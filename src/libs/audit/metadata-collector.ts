import { getRequest, getRequestIP } from '@tanstack/react-start/server';
import { createHash, randomUUID } from 'crypto';
import { clientIp } from '@/libs/client-ip';
import { env } from '@/libs/env';
import type { AuditMetadata } from '@/types/audit';

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
      sessionId: MetadataCollector.extractSessionId(headers.get('cookie')),
    };
  }

  // Hashes the session token so audit rows get a stable correlation ID
  // without persisting the raw bearer token (which would grant session takeover
  // to anyone with log/database access).
  private static extractSessionId(cookieHeader: string | null): string | undefined {
    if (!cookieHeader) return undefined;

    const sessionCookie = cookieHeader.split(';').find((cookie) => cookie.trim().startsWith('better-auth.session_token='));

    if (!sessionCookie) return undefined;

    const rawValue = sessionCookie.split('=')[1]?.trim();
    if (!rawValue) return undefined;

    return createHash('sha256').update(rawValue).digest('hex').slice(0, 32);
  }

  static generateChangeSetId(): string {
    return `cs_${randomUUID()}`;
  }
}
