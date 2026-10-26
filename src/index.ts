// CATCHEEZ サポートBot (Telegram)。grammy + 長時間ポーリング。Webhookの設定は不要で、起動するだけで動きます。
// 必要な環境変数: TELEGRAM_BOT_TOKEN。任意: ADMIN_CHAT_ID(人に聞くの転送先), ANTHROPIC_API_KEY(自由入力への回答),
// APP_URL, FLOW_URL, REF_CODE, CLAUDE_MODEL, AI_DAILY_LIMIT。
import { Bot, InlineKeyboard, InputFile, type Context } from 'grammy';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WELCOME, MENU, GUIDES, FAQ, HUMAN_INTRO, HUMAN_ACK, AI_OFF_MSG, PRICE_HELP, PRICE_NOTE, X_URL, APP_URL, FLOW_URL } from './content.js';
import { warmPrices, quote, findSymbols, quoteText, marketText, fmtPrice } from './prices.js';
import { COMPANIES, findCompanies, companyFor, wantsCompanyInfo } from './companies.js';
import { askAi, AI_ON } from './ai.js';

const TOKEN = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
const ADMIN = (process.env.ADMIN_CHAT_ID ?? '').trim();
const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');

export function makeBot(token: string): Bot {
  const bot = new Bot(token);
  const waitingForHuman = new Set<string>();     // 「人に聞く」を押して、次の1通を待っている人
  const asked = new Map<string, number>();        // 連投よけ: 最後に担当者へ転送した時刻
  const videoIds = new Map<string, string>();     // 動画ファイル名 → Telegram の file_id

  const menuKb = () => {
    const kb = new InlineKeyboard();
    MENU.forEach((m, i) => { kb.text(m.label, 'menu:' + m.key); if (i % 2 === 1) kb.row(); });
    return kb;
  };
  const backKb = (extra?: Array<{ label: string; url?: string; key?: string }>) => {
    const kb = new InlineKeyboard();
    (extra ?? []).forEach((b) => { if (b.url) kb.url(b.label, b.url); else if (b.key) kb.text(b.label, 'menu:' + b.key); });
    if (extra?.length) kb.row();
    kb.text('« メニューに戻る', 'menu:home');
    return kb;
  };

  async function sendHome(ctx: Context): Promise<void> {
    await ctx.reply(WELCOME, { parse_mode: 'HTML', reply_markup: menuKb() });
  }
  async function sendGuide(ctx: Context, key: string): Promise<void> {
    const g = GUIDES[key];
    if (!g) return sendHome(ctx);
    for (let i = 0; i < g.pages.length; i++) {
      const p = g.pages[i];
      const last = i === g.pages.length - 1;
      const kb = last ? backKb(p.buttons) : (p.buttons?.length ? backKb(p.buttons) : undefined);
      const file = p.video ? path.join(ASSETS, p.video) : null;
      if (file && existsSync(file)) {
        // 一度送った動画は Telegram 側の file_id を使い回す(毎回アップロードしない)
        const cached = videoIds.get(p.video!);
        if (cached) {
          await ctx.replyWithVideo(cached, { caption: p.text, parse_mode: 'HTML', reply_markup: kb, supports_streaming: true });
        } else {
          // まだアップロードしていない動画: 先に文章を出して、動画は後から送る(待たせない)
          await ctx.reply(p.text, { parse_mode: 'HTML', reply_markup: kb });
          await ctx.replyWithChatAction('upload_video').catch(() => null);
          const sent = await ctx.replyWithVideo(new InputFile(file), { supports_streaming: true }).catch((e) => { console.warn('video send failed', p.video, String(e)); return null; });
          if (sent?.video?.file_id) videoIds.set(p.video!, sent.video.file_id);
        }
      } else {
        await ctx.reply(p.text, { parse_mode: 'HTML', reply_markup: kb });
      }
    }
  }
  async function sendFaqList(ctx: Context): Promise<void> {
    const kb = new InlineKeyboard();
    FAQ.forEach((f, i) => { kb.text(f.q, 'faq:' + i).row(); });
    kb.text('« メニューに戻る', 'menu:home');
    await ctx.reply('<b>よくある質問</b>\n知りたいものを押してください。', { parse_mode: 'HTML', reply_markup: kb });
  }
  function matchFaq(text: string): typeof FAQ[number] | null {
    const t = text.toLowerCase();
    let best: { f: typeof FAQ[number]; n: number } | null = null;
    for (const f of FAQ) {
      const n = f.keys.filter((k) => t.includes(k.toLowerCase())).length;
      if (n > 0 && (!best || n > best.n)) best = { f, n };
    }
    return best?.f ?? null;
  }

  const priceKb = (companyKey?: string) => {
    const kb = new InlineKeyboard();
    if (companyKey) kb.text('🏢 この会社について', 'co:' + companyKey);
    kb.text('📊 いまの値動き', 'menu:market').url('取引画面を開く', `${APP_URL}/trade`).row().text('« メニューに戻る', 'menu:home');
    return kb;
  };
  async function sendQuotes(ctx: Context, symbols: string[]): Promise<boolean> {
    const parts: string[] = []; let companyKey: string | undefined;
    for (const s of symbols) {
      const q = await quote(s).catch(() => null);
      if (!q) continue;
      parts.push(quoteText(q));
      if (!companyKey) companyKey = companyFor(q.symbol)?.key;
    }
    if (!parts.length) return false;
    await ctx.reply(parts.join('\n\n') + '\n\n' + PRICE_NOTE, { parse_mode: 'HTML', reply_markup: priceKb(companyKey), link_preview_options: { is_disabled: true } });
    return true;
  }
  // 企業の説明(辞書) + いまの価格を1行
  async function sendCompany(ctx: Context, key: string): Promise<boolean> {
    const c = COMPANIES[key]; if (!c) return false;
    let q = await quote(key).catch(() => null);
    for (const s of c.syms ?? []) { if (q) break; q = await quote(s).catch(() => null); }
    const kb = new InlineKeyboard();
    let tail: string;
    if (q) {
      const sign = q.changePct > 0 ? '+' : '';
      tail = `\n\n${q.changePct >= 0 ? '📈' : '📉'} いまの価格: <b>$${fmtPrice(q.mark)}</b>（24時間 ${sign}${q.changePct.toFixed(2)}%）`;
      kb.text('📈 くわしい価格', 'q:' + q.symbol).url('取引画面を開く', `${APP_URL}/trade`).row();
    } else {
      tail = '\n\n<i>この銘柄は、いまCATCHEEZの取引一覧には見つかりませんでした。</i>';
      kb.text('📊 いまの値動き', 'menu:market').row();
    }
    kb.text('« メニューに戻る', 'menu:home');
    await ctx.reply(`🏢 <b>${c.name}</b>\n\n${c.desc}${tail}\n\n${PRICE_NOTE}`, { parse_mode: 'HTML', reply_markup: kb, link_preview_options: { is_disabled: true } });
    return true;
  }
  async function sendMarket(ctx: Context): Promise<void> {
    await ctx.replyWithChatAction('typing').catch(() => null);
    const text = await marketText().catch(() => '価格をいま取得できません。少し待ってもう一度お試しください。');
    await ctx.reply(text + '\n\n' + PRICE_NOTE, { parse_mode: 'HTML', reply_markup: backKb([{ label: '取引画面を開く', url: `${APP_URL}/trade` }]) });
  }

  bot.command('start', (ctx) => sendHome(ctx));
  bot.command('menu', (ctx) => sendHome(ctx));
  bot.command('help', (ctx) => sendHome(ctx));
  bot.command('faq', (ctx) => sendFaqList(ctx));
  bot.command('login', (ctx) => sendGuide(ctx, 'login'));
  bot.command('deposit', (ctx) => sendGuide(ctx, 'deposit'));
  bot.command('trade', (ctx) => sendGuide(ctx, 'trade'));
  bot.command('copy', (ctx) => sendGuide(ctx, 'copy'));
  bot.command('flow', (ctx) => sendGuide(ctx, 'flow'));
  bot.command('market', (ctx) => sendMarket(ctx));
  bot.command(['company', 'co'], async (ctx) => {
    const arg = (ctx.match ?? '').toString().trim();
    const cos = arg ? findCompanies(arg) : [];
    if (!cos.length || !(await sendCompany(ctx, cos[0]))) await ctx.reply('企業名か銘柄コードを送ってください。例: <b>ソフトバンク</b>、<b>NVDA</b>、<b>キオクシア</b>', { parse_mode: 'HTML', reply_markup: backKb() });
  });
  bot.command(['price', 'p'], async (ctx) => {
    const arg = (ctx.match ?? '').toString().trim();
    const syms = arg ? findSymbols(arg) : [];
    if (!syms.length || !(await sendQuotes(ctx, syms))) await ctx.reply(PRICE_HELP, { parse_mode: 'HTML', reply_markup: priceKb() });
  });
  bot.command('links', (ctx) => ctx.reply(`CATCHEEZ: ${APP_URL}\nFLOW: ${FLOW_URL}\nX: ${X_URL}`));
  // 担当者 → 利用者への返信: /reply <chatId> 本文  (ADMIN_CHAT_ID のチャットからだけ使える)
  bot.command('reply', async (ctx) => {
    if (!ADMIN || String(ctx.chat?.id) !== ADMIN) return;
    const m = (ctx.match ?? '').toString().match(/^(-?\d+)\s+([\s\S]+)$/);
    if (!m) return ctx.reply('使い方: /reply <chatId> 本文');
    try { await bot.api.sendMessage(m[1], '【CATCHEEZサポート】\n' + m[2]); await ctx.reply('送りました'); }
    catch (e) { await ctx.reply('送れませんでした: ' + String(e)); }
  });

  bot.callbackQuery(/^menu:(.+)$/, async (ctx) => {
    const key = ctx.match[1];
    await ctx.answerCallbackQuery();
    if (key === 'home') return sendHome(ctx);
    if (key === 'faq') return sendFaqList(ctx);
    if (key === 'market') return sendMarket(ctx);
    if (key === 'human') {
      waitingForHuman.add(String(ctx.from.id));
      return ctx.reply(HUMAN_INTRO, { reply_markup: backKb([{ label: 'X(@CatcheezAsia)を開く', url: X_URL }]) });
    }
    return sendGuide(ctx, key);
  });
  bot.callbackQuery(/^co:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); if (!(await sendCompany(ctx, ctx.match[1]))) await sendHome(ctx); });
  bot.callbackQuery(/^q:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); if (!(await sendQuotes(ctx, [ctx.match[1]]))) await ctx.reply(PRICE_HELP, { parse_mode: 'HTML', reply_markup: priceKb() }); });
  bot.callbackQuery(/^faq:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const f = FAQ[Number(ctx.match[1])];
    if (!f) return sendFaqList(ctx);
    await ctx.reply('<b>' + f.q + '</b>\n\n' + f.a, { parse_mode: 'HTML', reply_markup: backKb([{ label: 'ほかの質問', key: 'faq' }]) });
  });

  // 自由入力: 「人に聞く」待ち → 担当者へ転送 / FAQのキーワード → その答え / AI → 回答 / どれも無理 → 人に聞く案内
  bot.on('message:text', async (ctx) => {
    if (ctx.chat.type !== 'private') return;              // グループでは /コマンド だけに反応
    const uid = String(ctx.from.id);
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return;
    if (waitingForHuman.has(uid)) {
      waitingForHuman.delete(uid);
      await forwardToAdmin(ctx, text);
      return ctx.reply(HUMAN_ACK, { reply_markup: backKb() });
    }
    // 銘柄名・企業名が入っていたら: 「どんな会社?」なら説明、それ以外は価格(「NVDAの手数料は?」のようにFAQ語が強ければFAQを優先)
    const syms = findSymbols(text);
    const cos = findCompanies(text);
    const faq = matchFaq(text);
    const strongFaq = !!faq && /手数料|入金|出金|ログイン|取引時間|何時|レバレッジ|預け/.test(text);
    if (!strongFaq && (syms.length || cos.length)) {
      await ctx.replyWithChatAction('typing').catch(() => null);
      if (cos.length && (wantsCompanyInfo(text) || !syms.length)) { if (await sendCompany(ctx, cos[0])) return; }
      if (syms.length && (await sendQuotes(ctx, syms))) return;
      if (cos.length && (await sendCompany(ctx, cos[0]))) return;
    }
    if (faq) return ctx.reply('<b>' + faq.q + '</b>\n\n' + faq.a, { parse_mode: 'HTML', reply_markup: backKb([{ label: 'ほかの質問', key: 'faq' }, { label: '人に聞く', key: 'human' }]) });
    await ctx.replyWithChatAction('typing').catch(() => null);
    const ai = await askAi(uid, text);
    if (ai) return ctx.reply(ai, { reply_markup: backKb([{ label: '人に聞く', key: 'human' }]) });
    return ctx.reply(AI_OFF_MSG, { reply_markup: backKb([{ label: '人に聞く', key: 'human' }]) });
  });
  // 写真やファイル(送金のスクショなど)は担当者へ
  bot.on(['message:photo', 'message:document'], async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    await forwardToAdmin(ctx, '(画像・ファイル)');
    await ctx.reply(HUMAN_ACK, { reply_markup: backKb() });
  });

  async function forwardToAdmin(ctx: Context, text: string): Promise<void> {
    const uid = String(ctx.from?.id ?? '');
    const last = asked.get(uid) ?? 0;
    asked.set(uid, Date.now());
    if (!ADMIN) { console.log('human request (no ADMIN_CHAT_ID):', uid, text.slice(0, 200)); return; }
    const who = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ') + (ctx.from?.username ? ' @' + ctx.from.username : '');
    const head = `🙋 サポート依頼 from ${who} (chat ${ctx.chat?.id})${Date.now() - last < 60_000 ? ' (連投)' : ''}\n返信: /reply ${ctx.chat?.id} 本文\n\n`;
    try {
      await bot.api.sendMessage(ADMIN, head + text);
      if (ctx.message && (ctx.message.photo || ctx.message.document)) await bot.api.forwardMessage(ADMIN, ctx.chat!.id, ctx.message.message_id);
    } catch (e) { console.warn('forward failed', String(e)); }
  }

  bot.catch((err) => { console.error('bot error', err.error); });

  // 起動時に動画を1回だけアップロードしておく(ADMIN_CHAT_ID に音なしで送ってすぐ消す。file_id は残る)。
  // これで利用者には初回から一瞬で動画が届きます。
  async function warmVideos(): Promise<void> {
    if (!ADMIN) { console.log('warmVideos: ADMIN_CHAT_ID が無いので省略(初回だけ動画が遅くなります)'); return; }
    const names = new Set<string>();
    for (const g of Object.values(GUIDES)) for (const p of g.pages) if (p.video) names.add(p.video);
    for (const name of names) {
      const file = path.join(ASSETS, name);
      if (!existsSync(file) || videoIds.has(name)) continue;
      try {
        const m = await bot.api.sendVideo(ADMIN, new InputFile(file), { disable_notification: true, supports_streaming: true, caption: '(動画の準備中・自動で消えます)' });
        if (m.video?.file_id) videoIds.set(name, m.video.file_id);
        await bot.api.deleteMessage(ADMIN, m.message_id).catch(() => null);
        console.log('video ready:', name);
      } catch (e) { console.warn('warmVideos failed', name, String(e)); }
    }
  }
  (bot as any).warmVideos = warmVideos;
  (bot as any).warmPrices = () => warmPrices().then((n) => console.log('prices ready:', n, 'symbols')).catch((e) => console.warn('warmPrices failed', String(e)));
  return bot;
}

// ---- 起動 ----
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  if (!TOKEN) { console.error('TELEGRAM_BOT_TOKEN がありません'); process.exit(1); }
  const bot = makeBot(TOKEN);
  bot.api.setMyCommands([
    { command: 'start', description: 'メニューを開く' },
    { command: 'login', description: 'ログイン・口座開設' },
    { command: 'deposit', description: '入金・出金' },
    { command: 'trade', description: '取引のやり方' },
    { command: 'copy', description: '公式コピートレード(アプリ内)' },
    { command: 'flow', description: 'FLOW(BOTコピー)' },
    { command: 'faq', description: 'よくある質問' },
    { command: 'market', description: 'いまの値動き(上昇・下落)' },
    { command: 'price', description: '銘柄の価格 例: /price NVDA' },
    { command: 'company', description: '企業の説明 例: /company ソフトバンク' },
  ]).catch((e) => console.warn('setMyCommands failed', String(e)));
  console.log('CATCHEEZ support bot starting (AI:', AI_ON ? 'on' : 'off', ', admin:', ADMIN ? 'set' : 'none', ')');
  bot.start({ onStart: (me) => { console.log('polling as @' + me.username); (bot as any).warmVideos().catch(() => null); (bot as any).warmPrices(); } });
}
