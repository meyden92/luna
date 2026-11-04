import { afterAll, describe, expect, test } from 'bun:test';
import { and, eq, gte, inArray } from 'drizzle-orm';

/**
 * Runtime proof of the audit contract in issue #13, end to end (issue #45).
 *
 * `bun run db:audit-coverage` is the static half: it greps the query modules and
 * proves no audited model was quietly skipped while a batch was ported. It
 * cannot prove a row actually lands, that the action and record id are right, or
 * that an excluded model stays excluded. This file does that, by driving the
 * real query functions against the real database and reading `audit_log` back.
 *
 * Three things are asserted, and the third is the one an over-eager port breaks:
 *
 * 1. Every model in `AUDITED_MODELS` produces a row for create, update and
 *    delete — or the missing action is declared in `DELIBERATE_GAPS` below with
 *    the reason. The roll-up test at the bottom fails if a model gains coverage
 *    without the gap being removed, or loses coverage without one being added.
 * 2. Every model in `UNAUDITED_MODELS` produces none. The Prisma extension
 *    audited everything implicitly, so an over-eager port is as wrong as a
 *    missing one.
 * 3. A failing audit write neither rolls back nor corrupts the business write,
 *    and does not poison the surrounding transaction. That only holds because
 *    `writeAuditLog` writes on a SAVEPOINT.
 *
 * Needs a real Postgres: savepoint semantics and foreign-key behaviour are the
 * things under test. Skips cleanly without `DATABASE_URL`.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

/** Lazy, because `../client` opens a connection pool at module load. */
async function loadModules() {
  const [client, audit, adminSchema, authSchema, filesSchema, featuresSchema, automationSchema, analyticsSchema, studioSchema] =
    await Promise.all([
      import('../client'),
      import('../audit'),
      import('../schema/admin'),
      import('../schema/auth'),
      import('../schema/files'),
      import('../schema/features'),
      import('../schema/automation'),
      import('../schema/analytics'),
      import('../schema/studio'),
    ]);
  const [
    admin,
    auth,
    rbac,
    files,
    folders,
    features,
    flows,
    moderation,
    tasks,
    uploads,
    delivery,
    analytics,
    sourceSessions,
    studio,
    generations,
  ] = await Promise.all([
    import('./admin'),
    import('./auth'),
    import('./rbac'),
    import('./files'),
    import('./folders'),
    import('./features'),
    import('./flows'),
    import('./moderation'),
    import('./tasks'),
    import('./uploads'),
    import('./delivery'),
    import('./analytics'),
    import('./source-sessions'),
    import('./studio'),
    import('./generations'),
  ]);
  return {
    db: client.db,
    AUDITED_MODELS: audit.AUDITED_MODELS,
    UNAUDITED_MODELS: audit.UNAUDITED_MODELS,
    ...adminSchema,
    ...authSchema,
    ...filesSchema,
    ...featuresSchema,
    ...automationSchema,
    ...analyticsSchema,
    ...studioSchema,
    admin,
    auth,
    rbac,
    files,
    folders,
    features,
    flows,
    moderation,
    tasks,
    uploads,
    delivery,
    analytics,
    sourceSessions,
    studio,
    generations,
  };
}

type Modules = Awaited<ReturnType<typeof loadModules>>;

// Only ever dereferenced inside tests, which do not run without a database.
const M = hasDatabase ? await loadModules() : ({} as Modules);
const db = M.db;
const auditLog = M.auditLog;

type AuditedModel = (typeof M.AUDITED_MODELS)[number];
type AuditAction = 'create' | 'update' | 'delete';
const ACTIONS: AuditAction[] = ['create', 'update', 'delete'];

/**
 * Actions an audited model deliberately cannot produce, because the application
 * has no such path. Recorded here rather than silently untested, so each one is
 * a decision that has to be revisited when the path appears. `docs/db-verification.md`
 * carries the same list in prose.
 */
