import { createMiddleware } from '@tanstack/react-start';
import { ZodError } from 'zod';
import { ForbiddenError, UnauthorizedError } from '@/libs/rbac/errors';

export class RateLimitError extends Error {
  retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super('Too many requests');
    this.retryAfterMs = retryAfterMs;
    this.name = 'RateLimitError';
  }
}

type ErrorPayload = {
  error: string;
  code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'VALIDATION_FAILED' | 'RATE_LIMITED' | 'INTERNAL_ERROR';
  details?: unknown;
};

function payloadFor(err: unknown): { status: number; body: ErrorPayload; headers?: Record<string, string> } | null {
  if (err instanceof UnauthorizedError) {
    return { status: 401, body: { error: err.message, code: 'UNAUTHORIZED' } };
  }
  if (err instanceof ForbiddenError) {
    return { status: 403, body: { error: err.message, code: 'FORBIDDEN' } };
  }
  if (err instanceof ZodError) {
    return { status: 400, body: { error: 'Validation failed', code: 'VALIDATION_FAILED', details: err.issues } };
  }
  if (err instanceof RateLimitError) {
    return {
      status: 429,
      body: { error: 'Too many requests', code: 'RATE_LIMITED' },
      headers: { 'Retry-After': String(Math.ceil(err.retryAfterMs / 1000)) },
    };
  }
  return null;
}

export const errorMappingMiddleware = createMiddleware({ type: 'request' }).server(async ({ next, request }) => {
  try {
    return await next();
  } catch (err) {
    const mapped = payloadFor(err);
    if (!mapped) throw err;
    const { pathname } = new URL(request.url);
    if (mapped.body.code !== 'UNAUTHORIZED' && mapped.body.code !== 'VALIDATION_FAILED') {
      console.error(`[${request.method} ${pathname}]`, err);
    }
    return new Response(JSON.stringify(mapped.body), {
      status: mapped.status,
      headers: { 'Content-Type': 'application/json', ...mapped.headers },
    });
  }
});
