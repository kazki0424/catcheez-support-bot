// Telegramに繋がずにBotの応答を確かめるテスト。 npm test で実行。
// Bot API への送信を横取りして記録し、偽のアップデートを流し込みます。
import assert from 'node:assert/strict';
process.env.ADMIN_CHAT_ID = '999';
process.env.TELEGRAM_BOT_TOKEN = '123:test';
delete process.env.ANTHROPIC_API_KEY;
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
assert.equal(warm.length, 4, 'four videos pre-uploaded');
assert.ok(warm.every((c) => String(c.payload.chat_id) === '999' && c.payload.disable_notification === true));
assert.equal(calls.filter((c) => c.method === 'deleteMessage').length, 4, 'warm-up messages deleted');
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
assert.equal(c.length, GUIDES.copy.pages.length);
let ck = c[0].payload.reply_markup.inline_keyboard.flat();
assert.ok(ck.some((b: any) => b.url && b.url.endsWith('/copy')), 'copy guide links to /copy');
assert.ok(ck.some((b: any) => b.callback_data === 'menu:copyvs'), 'copy guide offers the comparison');
await press('menu:copyvs');
assert.match(lastText(), /公式コピートレード[\s\S]*\$101[\s\S]*FLOW[\s\S]*\$500/);
await text('/copy');
assert.equal(sent().length, GUIDES.copy.pages.length);
console.log('ok  official copy guide + comparison with FLOW');

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
