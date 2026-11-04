/**
 * Verification of fal's webhook signatures (ED25519, keys from fal's JWKS).
 *
 * fal signs `request_id \n user_id \n timestamp \n sha256hex(body)` with one of
 * the keys it publishes; any published key may verify. The body must be the
 * raw bytes as received, since re-serialised JSON hashes differently.
 *
 * Pure, so it is testable with a generated key pair. Fetching and caching the
 * JWKS lives in `falWebhookKeys` (`libs/studio/config.ts`).
 */

const WEBHOOK_TOLERANCE_SECONDS = 300;

export type WebhookVerification = { ok: true; requestId: string } | { ok: false; reason: 'missing-headers' | 'stale' | 'bad-signature' };

const encoder = new TextEncoder();

/** The raw 32-byte public keys in a JWKS document; anything else is skipped. */
export function publicKeysFromJwks(jwks: unknown): Uint8Array<ArrayBuffer>[] {
  if (typeof jwks !== 'object' || jwks === null || !Array.isArray((jwks as { keys?: unknown }).keys)) return [];
  const keys: Uint8Array<ArrayBuffer>[] = [];
  for (const entry of (jwks as { keys: unknown[] }).keys) {
    const x = typeof entry === 'object' && entry !== null ? (entry as { x?: unknown }).x : undefined;
    if (typeof x !== 'string') continue;
    const raw = new Uint8Array(Buffer.from(x, 'base64url'));
    if (raw.length === 32) keys.push(raw);
  }
  return keys;
}

export async function verifyFalWebhook(options: {
  headers: Headers;
  body: Uint8Array<ArrayBuffer>;
  publicKeys: Uint8Array<ArrayBuffer>[];
  nowSeconds: number;
}): Promise<WebhookVerification> {
  const { headers, body, publicKeys, nowSeconds } = options;
  const requestId = headers.get('x-fal-webhook-request-id');
  const userId = headers.get('x-fal-webhook-user-id');
  const timestamp = headers.get('x-fal-webhook-timestamp');
  const signatureHex = headers.get('x-fal-webhook-signature');
  if (!requestId || !userId || !timestamp || !signatureHex) return { ok: false, reason: 'missing-headers' };

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(nowSeconds - sentAt) > WEBHOOK_TOLERANCE_SECONDS) return { ok: false, reason: 'stale' };
  if (!/^(?:[0-9a-f]{2})+$/i.test(signatureHex)) return { ok: false, reason: 'bad-signature' };

  const bodyHash = Buffer.from(await crypto.subtle.digest('SHA-256', body)).toString('hex');
  const message = encoder.encode([requestId, userId, timestamp, bodyHash].join('\n'));
  const signature = new Uint8Array(Buffer.from(signatureHex, 'hex'));

  for (const raw of publicKeys) {
    const key = await crypto.subtle.importKey('raw', raw, 'Ed25519', false, ['verify']);
    if (await crypto.subtle.verify('Ed25519', key, signature, message)) return { ok: true, requestId };
  }
  return { ok: false, reason: 'bad-signature' };
}
