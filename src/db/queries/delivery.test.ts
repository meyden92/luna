import { afterAll, describe, expect, test } from 'bun:test';
import { and, gt, inArray } from 'drizzle-orm';

/**
 * The delivery paths' two silent-failure risks (issue #35).
 *
 * Both content-type filters here were case-insensitive under MariaDB's
 * utf8mb4_unicode_ci and are case-sensitive on Postgres `text` (issue #23): the
 * CDN route's `startsWith('image/')` and the audio player's `in [...]` list.
 * Neither failure raises anything — the file simply stops being deliverable — so
 * the assertions below are what keeps `ilike`/`lower()` from being "simplified"
 * back to `like`/a bare `inArray`.
 *
 * The third test pins the other direction of issue #13: `FileRendition` is a
 * derived artifact in `UNAUDITED_MODELS`, so the CDN hot path must write no
 * audit rows at all.
 *
 * This needs a real Postgres — the defect lives in the database's comparison
 * semantics — and skips cleanly without `DATABASE_URL`.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

/** Lazy: `../client` opens a connection pool at module load. */
async function loadModules() {
  const [client, adminSchema, filesSchema, authSchema, queries] = await Promise.all([
    import('../client'),
    import('../schema/admin'),
    import('../schema/files'),
    import('../schema/auth'),
    import('./delivery'),
  ]);
  return {
    db: client.db,
    auditLog: adminSchema.auditLog,
    file: filesSchema.file,
    fileRendition: filesSchema.fileRendition,
    user: authSchema.user,
    ...queries,
  };
}

type Modules = Awaited<ReturnType<typeof loadModules>>;

// Only ever dereferenced inside tests, which do not run without a database.
const {
  db,
  auditLog,
  file,
  fileRendition,
  user,
  createRendition,
  getDeliverableImage,
  getEmbeddableFile,
  listOwnedAudioFiles,
  touchRendition,
} = hasDatabase ? await loadModules() : ({} as Modules);

const runId = crypto.randomUUID();
const createdFileIds: string[] = [];
const createdRenditionIds: string[] = [];

/** Inserts a fixture file owned by whichever user the dev database has. */
async function insertFile(suffix: string, values: { contentType: string; private?: boolean }) {
  const [owner] = await db.select({ id: user.id }).from(user).limit(1);
  if (!owner) throw new Error('dev database has no user to own the fixture file');

  const id = `delivery-test-${runId}-${suffix}`;
  createdFileIds.push(id);
  await db.insert(file).values({
    id,
    url: `${runId}/${suffix}`,
    title: id,
    size: 1,
    contentType: values.contentType,
    private: values.private ?? false,
    ownerId: owner.id,
  });
  return { id, ownerId: owner.id };
}

afterAll(async () => {
  if (!hasDatabase) return;
  if (createdRenditionIds.length > 0) await db.delete(fileRendition).where(inArray(fileRendition.id, createdRenditionIds));
  if (createdFileIds.length > 0) {
    await db.delete(auditLog).where(inArray(auditLog.recordId, createdFileIds));
    await db.delete(file).where(inArray(file.id, createdFileIds));
  }
});

describe.skipIf(!hasDatabase)('file delivery', () => {
  test('the CDN route still serves a file stored with an upper-case content type', async () => {
    // Fails with `like` instead of `ilike`.
    const { id } = await insertFile('image', { contentType: 'IMAGE/PNG' });
    expect(await getDeliverableImage(id)).toMatchObject({ id });
  });

  test('the audio player still lists a file stored with an upper-case content type', async () => {
    // Fails with a bare `inArray` on the column.
    const { id, ownerId } = await insertFile('audio', { contentType: 'AUDIO/MPEG' });
    const files = await listOwnedAudioFiles(ownerId);
    expect(files.some((row) => row.id === id)).toBe(true);
  });

  test('a private file is not embeddable', async () => {
    const { id } = await insertFile('private', { contentType: 'image/png', private: true });
    expect(await getEmbeddableFile(id)).toBeUndefined();
  });

  test('rendition writes produce no audit rows', async () => {
    const { id, ownerId } = await insertFile('rendition', { contentType: 'image/png' });
    const startedAt = new Date();

    const rendition = await createRendition({
      sourceFileId: id,
      paramHash: `${runId.replace(/-/g, '')}${runId.replace(/-/g, '')}`.slice(0, 64),
      params: { w: 200, fmt: 'webp' },
      s3Key: `${ownerId}/renditions/${id}/test.webp`,
      contentType: 'image/webp',
      size: 42,
      width: 200,
      height: 100,
      private: false,
    });
    createdRenditionIds.push(rendition.id);
    await touchRendition(rendition.id);

    const rows = await db
      .select({ model: auditLog.model })
      .from(auditLog)
      .where(and(gt(auditLog.timestamp, startedAt), inArray(auditLog.model, ['FileRendition', 'File'])));
    expect(rows).toEqual([]);
  });
});
