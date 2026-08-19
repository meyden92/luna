import { and, count, desc, eq, ne } from 'drizzle-orm';
import { type AuditHandle, writeAuditLog } from '../audit';
import { db } from '../client';
import { user } from '../schema/auth';
import { formShare, formShareField, nicotineEntry } from '../schema/features';
import { file, fileMetadata, snippet } from '../schema/files';

/**
 * Query module for the standalone user-facing features (issue #15): nicotine
 * tracking, form shares and snippets, plus the single public file read the
 * form-share page shares a route module with.
 *
 * Same contract as the files and folders modules: call sites import named
 * functions, the `db` handle never leaves `src/db/`, the handle comes last and
 * defaults to this module's own `db`, and the audit call lives inside the write
 * function rather than at the call site.
 *
 * `NicotineEntry`, `FormShare`, `FormShareField` and `Snippet` are all in
 * `AUDITED_MODELS` — every write below records one.
 */

// ---------------------------------------------------------------------------
// Nicotine tracking
// ---------------------------------------------------------------------------

/** The columns the tracker UI renders. */
const nicotineColumns = {
  id: nicotineEntry.id,
  kind: nicotineEntry.kind,
  note: nicotineEntry.note,
  occurredAt: nicotineEntry.occurredAt,
  createdAt: nicotineEntry.createdAt,
};

/** An owner's entries, most recent first. */
export function listOwnedNicotineEntries(ownerId: string, handle: AuditHandle = db) {
  return handle
    .select(nicotineColumns)
    .from(nicotineEntry)
    .where(eq(nicotineEntry.ownerId, ownerId))
    .orderBy(desc(nicotineEntry.occurredAt));
}

export async function createNicotineEntry(
  { kind, note, ownerId }: { kind: string; note: string | null; ownerId: string },
  userId: string | null,
  handle: AuditHandle = db,
) {
  const [row] = await handle.insert(nicotineEntry).values({ id: crypto.randomUUID(), kind, note, ownerId }).returning();
  if (!row) throw new Error('Failed to create nicotine entry');
  await writeAuditLog(handle, { model: 'NicotineEntry', action: 'create', after: row, userId });
  return row;
}

/** One entry the owner owns, or undefined. */
async function getOwnedNicotineEntry(id: string, ownerId: string, handle: AuditHandle = db) {
  const [row] = await handle
    .select()
    .from(nicotineEntry)
    .where(and(eq(nicotineEntry.id, id), eq(nicotineEntry.ownerId, ownerId)));
  return row;
}

export async function updateOwnedNicotineEntry(
  { id, ownerId, kind, note, occurredAt }: { id: string; ownerId: string; kind: string; note: string | null; occurredAt: Date },
  userId: string | null,
  handle: AuditHandle = db,
) {
  const before = await getOwnedNicotineEntry(id, ownerId, handle);
  if (!before) return undefined;

  const [after] = await handle
    .update(nicotineEntry)
    .set({ kind, note, occurredAt, updatedAt: new Date() })
    .where(and(eq(nicotineEntry.id, id), eq(nicotineEntry.ownerId, ownerId)))
    .returning();
  if (!after) return undefined;

  await writeAuditLog(handle, { model: 'NicotineEntry', action: 'update', before, after, userId });
  return after;
}

/** Deletes an entry the owner owns and returns it, or undefined if there is none. */
export async function deleteOwnedNicotineEntry(
  { id, ownerId }: { id: string; ownerId: string },
  userId: string | null,
  handle: AuditHandle = db,
) {
  const before = await getOwnedNicotineEntry(id, ownerId, handle);
  if (!before) return undefined;

  await handle.delete(nicotineEntry).where(and(eq(nicotineEntry.id, id), eq(nicotineEntry.ownerId, ownerId)));
  await writeAuditLog(handle, { model: 'NicotineEntry', action: 'delete', before, userId });
  return before;
}

// ---------------------------------------------------------------------------
// Form shares
// ---------------------------------------------------------------------------

/** Shape the list dialog expects: the summary columns plus Prisma's `_count.fields`. */
export type FormShareSummary = {
  id: string;
  title: string | null;
  expiresAt: Date | null;
  expiresInMs: number | null;
  maxViews: number | null;
  viewCount: number;
  createdAt: Date;
  _count: { fields: number };
};

