// In-memory fixed-window limiter. Good enough for a single-region v1 app per
// architecture.md §11.3 ("worth a pass before public launch") — not a
// distributed limiter, so a burst can slip through right after a cold start
// or across multiple warm instances. Revisit with Upstash/Vercel KV if traffic
// or abuse patterns ever justify it.
const buckets = new Map<string, { count: number; resetAt: number }>();

// Periodically drop stale buckets so this doesn't grow unbounded on a long-lived instance.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
let lastSweep = Date.now();
function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { allowed: true };
}
