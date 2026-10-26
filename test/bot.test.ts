// Telegramに繋がずにBotの応答を確かめるテスト。 npm test で実行。
// Bot API への送信を横取りして記録し、偽のアップデートを流し込みます。
import assert from 'node:assert/strict';
process.env.ADMIN_CHAT_ID = '999';
process.env.TELEGRAM_BOT_TOKEN = '123:test';
delete process.env.ANTHROPIC_API_KEY;

// Hyperliquid の価格APIを偽物に差し替える(ネット不要)
const mk = (name: string, mark: number, prev: number, vol = 1e6, lev = 20) => ({ u: { name, maxLeverage: lev }, c: { markPx: String(mark), prevDayPx: String(prev), dayNtlVlm: String(vol), openInterest: '1000', funding: '0.0000125' } });
const MAIN = [mk('BTC', 68250.5, 67000), mk('ETH', 2319.2, 2350), mk('HYPE', 76.44, 76.1), mk('FLOW', 0.31, 0.3)];
const XYZ = [mk('xyz:NVDA', 184.32, 180.44, 12.3e6), mk('xyz:TSLA', 391.71, 370.2), mk('xyz:KIOXIA', 29065, 28800, 5e5, 10), mk('xyz:JP225', 29059, 29100), mk('xyz:GOLD', 3992.4, 3950, 2e6, 25), mk('xyz:XYZ100', 27995, 28100), mk('xyz:SP500', 7632.5, 7600)];
let hlCalls = 0;
globalThis.fetch = (async (url: any, init: any) => {
  const u = String(url);
  if (!u.includes('hyperliquid')) throw new Error('unexpected fetch ' + u);
  hlCalls++;
  const body = JSON.parse(init.body);
  const json = (v: any) => ({ ok: true, status: 200, json: async () => v, text: async () => JSON.stringify(v) });
  if (body.type === 'perpDexs') return json([null, { name: 'xyz', full_name: 'trade.xyz' }]);
  if (body.type === 'metaAndAssetCtxs') { const rows = body.dex === 'xyz' ? XYZ : MAIN; return json([{ universe: rows.map((r) => r.u) }, rows.map((r) => r.c)]); }
  throw new Error('unknown info ' + body.type);
}) as any;

const { makeBot } = await import('../src/index.js');
const { FAQ, MENU, GUIDES } = await import('../src/content.js');

const bot = makeBot('123:test');
bot.botInfo = { id: 123, is_bot: true, first_name: 'CATCHEEZ Support', username: 'catcheez_support_bot', can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false } as any;
const calls: Array<{ method: string; payload: any }> = [];
bot.api.config.use(async (prev, method, payload) => {
  calls.push({ method, payload });
  return { ok: true, result: method === 'sendMessage' || method === 'sendVideo' ? { message_id: calls.length, date: 0, chat: { id: 1, type: 'private' } } : true } as any;
});

let upd = 0;
const user = { id: 42, is_bot: false, first_name: 'Taro', username: 'taro' };
const chat = { id: 42, type: 'private' as const, first_name: 'Taro' };
async function text(t: string, c: any = chat, u: any = user) {
  calls.length = 0;
  await bot.handleUpdate({ update_id: ++upd, message: { message_id: upd, date: 0, chat: c, from: u, text: t, entities: t.startsWith('/') ? [{ type: 'bot_command', offset: 0, length: t.split(' ')[0].length }] : undefined } } as any);
  return calls;
}
async function press(data: string) {
  calls.length = 0;
  await bot.handleUpdate({ update_id: ++upd, callback_query: { id: 'cq' + upd, from: user, chat_instance: 'x', data, message: { message_id: 1, date: 0, chat, text: 'menu' } } } as any);
  return calls;
}
const sent = () => calls.filter((c) => c.method === 'sendMessage' || c.method === 'sendVideo');
const lastText = () => { const s = sent(); const p = s[s.length - 1].payload; return (p.text ?? p.caption) as string; };

// 1. /start → メニュー
await text('/start');
assert.equal(sent().length, 1);
assert.match(lastText(), /CATCHEEZ/);
const kb = sent()[0].payload.reply_markup.inline_keyboard.flat();
assert.equal(kb.length, MENU.length, 'menu buttons');
assert.ok(kb.every((b: any) => b.callback_data.startsWith('menu:')));
console.log('ok  /start → menu with', kb.length, 'buttons');