const DELIBERATE_GAPS: Partial<Record<AuditedModel, Partial<Record<AuditAction, string>>>> = {
  User: {
    // Registration IS audited, via auditUserCreated on Better-Auth's
    // user.create.after hook — but it is unreachable from a query module, so
    // this suite cannot drive it. Covered by the auth batch's own verification.
    create: 'created by Better-Auth through its own adapter; audited from the user.create.after hook, not from a query module',
    delete: 'no hard delete exists; softDeleteUserAccount is an UPDATE and is audited as one',
  },
  FormShare: { delete: 'no hard delete exists; softDeleteOwnedFormShare is an UPDATE and is audited as one' },
  FormShareField: {
    update: 'fields are immutable once the share is created',
    delete: 'fields are only removed by the database cascade from form_share, which has no hard-delete path either',
  },
  Flow: { delete: 'no hard delete exists; deactivateOwnedFlow is an UPDATE and is audited as one' },
  RbacGroup: { delete: 'groups are seeded, never deleted — no call site removes one' },
  UserGroupAssignment: { update: 'an assignment carries no mutable field; membership changes are a create or a delete' },
  DenylistEntry: {
    update: 'entries are append-only; the admin UI has no edit',
    delete: 'entries are append-only; the admin UI has no removal',
  },
  ModerationCase: { delete: 'cases are resolved, never removed — resolveModerationCase is an UPDATE' },
  StudioSettings: { delete: 'a single row that is created on first write and only ever updated' },
};

/** Unaudited models with no writer in any query module, so there is nothing to drive. */
const UNAUDITED_WITHOUT_WRITER = ['Account', 'Verification', 'OCRResult'];

/** Distinct per run, so a crashed run cannot collide with the next one. */
const runId = crypto.randomUUID().replace(/-/g, '');
const ownerId = `audit-test-owner-${runId}`;
const victimId = `audit-test-victim-${runId}`;
const hex = (seed: string, length: number) => `${seed}${seed}${seed}`.slice(0, length);

/** Every (model, action) pair an assertion below actually observed in `audit_log`. */
const observed = new Set<string>();
/** Every unaudited model a test below actually drove a write for. */
const drivenUnaudited = new Set<string>();

/** Rows this run created outside the query modules, torn down in `afterAll`. */
const fixture = {
  fileId: `audit-test-file-${runId}`,
  taskId: crypto.randomUUID(),
  flowId: crypto.randomUUID(),
  sessionId: `audit-test-session-${runId}`,
  studioCategoryId: `audit-test-studio-category-${runId}`,
  studioModelId: `audit-test-studio-model-${runId}`,
};
const createdRbacGroupIds: string[] = [];
const createdDenylistIds: string[] = [];
const createdTaskIds: string[] = [];
/** The instance's Studio settings row, set aside while the settings test writes its own. */
let savedStudioSettings: Record<string, unknown> | undefined;

let startingAuditCount = 0;
let startedAt = new Date();

if (hasDatabase) {
  startedAt = new Date();
  startingAuditCount = (await db.select().from(auditLog)).length;

  await db.insert(M.user).values([
    { id: ownerId, email: `${ownerId}@example.invalid`, name: 'audit coverage owner', storageQuotaMiB: 64 },
    { id: victimId, email: `${victimId}@example.invalid`, name: 'audit coverage victim', storageQuotaMiB: 1 },
  ]);
  // Prerequisites, inserted directly rather than through a query module: they
  // are the foreign keys the writes under test need, and creating them through
  // an audited function would add rows this file then has to reason around.
  await db.insert(M.file).values({
    id: fixture.fileId,
    url: `${runId}/fixture.png`,
    title: 'audit fixture',
    size: 1,
    contentType: 'image/png',
    ownerId,
  });
  await db.insert(M.task).values({
    id: fixture.taskId,
    name: `audit-fixture-${runId}`,
    description: 'fixture',
    cronExpression: '0 0 * * *',
    taskFunction: 'noop',
    createdBy: ownerId,
  });
  await db.insert(M.flow).values({ id: fixture.flowId, name: `audit fixture ${runId}`, ownerId, triggerType: 'manual', graph: {} });
  await db.insert(M.session).values({
    id: fixture.sessionId,
    token: `audit-test-token-${runId}`,
    userId: victimId,
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  await db.insert(M.studioCategory).values({ id: fixture.studioCategoryId, name: 'audit fixture', icon: 'Image' });
  await db.insert(M.studioModel).values({
    id: fixture.studioModelId,
    categoryId: fixture.studioCategoryId,
    endpointId: 'fal-ai/audit-fixture',
    name: 'audit fixture',
    schemaSnapshot: { input: { type: 'object' }, output: { type: 'object' } },
  });
}

/**
 * Asserts one audit row exists for `recordId` with the expected model and
 * action, and records the pair for the coverage roll-up at the bottom.
 */
async function expectAudited(model: AuditedModel, action: AuditAction, recordId: string) {
  const rows = await db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.recordId, recordId), eq(auditLog.model, model), eq(auditLog.action, action)));
  expect({ model, action, recordId, rows: rows.length }).toMatchObject({ model, action, recordId });
  expect(rows.length).toBeGreaterThan(0);
  observed.add(`${model}:${action}`);
  return rows[0] as NonNullable<(typeof rows)[number]>;
}

