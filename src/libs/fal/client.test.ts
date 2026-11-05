import { describe, expect, test } from 'bun:test';
import { createFalClient } from './client';

/** A client whose fetch records each request's Authorization header. */
function recordingClient() {
  const authorization: (string | null)[] = [];
  const client = createFalClient({
    key: 'test-key',
    queueBaseUrl: 'https://queue.test',
    restBaseUrl: 'https://rest.test',
    apiBaseUrl: 'https://api.test/v1',
    fetch: (async (_url: string, init: RequestInit) => {
      authorization.push(new Headers(init.headers).get('authorization'));
      return Response.json({ models: [], has_more: false });
    }) as typeof fetch,
  });
  return { client, authorization };
}

describe('platform.models', () => {
  test('asks for OpenAPI documents without a key', async () => {
    const { client, authorization } = recordingClient();
    await client.platform.models({ endpointIds: ['fal-ai/flux'], expandOpenapi: true });
    expect(authorization).toEqual([null]);
  });

  test('searches the catalog with the key', async () => {
    const { client, authorization } = recordingClient();
    await client.platform.models({ q: 'flux' });
    expect(authorization).toEqual(['Key test-key']);
  });
});
