import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq, inArray, sql } from 'drizzle-orm';

/**
 * The Studio history's listing (Category and media kind filters, keyset
 * pagination), Budgets and the schema check's record, against a real
 * Postgres. Rows are written directly under throwaway ids and removed
 * afterwards, audit rows included.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

async function loadModules() {
  const [client, adminSchema, authSchema, studioSchema, queries, generations] = await Promise.all([
    import('../client'),
    import('../schema/admin'),
    import('../schema/auth'),
    import('../schema/studio'),
    import('./studio'),
    import('./generations'),
  ]);
  return { db: client.db, ...adminSchema, ...authSchema, ...studioSchema, ...queries, ...generations };
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

describe.skipIf(!hasDatabase)('Budgets', () => {
  const spender = `${userId}-budget`;
  const now = new Date('2026-11-15T12:00:00Z');
  const spend = (name: string, values: Partial<typeof m.generation.$inferInsert>) => ({
    id: id(`budget-${name}`),
    userId: spender,
    name,
    endpointId: 'fake/image',
    formValues: {},
    status: 'succeeded' as const,
    ...values,
  });

  beforeAll(async () => {
    await m.db.insert(m.user).values({ id: spender, name: 'Budget test', email: `${spender}@lunashare.test`, emailVerified: false });
    // Written directly, not through setStudioBudgetOverride, so the test leaves no audit rows.
    await m.db.insert(m.studioBudgetOverride).values({ userId: spender, monthlyBudgetUsd: 1 });
    await m.db.insert(m.generation).values([
      spend('settled', { estimatedCostUsd: 0.03, actualCostUsd: 0.25, createdAt: new Date('2026-11-01T00:00:00Z') }),
      spend('unsettled', { estimatedCostUsd: 0.1, createdAt: new Date('2026-11-30T23:59:59Z') }),
      spend('deleted', { estimatedCostUsd: 0.2, deletedAt: now, createdAt: new Date('2026-11-10T00:00:00Z') }),
      spend('failed', { status: 'failed', estimatedCostUsd: 5, createdAt: new Date('2026-11-10T00:00:00Z') }),
      spend('billed failure', {
        status: 'failed',
        error: { message: 'fal returned no media.', billed: true },
        estimatedCostUsd: 0.07,
        createdAt: new Date('2026-11-10T00:00:00Z'),
      }),
      spend('cancelled', { status: 'cancelled', estimatedCostUsd: 5, createdAt: new Date('2026-11-10T00:00:00Z') }),
      spend('last month', { estimatedCostUsd: 5, createdAt: new Date('2026-10-31T23:59:59.999Z') }),
      spend('next month', { estimatedCostUsd: 5, createdAt: new Date('2026-12-01T00:00:00Z') }),
    ]);
  });

  afterAll(async () => {
    await m.db.delete(m.user).where(inArray(m.user.id, [spender]));
  });

  test('counts this UTC month’s billed costs and estimates, deleted entries and billed failures too, but not other failed or cancelled ones', async () => {
    expect(await m.getBudgetState(spender, m.db, now)).toEqual({ limitUsd: 1, spentUsd: 0.62, remainingUsd: 0.38 });
  });

  test('admission refuses an estimate the remainder does not cover, and an unlimited override lifts it', async () => {
    // Admission reads the current month, so these rows are created now.
    const current = `${spender}-now`;
    await m.db.insert(m.user).values({ id: current, name: 'Budget test', email: `${current}@lunashare.test`, emailVerified: false });
    try {
      await m.db.insert(m.studioBudgetOverride).values({ userId: current, monthlyBudgetUsd: 0.05 });
      await m.db.insert(m.generation).values({ ...spend('spent', { estimatedCostUsd: 0.03 }), id: id('budget-now'), userId: current });
      const next = { userId: current, modelId: null, templateId: null, name: 'next', endpointId: 'fake/image', formValues: {} };
      await expect(m.admitGeneration({ ...next, estimatedCostUsd: 0.03 })).rejects.toThrow(
        'This would cost about 0.03 $, but only 0.02 $ of your monthly Budget is left.',
      );
      await m.db.update(m.studioBudgetOverride).set({ monthlyBudgetUsd: null }).where(eq(m.studioBudgetOverride.userId, current));
      const admitted = await m.admitGeneration({ ...next, estimatedCostUsd: 0.03 });
      expect(admitted.status).toBe('queued');
    } finally {
      await m.db.delete(m.user).where(inArray(m.user.id, [current]));
    }
  });

  test('deleting a Generation clears its inputs and hides it, makes its live Outputs due, but keeps its cost', async () => {
    await m.db
      .insert(m.generation)
      .values(spend('to delete', { id: id('budget-delete'), estimatedCostUsd: 0.4, formValues: { prompt: 'secret' }, createdAt: now }));
    const output = (index: number, expiredAt: Date | null) => ({
      id: id(`budget-delete-${index}`),
      generationId: id('budget-delete'),
      index,
      mediaKind: 'image' as const,
      contentType: 'image/png',
      s3Key: `studio/${spender}/delete/${index}.png`,
      sizeBytes: 1,
      expiresAt: new Date('2026-11-20T00:00:00Z'),
      expiredAt,
    });
    await m.db.insert(m.generationOutput).values([output(0, null), output(1, now)]);

    const due = await m.deleteOwnedGeneration(id('budget-delete'), spender);
    expect(due).toEqual([{ id: id('budget-delete-0'), s3Key: `studio/${spender}/delete/0.png` }]);
    expect((await m.listGenerationOutputs(id('budget-delete'))).map((row) => row.expiresAt.getTime() <= Date.now())).toEqual([true, false]);
    expect(await m.getOwnedOutput(id('budget-delete-0'), spender)).toBeUndefined();
    expect(await m.getOwnedGeneration(id('budget-delete'), spender)).toBeUndefined();
    const [row] = await m.db
      .select()
      .from(m.generation)
      .where(eq(m.generation.id, id('budget-delete')));
    expect(row?.formValues).toEqual({});
    expect((await m.getBudgetState(spender, m.db, now)).spentUsd).toBe(1.02);
  });

  test('a Generation deleted while fal finished it records its Outputs already due', async () => {
    await m.db
      .insert(m.generation)
      .values(spend('finishing', { id: id('budget-finishing'), status: 'cancelled', deletedAt: now, createdAt: now }));
    const finished = await m.completeGeneration(id('budget-finishing'), {
      status: 'succeeded',
      outputs: [
        {
          index: 0,
          mediaKind: 'image',
          contentType: 'image/png',
          s3Key: `studio/${spender}/finishing/0.png`,
          sizeBytes: 1,
          width: null,
          height: null,
          durationSeconds: null,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      ],
    });
    expect(finished?.status).toBe('succeeded');
    const [stored] = await m.listGenerationOutputs(id('budget-finishing'));
    expect(stored?.expiresAt.getTime()).toBe(finished?.completedAt?.getTime());
  });
});

describe.skipIf(!hasDatabase)('recordStudioSchemaCheck', () => {
  const modelId = id('drift-model');
  const categoryId = id('drift-cat');
  const pending = { input: { type: 'object', properties: { prompt: { type: 'string' } } }, output: { type: 'object' } };
  const updatedAt = new Date('2026-10-01T00:00:00Z');

  beforeAll(async () => {
    await m.db.insert(m.studioCategory).values({ id: categoryId, name: 'Drift', icon: 'Image' });
    await m.db
      .insert(m.studioModel)
      .values({ id: modelId, categoryId, endpointId: 'fake/drift', name: 'Drift', schemaSnapshot: snapshot, updatedAt });
  });

  afterAll(async () => {
    await m.db.delete(m.auditLog).where(eq(m.auditLog.recordId, modelId));
    await m.db.delete(m.studioModel).where(eq(m.studioModel.id, modelId));
    await m.db.delete(m.studioCategory).where(eq(m.studioCategory.id, categoryId));
  });

  const audits = async () => (await m.db.select().from(m.auditLog).where(eq(m.auditLog.recordId, modelId))).length;

  test('stores the outcome without touching updated_at, and audits only a change', async () => {
    const checkedAt = new Date('2026-11-04T05:00:00Z');
    await m.recordStudioSchemaCheck(modelId, { pendingSchema: null, deprecated: false, checkedAt });
    expect(await audits()).toBe(0);

    const row = await m.recordStudioSchemaCheck(modelId, { pendingSchema: pending, deprecated: true, checkedAt });
    expect(row?.pendingSchema).toEqual(pending);
    expect(row?.deprecated).toBe(true);
    expect(row?.schemaCheckedAt).toEqual(checkedAt);
    expect(row?.updatedAt).toEqual(updatedAt);
    expect(await audits()).toBe(1);

    await m.recordStudioSchemaCheck(modelId, { pendingSchema: pending, deprecated: true, checkedAt: new Date() });
    expect(await audits()).toBe(1);
  });
});