/** Asserts no audit row mentions `recordId`, and notes the unaudited model as driven. */
async function expectUnaudited(model: string, recordId: string) {
  const rows = await db.select({ model: auditLog.model, action: auditLog.action }).from(auditLog).where(eq(auditLog.recordId, recordId));
  expect(rows).toEqual([]);
  drivenUnaudited.add(model);
}

afterAll(async () => {
  if (!hasDatabase) return;

  // Audit rows first: everything this run wrote landed after `startedAt`, and
  // `audit_log` starts empty on the development database.
  await db.delete(auditLog).where(gte(auditLog.timestamp, startedAt));

  await db.delete(M.generation).where(eq(M.generation.userId, ownerId));
  await db.delete(M.studioModel).where(eq(M.studioModel.id, fixture.studioModelId));
  await db.delete(M.studioCategory).where(eq(M.studioCategory.id, fixture.studioCategoryId));
  await db.delete(M.studioBudgetOverride).where(eq(M.studioBudgetOverride.userId, ownerId));
  if (savedStudioSettings) {
    await db.delete(M.studioSettings).where(eq(M.studioSettings.id, 'default'));
    await db.insert(M.studioSettings).values(savedStudioSettings as typeof M.studioSettings.$inferInsert);
  }
  await db.delete(M.moderationCase).where(eq(M.moderationCase.fileId, fixture.fileId));
  if (createdDenylistIds.length > 0) await db.delete(M.denylistEntry).where(inArray(M.denylistEntry.id, createdDenylistIds));
  await db.delete(M.formShare).where(eq(M.formShare.ownerId, ownerId));
  await db.delete(M.snippet).where(eq(M.snippet.ownerId, ownerId));
  await db.delete(M.nicotineEntry).where(eq(M.nicotineEntry.ownerId, ownerId));
  await db.delete(M.flowRun).where(eq(M.flowRun.ownerId, ownerId));
  await db.delete(M.flow).where(eq(M.flow.ownerId, ownerId));
  await db.delete(M.token).where(eq(M.token.userId, ownerId));
  if (createdTaskIds.length > 0) await db.delete(M.task).where(inArray(M.task.id, createdTaskIds));
  await db.delete(M.task).where(eq(M.task.id, fixture.taskId));
  await db.delete(M.egressRollup).where(eq(M.egressRollup.ownerId, ownerId));
  await db.delete(M.fileRendition).where(eq(M.fileRendition.sourceFileId, fixture.fileId));
  await db.delete(M.file).where(eq(M.file.ownerId, ownerId));
  await db.delete(M.folder).where(eq(M.folder.ownerId, ownerId));
  if (createdRbacGroupIds.length > 0) await db.delete(M.rbacGroup).where(inArray(M.rbacGroup.id, createdRbacGroupIds));
  await db.delete(M.session).where(inArray(M.session.userId, [ownerId, victimId]));
  await db.delete(M.user).where(inArray(M.user.id, [ownerId, victimId]));

  // The run must leave the trail exactly as it found it, or a later run's
  // assertions are reading this run's leftovers.
  const remaining = await db.select({ id: auditLog.id }).from(auditLog);
  expect(remaining.length).toBe(startingAuditCount);
});

// ---------------------------------------------------------------------------
// Audited models — content
// ---------------------------------------------------------------------------

describe.skipIf(!hasDatabase)('audited models: content', () => {
  test('File is audited on create, update and delete', async () => {
    const created = await M.uploads.createUploadedFile(
      {
        ownerId,
        size: 1024,
        url: `${runId}/audited.png`,
        title: 'audited file',
        tags: 'audit-test',
        contentType: 'image/png',
        privateUpload: false,
        hashes: { sha256: hex(runId, 64), md5: hex(runId, 32), phash: null },
        scrubReport: { version: 2, stripped: false },
        dimensions: { width: 12, height: 12 },
      },
      ownerId,
    );
    await expectAudited('File', 'create', created.id);

    await M.files.updateOwnedFile({ id: created.id, ownerId, values: { title: 'audited file renamed' } }, ownerId);
    await expectAudited('File', 'update', created.id);

    await M.uploads.releaseUploadedFile(created.id, ownerId);
    await expectAudited('File', 'delete', created.id);
  });

  test('Folder is audited on create, update and delete', async () => {
    const created = await M.folders.createFolder({ name: `audit folder ${runId}`, ownerId }, ownerId);
    await expectAudited('Folder', 'create', created.id);

    await M.folders.updateOwnedFolder({ id: created.id, ownerId, name: 'audit folder renamed' }, ownerId);
    await expectAudited('Folder', 'update', created.id);

    await M.folders.deleteOwnedFolder({ id: created.id, ownerId }, ownerId);
    await expectAudited('Folder', 'delete', created.id);
  });

  test('Snippet is audited on create, update and delete', async () => {
    const created = await M.features.createSnippet({ title: 'audit', content: 'x', language: 'ts', isPublic: false, ownerId }, ownerId);
    await expectAudited('Snippet', 'create', created.id);

    await M.features.updateOwnedSnippet({ id: created.id, ownerId, title: 'audit 2', content: 'y', language: 'ts' }, ownerId);
    await expectAudited('Snippet', 'update', created.id);

    await M.features.deleteOwnedSnippet({ id: created.id, ownerId }, ownerId);
    await expectAudited('Snippet', 'delete', created.id);
  });
});

