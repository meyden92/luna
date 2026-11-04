import { expect } from '@playwright/test';
import { createFalClient } from '../../../src/libs/fal/client';
import type { JsonObject } from '../stack/fal-fake/catalog';
import type { StackEnv } from '../stack-env';

/**
 * Spec helpers for the stack's fake fal service (`stack/fal-fake/`). The fake is
 * shared by every worker: find your own requests by text unique to the test
 * (`uniquePrefix`), and swap schemas only on `fake/drift`.
 */

export interface FalRequestRecord {
  request_id: string;
  endpoint_id: string;
  /** Exactly what the app sent to fal. */
  input: JsonObject;
  status: 'IN_PROGRESS' | 'COMPLETED';
  /** `[slow]` and not yet released or cancelled. */
  held: boolean;
  cancelled: boolean;
  submitted_at: string;
}

export interface FalUploadRecord {
  file_url: string;
  file_name: string;
  content_type: string;
  /** Null until the bytes were PUT. */
  size: number | null;
  expiration_duration_seconds: number | null;
}

async function control<T>(stack: StackEnv, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${stack.E2E_FAL_URL}/__control/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`fal-fake /__control/${path} answered ${response.status}: ${await response.text()}`);
  return (await response.json()) as T;
}

/** The app's own fal client, pointed at the fake from the test process. */
export function falFakeClient(stack: StackEnv) {
  return createFalClient({
    key: stack.E2E_FAL_KEY,
    queueBaseUrl: stack.E2E_FAL_URL,
    restBaseUrl: stack.E2E_FAL_URL,
    apiBaseUrl: `${stack.E2E_FAL_URL}/v1`,
  });
}

/** Every queue request the fake received, oldest first. */
export async function falRequests(stack: StackEnv): Promise<FalRequestRecord[]> {
  return (await control<{ requests: FalRequestRecord[] }>(stack, 'requests')).requests;
}

/** Waits for the one request whose input contains `text` anywhere, e.g. in its prompt. */
export async function falRequestContaining(stack: StackEnv, text: string): Promise<FalRequestRecord> {
  let found: FalRequestRecord[] = [];
  await expect
    .poll(async () => {
      found = (await falRequests(stack)).filter((request) => JSON.stringify(request.input).includes(text));
      return found.length;
    })
    .toBe(1);
  return found[0]!;
}

/** Every file uploaded to the fake's storage; a request's input names them by `file_url`. */
export async function falUploads(stack: StackEnv): Promise<FalUploadRecord[]> {
  return (await control<{ uploads: FalUploadRecord[] }>(stack, 'uploads')).uploads;
}

/** Lets a `[slow]` request finish, as it would have without the hook. */
export async function releaseFalRequest(stack: StackEnv, requestId: string): Promise<void> {
  await control(stack, 'release', { request_id: requestId });
}

/**
 * Replaces what the catalog serves for `endpointId`: its `<Name>Input` schema
 * and its status. Each call states the whole override, so `{}` restores the
 * catalog's.
 */
export async function setFalModel(
  stack: StackEnv,
  endpointId: string,
  override: { input?: JsonObject; status?: 'active' | 'deprecated' },
): Promise<void> {
  await control(stack, 'schema', { endpoint_id: endpointId, ...override });
}
