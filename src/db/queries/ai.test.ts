import { afterAll, describe, expect, test } from 'bun:test';
import { eq, inArray } from 'drizzle-orm';

/**
 * The two behaviours in this module that regress SILENTLY — no error, no type
 * error, no other failing test — so they are the two worth a test (issues #23,
 * #38).
 *
 * 1. The global-variable name check was case-insensitive under MariaDB's
 *    utf8mb4_unicode_ci and the form never asked for case to matter. On
 *    Postgres a plain `eq` would quietly start accepting `Style` alongside
 *    `style`, and the two are then indistinguishable in a prompt placeholder.
 * 2. The streaming endpoints write a generation row repeatedly as a prediction
 *    polls. Prisma's upsert treated an absent field as "leave it alone"; a
 *    faithful port has to as well, or a later progress write erases the
 *    prediction id and the reconciler can never finish the generation.
 *
 * Needs a real Postgres — case comparison is the database's semantics, and the
 * upsert behaviour is the query builder's. Skips cleanly without `DATABASE_URL`.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

/** Lazy, because `../client` opens a pool at module load and would defeat skipIf. */
async function loadModules() {
  const [client, aiSchema, adminSchema, authSchema, queries] = await Promise.all([
    import('../client'),
    import('../schema/ai'),
    import('../schema/admin'),
    import('../schema/auth'),
    import('./ai'),
  ]);
  return {
    db: client.db,
    auditLog: adminSchema.auditLog,
    globalVariable: aiSchema.globalVariable,
    template: aiSchema.template,
    templateGeneration: aiSchema.templateGeneration,
    user: authSchema.user,
    createGlobalVariable: queries.createGlobalVariable,
    globalVariableNameTaken: queries.globalVariableNameTaken,
    upsertTemplateGeneration: queries.upsertTemplateGeneration,
  };
}

type Modules = Awaited<ReturnType<typeof loadModules>>;

// Only dereferenced inside tests, which do not run without a database.
const {
  db,
  auditLog,
  globalVariable,
  template,
  templateGeneration,
  user,
  createGlobalVariable,
  globalVariableNameTaken,
  upsertTemplateGeneration,
} = hasDatabase ? await loadModules() : ({} as Modules);

/** Distinct per run, so a crashed run cannot collide with the next one. */
const runId = crypto.randomUUID().replace(/-/g, '');

const createdVariableIds: string[] = [];
const createdGenerationIds: string[] = [];

afterAll(async () => {
  if (!hasDatabase) return;
  const recordIds = [...createdVariableIds, ...createdGenerationIds];
  if (recordIds.length > 0) await db.delete(auditLog).where(inArray(auditLog.recordId, recordIds));
  if (createdVariableIds.length > 0) await db.delete(globalVariable).where(inArray(globalVariable.id, createdVariableIds));
  if (createdGenerationIds.length > 0) await db.delete(templateGeneration).where(inArray(templateGeneration.id, createdGenerationIds));
});

describe.skipIf(!hasDatabase)('global variable name uniqueness', () => {
  test('a differently-cased name is still taken', async () => {
    const name = `verify_${runId}`;
    const created = await createGlobalVariable({ name, label: 'Verify', type: 'text', required: false }, null);
    createdVariableIds.push(created.id);

    expect(await globalVariableNameTaken(name.toUpperCase())).toBe(true);
    // The half-fix this guards against: a plain equality filter finds nothing.
    const exact = await db.select({ id: globalVariable.id }).from(globalVariable).where(eq(globalVariable.name, name.toUpperCase()));
    expect(exact).toHaveLength(0);
  });

  test('a variable keeps its own name when it is the one being edited', async () => {
    const name = `verify_self_${runId}`;
    const created = await createGlobalVariable({ name, label: 'Verify', type: 'text', required: false }, null);
    createdVariableIds.push(created.id);

    expect(await globalVariableNameTaken(name.toUpperCase(), created.id)).toBe(false);
  });
});

describe.skipIf(!hasDatabase)('streaming generation upserts', () => {
  test('a progress write that omits the prediction id does not erase it', async () => {
    const [owner] = await db.select({ id: user.id }).from(user).limit(1);
    const [existing] = await db.select({ id: template.id }).from(template).limit(1);
    if (!owner || !existing) throw new Error('dev database has no user or template to attach the fixture to');

    const id = crypto.randomUUID();
    createdGenerationIds.push(id);
    const base = {
      id,
      templateId: existing.id,
      userId: owner.id,
      variableValues: {},
      originalImageUrls: [],
      finalPrompt: 'p',
      resultFileId: null,
    };

    await upsertTemplateGeneration({ ...base, status: 'processing' }, null);
    await upsertTemplateGeneration({ ...base, status: 'processing', replicateId: 'pred-1', replicateStatus: 'streaming' }, null);
    await upsertTemplateGeneration({ ...base, status: 'processing', finalPrompt: 'p2' }, null);

    const [row] = await db.select().from(templateGeneration).where(eq(templateGeneration.id, id));
    expect(row?.replicateId).toBe('pred-1');
    expect(row?.replicateStatus).toBe('streaming');
    expect(row?.finalPrompt).toBe('p2');
  });
});
