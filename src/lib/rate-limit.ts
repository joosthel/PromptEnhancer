/**
 * @file rate-limit.ts
 * Simple in-memory rate limiter for API routes.
 * Per-instance only (Vercel serverless instances don't share memory).
 * Sufficient for preventing casual abuse on a portfolio project.
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

const DEFAULT_LIMIT = 10
const DEFAULT_WINDOW_MS = 60_000

/**
 * Checks whether the given IP has exceeded the rate limit.
 * Cleans up stale entries on each call.
 */
export function rateLimit(
  ip: string,
  limit: number = DEFAULT_LIMIT,
  windowMs: number = DEFAULT_WINDOW_MS
): { success: boolean; remaining: number } {
  const now = Date.now()

  // Cleanup stale entries (every 100 calls to avoid overhead)
  if (store.size > 100) {
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key)
    }
  }

  const entry = store.get(ip)

  if (!entry || now > entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + windowMs })
    return { success: true, remaining: limit - 1 }
  }

  entry.count++

  if (entry.count > limit) {
    return { success: false, remaining: 0 }
  }

  return { success: true, remaining: limit - entry.count }
}