/**
 * An owner's live shares, newest first, each with its field count. A relation
 * count is one of the shapes the relational API cannot express, so this is a
 * core select with an explicit join and GROUP BY (issue #21).
 */
export async function listOwnedFormShares(ownerId: string, handle: AuditHandle = db): Promise<FormShareSummary[]> {
  const rows = await handle
    .select({
      id: formShare.id,
      title: formShare.title,
      expiresAt: formShare.expiresAt,
      expiresInMs: formShare.expiresInMs,
      maxViews: formShare.maxViews,
      viewCount: formShare.viewCount,
      createdAt: formShare.createdAt,
      fieldCount: count(formShareField.id),
    })
    .from(formShare)
    .leftJoin(formShareField, eq(formShareField.formId, formShare.id))
    .where(and(eq(formShare.ownerId, ownerId), eq(formShare.isDeleted, false)))
    .groupBy(formShare.id)
    .orderBy(desc(formShare.createdAt));

  return rows.map(({ fieldCount, ...row }) => ({ ...row, _count: { fields: fieldCount } }));
}

export type NewFormShareField = { label: string; value: string; type: string; isSensitive: boolean };

/**
 * Creates a share and its fields together. Prisma's nested `create` becomes one
 * transaction, so a share can never be left without its fields.
 *
 * `value` is written through untouched: for a sensitive field the caller has
 * already encrypted it, and `form_share_field.value` is plain `text` precisely
 * so Postgres stores those exact bytes. Nothing here trims, normalises or
 * re-encodes it — the ciphertext has to round-trip byte-identically or it stops
 * decrypting. Note this is also why the encrypted value is NOT case-normalised
 * the way hashes are (issue #23): base64 is case-significant.
 */
export async function createFormShare(
  {
    title,
    expiresInMs,
    maxViews,
    ownerId,
    fields,
  }: {
    title: string | null;
    expiresInMs: number | null;
    maxViews: number | null;
    ownerId: string;
    fields: NewFormShareField[];
  },
  userId: string | null,
  handle: AuditHandle = db,
) {
  return handle.transaction(async (tx) => {
    const [share] = await tx.insert(formShare).values({ id: crypto.randomUUID(), title, expiresInMs, maxViews, ownerId }).returning();
    if (!share) throw new Error('Failed to create form share');

    const inserted = await tx
      .insert(formShareField)
      .values(fields.map((field, index) => ({ id: crypto.randomUUID(), formId: share.id, ...field, sortOrder: index })))
      .returning();

    await writeAuditLog(tx, { model: 'FormShare', action: 'create', after: share, userId });
    for (const field of inserted) {
      await writeAuditLog(tx, { model: 'FormShareField', action: 'create', after: field, userId });
    }
    return share;
  });
}

/** Soft-deletes a share the owner owns. Returns the row as it was, or undefined. */
export async function softDeleteOwnedFormShare(
  { id, ownerId }: { id: string; ownerId: string },
  userId: string | null,
  handle: AuditHandle = db,
) {
  const [before] = await handle
    .select()
    .from(formShare)
    .where(and(eq(formShare.id, id), eq(formShare.ownerId, ownerId)));
  if (!before) return undefined;

  const deletedAt = new Date();
  const [after] = await handle
    .update(formShare)
    .set({ isDeleted: true, deletedAt, updatedAt: deletedAt })
    .where(and(eq(formShare.id, id), eq(formShare.ownerId, ownerId)))
    .returning();
  if (!after) return undefined;

  await writeAuditLog(handle, { model: 'FormShare', action: 'update', before, after, userId });
  return before;
}

/** A live share with its fields in display order — the public share page's read. */
export function getFormShareWithFields(id: string) {
  return db.query.formShare.findFirst({
    where: { id, isDeleted: false },
    with: { fields: { orderBy: { sortOrder: 'asc' } } },
  });
}

export type FormShareClaim =
  | { status: 'not-found' }
  | { status: 'expired-time' | 'expired-views'; id: string; expiresAt: Date | null; maxViews: number | null; viewCount: number }
  | {
      status: 'ok';
      id: string;
      expiresAt: Date | null;
      maxViews: number | null;
      viewCount: number;
      hasSensitiveFields: boolean;
    };

