import { ensureGroupAssignment, ensureSystemGroup, type GroupKey } from '@/db/queries/rbac';
import { ADMIN_GROUP_KEY, invalidateAuthorizationContext, USER_GROUP_KEY } from './service';

const GROUP_DEFINITIONS: ReadonlyArray<{ key: GroupKey; name: string; description: string }> = [
  {
    key: USER_GROUP_KEY,
    name: 'User',
    description: 'Default access for all authenticated users.',
  },
  {
    key: ADMIN_GROUP_KEY,
    name: 'Admin',
    description: 'Administrative access to all admin routes and actions.',
  },
];

export async function ensureBaseGroups(): Promise<{ userGroupId: string; adminGroupId: string }> {
  const ensuredGroups = await Promise.all(
    GROUP_DEFINITIONS.map(async (entry) => ({ key: entry.key, id: (await ensureSystemGroup(entry, null)).id })),
  );

  const groupMap = new Map(ensuredGroups.map((group) => [group.key, group.id]));

  const userGroupId = groupMap.get(USER_GROUP_KEY);
  const adminGroupId = groupMap.get(ADMIN_GROUP_KEY);

  if (!userGroupId || !adminGroupId) {
    throw new Error('Failed to resolve base groups');
  }

  return {
    userGroupId,
    adminGroupId,
  };
}

export async function ensureUserHasDefaultGroup(userId: string): Promise<void> {
  const { userGroupId } = await ensureBaseGroups();

  await ensureGroupAssignment({ userId, groupId: userGroupId }, null);

  invalidateAuthorizationContext(userId);
}

export async function includeDefaultGroup(groupIds: string[]): Promise<string[]> {
  const { userGroupId } = await ensureBaseGroups();
  const unique = new Set(groupIds);
  unique.add(userGroupId);
  return [...unique];
}
