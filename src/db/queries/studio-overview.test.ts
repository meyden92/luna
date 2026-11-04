import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { inArray } from 'drizzle-orm';

/**
 * The admin overview's reads against a real Postgres: what they total, and
 * that no successful Generation's input reaches an admin.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

async function loadModules() {
  const [client, authSchema, studioSchema, overview] = await Promise.all([
    import('../client'),
    import('../schema/auth'),
    import('../schema/studio'),
    import('./studio-overview'),
  ]);
  return { db: client.db, ...authSchema, ...studioSchema, ...overview };
}

type Modules = Awaited<ReturnType<typeof loadModules>>;
const m = hasDatabase ? await loadModules() : ({} as Modules);

const runId = crypto.randomUUID();
const userId = `studio-overview-${runId}`;
const id = (name: string) => `${name}-${runId}`;
const snapshot = { input: { type: 'object', properties: {} }, output: { type: 'object' } };
const from = new Date('2026-11-01T00:00:00Z');
const to = new Date('2026-12-01T00:00:00Z');
const SECRET = `secret prompt ${runId}`;

describe.skipIf(!hasDatabase)('the admin overview', () => {
  beforeAll(async () => {
    await m.db.insert(m.user).values({ id: userId, name: 'Overview test', email: `${userId}@lunashare.test`, emailVerified: false });
    await m.db.insert(m.studioCategory).values({ id: id('cat'), name: 'Overview', icon: 'Image' });
    await m.db
      .insert(m.studioModel)
      .values({ id: id('model'), categoryId: id('cat'), endpointId: 'fake/image', name: `Model ${runId}`, schemaSnapshot: snapshot });
    const base = {
      userId,
      modelId: id('model'),
      name: `Model ${runId}`,
      endpointId: 'fake/image',
      createdAt: new Date('2026-11-10T00:00:00Z'),
    };
    await m.db.insert(m.generation).values([
      {
        ...base,
        id: id('succeeded'),
        status: 'succeeded',
        formValues: { prompt: SECRET },
        requestInput: { prompt: SECRET },
        estimatedCostUsd: 0.03,
        actualCostUsd: 1.2345,
      },
      {
        ...base,
        id: id('failed'),
        status: 'failed',
        formValues: { prompt: 'broken [fail]' },
        requestInput: { prompt: 'broken [fail]' },
        error: { message: 'The fake failed this request.', type: 'fake_failure' },
        estimatedCostUsd: 0.03,
      },
      {
        ...base,
        id: id('running'),
        status: 'running',
        formValues: { prompt: SECRET },
        requestInput: { prompt: SECRET },
        estimatedCostUsd: 0.1,
      },
      {
        ...base,
        id: id('long-ago'),
        status: 'succeeded',
        formValues: {},
        estimatedCostUsd: 0.5,
        createdAt: new Date('1999-03-31T23:30:00Z'),
      },
    ]);
  });

  afterAll(async () => {
    await m.db.delete(m.user).where(inArray(m.user.id, [userId]));
    await m.db.delete(m.studioModel).where(inArray(m.studioModel.id, [id('model')]));
    await m.db.delete(m.studioCategory).where(inArray(m.studioCategory.id, [id('cat')]));
  });

  test('totals spend per User and per Model from billed costs and estimates, without failures', async () => {
    const users = await m.spendByUser(from, to);
    expect(users.find((row) => row.userId === userId)).toMatchObject({ spentUsd: 1.3345, generations: 2 });
    const models = await m.spendByModel(from, to);
    expect(models.find((row) => row.modelId === id('model'))).toMatchObject({ modelName: `Model ${runId}`, spentUsd: 1.3345 });
  });

  test('totals spend per UTC calendar month', async () => {
    const months = await m.spendByMonth(new Date('1999-01-01T00:00:00Z'), new Date('1999-07-01T00:00:00Z'));
    expect(months).toEqual([{ month: '1999-03', spentUsd: 0.5, generations: 1 }]);
  });

  test('rates failures among finished Generations', async () => {
    const rates = await m.failureRates(from);
    expect(rates.find((row) => row.modelId === id('model'))).toMatchObject({ finished: 2, failed: 1 });
  });

  test("shows a failed Generation's input and error, and nothing of the others' inputs", async () => {
    const failed = await m.failedGenerations(from, 50);
    expect(failed.find((row) => row.id === id('failed'))).toMatchObject({
      formValues: { prompt: 'broken [fail]' },
      requestInput: { prompt: 'broken [fail]' },
      error: { type: 'fake_failure' },
    });
    const running = await m.runningGenerations();
    expect(running.map((row) => row.id)).toContain(id('running'));

    const everything = [
      await m.spendByUser(from, to),
      await m.spendByModel(from, to),
      await m.failureRates(from),
      running,
      failed,
      await m.listBudgetOverrides(),
    ];
    expect(JSON.stringify(everything)).not.toContain(SECRET);
  });
});
