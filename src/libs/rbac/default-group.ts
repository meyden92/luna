import { getRbacPrisma } from './prisma';
import { ADMIN_GROUP_KEY, invalidateAuthorizationContext, USER_GROUP_KEY } from './service';

type GroupKey = typeof USER_GROUP_KEY | typeof ADMIN_GROUP_KEY;

type GroupRecord = {
  id: string;
  key: GroupKey;
};

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

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
}

async function ensureGroup(key: GroupKey, name: string, description: string): Promise<GroupRecord> {
  const rbacPrisma = getRbacPrisma(['rbacGroup']);

  const existing = await rbacPrisma.rbacGroup.findUnique({
    where: { key },
    select: { id: true },
  });

  if (existing) {
    await rbacPrisma.rbacGroup.update({
      where: { id: existing.id },
      data: {
        isSystem: true,
      },
    });

    return { id: existing.id, key };
  }

  try {
    const created = await rbacPrisma.rbacGroup.create({
      data: {
        key,
        name,
        description,
        isSystem: true,
      },
      select: { id: true },
    });

    return { id: created.id, key };
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const concurrent = await rbacPrisma.rbacGroup.findUnique({
      where: { key },
      select: { id: true },
    });

    if (!concurrent) {
      throw error;
    }

    return { id: concurrent.id, key };
  }
}

export async function ensureBaseGroups(): Promise<{ userGroupId: string; adminGroupId: string }> {
  const ensuredGroups = await Promise.all(GROUP_DEFINITIONS.map((entry) => ensureGroup(entry.key, entry.name, entry.description)));

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
  const rbacPrisma = getRbacPrisma(['userGroupAssignment']);
  const { userGroupId } = await ensureBaseGroups();

  await rbacPrisma.userGroupAssignment.upsert({
    where: {
      userId_groupId: {
        userId,
        groupId: userGroupId,
      },
    },
    update: {},
    create: {
      userId,
      groupId: userGroupId,
      createdByUserId: null,
    },
  });

  invalidateAuthorizationContext(userId);
}

export async function includeDefaultGroup(groupIds: string[]): Promise<string[]> {
  const { userGroupId } = await ensureBaseGroups();
  const unique = new Set(groupIds);
  unique.add(userGroupId);
  return [...unique];
}
