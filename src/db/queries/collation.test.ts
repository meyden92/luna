import { afterAll, describe, expect, test } from 'bun:test';
import { asc, count, desc, eq, inArray, sql } from 'drizzle-orm';

/**
 * The collation sites from issue #23, proven on both sides of each comparison.
 *
 * MariaDB's `utf8mb4_unicode_ci` matched and sorted case-insensitively, and the
 * application never asked for that — it inherited it. Postgres `text` under the
 * musl `en_US.utf8` this deployment runs does neither: it compares exactly and
 * it sorts byte-wise, so every capital letter sorts ahead of every lower-case
 * one. Both changes are silent. Nothing errors, nothing logs, a row simply stops
 * being found or a list comes back in a different order.
 *
 * Every test here asserts the WRITE path and the READ path, because normalising
 * one side alone is a half-fix that issue #23 proved does nothing: an entry
 * written upper-case still fails to match a normalised lookup, and a normalised
 * write still fails to match a raw lookup. Where a test can, it also asserts
 * that the naive form (`eq` on the raw column) finds nothing — that is what
 * stops the `ilike`/`lower()` being "simplified" away later.
 *
 * Sites already covered elsewhere, cross-referenced rather than duplicated:
 *
 *   - the moderation denylist hash gate, on both paths, and the quarantine
 *     status comparison — `moderation.test.ts`
 *   - upload hashes normalised on write — `uploads.test.ts`
 *   - the CDN and audio-player content-type filters — `delivery.test.ts`
 *   - the global-variable name uniqueness check — `ai.test.ts`
 *
 * The last block asserts something different in kind: that the gallery listing
 * still reaches its composite index. A translation can preserve results and lose
 * the access path, and that failure is as silent as the collation ones.
 *
 * Needs a real Postgres — collation and query plans are the database's, so there
 * is nothing here a mock could reproduce. Skips cleanly without `DATABASE_URL`.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

/** Lazy, because `../client` opens a connection pool at module load. */
async function loadModules() {
  const [client, authSchema, filesSchema, adminSchema, automationSchema, admin, auth, features, files, tasks] = await Promise.all([
    import('../client'),
    import('../schema/auth'),
    import('../schema/files'),
    import('../schema/admin'),
    import('../schema/automation'),
    import('./admin'),
    import('./auth'),
    import('./features'),
    import('./files'),
    import('./tasks'),
  ]);
  return {
    db: client.db,
    user: authSchema.user,
    token: authSchema.token,
    file: filesSchema.file,
    auditLog: adminSchema.auditLog,
    denylistEntry: adminSchema.denylistEntry,
    snippet: filesSchema.snippet,
    task: automationSchema.task,
    taskExecution: automationSchema.taskExecution,
    admin,
    auth,
    features,
    files,
    tasks,
  };
}

type Modules = Awaited<ReturnType<typeof loadModules>>;

// Only ever dereferenced inside tests, which do not run without a database.
const M = hasDatabase ? await loadModules() : ({} as Modules);
const db = M.db;

/** Distinct per run, so a crashed run cannot collide with the next one. */
const runId = crypto.randomUUID().replace(/-/g, '');
const ownerId = `collation-owner-${runId}`;
const EMAIL = `collation.${runId}@example.invalid`;

/**
 * A pair of names that byte-order and `lower()`-order disagree about.
 * Byte-wise, `B` (0x42) sorts before `a` (0x61); case-insensitively, `a` before
 * `b`. Under MariaDB the list showed `a` first, and it must still.
 */
const LOWER_FIRST = `zzcollation${runId}-a`;
const UPPER_FIRST = `zzcollation${runId}-B`;

// Titles that make the LIKE-metacharacter escaping observable. Searching for the
// literal `%` name must not be satisfied by the decoy, which is what an
// unescaped pattern would match.
const PERCENT_TITLE = `ab%cd-${runId}`;
const PERCENT_DECOY = `abZZcd-${runId}`;
const UNDERSCORE_TITLE = `ab_cd-${runId}`;
const UNDERSCORE_DECOY = `abXcd-${runId}`;

const orderingUserIds = [`collation-lower-${runId}`, `collation-upper-${runId}`];
const searchUserIds = [`collation-pct-${runId}`, `collation-pctdecoy-${runId}`];
const createdFileIds: string[] = [];
const createdTaskIds: string[] = [];
const createdSnippetIds: string[] = [];