// 2. ログイン案内 (動画がまだ未アップロード → 文章が先、動画が後)
await press('menu:login');
assert.ok(calls.some((c) => c.method === 'answerCallbackQuery'));
let l = sent();
assert.equal(l.length, GUIDES.login.pages.length + 1, 'text + video');
assert.equal(l[0].method, 'sendMessage');
assert.ok((l[0].payload.text as string).includes('ログイン'));
const lk = l[0].payload.reply_markup.inline_keyboard.flat();
assert.ok(lk.some((b: any) => b.url && b.url.includes('ref=')), 'login button carries the referral link');
assert.equal(l[1].method, 'sendVideo');
assert.ok(typeof l[1].payload.video !== 'string', 'first time uploads the file');
console.log('ok  login guide (cold): text first, then video upload + ref link');

// 2b. 起動時の事前アップロード → 以後は file_id で一発送信(文章は動画のキャプション)
bot.api.config.use(async (prev, method, payload) => {
  if (method === 'sendVideo') { calls.push({ method, payload }); return { ok: true, result: { message_id: 7, date: 0, chat: { id: 999, type: 'private' }, video: { file_id: 'FID_' + (typeof (payload as any).video === 'string' ? (payload as any).video : 'up'), file_unique_id: 'u', width: 1, height: 1, duration: 1 } } } as any; }
  return prev(method, payload);
});
calls.length = 0;
await (bot as any).warmVideos();
const warm = calls.filter((c) => c.method === 'sendVideo');
const nVideos = new Set(Object.values(GUIDES).flatMap((g) => g.pages.map((p) => p.video).filter(Boolean))).size;
assert.equal(warm.length, nVideos, 'all guide videos pre-uploaded');
assert.ok(warm.every((c) => String(c.payload.chat_id) === '999' && c.payload.disable_notification === true));
assert.equal(calls.filter((c) => c.method === 'deleteMessage').length, nVideos, 'warm-up messages deleted');
await press('menu:login');
l = sent();
assert.equal(l.length, GUIDES.login.pages.length, 'warm: one message per page');
assert.equal(l[0].method, 'sendVideo');
assert.equal(l[0].payload.video, 'FID_up', 'sent by file_id, no upload');
assert.ok((l[0].payload.caption as string).includes('ログイン'));
console.log('ok  warm-up: videos cached, guide sends by file_id with caption');

// 3. 入金案内は2ページ、最後のページにだけ戻るボタン
await press('menu:deposit');
const d = sent();
assert.equal(d.length, GUIDES.deposit.pages.length);
const lastKb = d[d.length - 1].payload.reply_markup.inline_keyboard.flat();
assert.ok(lastKb.some((b: any) => b.callback_data === 'menu:home'));
console.log('ok  deposit guide:', d.length, 'pages');

// 4. FAQ 一覧 → 個別
await press('menu:faq');
const fl = sent()[0].payload.reply_markup.inline_keyboard.flat().filter((b: any) => String(b.callback_data).startsWith('faq:'));
assert.equal(fl.length, FAQ.length);
await press('faq:0');
assert.ok(lastText().includes(FAQ[0].q));
console.log('ok  faq list:', fl.length, 'items');

// 5. 自由入力: キーワードが当たればFAQの答え
await text('手数料っていくら？');
assert.ok(lastText().includes('手数料'), 'keyword → FAQ answer');
await text('ログインできない');
assert.match(lastText(), /ログイン/);
await text('コピトレって資金預けるの？');
assert.match(lastText(), /公式コピートレード[\s\S]*FLOW/, 'copy question → explains both kinds');
console.log('ok  free text → FAQ keyword match');

// 5b. 公式コピトレの案内と、FLOWとの違いページ
await press('menu:copy');
let c = sent();
assert.equal(c.length, GUIDES.copy.pages.length, 'copy guide (video cached) one message per page');
assert.equal(c[0].method, 'sendVideo', 'copy guide carries the video');
let ck = c[0].payload.reply_markup.inline_keyboard.flat();
assert.ok(ck.some((b: any) => b.url && b.url.endsWith('/copy')), 'copy guide links to /copy');
assert.ok(ck.some((b: any) => b.callback_data === 'menu:copyvs'), 'copy guide offers the comparison');
await press('menu:copyvs');
assert.match(lastText(), /公式コピートレード[\s\S]*\$101[\s\S]*FLOW[\s\S]*\$500/);
await text('/copy');
assert.equal(sent().length, GUIDES.copy.pages.length);
console.log('ok  official copy guide + comparison with FLOW');