/**
 * Atomically claims one view of a share.
 *
 * Under Prisma this was a raw conditional UPDATE with a CASE expression, because
 * "increment only if still within the limits, and start the expiry countdown on
 * the first view" is not a single Prisma update. Here it is a transaction that
 * takes a row lock with `.for('update')` and then decides in TypeScript, which
 * gives the same guarantee — two concurrent viewers serialise on the lock, so
 * they cannot both pass `maxViews` — without raw SQL.
 *
 * Deliberately NOT audited. `FormShare` is an audited model, but this write is
 * an anonymous public view counter, not owner intent; the Prisma raw statement
 * bypassed the audit extension too, so production has never recorded these and
 * auditing them now would bury real edits under view traffic.
 */
export async function claimFormShareView(id: string, handle: AuditHandle = db): Promise<FormShareClaim> {
  return handle.transaction(async (tx) => {
    const [locked] = await tx.select().from(formShare).where(eq(formShare.id, id)).for('update');
    if (!locked || locked.isDeleted) return { status: 'not-found' };

    const now = new Date();
    const snapshot = { id: locked.id, expiresAt: locked.expiresAt, maxViews: locked.maxViews, viewCount: locked.viewCount };
    // `expiresAt > NOW()` in the original statement, so an exactly-equal instant is expired.
    if (locked.expiresAt && locked.expiresAt <= now) return { status: 'expired-time', ...snapshot };
    if (locked.maxViews !== null && locked.viewCount >= locked.maxViews) return { status: 'expired-views', ...snapshot };

    // The first view starts a relative countdown, in the same transaction as the increment.
    const expiresAt =
      locked.viewCount === 0 && locked.expiresInMs !== null && locked.expiresAt === null
        ? new Date(now.getTime() + locked.expiresInMs)
        : locked.expiresAt;

    const [after] = await tx
      .update(formShare)
      .set({ expiresAt, viewCount: locked.viewCount + 1, updatedAt: now })
      .where(eq(formShare.id, id))
      .returning();
    if (!after) return { status: 'not-found' };

    const [sensitive] = await tx
      .select({ total: count() })
      .from(formShareField)
      .where(and(eq(formShareField.formId, id), eq(formShareField.isSensitive, true)));

    return {
      status: 'ok',
      id: after.id,
      expiresAt: after.expiresAt,
      maxViews: after.maxViews,
      viewCount: after.viewCount,
      hasSensitiveFields: Number(sensitive?.total ?? 0) > 0,
    };
  });
}

/**
 * The one sensitive field a reveal request names, together with its share's
 * expiry. Returns the stored `value` verbatim so the caller decrypts the exact
 * bytes that were written.
 */
export async function getRevealableFormShareField({ fieldId, shareId }: { fieldId: string; shareId: string }, handle: AuditHandle = db) {
  const [row] = await handle
    .select({
      id: formShareField.id,
      value: formShareField.value,
      formExpiresAt: formShare.expiresAt,
    })
    .from(formShareField)
    .innerJoin(formShare, eq(formShare.id, formShareField.formId))
    .where(
      and(
        eq(formShareField.id, fieldId),
        eq(formShareField.formId, shareId),
        eq(formShareField.isSensitive, true),
        ne(formShareField.type, 'hidden'),
        eq(formShare.isDeleted, false),
      ),
    );
  return row;
}

// ---------------------------------------------------------------------------
// Snippets
// ---------------------------------------------------------------------------

/** An owner's live snippets, newest first, as whole rows. */
export function listOwnedSnippets(ownerId: string, handle: AuditHandle = db) {
  return handle
    .select()
    .from(snippet)
    .where(and(eq(snippet.ownerId, ownerId), eq(snippet.isDeleted, false)))
    .orderBy(desc(snippet.createdAt));
}

/** The same list trimmed to what the dashboard renders. */
export function listOwnedSnippetSummaries(ownerId: string, handle: AuditHandle = db) {
  return handle
    .select({
      id: snippet.id,
      title: snippet.title,
      content: snippet.content,
      language: snippet.language,
      isPublic: snippet.isPublic,
      createdAt: snippet.createdAt,
    })
    .from(snippet)
    .where(and(eq(snippet.ownerId, ownerId), eq(snippet.isDeleted, false)))
    .orderBy(desc(snippet.createdAt));
}

/** One live snippet the owner owns, or undefined. */
export async function getOwnedSnippet(id: string, ownerId: string, handle: AuditHandle = db) {
  const [row] = await handle
    .select()
    .from(snippet)
    .where(and(eq(snippet.id, id), eq(snippet.ownerId, ownerId), eq(snippet.isDeleted, false)));
  return row;
}