async function insertFile(title: string) {
  const id = `collation-file-${createdFileIds.length}-${runId}`;
  createdFileIds.push(id);
  await db.insert(M.file).values({ id, url: `${runId}/${id}`, title, size: 1, contentType: 'image/png', ownerId });
  return id;
}

if (hasDatabase) {
  await db.insert(M.user).values([
    { id: ownerId, email: EMAIL, name: `collation owner ${runId}`, storageQuotaMiB: 16 },
    { id: orderingUserIds[0] as string, email: `${orderingUserIds[0]}@example.invalid`, name: LOWER_FIRST },
    { id: orderingUserIds[1] as string, email: `${orderingUserIds[1]}@example.invalid`, name: UPPER_FIRST },
    { id: searchUserIds[0] as string, email: `${searchUserIds[0]}@example.invalid`, name: `pct%name-${runId}` },
    { id: searchUserIds[1] as string, email: `${searchUserIds[1]}@example.invalid`, name: `pctZZname-${runId}` },
  ]);
  await insertFile(`Collation Fixture ${runId}`);
  await insertFile(PERCENT_TITLE);
  await insertFile(PERCENT_DECOY);
  await insertFile(UNDERSCORE_TITLE);
  await insertFile(UNDERSCORE_DECOY);
}

afterAll(async () => {
  if (!hasDatabase) return;
  const allUsers = [ownerId, ...orderingUserIds, ...searchUserIds];
  if (createdSnippetIds.length > 0) await db.delete(M.auditLog).where(inArray(M.auditLog.recordId, createdSnippetIds));
  if (createdTaskIds.length > 0) {
    await db.delete(M.auditLog).where(inArray(M.auditLog.recordId, createdTaskIds));
    await db.delete(M.task).where(inArray(M.task.id, createdTaskIds));
  }
  await db.delete(M.auditLog).where(inArray(M.auditLog.userId, allUsers));
  await db.delete(M.snippet).where(eq(M.snippet.ownerId, ownerId));
  await db.delete(M.token).where(eq(M.token.userId, ownerId));
  if (createdFileIds.length > 0) await db.delete(M.file).where(inArray(M.file.id, createdFileIds));
  await db.delete(M.user).where(inArray(M.user.id, allUsers));
});

// ---------------------------------------------------------------------------
// Identity lookups: email and API token key
// ---------------------------------------------------------------------------

