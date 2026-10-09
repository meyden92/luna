import { createCipheriv, randomBytes, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { user } from '../../../src/db/schema/auth';
import { formShare, formShareField } from '../../../src/db/schema/features';
import type { TestDb } from '../fixtures/db';
import { type FixtureRole, fixtureUser } from '../fixtures/users';
import type { StackEnv } from '../stack-env';

/** A field of a seeded form share. `isSensitive` values are stored encrypted, like `createFormShare` does. */
export interface SeedField {
  label: string;
  value: string;
  type?: 'text' | 'password' | 'email' | 'url' | 'number' | 'textarea' | 'hidden';
  isSensitive?: boolean;
}

/**
 * AES-256-GCM, stored as `iv:authTag:ciphertext` (each base64): the wire format of
 * `src/libs/encryption/field-encryption.ts`, which cannot be imported here because it loads the app's env.
 */
function encryptFieldValue(plaintext: string, base64Key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(base64Key, 'base64'), iv, { authTagLength: 16 });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64')).join(':');
}

/**
 * Creates a form share owned by a fixture user and returns its id. No screen creates a share (the builder dialog
 * is not mounted anywhere), so this writes the rows `createFormShare` would, with the sensitive values encrypted
 * under the stack's `FORM_FIELD_ENCRYPTION_KEY`. `expiresAt` is absolute; `maxViews` limits claims.
 */
export async function seedFormShare(
  db: TestDb,
  stack: StackEnv,
  owner: FixtureRole,
  share: { title: string; fields: SeedField[]; expiresAt?: Date; maxViews?: number },
): Promise<string> {
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.username, fixtureUser(owner).username));
  if (!row) throw new Error(`No user for ${owner}`);

  const id = randomUUID();
  await db
    .insert(formShare)
    .values({ id, title: share.title, ownerId: row.id, expiresAt: share.expiresAt ?? null, maxViews: share.maxViews ?? null });
  await db.insert(formShareField).values(
    share.fields.map((field, index) => ({
      id: randomUUID(),
      formId: id,
      label: field.label,
      value: field.isSensitive ? encryptFieldValue(field.value, stack.E2E_FORM_FIELD_ENCRYPTION_KEY) : field.value,
      type: field.type ?? 'text',
      isSensitive: field.isSensitive ?? false,
      sortOrder: index,
    })),
  );
  return id;
}
