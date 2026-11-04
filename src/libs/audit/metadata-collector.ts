import { getRequest, getRequestIP } from '@tanstack/react-start/server';
import { getSessionCookie } from 'better-auth/cookies';
import { createHash, randomUUID } from 'crypto';
import { AUTH_COOKIE_PREFIX } from '@/libs/auth/cookie-prefix';
import { clientIp } from '@/libs/client-ip';
import { env } from '@/libs/env';
import type { AuditMetadata } from '@/types/audit';

/**
 * A stable correlation id for audit rows: a hash of the session token, never
 * the token itself (which would grant session takeover to anyone with log or
 * database access). Undefined when the request carries no session cookie.
 */
export function auditSessionId(headers: Headers): string | undefined {
  const token = getSessionCookie(headers, { cookiePrefix: AUTH_COOKIE_PREFIX });
  if (!token) return undefined;
  return createHash('sha256').update(token).digest('hex').slice(0, 32);
}

export class MetadataCollector {
  static async collectFromRequest(): Promise<AuditMetadata> {
    let headers: Headers;
    let socketIp: string | undefined;
    try {
      headers = getRequest().headers;
      socketIp = getRequestIP();
    } catch {
      // No request context (cron tasks, server startup) — audit without metadata.
      return {};
    }

    return {
      // The same address the rate limiters key on, never one the client chose (#234).
      ipAddress: clientIp(headers, env.TRUSTED_PROXY_HOPS, socketIp),
      userAgent: headers.get('user-agent') || undefined,
      requestId: headers.get('x-request-id') || undefined,
      endpoint: headers.get('x-invoke-path') || undefined,
      sessionId: auditSessionId(headers),
    };
  }

  static generateChangeSetId(): string {
    return `cs_${randomUUID()}`;
  }
}
