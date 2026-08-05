import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { deriveSigningKey } from '@/libs/crypto/signing-keys';
import { env } from '@/libs/env';

const DELIVERY_SESSION_MS = 15 * 60_000;

const deliverySessionPayloadSchema = z.object({
  scope: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('file'), fileId: z.string().min(1) }),
    z.object({ kind: z.literal('folder'), folderId: z.string().min(1) }),
    z.object({ kind: z.literal('files'), fileIds: z.array(z.string().min(1)).max(500) }),
  ]),
  exp: z.number().int().positive(),
  nonce: z.string().min(8),
});

export type DeliverySessionPayload = z.infer<typeof deliverySessionPayloadSchema>;

export function createDeliverySession(scope: DeliverySessionPayload['scope'], maxExpiresAt?: Date | null): string {
  const fallbackExp = Date.now() + DELIVERY_SESSION_MS;
  const exp = Math.min(fallbackExp, maxExpiresAt?.getTime() ?? fallbackExp);
  const payload = Buffer.from(JSON.stringify({ scope, exp, nonce: randomUUID() }), 'utf8').toString('base64url');
  const signature = signDeliveryPayload(payload);
  return `${payload}.${signature}`;
}

export function verifyDeliverySession(token: string | null | undefined): DeliverySessionPayload | null {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = signDeliveryPayload(payload);
  const expectedBuffer = Buffer.from(expected, 'base64url');
  const actualBuffer = Buffer.from(signature, 'base64url');
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) return null;

  try {
    const parsed = deliverySessionPayloadSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
    return parsed.exp > Date.now() ? parsed : null;
  } catch {
    return null;
  }
}

export function deliverySessionAllowsFile(payload: DeliverySessionPayload, file: { id: string; folderId: string | null }): boolean {
  if (payload.scope.kind === 'file') return payload.scope.fileId === file.id;
  if (payload.scope.kind === 'folder') return payload.scope.folderId === file.folderId;
  return payload.scope.fileIds.includes(file.id);
}

export function deliverySessionCookie(token: string): string {
  const secure = env.NODE_ENV === 'production' ? '; Secure' : '';
  return `ls_dlv=${token}; Path=/api/d; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(DELIVERY_SESSION_MS / 1000)}${secure}`;
}

function signDeliveryPayload(payload: string): string {
  return createHmac('sha256', deriveSigningKey('delivery-session', env.DELIVERY_COOKIE_SECRET)).update(payload).digest('base64url');
}
