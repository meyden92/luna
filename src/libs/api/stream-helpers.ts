import { requireAuthenticatedUser, UnauthorizedError } from '@/libs/rbac/guards';
import { logRequest } from './logger';

export async function authenticateRequest(request: Request): Promise<{ id: string; email: string }> {
  const user = await requireAuthenticatedUser(request.headers);
  return { id: user.id, email: user.email };
}

/**
 * Log the start of a streaming request. Call this after auth succeeds.
 * Returns a `done()` function to call when the stream ends.
 */
export function logStreamRequest(opts: { method: string; pathname: string; userId: string; userEmail?: string }) {
  const startTime = performance.now();

  return {
    done(success: boolean) {
      const durationMs = Math.round(performance.now() - startTime);
      logRequest({
        success,
        method: opts.method,
        pathname: opts.pathname,
        durationMs,
        userId: opts.userId,
        userEmail: opts.userEmail,
      });
    },
  };
}

export { UnauthorizedError };
