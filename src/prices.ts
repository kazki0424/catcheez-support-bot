// 銘柄の価格と24時間の変化。Hyperliquid の公開API(認証なし)から取ります。
// 対応: trade.xyz の株・指数・商品(xyz:NVDA など)と、Hyperliquid 本体(BTC/ETH/HYPE など)、ほかの HIP-3 市場も自動で拾います。
const HL_INFO = (process.env.HL_INFO_URL ?? 'https://api.hyperliquid.xyz/info').trim();
const DEX_FILTER = (process.env.HL_DEXS ?? '').split(',').map((s) => s.trim()).filter(Boolean); // 空なら全部
const CACHE_MS = Number(process.env.PRICE_CACHE_SEC ?? 45) * 1000;

export interface Quote {
  symbol: string;      // 'NVDA'
  dex: string;         // '' = Hyperliquid本体, 'xyz' = trade.xyz
  dexName: string;     // 表示用
  mark: number;
  prevDay: number;
  changePct: number;   // 24時間の変化(%)
  volumeUsd: number;   // 24時間出来高(USD)
  openInterest: number;
  fundingHourly: number; // 1時間あたり(%)
  maxLeverage: number;
  at: number;          // 取得時刻(ms)
}

// 日本語・通称 → 銘柄コード(候補順)。実在するものだけ使われます。
export const ALIASES: Array<[Array<string | RegExp>, string[]]> = [
  [['エヌビディア', 'nvidia', 'ヌビディア'], ['NVDA']],
  [['テスラ', 'tesla'], ['TSLA']],
  [['キオクシア', 'kioxia'], ['KIOXIA']],
  [['日経', '日経平均', '日経225', 'nikkei'], ['JP225']],
  [['コスピ', '韓国株', 'kospi'], ['KR200']],
  [['sp500', 's&p', 'エスアンドピー', 's&p500', 'spx'], ['SP500']],
  [['ナスダック', 'nasdaq', '米国100', 'us100', 'テック100'], ['XYZ100']],
  [['ゴールド', 'gold', /(?<![入送資料出現代年賃預返換])金(?=[はがのを相価っ]|$)/], ['GOLD', 'XAU']],   // 「入金」「送金」は除く
  [['シルバー', 'silver', /(?<!水)銀(?![行座])/], ['SILVER', 'XAG']],
  [['原油', 'wti', 'オイル'], ['CL', 'WTI']],
  [['ブレント', 'brent'], ['BRENTOIL', 'BRENT']],
  [['ビットコイン', 'bitcoin'], ['BTC']],
  [['イーサ', 'イーサリアム', 'ethereum'], ['ETH']],
  [['ハイプ', 'hyperliquid'], ['HYPE']],
  [['ソラナ', 'solana'], ['SOL']],
  [['アップル', 'apple'], ['AAPL']],
  [['マイクロソフト', 'microsoft'], ['MSFT']],
  [['アマゾン', 'amazon'], ['AMZN']],
  [['グーグル', 'google', 'アルファベット'], ['GOOGL', 'GOOG']],
  [[/メタ(?!マスク)/, 'facebook', 'フェイスブック'], ['META']],
  [['パランティア', 'palantir'], ['PLTR']],
  [['コストコ', 'costco'], ['COST']],
  [['スペースx', 'spacex', 'スペースエックス'], ['SPCX', 'SPACEX']],
  [['オープンai', 'openai'], ['OPENAI', 'OAI']],
  [['ユニツリー', 'unitree'], ['UNITREE']],
  [['ハイニックス', 'hynix'], ['SKHY', 'SKHX']],
  [['サムスン', 'samsung'], ['SMSN', 'SAMSUNG']],
  [['トヨタ', 'toyota'], ['TM', 'TOYOTA', '7203']],
  [['ソニー', 'sony'], ['SONY', '6758']],
  [['ソフトバンク', 'softbank'], ['SOFTBANK', '9984']],
  [['ドル円', 'ドル/円', 'usdjpy'], ['JPY', 'USDJPY']],
  [['ユーロ', 'eurusd'], ['EUR', 'EURUSD']],
  [['ポンド', 'gbpusd'], ['GBP', 'GBPUSD']],
];
// 文中に出てきても銘柄として扱わない語
const NOT_SYMBOLS = new Set(['FLOW', 'USDC', 'USDT', 'USD', 'BOT', 'CATCHEEZ', 'QR', 'ID', 'TX', 'OK', 'NG', 'AI', 'API', 'KYC', 'DEX', 'LINE', 'PC', 'IOS', 'ARB', 'ARBITRUM']);

