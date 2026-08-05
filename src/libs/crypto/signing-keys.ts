import { hkdfSync } from 'node:crypto';
import { env } from '@/libs/env';

/**
 * Derives a purpose-isolated 32-byte signing key.
 *
 * Prefers a dedicated secret when configured; otherwise derives from the shared
 * application secret. Because each purpose uses a distinct HKDF `info` label, the
 * signing domains (rendition URLs, delivery cookies, visitor hashes) never share
 * the same raw key even when they fall back to the same base secret — a leak in
 * one domain no longer forges the others.
 */
const cache = new Map<string, Buffer>();

export function deriveSigningKey(purpose: string, dedicatedSecret?: string | null): Buffer {
  const cached = cache.get(purpose);
  if (cached) return cached;
  const ikm = dedicatedSecret ?? env.FORM_FIELD_ENCRYPTION_KEY;
  const key = Buffer.from(hkdfSync('sha256', ikm, 'lunashare/signing/v1', purpose, 32));
  cache.set(purpose, key);
  return key;
}