// 5c. 価格: 銘柄名を送ると現在価格と24時間の変化
await (bot as any).warmPrices();
assert.ok(hlCalls >= 3, 'dex list + 2 markets loaded');
await text('NVDAの価格は？');
let pt = lastText();
assert.match(pt, /NVDA/); assert.match(pt, /エヌビディア/); assert.match(pt, /\$184\.32/); assert.match(pt, /\+2\.15%/); assert.match(pt, /trade\.xyz/);
await text('キオクシア 今日どう？');
pt = lastText(); assert.match(pt, /KIOXIA/); assert.match(pt, /29,065\.00/); assert.match(pt, /\+0\.92%/); assert.match(pt, /10倍/);
await text('ビットコインいくら？');
assert.match(lastText(), /BTC[\s\S]*\$68,250\.50/);
await text('日経とゴールド');
pt = lastText(); assert.match(pt, /JP225[\s\S]*-0\.14%/); assert.match(pt, /GOLD/);
await text('/price tsla');
assert.match(lastText(), /TSLA[\s\S]*\+5\.81%/);
await text('/price');
assert.match(lastText(), /銘柄名を送って/);
await text('入金はどうやる？');
assert.ok(!/GOLD/.test(lastText()), '「入金」の金はゴールド扱いしない');
await text('メタマスクで送金できない');
assert.ok(!/META|GOLD/.test(lastText()), 'メタマスク・送金は銘柄扱いしない');
await text('NVDAの手数料は？');
assert.match(lastText(), /手数料/); assert.ok(!/\$184/.test(lastText()), 'FAQ語が強ければFAQ優先');
await text('FLOWは安全？');
assert.ok(!/\$0\.31/.test(lastText()), 'FLOW は銘柄扱いしない');
console.log('ok  price lookups: symbol, Japanese alias, /price, false-positive guards');

// 5e. 企業の説明
await text('ソフトバンクってどんな会社？');
pt = lastText();
assert.match(pt, /ソフトバンクグループ/); assert.match(pt, /投資持株会社/); assert.match(pt, /見つかりませんでした/, '未上場扱い(偽データに無い)');
await text('テスラについて教えて');
pt = lastText(); assert.match(pt, /Tesla/); assert.match(pt, /マスク/); assert.match(pt, /いまの価格: <b>\$391\.71/); assert.match(pt, /\+5\.81%/);
await text('キオクシアとは');
pt = lastText(); assert.match(pt, /東芝メモリ/); assert.match(pt, /\$29,065/);
await text('/company 日経');
assert.match(lastText(), /日経225/);
await text('NVDA');                     // 説明の意図が無ければ価格
pt = lastText(); assert.match(pt, /価格: <b>\$184\.32/); assert.ok(!/サンタクララ/.test(pt));
let kbz = sent()[sent().length - 1].payload.reply_markup.inline_keyboard.flat();
assert.ok(kbz.some((b: any) => b.callback_data === 'co:NVDA'), 'price card offers company button');
await press('co:NVDA');
assert.match(lastText(), /NVIDIA[\s\S]*サンタクララ/);
kbz = sent()[sent().length - 1].payload.reply_markup.inline_keyboard.flat();
assert.ok(kbz.some((b: any) => b.callback_data === 'q:NVDA'));
await press('q:NVDA');
assert.match(lastText(), /24時間出来高/);
await text('入金方法を教えて');         // 「教えて」でも企業が無ければ企業説明にならない
assert.ok(!/🏢/.test(lastText()));
await text('ミュージックが好き');       // "mu"(マイクロン)の誤反応なし
assert.ok(!/Micron/.test(lastText()));
console.log('ok  company explanations (dictionary) + buttons + guards');

// 5d. いまの値動き一覧
await press('menu:market');
pt = lastText();
assert.match(pt, /上昇[\s\S]*TSLA[\s\S]*下落[\s\S]*ETH|上昇[\s\S]*TSLA[\s\S]*下落/);
assert.match(pt, /暗号資産[\s\S]*BTC/);
const before = hlCalls; await text('/market'); assert.equal(hlCalls, before, 'cached within 45s: no new API calls');
console.log('ok  market overview + cache');

