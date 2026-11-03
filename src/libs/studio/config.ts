import { env } from '@/libs/env';
import { createFalClient, type FalClient } from '@/libs/fal/client';
import { publicKeysFromJwks } from '@/libs/fal/webhook';
import { UserFacingError } from '@/libs/user-facing-error';
import { studioWebhookUrl } from './webhook-url';

/**
 * Whether this instance runs the Studio, and its fal client. Server-only.
 *
 * Without `FAL_KEY` the Studio is off: its routes and server functions refuse
 * with `StudioDisabledError`, and nothing Studio-related renders.
 */

export function isStudioEnabled(): boolean {
  return Boolean(env.FAL_KEY);
}

export class StudioDisabledError extends UserFacingError {
  constructor() {
    super('The Studio is not enabled on this instance.', 'StudioDisabledError');
    this.status = 404;
  }
}

export function assertStudioEnabled(): void {
  if (!isStudioEnabled()) throw new StudioDisabledError();
}

let client: FalClient | undefined;

/** The fal client for this instance's key and hosts. Throws while the Studio is off. */
export function falClient(): FalClient {
  assertStudioEnabled();
  client ??= createFalClient({
    key: env.FAL_KEY as string,
    billingKey: env.FAL_BILLING_KEY || undefined,
    queueBaseUrl: env.FAL_QUEUE_BASE_URL,
    restBaseUrl: env.FAL_REST_BASE_URL,
    apiBaseUrl: env.FAL_API_BASE_URL,
  });
  return client;
}

const JWKS_TTL_MS = 24 * 60 * 60 * 1000;
let jwks: { keys: Uint8Array<ArrayBuffer>[]; fetchedAt: number } | undefined;

/** fal's webhook signing keys, fetched from its JWKS at most once a day. */
export async function falWebhookKeys(): Promise<Uint8Array<ArrayBuffer>[]> {
  if (jwks && Date.now() - jwks.fetchedAt < JWKS_TTL_MS) return jwks.keys;
  const response = await fetch(`${env.FAL_REST_BASE_URL.replace(/\/+$/, '')}/.well-known/jwks.json`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Fetching fal's JWKS failed with ${response.status}`);
  jwks = { keys: publicKeysFromJwks(await response.json()), fetchedAt: Date.now() };
  return jwks.keys;
}

/**
 * Where fal should deliver results, or null when fal cannot reach this
 * instance. `BETTER_AUTH_URL` is read from the process because Better Auth
 * owns it and it is not part of the env schema.
 */
export function studioWebhookTarget(): string | null {
  return studioWebhookUrl(env.PUBLIC_BASE_URL || process.env.BETTER_AUTH_URL);
}
