import prisma from '@/libs/prismadb';
import { getRbacPrisma } from './prisma';

export const USER_GROUP_KEY = 'user';
export const ADMIN_GROUP_KEY = 'admin';

function getPrisma() {
  return getRbacPrisma(['userGroupAssignment']);
}

export async function isSuperAdminUser(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isSuperAdmin: true },
  });

  return Boolean(user?.isSuperAdmin);
}

export function invalidateAuthorizationContext(userId?: string): void {
  void userId;
}

export async function isUserAdmin(userId: string): Promise<boolean> {
  if (await isSuperAdminUser(userId)) {
    return true;
  }

  const rbacPrisma = getPrisma();
  const assignment = await rbacPrisma.userGroupAssignment.findFirst({
    where: {
      userId,
      group: {
        key: ADMIN_GROUP_KEY,
      },
    },
    select: {
      id: true,
    },
  });

  return Boolean(assignment);
}