// ---------------------------------------------------------------------------
// Audited models — sharing, automation, user data
// ---------------------------------------------------------------------------

describe.skipIf(!hasDatabase)('audited models: sharing, automation and user data', () => {
  test('FormShare is audited on create and on its soft delete, and its fields on create', async () => {
    // FormShareField only exists under its parent share, so it is exercised
    // through createFormShare.
    const share = await M.features.createFormShare(
      {
        title: `audit share ${runId}`,
        expiresInMs: null,
        maxViews: null,
        ownerId,
        fields: [{ label: 'secret', value: 'value', type: 'text', isSensitive: false }],
      },
      ownerId,
    );
    await expectAudited('FormShare', 'create', share.id);

    const [shareField] = await db.select({ id: M.formShareField.id }).from(M.formShareField).where(eq(M.formShareField.formId, share.id));
    if (!shareField) throw new Error('form share field row missing');
    await expectAudited('FormShareField', 'create', shareField.id);

    // The share's removal is a soft delete, so it is audited as an update.
    await M.features.softDeleteOwnedFormShare({ id: share.id, ownerId }, ownerId);
    await expectAudited('FormShare', 'update', share.id);
  });

  test('Flow is audited on create and update', async () => {
    const created = await M.flows.createOwnedFlow(
      { name: `audit flow ${runId}`, ownerId, enabled: true, triggerType: 'manual', graph: {} },
      ownerId,
    );
    await expectAudited('Flow', 'create', created.id);

    await M.flows.updateOwnedFlow(
      { id: created.id, ownerId, name: 'audit flow 2', enabled: false, triggerType: 'manual', graph: {} },
      ownerId,
    );
    await expectAudited('Flow', 'update', created.id);
  });

  test('Task is audited on create, update and delete', async () => {
    const created = await M.tasks.createTask(
      { name: `audit-task-${runId}`, description: 'audit', cronExpression: '0 0 * * *', taskFunction: 'noop', createdBy: ownerId },
      ownerId,
    );
    createdTaskIds.push(created.id);
    await expectAudited('Task', 'create', created.id);

    await M.tasks.updateTaskDefinition(created.id, { description: 'audit 2' }, ownerId);
    await expectAudited('Task', 'update', created.id);

    await M.tasks.deleteTask(created.id, ownerId);
    await expectAudited('Task', 'delete', created.id);
  });

  test('NicotineEntry is audited on create, update and delete', async () => {
    const created = await M.features.createNicotineEntry({ kind: 'pouch', note: null, ownerId }, ownerId);
    await expectAudited('NicotineEntry', 'create', created.id);

    await M.features.updateOwnedNicotineEntry({ id: created.id, ownerId, kind: 'pouch', note: 'audit', occurredAt: new Date() }, ownerId);
    await expectAudited('NicotineEntry', 'update', created.id);

    await M.features.deleteOwnedNicotineEntry({ id: created.id, ownerId }, ownerId);
    await expectAudited('NicotineEntry', 'delete', created.id);
  });
});

// ---------------------------------------------------------------------------
// Audited models — account, credentials and administration
// ---------------------------------------------------------------------------

