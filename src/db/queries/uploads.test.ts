import { afterAll, describe, expect, test } from 'bun:test';
import { and, eq, inArray } from 'drizzle-orm';

/**
 * The upload path's two invariants that no type checker can see (issue #34):
 *
 * 1. Content hashes are normalised on the WRITE path. Stored upper-case, they
 *    silently stop matching the case-normalised moderation gate on Postgres and
 *    the denylist fails open (issues #23, #42).
 * 2. A failing audit write never rolls back or corrupts the business write, even
 *    though both share one transaction. That only holds because `writeAuditLog`
 *    writes on a SAVEPOINT.
 *
 * Needs a real Postgres — savepoint semantics and case-sensitive comparison are
 * the things under test, so there is nothing here a mock could reproduce. Skips
 * cleanly without `DATABASE_URL`.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

/** Imported lazily; `../client` opens a connection pool at module load. */
async function loadModules() {
  const [client, filesSchema, authSchema, adminSchema, uploads, quota] = await Promise.all([
    import('../client'),
    import('../schema/files'),
    import('../schema/auth'),
    import('../schema/admin'),
    import('./uploads'),
    import('@/libs/storage-quota'),
  ]);
  return {
    db: client.db,
    file: filesSchema.file,
    fileMetadata: filesSchema.fileMetadata,
    folder: filesSchema.folder,
    user: authSchema.user,
    auditLog: adminSchema.auditLog,
    createUploadedFile: uploads.createUploadedFile,
    releaseUploadedFile: uploads.releaseUploadedFile,
    findOwnedActiveFolderId: uploads.findOwnedActiveFolderId,
    StorageQuotaExceededError: quota.StorageQuotaExceededError,
  };
}

type Modules = Awaited<ReturnType<typeof loadModules>>;

const {
  db,
  file,
  fileMetadata,
  folder,
  user,
  auditLog,
  createUploadedFile,
  releaseUploadedFile,
  findOwnedActiveFolderId,
  StorageQuotaExceededError,
} = hasDatabase ? await loadModules() : ({} as Modules);

/** Distinct per run, so a crashed run cannot collide with the next one. */
const runId = crypto.randomUUID().replace(/-/g, '');
const ownerId = `uploads-test-owner-${runId}`;
const SHA256 = `${runId}${runId}`.slice(0, 64);
const MD5 = runId.slice(0, 32);

const createdFileIds: string[] = [];

/** A dedicated owner with a 1 MiB quota, so the quota test needs no real user. */
if (hasDatabase) {
  await db.insert(user).values({ id: ownerId, email: `${ownerId}@example.invalid`, name: 'uploads test', storageQuotaMiB: 1 });
}

function uploadInput(overrides: Partial<Parameters<typeof createUploadedFile>[0]> = {}): Parameters<typeof createUploadedFile>[0] {
  return {
    ownerId,
    size: 1024,
    url: `${runId}-fixture.png`,
    title: 'fixture.png',
    tags: 'web-upload',
    contentType: 'image/png',
    privateUpload: false,
    hashes: { sha256: SHA256, md5: MD5, phash: null },
    scrubReport: { version: 2, stripped: false },
    ...overrides,
  };
}

afterAll(async () => {
  if (!hasDatabase) return;
  if (createdFileIds.length > 0) await db.delete(auditLog).where(inArray(auditLog.recordId, createdFileIds));
  await db.delete(file).where(eq(file.ownerId, ownerId));
  await db.delete(folder).where(eq(folder.ownerId, ownerId));
  await db.delete(auditLog).where(eq(auditLog.userId, ownerId));
  await db.delete(user).where(eq(user.id, ownerId));
});

describe.skipIf(!hasDatabase)('upload writes', () => {
  test('an upload hash arriving in upper case is stored lower case', async () => {
    const created = await createUploadedFile(
      uploadInput({ hashes: { sha256: SHA256.toUpperCase(), md5: MD5.toUpperCase(), phash: SHA256.toUpperCase() } }),
      ownerId,
    );
    createdFileIds.push(created.id);

    const [stored] = await db.select().from(file).where(eq(file.id, created.id));
    expect(stored?.sha256).toBe(SHA256);
    expect(stored?.md5).toBe(MD5);
    expect(stored?.phash).toBe(SHA256);
  });

  test('the create is audited and its derived metadata row is not', async () => {
    const created = await createUploadedFile(uploadInput({ dimensions: { width: 800, height: 600 } }), ownerId);
    createdFileIds.push(created.id);

    expect(created.metadata).toEqual({ width: 800, height: 600 });

    const audits = await db.select().from(auditLog).where(eq(auditLog.recordId, created.id));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ model: 'File', action: 'create', userId: ownerId });

    const [metadata] = await db.select().from(fileMetadata).where(eq(fileMetadata.fileId, created.id));
    if (!metadata) throw new Error('metadata row missing');
    const metadataAudits = await db.select().from(auditLog).where(eq(auditLog.recordId, metadata.id));
    expect(metadataAudits).toHaveLength(0);
  });

  test('a failing audit write leaves the uploaded file committed', async () => {
    // An unknown userId violates audit_log's FK to `user`, so the audit INSERT
    // fails inside the same transaction as the file INSERT. Without the
    // savepoint the aborted statement would poison that transaction and take
    // the file row with it.
    const created = await createUploadedFile(uploadInput(), `missing-user-${runId}`);
    createdFileIds.push(created.id);

    const [stored] = await db.select().from(file).where(eq(file.id, created.id));
    expect(stored?.id).toBe(created.id);

    const audits = await db.select().from(auditLog).where(eq(auditLog.recordId, created.id));
    expect(audits).toHaveLength(0);
  });

  test('an upload over quota is rejected and reserves nothing', async () => {
    const before = await db.select({ id: file.id }).from(file).where(eq(file.ownerId, ownerId));

    // 1 MiB quota, 2 MiB upload.
    await expect(createUploadedFile(uploadInput({ size: 2 * 1024 * 1024 }), ownerId)).rejects.toBeInstanceOf(StorageQuotaExceededError);

    const after = await db.select({ id: file.id }).from(file).where(eq(file.ownerId, ownerId));
    expect(after).toHaveLength(before.length);
  });

  test('releasing a reservation deletes the row and audits the delete', async () => {
    const created = await createUploadedFile(uploadInput(), ownerId);
    createdFileIds.push(created.id);

    await releaseUploadedFile(created.id, ownerId);

    const rows = await db.select().from(file).where(eq(file.id, created.id));
    expect(rows).toHaveLength(0);

    const audits = await db.select().from(auditLog).where(eq(auditLog.recordId, created.id));
    expect(audits.map((row) => row.action).sort()).toEqual(['create', 'delete']);
  });

  test('a ShareX token pointing at a deleted folder falls back to no folder', async () => {
    const folderId = `uploads-test-folder-${runId}`;
    await db.insert(folder).values({ id: folderId, name: 'fixture', ownerId });

    expect(await findOwnedActiveFolderId(folderId, ownerId)).toBe(folderId);
    expect(await findOwnedActiveFolderId(folderId, `someone-else-${runId}`)).toBeNull();

    await db
      .update(folder)
      .set({ isDeleted: true })
      .where(and(eq(folder.id, folderId), eq(folder.ownerId, ownerId)));
    expect(await findOwnedActiveFolderId(folderId, ownerId)).toBeNull();
  });
});
