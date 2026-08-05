import { getRequestHeaders } from '@tanstack/react-start/server';
import { createHash, randomUUID } from 'crypto';
import type { AuditMetadata } from '@/types/audit';

export class MetadataCollector {
  static async collectFromRequest(): Promise<AuditMetadata> {
    let headersList: Record<string, string | undefined> | Headers;
    try {
      headersList = getRequestHeaders() as unknown as Record<string, string | undefined> | Headers;
    } catch {
      // No request context (cron tasks, server startup) — audit without metadata.
      return {};
    }

    const get = (name: string) =>
      (headersList instanceof Headers ? headersList.get(name) : (headersList as Record<string, string | undefined>)[name]) ?? null;

    return {
      ipAddress: get('x-forwarded-for')?.split(',')[0]?.trim() || get('x-real-ip') || undefined,
      userAgent: get('user-agent') || undefined,
      requestId: get('x-request-id') || undefined,
      endpoint: get('x-invoke-path') || undefined,
      sessionId: MetadataCollector.extractSessionId(get('cookie')),
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
