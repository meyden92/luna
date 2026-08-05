import type { AnyFunctionMiddleware } from '@tanstack/react-start';
import { adminMiddleware, authedMiddleware, tokenMiddleware } from './middleware/auth';
import { type PaginationConfig, paginatedMiddleware } from './middleware/pagination';
import { type RateLimitConfig, rateLimitedMiddleware } from './middleware/rate-limit';

export type AuthLevel = 'user' | 'admin' | 'token' | 'none';

export interface AppMiddlewareOptions {
  auth?: AuthLevel;
  pagination?: boolean | PaginationConfig;
  rateLimit?: RateLimitConfig;
}

// Returns the middleware array for a server function. Use as:
//   createServerFn({ method: 'POST' }).middleware(appMiddleware({ auth: 'user' }))
// Inlined at the call site so the TanStack Start vite plugin can statically
// detect `createServerFn(...).handler(...)` and split it into client/server bundles.
export function appMiddleware(opts: AppMiddlewareOptions = {}): AnyFunctionMiddleware[] {
  const { auth = 'user', pagination, rateLimit } = opts;

  const fnMiddleware: AnyFunctionMiddleware[] = [];
  if (rateLimit) fnMiddleware.push(rateLimitedMiddleware(rateLimit));
  if (auth === 'admin') fnMiddleware.push(adminMiddleware);
  else if (auth === 'token') fnMiddleware.push(tokenMiddleware);
  else if (auth === 'user') fnMiddleware.push(authedMiddleware);
  if (pagination) {
    const cfg = typeof pagination === 'object' ? pagination : {};
    fnMiddleware.push(paginatedMiddleware(cfg));
  }
  return fnMiddleware;
}
