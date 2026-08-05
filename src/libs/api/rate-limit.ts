type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export type RateLimitConfig = {
  scope: string;
  windowMs: number;
  max: number;
};

export const RATE_LIMITS = {
  publicFileView: { scope: 'publicFileView', windowMs: 60_000, max: 60 },
  publicFormShareView: { scope: 'publicFormShareView', windowMs: 60_000, max: 60 },
  publicFormShareClaim: { scope: 'publicFormShareClaim', windowMs: 60_000, max: 30 },
  publicFormShareReveal: { scope: 'publicFormShareReveal', windowMs: 60_000, max: 60 },
  publicSnippetView: { scope: 'publicSnippetView', windowMs: 60_000, max: 60 },
  publicProfileView: { scope: 'publicProfileView', windowMs: 60_000, max: 60 },
  uploadWeb: { scope: 'uploadWeb', windowMs: 60_000, max: 60 },
  uploadSharex: { scope: 'uploadSharex', windowMs: 60_000, max: 60 },
  generateImage: { scope: 'generateImage', windowMs: 60_000, max: 10 },
  generateTemplate: { scope: 'generateTemplate', windowMs: 60_000, max: 10 },
  generateEditImage: { scope: 'generateEditImage', windowMs: 60_000, max: 10 },
  testGenerate: { scope: 'testGenerate', windowMs: 60_000, max: 10 },
} as const satisfies Record<string, RateLimitConfig>;

export type RateLimitScope = keyof typeof RATE_LIMITS;

// In-memory store — resets on server restart. Fine for single-instance deployments.
// For multi-instance, swap with Redis or similar.
const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 5 * 60 * 1000;

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  for (const [key, entry] of store) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}

export function checkRateLimit(key: string, windowMs: number, max: number): { allowed: boolean; remaining: number; retryAfterMs: number } {
  cleanup();

  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1, retryAfterMs: 0 };
  }

  entry.count++;

  if (entry.count > max) {
    return { allowed: false, remaining: 0, retryAfterMs: entry.resetAt - now };
  }

  return { allowed: true, remaining: max - entry.count, retryAfterMs: 0 };
}

export function checkScopedRateLimit(scope: RateLimitScope, subject: string) {
  const { scope: keyScope, windowMs, max } = RATE_LIMITS[scope];
  return checkRateLimit(`${keyScope}:${subject}`, windowMs, max);
}

export function retryAfterSeconds(retryAfterMs: number): string {
  return String(Math.ceil(retryAfterMs / 1000));
}
