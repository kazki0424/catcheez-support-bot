// 自由入力の質問に答える部分。ANTHROPIC_API_KEY が無ければ使われません(FAQとメニューだけで動きます)。
import { AI_SYSTEM } from './content.js';

const KEY = (process.env.ANTHROPIC_API_KEY ?? '').trim();
const MODEL = (process.env.CLAUDE_MODEL ?? 'claude-haiku-5-5').trim();
const MAX_PER_USER_PER_DAY = Number(process.env.AI_DAILY_LIMIT ?? 30);
export const AI_ON = KEY.length > 0;

const used = new Map<string, { day: string; n: number }>();
function today(): string { return new Date().toISOString().slice(0, 10); }
export function aiBudgetLeft(userId: string): boolean {
  const u = used.get(userId);
  if (!u || u.day !== today()) return true;
  return u.n < MAX_PER_USER_PER_DAY;
}
function count(userId: string): void {
  const u = used.get(userId);
  if (!u || u.day !== today()) used.set(userId, { day: today(), n: 1 }); else u.n += 1;
}

/** 直近のやり取り(ユーザーごとに最大6件)を覚えておく */
const history = new Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>();

export async function askAi(userId: string, question: string): Promise<string | null> {
  if (!AI_ON || !aiBudgetLeft(userId)) return null;
  const h = history.get(userId) ?? [];
  const messages = [...h, { role: 'user' as const, content: question }];
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 500, system: AI_SYSTEM, messages }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) { console.warn('ai: http', res.status, await res.text().catch(() => '')); return null; }
    const j = (await res.json()) as any;
    const text = (j.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('').trim();
    if (!text) return null;
    count(userId);
    history.set(userId, [...messages, { role: 'assistant' as const, content: text }].slice(-6));
    return text;
  } catch (e) { console.warn('ai: error', String(e)); return null; }
}