// 5f. 入金の初心者向け質問
await text('日本円しか持ってないけど入金できる？');
assert.match(lastText(), /法定通貨でUSDCを購入/);
await text('USDTとUSDCって何が違うの');
assert.match(lastText(), /Circle/); assert.ok(!/価格: <b>/.test(lastText()), 'not a price card');
await text('ガス代ってなに？ETHいるの？');
assert.match(lastText(), /ガス代はネットワークの利用料/); assert.ok(!/イーサリアム（ETH）<\/b>/.test(lastText()));
await text('ソラナで送っちゃったけど届かない');
assert.match(lastText(), /Arbitrum One|TXID/); assert.ok(!/\$[0-9]/.test(lastText()) || /TXID/.test(lastText()), 'deposit trouble beats SOL price');
await press('menu:deposit');
let dp = sent();
let dkb = dp[0].payload.reply_markup.inline_keyboard.flat();
assert.ok(dkb.some((b: any) => b.callback_data === 'menu:dep_jpy') && dkb.some((b: any) => b.callback_data === 'menu:dep_ex'), 'deposit page offers branches');
await press('menu:dep_ex');
assert.match(lastText(), /Arbitrum One[\s\S]*ETHは不要/);
await press('menu:dep_words');
assert.match(lastText(), /TXID/);
console.log('ok  beginner deposit branches (JPY / exchange / wallet / words)');

// 6. 自由入力: 当たらない & AIなし → 人に聞く案内
await text('こんにちは、ところで宇宙の広さは？');
assert.match(lastText(), /担当者/);
console.log('ok  unknown text (AI off) → human fallback message');

// 7. 人に聞く → 次の1通が担当者へ転送される
await press('menu:human');
assert.match(lastText(), /担当者|聞/);
await text('入金したのに反映されません。TXは0xabc…');
const toAdmin = sent().filter((c) => String(c.payload.chat_id) === '999');
assert.equal(toAdmin.length, 1, 'forwarded to admin');
assert.ok(toAdmin[0].payload.text.includes('/reply 42'), 'admin gets reply hint');
assert.ok(toAdmin[0].payload.text.includes('0xabc'));
const toUser = sent().filter((c) => String(c.payload.chat_id) === '42');
assert.equal(toUser.length, 1);
assert.match(toUser[0].payload.text, /受け付け/);
console.log('ok  human escalation forwarded to ADMIN_CHAT_ID');

// 8. 担当者の /reply が利用者に届く。他人の /reply は無視
await text('/reply 42 入金を確認しました。10分ほどで反映します。', { id: 999, type: 'private' }, { id: 999, is_bot: false, first_name: 'Admin' });
const back = sent().filter((c) => String(c.payload.chat_id) === '42');
assert.equal(back.length, 1);
assert.ok(back[0].payload.text.includes('CATCHEEZサポート'));
await text('/reply 42 なりすまし');
assert.equal(sent().filter((c) => String(c.payload.chat_id) === '42').length, 0, 'non-admin /reply ignored');
console.log('ok  /reply from admin only');

// 9. 写真は担当者へ転送
calls.length = 0;
await bot.handleUpdate({ update_id: ++upd, message: { message_id: upd, date: 0, chat, from: user, photo: [{ file_id: 'p1', file_unique_id: 'u', width: 1, height: 1 }] } } as any);
assert.ok(calls.some((c) => c.method === 'forwardMessage' && String(c.payload.chat_id) === '999'));
console.log('ok  photo → forwarded to admin');

// 10. グループでは自由入力に反応しない。/start には反応する
await text('手数料は？', { id: -100, type: 'supergroup', title: 'g' });
assert.equal(sent().length, 0, 'group free text ignored');
await text('/start@catcheez_support_bot', { id: -100, type: 'supergroup', title: 'g' });
assert.equal(sent().length, 1);
console.log('ok  group: commands only');

// 11. 全ページの HTML が Telegram で通る形か (タグの開閉が一致)
function checkHtml(s: string, where: string) {
  const open = (s.match(/<(b|i|a|code|pre)\b[^>]*>/g) ?? []).length;
  const close = (s.match(/<\/(b|i|a|code|pre)>/g) ?? []).length;
  assert.equal(open, close, 'unbalanced tags in ' + where);
  assert.ok(!/<(br|p|ul|li|h\d)\b/.test(s), 'unsupported tag in ' + where);
}
for (const [k, g] of Object.entries(GUIDES)) g.pages.forEach((p, i) => { checkHtml(p.text, `${k}#${i}`); assert.ok(p.text.length <= 1024 || !p.video, `${k}#${i} caption too long for a video (${p.text.length})`); });
FAQ.forEach((f, i) => checkHtml(f.a, 'faq#' + i));
console.log('ok  HTML tags balanced, video captions ≤1024 chars');

console.log('\nall tests passed');
