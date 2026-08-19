import { and, count, eq } from 'drizzle-orm';
import { type AuditHandle, writeAuditLog } from '../audit';
import { db } from '../client';
import { rbacGroup, userGroupAssignment } from '../schema/admin';
import { user } from '../schema/auth';

/**
 * Query module for RBAC (issue #37): the account status the auth guard checks,
 * the admin permission check, and the two base-group writes.
 *
 * The group keys live here rather than in `libs/rbac/service` because they are
 * database identity — the value stored in `rbac_group.key` — and every query in
 * this module filters on them. `libs/rbac/service` re-exports them so call
 * sites keep importing from where they always did.
 *
 * `rbac_group.key` is NOT in the transform's LOWERCASED set, and deliberately
 * so: the only values ever written are the two lower-case literals below, so
 * there is no case boundary to normalise across (issue #23). Verified against
 * the migrated rows.
 */
export const USER_GROUP_KEY = 'user';
export const ADMIN_GROUP_KEY = 'admin';

export type GroupKey = typeof USER_GROUP_KEY | typeof ADMIN_GROUP_KEY;

/** The account fields the authentication guard rejects on. */
export type AccountStatus = {
  isDeleted: boolean;
  banned: boolean | null;
  banExpires: Date | null;
};

/**
 * Status of the user behind a session. `undefined` means the session points at
 * a row that no longer exists, which the guard treats as unauthenticated.
 */
export async function getAccountStatus(userId: string, handle: AuditHandle = db): Promise<AccountStatus | undefined> {
  const [row] = await handle
    .select({ isDeleted: user.isDeleted, banned: user.banned, banExpires: user.banExpires })
    .from(user)
    .where(eq(user.id, userId));
  return row;
}

/**
 * Whether the user may act as an administrator — super-admin flag, or
 * membership of the admin group.
 *
 * This runs on every admin-guarded request, so it is deliberately ONE query
 * rather than the two the Prisma version issued (a super-admin lookup, then an
 * assignment lookup). Membership is a relation count, which the relational API
 * cannot express, so it is a core select with explicit joins and GROUP BY
 * (issue #21). `count(rbacGroup.id)` ignores the nulls the LEFT JOINs produce,
 * so a user with no assignments correctly counts zero.
 */
export async function isUserAdmin(userId: string, handle: AuditHandle = db): Promise<boolean> {
  const [row] = await handle
    .select({ isSuperAdmin: user.isSuperAdmin, adminGroups: count(rbacGroup.id) })
    .from(user)
    .leftJoin(userGroupAssignment, eq(userGroupAssignment.userId, user.id))
    .leftJoin(rbacGroup, and(eq(rbacGroup.id, userGroupAssignment.groupId), eq(rbacGroup.key, ADMIN_GROUP_KEY)))
    .where(eq(user.id, userId))
    .groupBy(user.id);

  if (!row) return false;
  return row.isSuperAdmin || row.adminGroups > 0;
}

/**
 * Creates the group if it is missing and marks it as a system group, returning
 * its id either way.
 *
 * `onConflictDoNothing` replaces the Prisma version's catch-on-P2002 retry: two
 * concurrent callers race on the unique `key`, and the loser reads back the
 * winner's row. The `isSystem` update only fires when the flag is actually
 * false — the Prisma version wrote it unconditionally, which under the implicit
 * audit extension produced an audit row on every single call.
 */
export async function ensureSystemGroup(
  { key, name, description }: { key: GroupKey; name: string; description: string },
  userId: string | null,
  handle: AuditHandle = db,
): Promise<{ id: string }> {
  const [existing] = await handle.select({ id: rbacGroup.id, isSystem: rbacGroup.isSystem }).from(rbacGroup).where(eq(rbacGroup.key, key));

  if (existing) {
    if (!existing.isSystem) {
      const [before] = await handle.select().from(rbacGroup).where(eq(rbacGroup.id, existing.id));
      const [after] = await handle
        .update(rbacGroup)
        .set({ isSystem: true, updatedAt: new Date() })
        .where(eq(rbacGroup.id, existing.id))
        .returning();
      if (after) await writeAuditLog(handle, { model: 'RbacGroup', action: 'update', before, after, userId });
    }
    return { id: existing.id };
  }

  const [created] = await handle
    .insert(rbacGroup)
    .values({ id: crypto.randomUUID(), key, name, description, isSystem: true })
    .onConflictDoNothing({ target: rbacGroup.key })
    .returning();

  if (created) {
    await writeAuditLog(handle, { model: 'RbacGroup', action: 'create', after: created, userId });
    return { id: created.id };
  }

  const [concurrent] = await handle.select({ id: rbacGroup.id }).from(rbacGroup).where(eq(rbacGroup.key, key));
  if (!concurrent) throw new Error(`Failed to ensure RBAC group '${key}'`);
  return concurrent;
}

/**
 * Adds the user to the group if they are not in it already. Audited only when a
 * row is actually inserted — re-running it is a no-op, not an admin action.
 *
 * `createdByUserId` is both the column and the audit actor: an assignment made
 * by the signup hook has no acting admin and records `null` for both.
 */
export async function ensureGroupAssignment(
  { userId, groupId }: { userId: string; groupId: string },
  createdByUserId: string | null,
  handle: AuditHandle = db,
): Promise<void> {
  const [created] = await handle
    .insert(userGroupAssignment)
    .values({ id: crypto.randomUUID(), userId, groupId, createdByUserId })
    .onConflictDoNothing({ target: [userGroupAssignment.userId, userGroupAssignment.groupId] })
    .returning();

  if (created) {
    await writeAuditLog(handle, { model: 'UserGroupAssignment', action: 'create', after: created, userId: createdByUserId });
  }
}