describe.skipIf(!hasDatabase)('audited models: account, credentials and administration', () => {
  test('User is audited on update, and its soft delete is audited as an update', async () => {
    await M.auth.updateUserProfile(ownerId, { bio: `audit ${runId}` }, ownerId);
    await expectAudited('User', 'update', ownerId);

    // The nearest thing to a User delete. Recorded as an update on purpose:
    // the row survives, which is what the trail should say happened.
    await M.admin.softDeleteUserAccount({ id: victimId, banReason: 'audit coverage' }, ownerId);
    await expectAudited('User', 'update', victimId);
    // The sessions it drops are Session writes, and Session is unaudited.
    await expectUnaudited('Session', fixture.sessionId);
    expect(await db.select().from(M.session).where(eq(M.session.id, fixture.sessionId))).toEqual([]);
  });

  test('Token is audited on create, update and delete', async () => {
    const created = await M.auth.createUserToken({ name: `audit token ${runId}`, key: hex(runId, 64), userId: ownerId }, ownerId);
    await expectAudited('Token', 'create', created.id);

    await M.auth.updateOwnedTokenSettings(
      {
        id: created.id,
        userId: ownerId,
        settings: { compressImage: true, convertToJpeg: false, jpegQuality: 80, folderId: null, stripMetadata: false, flowId: null },
      },
      ownerId,
    );
    await expectAudited('Token', 'update', created.id);

    await M.auth.deleteOwnedToken({ id: created.id, userId: ownerId }, ownerId);
    await expectAudited('Token', 'delete', created.id);
  });

  test('SourceSession is audited on create, update and delete, without its value', async () => {
    const sourceKey = `audit-test-${runId}`;
    const values = ['first-secret', 'second-secret'].map((value) => `${value}-${runId}`);

    const created = await M.sourceSessions.upsertSourceSession({ sourceKey, encryptedValue: values[0] as string }, ownerId);
    await expectAudited('SourceSession', 'create', created.id);

    await M.sourceSessions.upsertSourceSession({ sourceKey, encryptedValue: values[1] as string }, ownerId);
    await expectAudited('SourceSession', 'update', created.id);

    await M.sourceSessions.deleteSourceSession(sourceKey, ownerId);
    await expectAudited('SourceSession', 'delete', created.id);

    const rows = JSON.stringify(await db.select().from(auditLog).where(eq(auditLog.recordId, created.id)));
    for (const value of values) expect(rows).not.toContain(value);
  });

  test('RbacGroup is audited on create and update, and UserGroupAssignment on create and delete', async () => {
    // `ensureSystemGroup` is typed to the two seeded keys, but is key-agnostic at
    // runtime. Casting keeps this run off the real `user`/`admin` rows, which it
    // would otherwise mutate.
    const createKey = `audit-create-${runId}` as 'user';
    const updateKey = `audit-update-${runId}` as 'user';

    const createdGroup = await M.rbac.ensureSystemGroup({ key: createKey, name: 'audit', description: 'audit' }, ownerId);
    createdRbacGroupIds.push(createdGroup.id);
    await expectAudited('RbacGroup', 'create', createdGroup.id);

    // The update branch only fires on a group that is not yet a system group.
    const nonSystemId = crypto.randomUUID();
    createdRbacGroupIds.push(nonSystemId);
    await db.insert(M.rbacGroup).values({ id: nonSystemId, key: updateKey, name: 'audit', isSystem: false });
    await M.rbac.ensureSystemGroup({ key: updateKey, name: 'audit', description: 'audit' }, ownerId);
    await expectAudited('RbacGroup', 'update', nonSystemId);

    await M.rbac.ensureGroupAssignment({ userId: ownerId, groupId: createdGroup.id }, ownerId);
    const [assignment] = await db
      .select({ id: M.userGroupAssignment.id })
      .from(M.userGroupAssignment)
      .where(eq(M.userGroupAssignment.userId, ownerId));
    if (!assignment) throw new Error('group assignment row missing');
    await expectAudited('UserGroupAssignment', 'create', assignment.id);

    await M.admin.replaceUserGroupAssignments({ userId: ownerId, groupIds: [] }, ownerId);
    await expectAudited('UserGroupAssignment', 'delete', assignment.id);
  });

  test('DenylistEntry is audited on create', async () => {
    const entry = await M.moderation.createDenylistEntry(
      { hashType: 'sha256', hash: hex(runId.split('').reverse().join(''), 64), severity: 'block', addedBy: ownerId },
      ownerId,
    );
    createdDenylistIds.push(entry.id);
    await expectAudited('DenylistEntry', 'create', entry.id);
  });

  test('ModerationCase is audited on create and update', async () => {
    const quarantined = await M.moderation.quarantineFile(
      { fileId: fixture.fileId, matchType: 'sha256', matchedEntryId: null, distance: null, uploaderId: ownerId },
      ownerId,
    );
    await expectAudited('ModerationCase', 'create', quarantined.id);
    // Quarantine also flips the file private, which is a File update.
    await expectAudited('File', 'update', fixture.fileId);

    await M.moderation.resolveModerationCase({ id: quarantined.id, status: 'released', resolution: 'audit', reviewerId: ownerId }, ownerId);
    await expectAudited('ModerationCase', 'update', quarantined.id);
  });
});

