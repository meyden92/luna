import { and, count, desc, eq } from 'drizzle-orm';
import { type AuditHandle, writeAuditLog } from '../audit';
import { db } from '../client';
import { file, folder } from '../schema/files';
import { detachFilesFromFolder } from './files';

/**
 * Query module for folders (issue #15). Same contract as the files module: call
 * sites import named functions, the handle stays internal, and the audit call
 * lives inside the write.
 */

/**
 * A relation count is one of the shapes the relational query API cannot express,
 * so it becomes a core select with an explicit join and GROUP BY (issue #21).
 * `count(file.id)` ignores the nulls a LEFT JOIN produces, so an empty folder
 * correctly reports zero.
 *
 * The obvious-looking alternative — a correlated subquery built from a `sql`
 * template — is a trap here. Drizzle renders interpolated columns unqualified
 * inside the template, so `${file.folderId} = ${folder.id}` emits
 * `"folder_id" = "id"`, and inside `FROM "file"` that `"id"` binds to
 * `file.id` rather than the outer folder. The correlation silently never
 * matches and every count comes back 0, with no error.
 */
const liveFileCount = count(file.id);

const folderColumns = {
  id: folder.id,
  name: folder.name,
  color: folder.color,
  isDeleted: folder.isDeleted,
  deletedAt: folder.deletedAt,
  createdAt: folder.createdAt,
  updatedAt: folder.updatedAt,
  ownerId: folder.ownerId,
};

/** Shape the dashboard expects: the folder row plus Prisma's `_count.files`. */
type FolderWithCount = typeof folder.$inferSelect & { _count: { files: number } };

function withCount({ fileCount, ...row }: typeof folder.$inferSelect & { fileCount: number }): FolderWithCount {
  return { ...row, _count: { files: fileCount } };
}

/** The owner's folders, newest first, each with its live file count. */
export async function listOwnedFolders(ownerId: string, handle: AuditHandle = db): Promise<FolderWithCount[]> {
  const rows = await handle
    .select({ ...folderColumns, fileCount: liveFileCount })
    .from(folder)
    .leftJoin(file, and(eq(file.folderId, folder.id), eq(file.isDeleted, false)))
    .where(and(eq(folder.ownerId, ownerId), eq(folder.isDeleted, false)))
    .groupBy(folder.id)
    .orderBy(desc(folder.createdAt));
  return rows.map(withCount);
}

/** One folder the owner owns, with its live file count, or undefined. */
export async function getOwnedFolder(id: string, ownerId: string, handle: AuditHandle = db): Promise<FolderWithCount | undefined> {
  const [row] = await handle
    .select({ ...folderColumns, fileCount: liveFileCount })
    .from(folder)
    .leftJoin(file, and(eq(file.folderId, folder.id), eq(file.isDeleted, false)))
    .where(and(eq(folder.id, id), eq(folder.ownerId, ownerId)))
    .groupBy(folder.id);
  return row ? withCount(row) : undefined;
}

export async function createFolder(
  { name, color, ownerId }: { name: string; color?: string | null; ownerId: string },
  userId: string | null,
  handle: AuditHandle = db,
): Promise<FolderWithCount> {
  const [row] = await handle
    .insert(folder)
    .values({ id: crypto.randomUUID(), name, color: color ?? null, ownerId })
    .returning();
  if (!row) throw new Error('Failed to create folder');
  await writeAuditLog(handle, { model: 'Folder', action: 'create', after: row, userId });
  return { ...row, _count: { files: 0 } };
}

export async function updateOwnedFolder(
  { id, ownerId, name, color }: { id: string; ownerId: string; name?: string; color?: string | null },
  userId: string | null,
  handle: AuditHandle = db,
): Promise<FolderWithCount | undefined> {
  const before = await getOwnedFolder(id, ownerId, handle);
  if (!before) return undefined;

  const [after] = await handle
    .update(folder)
    .set({
      ...(name === undefined ? {} : { name }),
      ...(color === undefined ? {} : { color }),
      updatedAt: new Date(),
    })
    .where(and(eq(folder.id, id), eq(folder.ownerId, ownerId)))
    .returning();
  if (!after) return undefined;

  const { _count, ...beforeRow } = before;
  await writeAuditLog(handle, { model: 'Folder', action: 'update', before: beforeRow, after, userId });
  return { ...after, _count };
}

/**
 * Deletes a folder, first clearing it from any files that sit in it so they are
 * kept rather than cascaded away. Both halves are audited.
 */
export async function deleteOwnedFolder(
  { id, ownerId }: { id: string; ownerId: string },
  userId: string | null,
  handle: AuditHandle = db,
): Promise<{ id: string; filesCount: number } | undefined> {
  const before = await getOwnedFolder(id, ownerId, handle);
  if (!before) return undefined;

  const detached = before._count.files > 0 ? await detachFilesFromFolder(id, ownerId, userId, handle) : 0;

  const { _count, ...beforeRow } = before;
  await handle.delete(folder).where(and(eq(folder.id, id), eq(folder.ownerId, ownerId)));
  await writeAuditLog(handle, { model: 'Folder', action: 'delete', before: beforeRow, userId });

  return { id, filesCount: detached };
}

/** Number of live folders an owner has. */
export async function countOwnedFolders(ownerId: string, handle: AuditHandle = db) {
  const [row] = await handle
    .select({ total: count() })
    .from(folder)
    .where(and(eq(folder.ownerId, ownerId), eq(folder.isDeleted, false)));
  return Number(row?.total ?? 0);
}
