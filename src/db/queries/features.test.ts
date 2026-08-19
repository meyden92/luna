import { afterAll, describe, expect, test } from 'bun:test';

/**
 * The encrypted form-share round-trip (issue #44).
 *
 * `form_share_field.value` holds ciphertext, and the acceptance criterion is
 * that it round-trips BYTE-IDENTICALLY: a column type that trims, re-encodes or
 * canonicalises the value would leave it undecryptable, and the failure only
 * shows up when someone tries to reveal a field. Reasoning about the column type
 * is not enough — this drives a real encrypt → write → read → decrypt cycle.
 *
 * The plaintext is chosen to break anything that reformats: a colon (the wire
 * format's `iv:tag:ciphertext` separator), JSON-shaped text, a newline, quotes,
 * a non-ASCII character, an emoji, and leading/trailing whitespace.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

// Lazy: `../client` opens a pool at module load and would throw before
// `skipIf` had a chance to skip anything.
const { db } = hasDatabase ? await import('../client') : { db: null as never };
const { formShare } = hasDatabase ? await import('../schema/features') : ({} as never);
const { user } = hasDatabase ? await import('../schema/auth') : ({} as never);
const { auditLog } = hasDatabase ? await import('../schema/admin') : ({} as never);
const { createFormShare, getRevealableFormShareField, getFormShareWithFields } = hasDatabase ? await import('./features') : ({} as never);
const { encryptFieldValue, decryptFieldValue } = hasDatabase ? await import('@/libs/encryption/field-encryption') : ({} as never);
const { eq, inArray } = await import('drizzle-orm');

const SECRET = '  {"iv":"a:b"}\n"quoted" café 🔐  ';

const createdShareIds: string[] = [];

afterAll(async () => {
  if (!hasDatabase || createdShareIds.length === 0) return;
  await db.delete(auditLog).where(inArray(auditLog.recordId, createdShareIds));
  await db.delete(formShare).where(inArray(formShare.id, createdShareIds));
});

describe.skipIf(!hasDatabase)('encrypted form-share field round-trip', () => {
  test('ciphertext survives write and read byte-identically, and still decrypts', async () => {
    const [owner] = await db.select({ id: user.id }).from(user).limit(1);
    if (!owner) throw new Error('dev database has no user to own the fixture share');

    const ciphertext = encryptFieldValue(SECRET);
    const share = await createFormShare(
      {
        title: 'zz-encryption-roundtrip',
        expiresInMs: null,
        maxViews: null,
        ownerId: owner.id,
        fields: [{ label: 'secret', value: ciphertext, type: 'text', isSensitive: true }],
      },
      owner.id,
    );
    createdShareIds.push(share.id);

    const detail = await getFormShareWithFields(share.id);
    const fieldId = detail?.fields[0]?.id;
    expect(fieldId).toBeDefined();

    const revealed = await getRevealableFormShareField({ fieldId: fieldId as string, shareId: share.id });
    expect(revealed).toBeDefined();

    // Byte-for-byte, not merely "decrypts to something".
    expect(Buffer.compare(Buffer.from(revealed?.value ?? '', 'utf8'), Buffer.from(ciphertext, 'utf8'))).toBe(0);
    expect(decryptFieldValue(revealed?.value as string)).toBe(SECRET);
  });

  test('the audit snapshot records the field without leaking the plaintext', async () => {
    const shareId = createdShareIds[0];
    expect(shareId).toBeDefined();

    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.recordId, shareId as string));
    expect(rows.length).toBeGreaterThan(0);
    // `Token.key` has explicit redaction; a form-share value is already
    // ciphertext, so what must not appear is the PLAINTEXT.
    expect(JSON.stringify(rows)).not.toContain('café');
  });
});
