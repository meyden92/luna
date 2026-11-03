import { randomUUID } from 'node:crypto';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { expect } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { generation, generationOutput } from '../../../src/db/schema/studio';
import type { TestDb } from '../fixtures/db';
import { test } from '../fixtures/test';
import { fixtureUserId, workerRole } from '../fixtures/users';
import { fakeModel, type JsonObject, MEDIA } from '../stack/fal-fake/catalog';
import type { StackEnv } from '../stack-env';
import { falFakeClient, falRequestContaining, releaseFalRequest, setFalModel } from '../utils/fal-fake';
import { uniquePrefix } from '../utils/own-files';

// The app's Generation poller against the fake fal service. No screen submits a
// Generation yet, so each test submits to the fake with the app's own fal
// client and records the Generation row as the app's submit would; the app's
// poller then finishes it.

const FINISH_TIMEOUT_MS = 30_000;

async function seedSubmittedGeneration(db: TestDb, stack: StackEnv, userId: string, endpointId: string, input: JsonObject) {
  const submitted = await falFakeClient(stack).queue.submit(endpointId, input);
  const id = randomUUID();
  await db.insert(generation).values({
    id,
    userId,
    name: fakeModel(endpointId)!.displayName,
    endpointId,
    formValues: input,
    requestInput: input,
    falRequestId: submitted.requestId,
    statusUrl: submitted.statusUrl,
    responseUrl: submitted.responseUrl,
    cancelUrl: submitted.cancelUrl,
  });
  return { id, requestId: submitted.requestId };
}

async function generationRow(db: TestDb, id: string) {
  const [row] = await db.select().from(generation).where(eq(generation.id, id));
  return row!;
}

test('a Generation on the fake finishes with its Output copied to storage', async ({ db, stack, bucket }, testInfo) => {
  const userId = await fixtureUserId(db, workerRole(testInfo.parallelIndex));
  const { id } = await seedSubmittedGeneration(db, stack, userId, 'fake/image', { prompt: uniquePrefix('smoke') });

  await expect.poll(async () => (await generationRow(db, id)).status, { timeout: FINISH_TIMEOUT_MS }).toBe('succeeded');

  const outputs = await db.select().from(generationOutput).where(eq(generationOutput.generationId, id));
  expect(outputs).toHaveLength(1);
  const [output] = outputs;
  expect(output).toMatchObject({ mediaKind: 'image', contentType: 'image/png', width: 128, height: 128 });
  const object = await bucket.client.send(new GetObjectCommand({ Bucket: bucket.name, Key: output!.s3Key }));
  const stored = await object.Body!.transformToByteArray();
  const fixture = new Uint8Array(await (await fetch(`${stack.E2E_FAL_URL}/media/${MEDIA.image.name}`)).arrayBuffer());
  expect(Buffer.from(stored).equals(Buffer.from(fixture))).toBe(true);
});

test('[fail] in the input fails the Generation with a fal-style error', async ({ db, stack }, testInfo) => {
  const userId = await fixtureUserId(db, workerRole(testInfo.parallelIndex));
  const { id } = await seedSubmittedGeneration(db, stack, userId, 'fake/image', { prompt: `${uniquePrefix('smoke')} [fail]` });

  await expect.poll(async () => (await generationRow(db, id)).status, { timeout: FINISH_TIMEOUT_MS }).toBe('failed');
  expect((await generationRow(db, id)).error).toMatchObject({ type: 'fake_failure', message: expect.stringContaining('[fail]') });
});

test('[slow] holds the Generation running until it is released', async ({ db, stack }, testInfo) => {
  const userId = await fixtureUserId(db, workerRole(testInfo.parallelIndex));
  const prompt = `${uniquePrefix('smoke')} [slow]`;
  const { id, requestId } = await seedSubmittedGeneration(db, stack, userId, 'fake/image', { prompt });

  await expect.poll(async () => (await generationRow(db, id)).status, { timeout: FINISH_TIMEOUT_MS }).toBe('running');
  expect(await falRequestContaining(stack, prompt)).toMatchObject({ request_id: requestId, status: 'IN_PROGRESS', held: true });

  await releaseFalRequest(stack, requestId);
  await expect.poll(async () => (await generationRow(db, id)).status, { timeout: FINISH_TIMEOUT_MS }).toBe('succeeded');
});

test('/__control/schema swaps what the catalog serves for a Model', async ({ stack }) => {
  const fal = falFakeClient(stack);
  const served = async () => {
    const [model] = (await fal.platform.models({ endpointIds: ['fake/drift'], expandOpenapi: true })).models;
    const schemas = (model!.openapi as { components: { schemas: Record<string, { properties: Record<string, unknown> }> } }).components
      .schemas;
    return { status: model!.status, properties: Object.keys(schemas.FakeDriftInput!.properties) };
  };
  const input = structuredClone(fakeModel('fake/drift')!.input) as { properties: Record<string, unknown> };
  delete input.properties.aspect_ratio;

  try {
    await setFalModel(stack, 'fake/drift', { input: input as JsonObject, status: 'deprecated' });
    expect(await served()).toEqual({ status: 'deprecated', properties: ['prompt', 'num_images', 'seed'] });
  } finally {
    await setFalModel(stack, 'fake/drift', {});
  }
  expect(await served()).toEqual({ status: 'active', properties: ['prompt', 'aspect_ratio', 'num_images', 'seed'] });
});
