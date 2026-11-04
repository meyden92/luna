import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { inArray, sql } from 'drizzle-orm';

/**
 * The Studio history's listing: Category and media kind filters and keyset
 * pagination, against a real Postgres. Rows are written directly (no audit
 * rows) under a throwaway user and removed afterwards.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

async function loadModules() {
  const [client, authSchema, studioSchema, queries] = await Promise.all([
    import('../client'),
    import('../schema/auth'),
    import('../schema/studio'),
    import('./studio'),
  ]);
  return { db: client.db, ...authSchema, ...studioSchema, ...queries };
}

type Modules = Awaited<ReturnType<typeof loadModules>>;
const m = hasDatabase ? await loadModules() : ({} as Modules);

const runId = crypto.randomUUID();
const userId = `studio-test-${runId}`;
const id = (name: string) => `${name}-${runId}`;
const snapshot = { input: { type: 'object', properties: {} }, output: { type: 'object' } };

describe.skipIf(!hasDatabase)('listOwnGenerations', () => {
  beforeAll(async () => {
    await m.db.insert(m.user).values({ id: userId, name: 'Studio test', email: `${userId}@lunashare.test`, emailVerified: false });
    await m.db.insert(m.studioCategory).values([
      { id: id('cat-a'), name: 'A', icon: 'Image' },
      { id: id('cat-b'), name: 'B', icon: 'Video' },
    ]);
    await m.db.insert(m.studioModel).values([
      { id: id('model-a'), categoryId: id('cat-a'), endpointId: 'fake/image', name: 'Model A', schemaSnapshot: snapshot },
      { id: id('model-b'), categoryId: id('cat-b'), endpointId: 'fake/video', name: 'Model B', schemaSnapshot: snapshot },
    ]);
    // A Template in Category A on Category B's Model counts as Category A.
    await m.db
      .insert(m.studioTemplate)
      .values({ id: id('template-a'), categoryId: id('cat-a'), modelId: id('model-b'), name: 'Template A' });

    const base = Date.parse('2026-11-01T12:00:00Z');
    const generations = [
      { name: 'oldest', modelId: id('model-a'), templateId: null },
      { name: 'video', modelId: id('model-b'), templateId: null },
      { name: 'template', modelId: id('model-b'), templateId: id('template-a') },
      { name: 'newest', modelId: id('model-a'), templateId: null },
    ];
    await m.db.insert(m.generation).values(
      generations.map((values, index) => ({
        id: id(values.name),
        userId,
        ...values,
        endpointId: 'fake/image',
        formValues: {},
        status: 'succeeded' as const,
        createdAt: new Date(base + index * 60_000),
      })),
    );
    const output = (generationId: string, mediaKind: 'image' | 'video') => ({
      id: id(`${generationId}-out`),
      generationId: id(generationId),
      index: 0,
      mediaKind,
      contentType: mediaKind === 'image' ? 'image/png' : 'video/mp4',
      s3Key: `studio/${userId}/${generationId}/0`,
      sizeBytes: 1,
      expiresAt: new Date(base + 7 * 86_400_000),
    });
    await m.db
      .insert(m.generationOutput)
      .values([output('oldest', 'image'), output('video', 'video'), output('template', 'video'), output('newest', 'image')]);
  });

  afterAll(async () => {
    await m.db.delete(m.user).where(inArray(m.user.id, [userId]));
    await m.db.delete(m.studioTemplate).where(inArray(m.studioTemplate.id, [id('template-a')]));
    await m.db.delete(m.studioModel).where(inArray(m.studioModel.id, [id('model-a'), id('model-b')]));
    await m.db.delete(m.studioCategory).where(inArray(m.studioCategory.id, [id('cat-a'), id('cat-b')]));
  });

  const names = (entries: Awaited<ReturnType<Modules['listOwnGenerations']>>) => entries.map(({ row }) => row.name);

  test('lists newest first with their Outputs', async () => {
    const entries = await m.listOwnGenerations(userId, { limit: 10 });
    expect(names(entries)).toEqual(['newest', 'template', 'video', 'oldest']);
    expect(entries[0]?.outputs.map((output) => output.mediaKind)).toEqual(['image']);
  });

  test('filters by the Category of the Template, else of the Model', async () => {
    expect(names(await m.listOwnGenerations(userId, { categoryId: id('cat-a'), limit: 10 }))).toEqual(['newest', 'template', 'oldest']);
    expect(names(await m.listOwnGenerations(userId, { categoryId: id('cat-b'), limit: 10 }))).toEqual(['video']);
  });

  test('filters by the media kinds of the Outputs', async () => {
    expect(names(await m.listOwnGenerations(userId, { mediaKinds: ['video'], limit: 10 }))).toEqual(['template', 'video']);
    expect(names(await m.listOwnGenerations(userId, { mediaKinds: ['audio'], limit: 10 }))).toEqual([]);
  });

  test('continues after a cursor without repeating or skipping', async () => {
    const first = await m.listOwnGenerations(userId, { limit: 3 });
    const last = first.at(-1)?.row;
    const rest = await m.listOwnGenerations(userId, { limit: 3, cursor: last!.id });
    expect([...names(first), ...names(rest)]).toEqual(['newest', 'template', 'video', 'oldest']);
  });

  test('pages through Generations created within the same millisecond', async () => {
    const other = `${userId}-micro`;
    await m.db.insert(m.user).values({ id: other, name: 'Studio test', email: `${other}@lunashare.test`, emailVerified: false });
    try {
      await m.db.insert(m.generation).values(
        ['first', 'second', 'third'].map((name, index) => ({
          id: id(`micro-${name}`),
          userId: other,
          name,
          endpointId: 'fake/image',
          formValues: {},
          createdAt: sql`${`2026-11-01T13:00:00.00010${index}Z`}::timestamptz`,
        })),
      );
      const first = await m.listOwnGenerations(other, { limit: 1 });
      const rest = await m.listOwnGenerations(other, { limit: 5, cursor: first[0]!.row.id });
      expect([...names(first), ...names(rest)]).toEqual(['third', 'second', 'first']);
    } finally {
      await m.db.delete(m.user).where(inArray(m.user.id, [other]));
    }
  });
});
