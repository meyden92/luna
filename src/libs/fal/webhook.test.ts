import { beforeAll, describe, expect, test } from 'bun:test';
import { publicKeysFromJwks, verifyFalWebhook } from './webhook';

const encoder = new TextEncoder();
const NOW = 1_800_000_000;

let signingKey: CryptoKey;
let jwks: unknown;
let otherJwks: unknown;

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
}

async function exportJwk(key: CryptoKey) {
  return { keys: [{ kty: 'OKP', crv: 'Ed25519', x: Buffer.from(await crypto.subtle.exportKey('raw', key)).toString('base64url') }] };
}

/** Signs the way fal does: `request_id\nuser_id\ntimestamp\nsha256hex(body)`, hex-encoded. */
async function signedHeaders(body: Uint8Array<ArrayBuffer>, { requestId = 'req-1', userId = 'fal-user', timestamp = NOW } = {}) {
  const message = [requestId, userId, String(timestamp), await sha256Hex(body)].join('\n');
  const signature = Buffer.from(await crypto.subtle.sign('Ed25519', signingKey, encoder.encode(message))).toString('hex');
  return new Headers({
    'X-Fal-Webhook-Request-Id': requestId,
    'X-Fal-Webhook-User-Id': userId,
    'X-Fal-Webhook-Timestamp': String(timestamp),
    'X-Fal-Webhook-Signature': signature,
  });
}

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as CryptoKeyPair;
  signingKey = pair.privateKey;
  jwks = await exportJwk(pair.publicKey);
  const other = (await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as CryptoKeyPair;
  otherJwks = await exportJwk(other.publicKey);
});

describe('verifyFalWebhook', () => {
  const body = encoder.encode('{"request_id":"req-1","status":"OK","payload":{}}');

  test('accepts a body signed by a key in the JWKS', async () => {
    const headers = await signedHeaders(body);
    expect(await verifyFalWebhook({ headers, body, publicKeys: publicKeysFromJwks(jwks), nowSeconds: NOW })).toEqual({
      ok: true,
      requestId: 'req-1',
    });
  });

  test('accepts when any one of several keys verifies', async () => {
    const headers = await signedHeaders(body);
    const keys = [...publicKeysFromJwks(otherJwks), ...publicKeysFromJwks(jwks)];
    expect((await verifyFalWebhook({ headers, body, publicKeys: keys, nowSeconds: NOW })).ok).toBe(true);
  });

  test('rejects a body changed after signing', async () => {
    const headers = await signedHeaders(body);
    const tampered = encoder.encode('{"request_id":"req-1","status":"OK","payload":{"x":1}}');
    expect(await verifyFalWebhook({ headers, body: tampered, publicKeys: publicKeysFromJwks(jwks), nowSeconds: NOW })).toEqual({
      ok: false,
      reason: 'bad-signature',
    });
  });

  test('rejects a signature from a key outside the JWKS', async () => {
    const headers = await signedHeaders(body);
    const result = await verifyFalWebhook({ headers, body, publicKeys: publicKeysFromJwks(otherJwks), nowSeconds: NOW });
    expect(result).toEqual({ ok: false, reason: 'bad-signature' });
  });

  test('rejects a timestamp more than 300 seconds off, in either direction', async () => {
    const keys = publicKeysFromJwks(jwks);
    const stale = await signedHeaders(body, { timestamp: NOW - 301 });
    const future = await signedHeaders(body, { timestamp: NOW + 301 });
    const edge = await signedHeaders(body, { timestamp: NOW - 300 });
    expect(await verifyFalWebhook({ headers: stale, body, publicKeys: keys, nowSeconds: NOW })).toEqual({ ok: false, reason: 'stale' });
    expect(await verifyFalWebhook({ headers: future, body, publicKeys: keys, nowSeconds: NOW })).toEqual({ ok: false, reason: 'stale' });
    expect((await verifyFalWebhook({ headers: edge, body, publicKeys: keys, nowSeconds: NOW })).ok).toBe(true);
  });

  test('rejects a request missing a signature header', async () => {
    const headers = await signedHeaders(body);
    headers.delete('X-Fal-Webhook-Signature');
    expect(await verifyFalWebhook({ headers, body, publicKeys: publicKeysFromJwks(jwks), nowSeconds: NOW })).toEqual({
      ok: false,
      reason: 'missing-headers',
    });
  });

  test('rejects a request id swapped after signing', async () => {
    const headers = await signedHeaders(body);
    headers.set('X-Fal-Webhook-Request-Id', 'req-2');
    expect((await verifyFalWebhook({ headers, body, publicKeys: publicKeysFromJwks(jwks), nowSeconds: NOW })).ok).toBe(false);
  });
});

describe('publicKeysFromJwks', () => {
  test('ignores keys that are not raw 32-byte Ed25519 keys', () => {
    expect(publicKeysFromJwks({ keys: [{ x: 'c2hvcnQ' }, { kty: 'RSA' }] })).toEqual([]);
    expect(publicKeysFromJwks(null)).toEqual([]);
  });
});
