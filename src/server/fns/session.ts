import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import type { Session } from '@/libs/auth/auth';
import { appMiddleware } from '@/server/server-fn';

export const getCurrentSession = createServerFn({ method: 'GET' }).handler(async () => {
  const [{ auth }, { requireAuthenticatedUser }] = await Promise.all([import('@/libs/auth/auth'), import('@/libs/rbac/guards')]);
  const headers = getRequestHeaders();
  const result = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
  if (!result) return null;
  try {
    await requireAuthenticatedUser(headers);
  } catch {
    return null;
  }
  return (result ?? null) as Session | null;
});

export const listUserSessions = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .handler(async () => {
    const { auth } = await import('@/libs/auth/auth');
    return auth.api.listSessions({ headers: getRequestHeaders() });
  });