// ---------------------------------------------------------------------------
// Audited models — Studio configuration
// ---------------------------------------------------------------------------

describe.skipIf(!hasDatabase)('audited models: Studio configuration', () => {
  test('StudioCategory, StudioModel and StudioTemplate are audited on create, update and delete', async () => {
    const category = await M.studio.createStudioCategory({ name: `audit ${runId}`, icon: 'Image' }, ownerId);
    await expectAudited('StudioCategory', 'create', category.id);
    await M.studio.updateStudioCategory(category.id, { name: 'audit renamed' }, ownerId);
    await expectAudited('StudioCategory', 'update', category.id);

    const model = await M.studio.createStudioModel(
      {
        categoryId: category.id,
        endpointId: 'fal-ai/audit',
        name: 'audit model',
        schemaSnapshot: { input: { type: 'object' }, output: { type: 'object' } },
      },
      ownerId,
    );
    await expectAudited('StudioModel', 'create', model.id);
    await M.studio.updateStudioModel(model.id, { isActive: false }, ownerId);
    await expectAudited('StudioModel', 'update', model.id);

    const template = await M.studio.createStudioTemplate(
      { categoryId: category.id, modelId: model.id, name: 'audit template', createdBy: ownerId },
      ownerId,
    );
    await expectAudited('StudioTemplate', 'create', template.id);
    await M.studio.updateStudioTemplate(template.id, { name: 'audit template 2' }, ownerId);
    await expectAudited('StudioTemplate', 'update', template.id);

    await M.studio.deleteStudioTemplate(template.id, ownerId);
    await expectAudited('StudioTemplate', 'delete', template.id);
    await M.studio.deleteStudioModel(model.id, ownerId);
    await expectAudited('StudioModel', 'delete', model.id);
    await M.studio.deleteStudioCategory(category.id, ownerId);
    await expectAudited('StudioCategory', 'delete', category.id);
  });

  test('StudioSettings is audited on its first write as a create, then as updates', async () => {
    const [existing] = await db.select().from(M.studioSettings).where(eq(M.studioSettings.id, 'default'));
    if (existing) {
      savedStudioSettings = existing;
      await db.delete(M.studioSettings).where(eq(M.studioSettings.id, 'default'));
    }

    await M.studio.updateStudioSettings({ defaultMonthlyBudgetUsd: 20 }, ownerId);
    await expectAudited('StudioSettings', 'create', 'default');
    await M.studio.updateStudioSettings({ maxActiveGenerationsPerUser: 5 }, ownerId);
    await expectAudited('StudioSettings', 'update', 'default');

    if (!savedStudioSettings) await db.delete(M.studioSettings).where(eq(M.studioSettings.id, 'default'));
  });

  test('StudioBudgetOverride is audited on create, update and delete, keyed by the User', async () => {
    await M.studio.setStudioBudgetOverride(ownerId, 10, ownerId);
    await expectAudited('StudioBudgetOverride', 'create', ownerId);
    await M.studio.setStudioBudgetOverride(ownerId, null, ownerId);
    await expectAudited('StudioBudgetOverride', 'update', ownerId);
    await M.studio.deleteStudioBudgetOverride(ownerId, ownerId);
    await expectAudited('StudioBudgetOverride', 'delete', ownerId);
  });
});

// ---------------------------------------------------------------------------
// The other direction: models that must produce nothing
// ---------------------------------------------------------------------------

