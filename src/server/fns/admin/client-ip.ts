import { createServerFn } from '@tanstack/react-start';
import { getRequest, getRequestIP } from '@tanstack/react-start/server';
import { proxyDiagnosis } from '@/libs/client-ip';
import { env } from '@/libs/env';
import { appMiddleware } from '@/server/server-fn';

/** How the app derives the admin's own client IP, with the warnings `proxyDiagnosis` raises (#236). */
export const getClientIpDiagnosis = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(async () => proxyDiagnosis(getRequest().headers, env.TRUSTED_PROXY_HOPS, getRequestIP()));
