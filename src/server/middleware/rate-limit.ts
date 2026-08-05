import { createMiddleware } from '@tanstack/react-start';
import { checkRateLimit, type RateLimitConfig } from '@/libs/api/rate-limit';
import { RateLimitError } from './error-mapping';

export type { RateLimitConfig };

function forwardedIpForTrustedProxy(headers: Headers, trustedProxyHops: number): string | null {
  if (trustedProxyHops <= 0) return null;

  const forwardedFor = headers
    .get('x-forwarded-for')
    ?.split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return forwardedFor?.at(-trustedProxyHops) ?? null;
}

function rateLimitClientKey(request: Request, trustedProxyHops: number, fallbackIp?: string): string {
  const ip = forwardedIpForTrustedProxy(request.headers, trustedProxyHops) ?? fallbackIp;
  if (ip) return `ip:${ip}`;

  throw new Error('Unable to determine client IP for rate limiting');
}

export const rateLimitedMiddleware = (cfg: RateLimitConfig) =>
  createMiddleware({ type: 'function' }).server(async ({ next }) => {
    const { getRequest, getRequestIP } = await import('@tanstack/react-start/server');
    const { env } = await import('@/libs/env');
    const request = getRequest();
    const key = rateLimitClientKey(request, env.TRUSTED_PROXY_HOPS, getRequestIP());
    const result = checkRateLimit(`${cfg.scope}:${key}`, cfg.windowMs, cfg.max);
    if (!result.allowed) throw new RateLimitError(result.retryAfterMs);
    return next();
  });
