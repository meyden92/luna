import { getRequest } from '@tanstack/react-start/server';
import { env } from '@/libs/env';

export function getPublicOrigin(): string {
  if (env.PUBLIC_BASE_URL) {
    return env.PUBLIC_BASE_URL.replace(/\/+$/, '');
  }

  const request = getRequest();
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') ?? new URL(request.url).protocol.replace(':', '');

  return host ? `${proto}://${host}` : new URL(request.url).origin;
}
