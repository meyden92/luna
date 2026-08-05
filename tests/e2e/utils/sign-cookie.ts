import { createHmac } from 'node:crypto';

export function signSessionCookie(token: string, secret: string): string {
  const signature = createHmac('sha256', secret).update(token).digest('base64');
  return encodeURIComponent(`${token}.${signature}`);
}
