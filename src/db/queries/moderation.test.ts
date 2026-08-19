import { afterAll, describe, expect, test } from 'bun:test';
import { eq, inArray } from 'drizzle-orm';

/**
 * The regression that must never return (issue #42).
 *
 * MariaDB's utf8mb4_unicode_ci compared the denylist hash case-insensitively.
 * Postgres `varchar` does not, so a case-mismatched entry silently stops
 * blocking content — the gate fails OPEN, with no error and nothing in the logs
 * (reproduced on a live Postgres in issue #23). The remedy is normalising hex
 * case on the write path AND the read path; the first two tests below fail if
 * either half is removed.
 *
 * This needs a real Postgres: the defect lives in the database's comparison
 * semantics, so there is nothing here a mock could reproduce. It skips cleanly
 * without `DATABASE_URL` so `bun test` still runs for anyone without one.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

/**
 * Imported lazily because `../client` opens a connection pool at module load —
 * a static import would throw before `skipIf` had a chance to skip anything.
 */
async function loadModules() {
  const [client, adminSchema, filesSchema, authSchema, queries, gate] = await Promise.all([
    import('../client'),
    import('../schema/admin'),
    import('../schema/files'),
    import('../schema/auth'),
    import('./moderation'),
    import('@/libs/moderation/hash-gate'),
  ]);
  return {
    db: client.db,
    auditLog: adminSchema.auditLog,
    denylistEntry: adminSchema.denylistEntry,
    file: filesSchema.file,
    user: authSchema.user,
    createDenylistEntry: queries.createDenylistEntry,
    listRescanCandidates: queries.listRescanCandidates,
    findDenylistMatchForHashes: gate.findDenylistMatchForHashes,
  };
}

type Modules = Awaited<ReturnType<typeof loadModules>>;

// Only ever dereferenced inside tests, which do not run without a database.
const { db, auditLog, denylistEntry, file, user, createDenylistEntry, listRescanCandidates, findDenylistMatchForHashes } = hasDatabase
  ? await loadModules()
  : ({} as Modules);

/** Distinct per run, so a crashed run cannot collide with the next one. */
const runId = crypto.randomUUID().replace(/-/g, '');
const otherId = crypto.randomUUID().replace(/-/g, '');
const SHA256 = `${runId}${runId}`.slice(0, 64);
const MD5 = runId.slice(0, 32);
// Never added to the denylist, so a test asserting on one hash type cannot be
// satisfied by the entry another test added.
const UNLISTED_SHA256 = `${otherId}${otherId}`.slice(0, 64);
const UNLISTED_MD5 = otherId.slice(0, 32);

const createdEntryIds: string[] = [];
const createdFileIds: string[] = [];

afterAll(async () => {
  if (!hasDatabase) return;
  const recordIds = [...createdEntryIds, ...createdFileIds];
  if (recordIds.length > 0) await db.delete(auditLog).where(inArray(auditLog.recordId, recordIds));
  if (createdEntryIds.length > 0) await db.delete(denylistEntry).where(inArray(denylistEntry.id, createdEntryIds));
  if (createdFileIds.length > 0) await db.delete(file).where(inArray(file.id, createdFileIds));
});

describe.skipIf(!hasDatabase)('moderation case-sensitivity', () => {
  test('a denylist entry written in upper case still blocks', async () => {
    // Fails without normalisation on the WRITE path: the row lands upper-case
    // and the normalised read then matches nothing — the fail-open case.
    const entry = await createDenylistEntry({ hashType: 'sha256', hash: SHA256.toUpperCase(), severity: 'block', addedBy: null }, null);
    createdEntryIds.push(entry.id);

    const match = await findDenylistMatchForHashes({ sha256: SHA256, md5: UNLISTED_MD5, phash: null });
    expect(match).toMatchObject({ matchType: 'sha256', matchedEntryId: entry.id });
  });

  test('an uploaded hash arriving in upper case still matches a stored entry', async () => {
    // Fails without normalisation on the READ path.
    const entry = await createDenylistEntry({ hashType: 'md5', hash: MD5, severity: 'block', addedBy: null }, null);
    createdEntryIds.push(entry.id);

    const match = await findDenylistMatchForHashes({ sha256: UNLISTED_SHA256.toUpperCase(), md5: MD5.toUpperCase(), phash: null });
    expect(match).toMatchObject({ matchType: 'md5', matchedEntryId: entry.id });
  });

  test('rescan skips a file already quarantined under a differently-cased status', async () => {
    // `file.moderation_status` is compared as a string and the data transform
    // does not normalise it, so the comparison itself has to be insensitive.
    const [owner] = await db.select({ id: user.id }).from(user).limit(1);
    if (!owner) throw new Error('dev database has no user to own the fixture file');

    const id = `moderation-test-${runId}`;
    createdFileIds.push(id);
    await db.insert(file).values({
      id,
      url: `https://example.invalid/${id}`,
      title: id,
      size: 1,
      contentType: 'image/png',
      moderationStatus: 'QUARANTINED',
      sha256: SHA256,
      md5: MD5,
      ownerId: owner.id,
    });

    const quarantined = await listRescanCandidates({ limit: 5000 });
    expect(quarantined.some((candidate) => candidate.id === id)).toBe(false);

    await db.update(file).set({ moderationStatus: 'clear' }).where(eq(file.id, id));
    const cleared = await listRescanCandidates({ limit: 5000 });
    expect(cleared.some((candidate) => candidate.id === id)).toBe(true);
  });
});