interface DexCache { names: string[]; quotes: Map<string, Quote>; at: number; loading?: Promise<void> }
const dexes = new Map<string, { name: string; full: string }>();     // dex id → 表示名
const cache = new Map<string, DexCache>();                            // dex id → 価格
let dexListAt = 0;

async function info(body: Record<string, unknown>): Promise<any> {
  const res = await fetch(HL_INFO, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error('info ' + res.status);
  return res.json();
}

async function loadDexList(): Promise<void> {
  if (Date.now() - dexListAt < 6 * 3600_000 && dexes.size) return;
  dexes.set('', { name: '', full: 'Hyperliquid' });
  try {
    const list = (await info({ type: 'perpDexs' })) as Array<{ name: string; full_name?: string } | null>;
    for (const d of list) if (d && d.name) dexes.set(d.name, { name: d.name, full: d.full_name || d.name });
  } catch (e) { console.warn('perpDexs failed', String(e)); if (!dexes.has('xyz')) dexes.set('xyz', { name: 'xyz', full: 'trade.xyz' }); }
  if (DEX_FILTER.length) for (const k of [...dexes.keys()]) if (k && !DEX_FILTER.includes(k)) dexes.delete(k);
  dexListAt = Date.now();
}

async function loadDex(dex: string): Promise<void> {
  const c = cache.get(dex);
  if (c && Date.now() - c.at < CACHE_MS) return;
  if (c?.loading) return c.loading;
  const p = (async () => {
    const body: Record<string, unknown> = { type: 'metaAndAssetCtxs' };
    if (dex) body.dex = dex;
    const [meta, ctxs] = (await info(body)) as [{ universe: Array<{ name: string; maxLeverage?: number; isDelisted?: boolean }> }, Array<any>];
    const quotes = new Map<string, Quote>(); const names: string[] = [];
    const full = dexes.get(dex)?.full ?? dex;
    meta.universe.forEach((u, i) => {
      const x = ctxs[i]; if (!x || u.isDelisted) return;
      const symbol = u.name.includes(':') ? u.name.split(':').pop()! : u.name;
      const mark = Number(x.markPx), prev = Number(x.prevDayPx);
      if (!isFinite(mark) || mark <= 0) return;
      quotes.set(symbol.toUpperCase(), {
        symbol, dex, dexName: full, mark, prevDay: prev,
        changePct: prev > 0 ? ((mark - prev) / prev) * 100 : 0,
        volumeUsd: Number(x.dayNtlVlm) || 0, openInterest: Number(x.openInterest) || 0,
        fundingHourly: (Number(x.funding) || 0) * 100, maxLeverage: u.maxLeverage ?? 0, at: Date.now(),
      });
      names.push(symbol.toUpperCase());
    });
    cache.set(dex, { names, quotes, at: Date.now() });
  })();
  cache.set(dex, { names: c?.names ?? [], quotes: c?.quotes ?? new Map(), at: c?.at ?? 0, loading: p });
  try { await p; } catch (e) { console.warn('metaAndAssetCtxs failed', dex || 'main', String(e)); const cc = cache.get(dex); if (cc) cc.loading = undefined; }
}

/** 起動時に一度全部読む(銘柄名の一覧を作るため)。失敗しても後で再挑戦します */
export async function warmPrices(): Promise<number> {
  await loadDexList();
  await Promise.all([...dexes.keys()].map((d) => loadDex(d)));
  let n = 0; for (const c of cache.values()) n += c.names.length;
  return n;
}

function dexOrder(): string[] { return ['xyz', '', ...[...dexes.keys()].filter((d) => d !== 'xyz' && d !== '')]; }

/** 銘柄コードから価格(古ければ取り直す)。xyz → 本体 → その他 の順で探す */
export async function quote(symbolIn: string): Promise<Quote | null> {
  await loadDexList();
  const symbol = symbolIn.toUpperCase();
  for (const d of dexOrder()) {
    const c = cache.get(d);
    if (c && c.names.length && !c.names.includes(symbol)) continue;   // この市場には無い(一覧が空なら試す)
    await loadDex(d);
    const q = cache.get(d)?.quotes.get(symbol);
    if (q) return q;
  }
  return null;
}

/** 文章から銘柄を見つける: 日本語の通称 → 英字のコード の順 */
export function findSymbols(text: string): string[] {
  const t = text.toLowerCase();
  const known = new Set<string>(); for (const c of cache.values()) for (const n of c.names) known.add(n);
  const found: string[] = [];
  const push = (s: string) => { if (!found.includes(s)) found.push(s); };
  for (const [words, syms] of ALIASES) {
    if (words.some((w) => (w instanceof RegExp ? w.test(text) : w.length >= 2 && t.includes(w.toLowerCase())))) {
      const hit = syms.find((s) => known.has(s)) ?? (known.size ? null : syms[0]);
      if (hit) push(hit);
    }
  }
  for (const m of text.match(/[A-Za-z][A-Za-z0-9]{1,9}/g) ?? []) {
    const s = m.toUpperCase();
    if (NOT_SYMBOLS.has(s)) continue;
    if (known.has(s)) push(s);
  }
  return found.slice(0, 3);
}

export function fmtPrice(v: number): string {
  if (v >= 100) return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v >= 1) return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
  return v.toPrecision(4);
}
export function fmtUsd(v: number): string {
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
  return '$' + v.toFixed(0);
}
function jstNow(): string {
  const d = new Date(Date.now() + 9 * 3600_000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
function jaName(symbol: string): string {
  for (const [words, syms] of ALIASES) if (syms.includes(symbol)) { const w = words.find((x): x is string => typeof x === 'string' && /[^\x00-\x7f]/.test(x)); if (w) return w; }
  return '';
}

/** 1銘柄の答え(HTML) */
export function quoteText(q: Quote): string {
  const arrow = q.changePct > 0.05 ? '📈' : q.changePct < -0.05 ? '📉' : '➖';
  const sign = q.changePct > 0 ? '+' : '';
  const ja = jaName(q.symbol);
  const lines = [
    `${arrow} <b>${q.symbol}</b>${ja ? `（${ja}）` : ''}`,
    `価格: <b>$${fmtPrice(q.mark)}</b>`,
    `24時間: <b>${sign}${q.changePct.toFixed(2)}%</b>（前日 $${fmtPrice(q.prevDay)}）`,
  ];
  if (q.volumeUsd > 0) lines.push(`24時間出来高: ${fmtUsd(q.volumeUsd)}`);
  if (q.maxLeverage) lines.push(`最大レバレッジ: ${q.maxLeverage}倍`);
  if (q.fundingHourly) lines.push(`資金調達率: ${q.fundingHourly > 0 ? '+' : ''}${q.fundingHourly.toFixed(4)}%/時`);
  lines.push(`<i>${q.dexName} ・ ${jstNow()} JST 時点。元の市場が閉まっている時間は参考価格です。</i>`);
  return lines.join('\n');
}

/** 値動きまとめ: 株・指数(xyz)の上昇・下落トップと、BTC/ETH/HYPE */
export async function marketText(): Promise<string> {
  await loadDexList();
  await Promise.all(['xyz', ''].map((d) => loadDex(d)));
  const xyz = [...(cache.get('xyz')?.quotes.values() ?? [])].filter((q) => q.prevDay > 0);
  if (!xyz.length) return '価格をいま取得できません。少し待ってもう一度お試しください。';
  const sorted = [...xyz].sort((a, b) => b.changePct - a.changePct);
  const row = (q: Quote) => `${q.changePct >= 0 ? '🟢' : '🔴'} <b>${q.symbol}</b> $${fmtPrice(q.mark)}  ${q.changePct > 0 ? '+' : ''}${q.changePct.toFixed(2)}%`;
  const up = sorted.filter((q) => q.changePct > 0).slice(0, 5);
  const down = sorted.filter((q) => q.changePct < 0).slice(-5).reverse();
  const main = cache.get('')?.quotes;
  const crypto = ['BTC', 'ETH', 'HYPE'].map((s) => main?.get(s)).filter(Boolean) as Quote[];
  const out = [`<b>📊 いまの値動き（24時間）</b> ${jstNow()} JST`, '', '<b>上昇</b>', ...(up.length ? up.map(row) : ['（なし）']), '', '<b>下落</b>', ...(down.length ? down.map(row) : ['（なし）'])];
  if (crypto.length) out.push('', '<b>暗号資産</b>', ...crypto.map(row));
  out.push('', '<i>銘柄名を送ると、その銘柄だけ答えます（例: NVDA、キオクシア、日経）</i>');
  return out.join('\n');
}
