// CATCHEEZ サポートBot (Telegram)。grammy + 長時間ポーリング。Webhookの設定は不要で、起動するだけで動きます。
// 必要な環境変数: TELEGRAM_BOT_TOKEN。任意: ADMIN_CHAT_ID(人に聞くの転送先), ANTHROPIC_API_KEY(自由入力への回答),
// APP_URL, FLOW_URL, REF_CODE, CLAUDE_MODEL, AI_DAILY_LIMIT。
import { Bot, InlineKeyboard, InputFile, type Context } from 'grammy';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WELCOME, MENU, GUIDES, FAQ, HUMAN_INTRO, HUMAN_ACK, AI_OFF_MSG, X_URL, APP_URL, FLOW_URL } from './content.js';
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
        const sent = await ctx.replyWithVideo(cached ?? new InputFile(file), { caption: p.text, parse_mode: 'HTML', reply_markup: kb });
        if (!cached && sent?.video?.file_id) videoIds.set(p.video!, sent.video.file_id);
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

  bot.command('start', (ctx) => sendHome(ctx));
  bot.command('menu', (ctx) => sendHome(ctx));
  bot.command('help', (ctx) => sendHome(ctx));
  bot.command('faq', (ctx) => sendFaqList(ctx));
  bot.command('login', (ctx) => sendGuide(ctx, 'login'));
  bot.command('deposit', (ctx) => sendGuide(ctx, 'deposit'));
  bot.command('trade', (ctx) => sendGuide(ctx, 'trade'));
  bot.command('flow', (ctx) => sendGuide(ctx, 'flow'));
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
    if (key === 'human') {
      waitingForHuman.add(String(ctx.from.id));
      return ctx.reply(HUMAN_INTRO, { reply_markup: backKb([{ label: 'X(@CatcheezAsia)を開く', url: X_URL }]) });
    }
    return sendGuide(ctx, key);
  });
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
    const faq = matchFaq(text);
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
    { command: 'flow', description: 'コピートレード(FLOW)' },
    { command: 'faq', description: 'よくある質問' },
  ]).catch((e) => console.warn('setMyCommands failed', String(e)));
  console.log('CATCHEEZ support bot starting (AI:', AI_ON ? 'on' : 'off', ', admin:', ADMIN ? 'set' : 'none', ')');
  bot.start({ onStart: (me) => console.log('polling as @' + me.username) });
}