describe.skipIf(!hasDatabase)('unaudited models produce no audit rows', () => {
  test('TaskExecution writes are not audited', async () => {
    const execution = await M.tasks.createTaskExecution({ taskId: fixture.taskId, triggeredBy: 'audit-coverage-test' });
    await M.tasks.updateTaskExecution(execution.id, { status: 'success', duration: 1, completedAt: new Date() });
    await expectUnaudited('TaskExecution', execution.id);
  });

  test('FlowRun writes are not audited', async () => {
    const run = await M.flows.createFlowRun({ flowId: fixture.flowId, ownerId, triggeredBy: 'audit-coverage-test', items: [] });
    await M.flows.completeFlowRun({ id: run.id, status: 'success', duration: 1, logs: [] });
    await expectUnaudited('FlowRun', run.id);
  });

  test('FileRendition writes are not audited', async () => {
    const rendition = await M.delivery.createRendition({
      sourceFileId: fixture.fileId,
      paramHash: hex(runId, 64),
      params: { w: 100 },
      s3Key: `${ownerId}/renditions/${runId}.webp`,
      contentType: 'image/webp',
      size: 1,
      width: 100,
      height: 100,
      private: false,
    });
    await M.delivery.touchRendition(rendition.id);
    await expectUnaudited('FileRendition', rendition.id);

    expect(await M.tasks.deleteFileRenditions([rendition.id])).toBe(1);
    await expectUnaudited('FileRendition', rendition.id);
  });

  test('FileMetadata writes are not audited, even alongside an audited File write', async () => {
    await M.tasks.upsertFileDimensions(fixture.fileId, 640, 480);
    const [metadata] = await db.select({ id: M.fileMetadata.id }).from(M.fileMetadata).where(eq(M.fileMetadata.fileId, fixture.fileId));
    if (!metadata) throw new Error('file metadata row missing');
    await expectUnaudited('FileMetadata', metadata.id);
  });

  test('the analytics writes are not audited', async () => {
    await M.analytics.upsertEgressRollup({ ownerId, period: M.analytics.utcMonth(new Date()), bytes: 10 });
    const [egressRollup] = await db.select({ id: M.egressRollup.id }).from(M.egressRollup).where(eq(M.egressRollup.ownerId, ownerId));
    if (!egressRollup) throw new Error('egress rollup row missing');
    await expectUnaudited('EgressRollup', egressRollup.id);
  });

  test('Generation and GenerationOutput writes are not audited', async () => {
    const created = await M.generations.admitGeneration({
      userId: ownerId,
      modelId: fixture.studioModelId,
      templateId: null,
      name: 'audit fixture',
      endpointId: 'fal-ai/audit-fixture',
      formValues: { prompt: `private prompt ${runId}` },
      estimatedCostUsd: 0.01,
    });
    await M.generations.setGenerationSubmitted(created.id, {
      falRequestId: `audit-request-${runId}`,
      statusUrl: 'https://queue.example.invalid/status',
      responseUrl: 'https://queue.example.invalid/response',
      cancelUrl: 'https://queue.example.invalid/cancel',
      requestInput: { prompt: `private prompt ${runId}` },
      formValues: { prompt: `private prompt ${runId}` },
      progress: null,
    });
    const finished = await M.generations.completeGeneration(created.id, {
      status: 'succeeded',
      outputs: [
        {
          index: 0,
          mediaKind: 'image',
          contentType: 'image/png',
          s3Key: `studio/${ownerId}/${created.id}/0.png`,
          sizeBytes: 10,
          width: 1,
          height: 1,
          durationSeconds: null,
          expiresAt: new Date(Date.now() + 60_000),
        },
      ],
    });
    expect(finished?.status).toBe('succeeded');
    // Finishing is idempotent: a second delivery changes nothing.
    expect(await M.generations.completeGeneration(created.id, { status: 'failed', error: { message: 'late' } })).toBeUndefined();
    await M.generations.markGenerationsSeen(ownerId, [created.id]);

    const [output] = await M.generations.listGenerationOutputs(created.id);
    if (!output) throw new Error('generation output row missing');
    await M.generations.markOutputsExpired([output.id], new Date());
    await expectUnaudited('Generation', created.id);
    await expectUnaudited('GenerationOutput', output.id);
  });

  test('no audit row this run wrote names an unaudited model', async () => {
    // The catch-all. Any over-eager port shows up here even if no test above
    // happened to drive the write that produced it.
    const rows = await db.selectDistinct({ model: auditLog.model }).from(auditLog).where(gte(auditLog.timestamp, startedAt));
    const overEager = rows.map((row) => row.model).filter((model) => model in M.UNAUDITED_MODELS);
    expect(overEager).toEqual([]);
    drivenUnaudited.add('AuditLog');
  });
});

// ---------------------------------------------------------------------------
// Transaction composition and audit-failure isolation
// ---------------------------------------------------------------------------