describe.skipIf(!hasDatabase)('identity lookups', () => {
  test('emails are lower-cased on the write path and matched insensitively on the read path', async () => {
    expect(M.auth.normaliseEmail(`MiXeD.${runId}@Example.INVALID`)).toBe(`mixed.${runId}@example.invalid`);

    // Read path: the admin search finds the account whatever case is typed.
    const found = await M.admin.listAdminUsersPage({ page: 1, pageSize: 10, sort: 'email', order: 'asc', search: EMAIL.toUpperCase() });
    expect(found.users.map((row) => row.id)).toContain(ownerId);

    // The half-fix this guards against: a plain equality filter finds nothing.
    const exact = await db.select({ id: M.user.id }).from(M.user).where(eq(M.user.email, EMAIL.toUpperCase()));
    expect(exact).toEqual([]);
  });

  test('the migrated user and token rows are already normalised', async () => {
    // The other half of the write path. Normalising new writes leaves every
    // historical row broken unless the data migration normalised them too, and
    // this asserts against the real migrated dataset rather than a fixture.
    const [emails] = await db.select({ n: count() }).from(M.user).where(sql`${M.user.email} <> lower(${M.user.email})`);
    expect(emails?.n).toBe(0);

    const [keys] = await db.select({ n: count() }).from(M.token).where(sql`${M.token.key} <> lower(${M.token.key})`);
    expect(keys?.n).toBe(0);

    // The moderation gate's two sides, on real rows. `moderation.test.ts` proves
    // the comparison; this proves the history it compares against.
    const [hashes] = await db
      .select({ n: count() })
      .from(M.file)
      .where(
        sql`${M.file.sha256} <> lower(${M.file.sha256}) or ${M.file.md5} <> lower(${M.file.md5}) or ${M.file.phash} <> lower(${M.file.phash})`,
      );
    expect(hashes?.n).toBe(0);

    const [denylist] = await db
      .select({ n: count() })
      .from(M.denylistEntry)
      .where(sql`${M.denylistEntry.hash} <> lower(${M.denylistEntry.hash})`);
    expect(denylist?.n).toBe(0);
  });

  test('an API token key written in upper case is stored lower case and still validates', async () => {
    const key = `${runId}${runId}`.slice(0, 64);
    const created = await M.auth.createUserToken({ name: `collation ${runId}`, key: key.toUpperCase(), userId: ownerId }, ownerId);

    // Write path.
    const [stored] = await db.select({ key: M.token.key }).from(M.token).where(eq(M.token.id, created.id));
    expect(stored?.key).toBe(key);

    // Read path: an upper-case key presented by a client still authenticates.
    const validated = await M.auth.validateTokenKey(key.toUpperCase());
    expect(validated?.id).toBe(created.id);

    // The half-fix: without normalising the input, the lookup finds nothing.
    const exact = await db.select({ id: M.token.id }).from(M.token).where(eq(M.token.key, key.toUpperCase()));
    expect(exact).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Search filters
// ---------------------------------------------------------------------------

describe.skipIf(!hasDatabase)('search filters match across a case difference', () => {
  test('the gallery search matches a title in a different case', async () => {
    const page = await M.files.listGallery(ownerId, { limit: 50, search: `COLLATION FIXTURE ${runId}`.toUpperCase() });
    expect(page.files.map((row) => row.title)).toContain(`Collation Fixture ${runId}`);

    const lowered = await M.files.listGallery(ownerId, { limit: 50, search: `collation fixture ${runId}` });
    expect(lowered.files.map((row) => row.title)).toContain(`Collation Fixture ${runId}`);
  });

  test('the admin user search matches a name in a different case', async () => {
    const page = await M.admin.listAdminUsersPage({ page: 1, pageSize: 20, sort: 'name', order: 'asc', search: `ZZCOLLATION${runId}-A` });
    expect(page.users.map((row) => row.name)).toEqual([LOWER_FIRST]);
  });

  test('the audit search matches a model and action in a different case', async () => {
    // `audit_log.model` holds Prisma's PascalCase names and `action` lower-case
    // verbs, and both are typed into a URL by an admin.
    const created = await M.features.createSnippet({ title: 'collation', content: 'x', language: null, isPublic: false, ownerId }, ownerId);
    createdSnippetIds.push(created.id);

    const byModel = await M.admin.listAuditLogs({ model: 'snippet', recordId: created.id, limit: 10 });
    expect(byModel.map((row) => row.recordId)).toEqual([created.id]);

    const byAction = await M.admin.listAuditLogs({ action: 'CREATE', recordId: created.id, limit: 10 });
    expect(byAction.map((row) => row.recordId)).toEqual([created.id]);

    const bySearch = await M.admin.listAuditLogs({ search: created.id.toUpperCase(), limit: 10 });
    expect(bySearch.map((row) => row.recordId)).toContain(created.id);

    // The half-fix: an exact filter on the stored casing finds nothing.
    const exact = await db.select({ id: M.auditLog.id }).from(M.auditLog).where(eq(M.auditLog.model, 'snippet'));
    expect(exact).toEqual([]);
  });

  test('the task lookup and execution filters match across a case difference', async () => {
    const name = `zz-collation-task-${runId}`;
    const created = await M.tasks.createTask(
      { name, description: 'collation', cronExpression: '0 0 * * *', taskFunction: 'noop', createdBy: ownerId },
      ownerId,
    );
    createdTaskIds.push(created.id);

    // `getTaskByName` is case-insensitive equality, not a substring match.
    expect((await M.tasks.getTaskByName(name.toUpperCase()))?.id).toBe(created.id);

    const execution = await M.tasks.createTaskExecution({ taskId: created.id, triggeredBy: 'collation-test' });
    await M.tasks.updateTaskExecution(execution.id, { status: 'success', error: `Collation Boom ${runId}` });

    const byStatus = await M.tasks.listTaskExecutions(
      { taskId: created.id, status: 'SUCCESS' },
      { cursor: null, direction: 'next', limit: 10 },
    );
    expect(byStatus.map((row) => row.id)).toEqual([execution.id]);

    const bySearch = await M.tasks.listTaskExecutions(
      { search: `COLLATION BOOM ${runId}` },
      { cursor: null, direction: 'next', limit: 10 },
    );
    expect(bySearch.map((row) => row.id)).toEqual([execution.id]);

    // The half-fix on the status column, which holds a lower-case vocabulary.
    const exact = await db.select({ id: M.taskExecution.id }).from(M.taskExecution).where(eq(M.taskExecution.status, 'SUCCESS'));
    expect(exact).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

describe.skipIf(!hasDatabase)('ordering of human-entered names', () => {
  test('this Postgres really does sort byte-wise, so lower() is doing work', async () => {
    // The premise the two tests below rest on. If this ever fails the deployment
    // has changed collation and the `lower()` ordering keys can be reconsidered.
    const raw = await db.select({ name: M.user.name }).from(M.user).where(inArray(M.user.id, orderingUserIds)).orderBy(asc(M.user.name));
    expect(raw.map((row) => row.name)).toEqual([UPPER_FIRST, LOWER_FIRST]);
  });

  test('the assignee picker orders names case-insensitively', async () => {
    const rows = await M.admin.listActiveUsers();
    const ours = rows.filter((row) => orderingUserIds.includes(row.id)).map((row) => row.name);
    expect(ours).toEqual([LOWER_FIRST, UPPER_FIRST]);
  });

  test('the admin user list orders names case-insensitively', async () => {
    const page = await M.admin.listAdminUsersPage({ page: 1, pageSize: 20, sort: 'name', order: 'asc', search: `zzcollation${runId}-` });
    expect(page.users.map((row) => row.name)).toEqual([LOWER_FIRST, UPPER_FIRST]);
  });
});

// ---------------------------------------------------------------------------
// LIKE metacharacters in user input
// ---------------------------------------------------------------------------

describe.skipIf(!hasDatabase)('LIKE metacharacters in user input are escaped, not honoured', () => {
  test('a literal % in a gallery search is text, not a wildcard', async () => {
    const page = await M.files.listGallery(ownerId, { limit: 50, search: PERCENT_TITLE });
    expect(page.files.map((row) => row.title)).toEqual([PERCENT_TITLE]);
  });

  test('a literal _ in a gallery search is text, not a single-character wildcard', async () => {
    const page = await M.files.listGallery(ownerId, { limit: 50, search: UNDERSCORE_TITLE });
    expect(page.files.map((row) => row.title)).toEqual([UNDERSCORE_TITLE]);
    // The decoy differs from the pattern only where the `_` sits.
    expect(page.files.map((row) => row.title)).not.toContain(UNDERSCORE_DECOY);
  });

  test('a literal % in the admin user search is text, not a wildcard', async () => {
    const page = await M.admin.listAdminUsersPage({ page: 1, pageSize: 20, sort: 'name', order: 'asc', search: `pct%name-${runId}` });
    expect(page.users.map((row) => row.name)).toEqual([`pct%name-${runId}`]);
  });

  test('a literal % in a task name lookup is text, not a wildcard', async () => {
    const decoy = `zzZZtask-${runId}`;
    const created = await M.tasks.createTask(
      { name: decoy, description: 'collation', cronExpression: '0 0 * * *', taskFunction: 'noop', createdBy: ownerId },
      ownerId,
    );
    createdTaskIds.push(created.id);

    // Unescaped, `zz%task-...` would match the decoy and return a task the
    // scheduler was never asked for.
    expect(await M.tasks.getTaskByName(`zz%task-${runId}`)).toBeNull();
    expect((await M.tasks.getTaskByName(decoy))?.id).toBe(created.id);
  });
});

// ---------------------------------------------------------------------------
// Access paths
// ---------------------------------------------------------------------------

type Emitted = { sql: string; params: unknown[] };
type QueryBuilder = Record<string, unknown> & { toSQL: () => Emitted };
type SelectHandle = { select: (fields: unknown) => { from: (source: unknown) => QueryBuilder } };
type PoolClient = { $client: { query: (text: string, values: unknown[]) => Promise<{ rows: Record<string, string>[] }> } };
type GalleryFilters = Parameters<typeof M.files.listGallery>[1];
type GalleryHandle = Parameters<typeof M.files.listGallery>[2];

describe.skipIf(!hasDatabase)('the gallery listing stays on its composite index', () => {
  /**
   * Runs `listGallery` against a handle that captures the SQL Drizzle emits
   * instead of executing it, so the plan below is the plan of the real query
   * rather than of a copy that can drift away from it.
   */
  async function planFor(ownerId: string, filters: GalleryFilters) {
    let captured: Emitted | undefined;
    const capturing = {
      select(fields: unknown) {
        const builder = (db as unknown as SelectHandle).select(fields);
        const from = builder.from.bind(builder);
        builder.from = (source: unknown) => {
          const query = from(source);
          // A Drizzle query builder is already a thenable; replacing its `then`
          // is what lets the query be captured instead of run, and nothing
          // outside this function ever sees the object.
          // biome-ignore lint/suspicious/noThenProperty: intercepting the builder's own thenable is the mechanism
          query.then = (onFulfilled: (rows: unknown[]) => unknown, onRejected: (reason: unknown) => unknown) => {
            captured = query.toSQL();
            return Promise.resolve([]).then(onFulfilled, onRejected);
          };
          return query;
        };
        return builder;
      },
    };

    await M.files.listGallery(ownerId, filters, capturing as unknown as GalleryHandle);
    if (!captured) throw new Error('listGallery emitted no query');

    const { $client } = db as unknown as PoolClient;
    const explained = await $client.query(`EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF) ${captured.sql}`, captured.params);
    return explained.rows.map((row) => row['QUERY PLAN']).join('\n');
  }

  /** The owner holding the migrated production files — 4,184 of the 4,230. */
  async function busiestOwner() {
    const [row] = await db
      .select({ ownerId: M.file.ownerId, files: count() })
      .from(M.file)
      .groupBy(M.file.ownerId)
      .orderBy(desc(count()))
      .limit(1);
    if (!row?.ownerId) throw new Error('dev database has no files to plan against');
    return row.ownerId;
  }

  test('the first page is an index scan on file_ownerId_isDeleted_createdAt_id_idx', async () => {
    const plan = await planFor(await busiestOwner(), { limit: 30 });
    expect(plan).toContain('file_ownerId_isDeleted_createdAt_id_idx');
    // A Sort node would mean the ordering is no longer coming from the index.
    expect(plan).not.toContain('Sort Key: file.created_at');
    expect(plan).not.toContain('Seq Scan on file');
  });

  test('the keyset cursor is pushed into the index condition rather than filtered after it', async () => {
    // This is what Prisma's `cursor` + `skip: 1` could not do. A row-value
    // comparison the planner cannot push down would degrade into a growing scan
    // as the user pages, with identical results and no failing test.
    const ownerId = await busiestOwner();
    const firstPage = await M.files.listGallery(ownerId, { limit: 30 });
    expect(firstPage.nextCursor).toBeTruthy();

    const plan = await planFor(ownerId, { limit: 30, cursor: firstPage.nextCursor ?? undefined });
    expect(plan).toContain('file_ownerId_isDeleted_createdAt_id_idx');
    expect(plan).toMatch(/Index Cond:.*ROW\(created_at, id\)/s);
  });

  test('filtering by folder moves to the folder-qualified composite index', async () => {
    // Planned against the fullest real folder. An empty or invented folder id is
    // selective enough that `file_folderId_idx` legitimately wins, which would
    // make this assertion measure the fixture rather than the access path.
    const [busiest] = await db
      .select({ ownerId: M.file.ownerId, folderId: M.file.folderId, files: count() })
      .from(M.file)
      .where(sql`${M.file.folderId} is not null`)
      .groupBy(M.file.ownerId, M.file.folderId)
      .orderBy(desc(count()))
      .limit(1);
    if (!busiest?.folderId) throw new Error('dev database has no foldered files to plan against');

    const plan = await planFor(busiest.ownerId, { limit: 30, folderId: busiest.folderId });
    expect(plan).toContain('file_ownerId_isDeleted_folderId_createdAt_id_idx');
    expect(plan).not.toContain('Sort Key: file.created_at');
  });
});
