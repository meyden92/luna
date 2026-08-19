import { and, eq, ilike, inArray, sql } from 'drizzle-orm';
import type { AuditHandle } from '../audit';
import { db } from '../client';
import { user } from '../schema/auth';
import { file, fileMetadata, fileRendition } from '../schema/files';
import type { JsonValue } from '../schema/json';

/**
 * Query module for file delivery (issue #35): the CDN rendition route, direct
 * file access, single and archive downloads, and embed metadata.
 *
 * These are the read-dominated hot paths, so every lookup here is a single
 * statement on an index — see the per-function notes for which one. Nothing in
 * this module is audited: `FileRendition` is in `UNAUDITED_MODELS` as a derived
 * artifact (issue #13), and the file reads are reads.
 *
 * `moderation_status` is checked by the callers in JavaScript
 * (`=== 'quarantined'`), which is case-sensitive on both engines and so needs no
 * collation remedy. The transform now lower-cases the column anyway.
 */

/**
 * The audio MIME types the player lists. Compared against `lower(content_type)`
 * rather than the column directly: Prisma's `in` inherited case-insensitivity
 * from MariaDB's utf8mb4_unicode_ci, so an upload that arrived as `AUDIO/MPEG`
 * used to appear in the player and would silently stop appearing on Postgres
 * (issue #23). Production holds no upper-case content type today, which makes
 * this a no-op on history and a guarantee going forward. `content_type` carries
 * no index, so wrapping it costs nothing.
 */
const AUDIO_CONTENT_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3'];

/**
 * `file_rendition.param_hash` is deliberately NOT case-normalised, matching the
 * decision recorded for `view_event.visitor_hash` under issue #41 and the
 * "hash-shaped columns not normalised" note in `scripts/db/transform-tables.ts`.
 *
 * The reasoning, not an inherited oversight: the only producer of this value on
 * either side is `renditionParamHash`, a `createHash('sha256').digest('hex')`
 * that always emits lower-case hex. No user input and no external system ever
 * reaches this column, so there is no case boundary for a comparison to fall
 * across — unlike `file.sha256`, which is compared against denylist entries that
 * arrive from outside. The table is empty in production (0 rows), so there is no
 * history to normalise either.
 */

/**
 * The CDN rendition route's source lookup: a live image, by id.
 *
 * `ilike` rather than `like` for the `image/` prefix: Prisma's `startsWith`
 * inherited case-insensitivity from the MariaDB collation (issue #23), and
 * `listGallery` already uses `ilike` for the same prefix test. Runs as an index
 * scan on `file_pkey` with the rest as a filter, so the pattern never costs a
 * scan.
 */
export async function getDeliverableImage(id: string, handle: AuditHandle = db) {
  const [row] = await handle
    .select({
      id: file.id,
      ownerId: file.ownerId,
      url: file.url,
      private: file.private,
      size: file.size,
      moderationStatus: file.moderationStatus,
    })
    .from(file)
    .where(and(eq(file.id, id), eq(file.isDeleted, false), ilike(file.contentType, 'image/%')));
  return row;
}

/**
 * The lookup behind `/api/d/$fileId` and `/api/download`: one live file by id.
 *
 * Both routes take the same row — the two Prisma `select`s differed only in
 * which of `title` and `contentType` they asked for — so they share one
 * function. `folderId` is here because `deliverySessionAllowsFile` matches a
 * folder-scoped delivery cookie against it. Index scan on `file_pkey`.
 */
export async function getDeliverableFile(id: string, handle: AuditHandle = db) {
  const [row] = await handle
    .select({
      id: file.id,
      ownerId: file.ownerId,
      folderId: file.folderId,
      url: file.url,
      title: file.title,
      private: file.private,
      size: file.size,
      contentType: file.contentType,
      moderationStatus: file.moderationStatus,
    })
    .from(file)
    .where(and(eq(file.id, id), eq(file.isDeleted, false)));
  return row;
}

/** A cached rendition by its parameter hash. Unique index on `param_hash`. */
export async function findRenditionByParamHash(paramHash: string, handle: AuditHandle = db) {
  const [row] = await handle.select().from(fileRendition).where(eq(fileRendition.paramHash, paramHash));
  return row;
}

/**
 * Bumps a rendition's `last_accessed_at` so the pruning task can age it out.
 * Called fire-and-forget from the CDN hot path, exactly as the Prisma version
 * was — a failed touch must never fail the delivery.
 */
export async function touchRendition(id: string, handle: AuditHandle = db) {
  const now = new Date();
  await handle.update(fileRendition).set({ lastAccessedAt: now, updatedAt: now }).where(eq(fileRendition.id, id));
}

export type NewRendition = {
  sourceFileId: string;
  paramHash: string;
  params: JsonValue;
  s3Key: string;
  contentType: string;
  size: number;
  width: number | null;
  height: number | null;
  private: boolean;
};

/**
 * Stores a freshly generated rendition. Not audited: `FileRendition` is a
 * derived artifact in `UNAUDITED_MODELS` (issue #13) — it records no user
 * intent, only that the CDN resized an image someone asked to see.
 */
export async function createRendition(values: NewRendition, handle: AuditHandle = db) {
  const [row] = await handle
    .insert(fileRendition)
    .values({ id: crypto.randomUUID(), ...values })
    .returning();
  if (!row) throw new Error('Failed to create rendition');
  return row;
}

/**
 * The embed/oEmbed read: a live, public file with its owner's display name and
 * optional media metadata.
 *
 * A core select with an INNER JOIN rather than the relational API, for the same
 * reason as `getViewableFile`: `file.owner_id` is NOT NULL behind a foreign key,
 * and the join says so in the types, where `r.one.user` would hand the embed
 * page a nullable owner it would then have to pretend to handle. Metadata is
 * genuinely optional and stays a LEFT JOIN.
 */
export async function getEmbeddableFile(id: string, handle: AuditHandle = db) {
  const [row] = await handle
    .select({
      id: file.id,
      title: file.title,
      url: file.url,
      ownerId: file.ownerId,
      contentType: file.contentType,
      size: file.size,
      ownerName: user.name,
      metadata: {
        artist: fileMetadata.artist,
        duration: fileMetadata.duration,
        width: fileMetadata.width,
        height: fileMetadata.height,
      },
    })
    .from(file)
    .innerJoin(user, eq(user.id, file.ownerId))
    .leftJoin(fileMetadata, eq(fileMetadata.fileId, file.id))
    .where(and(eq(file.id, id), eq(file.isDeleted, false), eq(file.private, false)));
  return row;
}

/**
 * The dashboard audio player's listing. Deliberately keeps the original's lack
 * of an `is_deleted` filter — the player has always shown every audio file the
 * owner has, and narrowing it is not this migration's call.
 */
export function listOwnedAudioFiles(ownerId: string, handle: AuditHandle = db) {
  return handle
    .select({ id: file.id, title: file.title, url: file.url })
    .from(file)
    .where(and(eq(file.ownerId, ownerId), inArray(sql`lower(${file.contentType})`, AUDIO_CONTENT_TYPES)));
}
