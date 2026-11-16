import 'server-only';

/**
 * Simple sliding-window limiter per user (default 20 AI requests / 10 minutes).
 * In-memory, so on serverless platforms it is per instance — a guard against runaway use,
 * not a billing control. Swap for Upstash/Redis if you need a global limit.
 */
const WINDOW_MS = 10 * 60 * 1000;
const hits = new Map<string, number[]>();

export function checkRateLimit(userId: string): { ok: true } | { ok: false; retryInMinutes: number } {
  const max = Number(process.env.AI_RATE_LIMIT) || 20;
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= max) {
    return { ok: false, retryInMinutes: Math.max(1, Math.ceil((WINDOW_MS - (now - recent[0])) / 60000)) };
  }
  recent.push(now);
  hits.set(userId, recent);
  return { ok: true };
}