describe.skipIf(!hasDatabase)('audited writes inside a caller transaction', () => {
  test('a write composed into a transaction is audited, and the row is visible inside it', async () => {
    // The asymmetry issue #13 set out to remove: the Prisma extension skipped
    // writes inside `$transaction`, so five call sites audited by hand. With
    // every audited write explicit, composing into a transaction changes nothing.
    const id = await db.transaction(async (tx) => {
      const snippet = await M.features.createSnippet({ title: 'tx', content: 'x', language: null, isPublic: false, ownerId }, ownerId, tx);
      const inside = await tx.select().from(auditLog).where(eq(auditLog.recordId, snippet.id));
      expect(inside).toHaveLength(1);
      return snippet.id;
    });

    await expectAudited('Snippet', 'create', id);
    await M.features.deleteOwnedSnippet({ id, ownerId }, ownerId);
  });

  test('rolling the transaction back takes the audit row with the business row', async () => {
    let id = '';
    await expect(
      db.transaction(async (tx) => {
        const snippet = await M.features.createSnippet(
          { title: 'tx', content: 'x', language: null, isPublic: false, ownerId },
          ownerId,
          tx,
        );
        id = snippet.id;
        throw new Error('deliberate rollback');
      }),
    ).rejects.toThrow('deliberate rollback');

    expect(await db.select().from(M.snippet).where(eq(M.snippet.id, id))).toEqual([]);
    expect(await db.select().from(auditLog).where(eq(auditLog.recordId, id))).toEqual([]);
  });

  test('a failing audit write leaves the business write committed and the transaction usable', async () => {
    // An unknown userId violates `audit_log_user_id_user_id_fkey`, so the audit
    // INSERT genuinely fails inside the caller's transaction. Without the
    // SAVEPOINT in `writeAuditLog` the aborted statement would poison that
    // transaction: the first snippet would be lost AND the second write would
    // fail with "current transaction is aborted". A `console.error` from the
    // audit layer is expected here — it is deliberate, not noise.
    const [failed, succeeded] = await db.transaction(async (tx) => {
      const first = await M.features.createSnippet(
        { title: 'audit fails', content: 'x', language: null, isPublic: false, ownerId },
        `missing-user-${runId}`,
        tx,
      );
      const second = await M.features.createSnippet(
        { title: 'audit works', content: 'y', language: null, isPublic: false, ownerId },
        ownerId,
        tx,
      );
      return [first, second];
    });

    expect(await db.select({ id: M.snippet.id }).from(M.snippet).where(eq(M.snippet.id, failed.id))).toHaveLength(1);
    expect(await db.select().from(auditLog).where(eq(auditLog.recordId, failed.id))).toEqual([]);
    expect(await db.select().from(auditLog).where(eq(auditLog.recordId, succeeded.id))).toHaveLength(1);

    await M.features.deleteOwnedSnippet({ id: failed.id, ownerId }, ownerId);
    await M.features.deleteOwnedSnippet({ id: succeeded.id, ownerId }, ownerId);
  });
});

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

describe.skipIf(!hasDatabase)('field-level redaction', () => {
  test('Token.key never reaches an audit row', async () => {
    // Asserted against a written row, not against REDACTED_FIELDS: the constant
    // being right is not the same as the row being clean, and the Prisma
    // implementation wrote these credentials in cleartext (issue #27).
    const key = hex(`${runId}beef`, 64);
    const created = await M.auth.createUserToken({ name: `redaction ${runId}`, key, userId: ownerId }, ownerId);

    const [row] = await db.select().from(auditLog).where(eq(auditLog.recordId, created.id));
    if (!row) throw new Error('token audit row missing');

    expect((row.after as Record<string, unknown>).id).toBe(created.id);
    expect((row.after as Record<string, unknown>).key).toBeUndefined();
    expect(JSON.stringify(row)).not.toContain(key);

    await M.auth.deleteOwnedToken({ id: created.id, userId: ownerId }, ownerId);
    const rows = await db.select().from(auditLog).where(eq(auditLog.recordId, created.id));
    expect(JSON.stringify(rows)).not.toContain(key);
  });
});

// ---------------------------------------------------------------------------
// Roll-up — declared last so every assertion above has already run
// ---------------------------------------------------------------------------

describe.skipIf(!hasDatabase)('coverage roll-up', () => {
  test('every audited model is covered for create, update and delete, or the gap is declared', async () => {
    const missing: string[] = [];
    for (const model of M.AUDITED_MODELS) {
      for (const action of ACTIONS) {
        if (observed.has(`${model}:${action}`)) continue;
        if (DELIBERATE_GAPS[model]?.[action]) continue;
        missing.push(`${model}:${action}`);
      }
    }
    expect(missing).toEqual([]);
  });

  test('no declared gap is stale', () => {
    // A gap that is now covered is a comment lying about the code.
    const stale: string[] = [];
    for (const [model, actions] of Object.entries(DELIBERATE_GAPS)) {
      for (const action of Object.keys(actions ?? {})) {
        if (observed.has(`${model}:${action}`)) stale.push(`${model}:${action}`);
      }
    }
    expect(stale).toEqual([]);
  });

  test('every unaudited model is either driven by a test or has no writer at all', () => {
    const untested = Object.keys(M.UNAUDITED_MODELS).filter((model) => !drivenUnaudited.has(model));
    expect(untested.sort()).toEqual([...UNAUDITED_WITHOUT_WRITER].sort());
  });
});