/**
 * A live snippet with its author, for the public `/bin/$id` page. The caller
 * still decides whether the viewer may see it — this read deliberately does not
 * filter on `isPublic`, because owners and admins can view private snippets.
 */
export function getSnippetWithAuthor(id: string) {
  return db.query.snippet.findFirst({
    where: { id, isDeleted: false },
    with: { author: { columns: { id: true, name: true, image: true } } },
  });
}

export async function createSnippet(
  {
    title,
    content,
    language,
    isPublic,
    ownerId,
  }: { title: string | null; content: string; language: string | null; isPublic: boolean; ownerId: string },
  userId: string | null,
  handle: AuditHandle = db,
) {
  const [row] = await handle.insert(snippet).values({ id: crypto.randomUUID(), title, content, language, isPublic, ownerId }).returning();
  if (!row) throw new Error('Failed to create snippet');
  await writeAuditLog(handle, { model: 'Snippet', action: 'create', after: row, userId });
  return row;
}

/** Updates a snippet the owner owns. `isPublic` is left alone when omitted. */
export async function updateOwnedSnippet(
  {
    id,
    ownerId,
    title,
    content,
    language,
    isPublic,
  }: { id: string; ownerId: string; title: string; content: string; language: string | null; isPublic?: boolean },
  userId: string | null,
  handle: AuditHandle = db,
) {
  const [before] = await handle
    .select()
    .from(snippet)
    .where(and(eq(snippet.id, id), eq(snippet.ownerId, ownerId)));
  if (!before) return undefined;

  const [after] = await handle
    .update(snippet)
    .set({ title, content, language, ...(isPublic === undefined ? {} : { isPublic }), updatedAt: new Date() })
    .where(and(eq(snippet.id, id), eq(snippet.ownerId, ownerId)))
    .returning();
  if (!after) return undefined;

  await writeAuditLog(handle, { model: 'Snippet', action: 'update', before, after, userId });
  return after;
}

/** Deletes a snippet the owner owns and returns it, or undefined if there is none. */
export async function deleteOwnedSnippet(
  { id, ownerId }: { id: string; ownerId: string },
  userId: string | null,
  handle: AuditHandle = db,
) {
  const [before] = await handle
    .select()
    .from(snippet)
    .where(and(eq(snippet.id, id), eq(snippet.ownerId, ownerId)));
  if (!before) return undefined;

  await handle.delete(snippet).where(and(eq(snippet.id, id), eq(snippet.ownerId, ownerId)));
  await writeAuditLog(handle, { model: 'Snippet', action: 'delete', before, userId });
  return before;
}

// ---------------------------------------------------------------------------
// Public file view
// ---------------------------------------------------------------------------

/**
 * The public `/view/$id` read: a live, non-quarantined file with its owner and
 * metadata. It lives here rather than in `queries/files.ts` only because that
 * module belongs to another batch.
 *
 * A core select rather than the relational API: `file.owner_id` is NOT NULL
 * behind a foreign key, and an INNER JOIN says so in the types, where the
 * relational API's `one` relation would hand the page a nullable owner it would
 * then have to pretend to handle. Metadata is genuinely optional, so it stays a
 * LEFT JOIN and comes back `null` when there is no row.
 *
 * `moderation_status` is NOT NULL with a default, so `ne` cannot silently drop
 * rows the way it would on a nullable column.
 */
export async function getViewableFile(id: string, handle: AuditHandle = db) {
  const [row] = await handle
    .select({
      id: file.id,
      title: file.title,
      url: file.url,
      contentType: file.contentType,
      size: file.size,
      tags: file.tags,
      private: file.private,
      createdAt: file.createdAt,
      ownerId: file.ownerId,
      owner: { id: user.id, name: user.name, image: user.image },
      metadata: {
        artist: fileMetadata.artist,
        lyrics: fileMetadata.lyrics,
        duration: fileMetadata.duration,
        width: fileMetadata.width,
        height: fileMetadata.height,
      },
    })
    .from(file)
    .innerJoin(user, eq(user.id, file.ownerId))
    .leftJoin(fileMetadata, eq(fileMetadata.fileId, file.id))
    .where(and(eq(file.id, id), eq(file.isDeleted, false), ne(file.moderationStatus, 'quarantined')));
  return row;
}
