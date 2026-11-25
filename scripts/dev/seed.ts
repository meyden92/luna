/**
 * Gives a local dev database two accounts to sign in with, each holding the e2e
 * gallery dataset (`tests/e2e/fixtures/gallery.ts`):
 *
 *   bun run db:seed
 *
 *   admin / admin   super admin
 *   user  / user    ordinary user
 *
 * An account whose username already exists is skipped, so a second run changes
 * nothing; delete the account to seed it afresh. Writes to the database and the
 * bucket the app's environment names, so it refuses any non-local database.
 */
import { readFileSync } from 'node:fs';
import { and, eq } from 'drizzle-orm';
import { GALLERY_FOLDERS, GALLERY_UPLOADS, type GalleryFolder, galleryDataset } from '../../tests/e2e/fixtures/gallery';

/**
 * Below `PASSWORD_MIN_LENGTH` on purpose: only the forms that set a password
 * enforce it, sign-in does not.
 */
const ACCOUNTS = [
  { username: 'admin', password: 'admin', name: 'Admin', superAdmin: true },
  { username: 'user', password: 'user', name: 'User', superAdmin: false },
] as const;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) fail('DATABASE_URL is not set.');
if (process.env.NODE_ENV === 'production') fail('Refusing to seed with NODE_ENV=production.');
if (!LOCAL_HOSTS.has(new URL(databaseUrl).hostname)) fail(`Refusing to seed a non-local database (${new URL(databaseUrl).hostname}).`);

const { db } = await import('../../src/db/client');
const { findUserIdByUsername } = await import('../../src/db/queries/auth');
const { updateOwnedFile } = await import('../../src/db/queries/files');
const { createFolder } = await import('../../src/db/queries/folders');
const { user } = await import('../../src/db/schema/auth');
const { file } = await import('../../src/db/schema/files');
const { createUserWithCredentials } = await import('../../src/libs/auth/credentials');
const { fileS3Key, setObjectPrivacy } = await import('../../src/libs/S3Helper');
const { storeSharexUpload } = await import('../../src/libs/sharex-upload');

async function seedGallery(ownerId: string): Promise<void> {
  const folderIds = new Map<GalleryFolder, string>();
  for (const name of GALLERY_FOLDERS) {
    folderIds.set(name, (await createFolder({ name, ownerId }, ownerId)).id);
  }

  for (const upload of GALLERY_UPLOADS) {
    const settings = {
      compressImage: false,
      convertToJpeg: false,
      jpegQuality: 85,
      folderId: upload.folder ? folderIds.get(upload.folder)! : null,
      flowId: null,
    };
    const bytes = new File([readFileSync(upload.source.path)], upload.title, { type: upload.source.mimeType });
    const response = await storeSharexUpload(ownerId, settings, bytes);
    if (!response.ok) fail(`${upload.title}: ${response.status} ${await response.text()}`);
  }

  for (const seeded of galleryDataset(new Date()).files) {
    const [row] = await db
      .update(file)
      .set({ createdAt: seeded.createdAt })
      .where(and(eq(file.ownerId, ownerId), eq(file.title, seeded.title)))
      .returning({ id: file.id, url: file.url });
    if (!row) fail(`${seeded.title} was not stored.`);
    if (seeded.private) {
      await setObjectPrivacy(fileS3Key(ownerId, row.url), true);
      await updateOwnedFile({ id: row.id, ownerId, values: { private: true } }, ownerId);
    }
  }
}

for (const account of ACCOUNTS) {
  if (await findUserIdByUsername(account.username)) {
    console.log(`– ${account.username}: exists, skipped`);
    continue;
  }

  const created = await createUserWithCredentials({
    username: account.username,
    name: account.name,
    email: `${account.username}@lunashare.test`,
    password: account.password,
  });
  if (account.superAdmin) await db.update(user).set({ isSuperAdmin: true }).where(eq(user.id, created.id));

  await seedGallery(created.id);
  console.log(`✔ ${account.username}: created with ${GALLERY_UPLOADS.length} files`);
}

process.exit(0);
