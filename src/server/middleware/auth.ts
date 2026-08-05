import { createMiddleware } from '@tanstack/react-start';
import { ForbiddenError, UnauthorizedError } from '@/libs/rbac/errors';

// Error classes live in a pure module so this file (and its consumers in the
// client bundle via `appMiddleware`) stay free of prismadb/auth top-level
// imports. The actual server-side bodies are lazy-imported inside `.server()`.
export { ForbiddenError, UnauthorizedError };

export const authedMiddleware = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const { getRequestHeaders } = await import('@tanstack/react-start/server');
  const { requireAuthenticatedUser } = await import('@/libs/rbac/guards');
  const user = await requireAuthenticatedUser(getRequestHeaders());
  return next({ context: { user: { id: user.id, email: user.email } } });
});

export const adminMiddleware = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const { getRequestHeaders } = await import('@tanstack/react-start/server');
  const { requireAdmin } = await import('@/libs/rbac/guards');
  const user = await requireAdmin(getRequestHeaders());
  return next({ context: { user: { id: user.id, email: user.email }, isAdmin: true } });
});

export const tokenMiddleware = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const { getRequest } = await import('@tanstack/react-start/server');
  const { UnauthorizedError } = await import('@/libs/rbac/guards');
  const request = getRequest();
  const authHeader = request.headers.get('authorization');
  let tokenKey: string | null = null;

  if (authHeader?.startsWith('Bearer ')) {
    tokenKey = authHeader.slice(7);
  } else {
    try {
      const cloned = request.clone();
      const formData = await cloned.formData();
      tokenKey = formData.get('token')?.toString() || null;
    } catch {
      // Not form data, ignore
    }
  }

  if (!tokenKey) throw new UnauthorizedError('Missing authentication token');

  const { validateTokenKey } = await import('@/libs/auth/token-auth');
  const tokenRecord = await validateTokenKey(tokenKey);

  if (!tokenRecord) throw new UnauthorizedError('Invalid token');
  return next({ context: { user: { id: tokenRecord.user.id, email: tokenRecord.user.email } } });
});
