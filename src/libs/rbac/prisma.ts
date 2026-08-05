import prisma from '@/libs/prismadb';

const DEFAULT_MESSAGE = 'RBAC Prisma delegates are unavailable. Run `bun run db:generate` after applying the RBAC migration.';

type RbacPrisma = typeof prisma;

export type RbacPrismaDelegate = Extract<keyof RbacPrisma, 'rbacGroup' | 'userGroupAssignment'>;

export function getRbacPrisma(requiredDelegates: readonly RbacPrismaDelegate[]): RbacPrisma {
  for (const delegate of requiredDelegates) {
    if (!prisma[delegate]) {
      throw new Error(DEFAULT_MESSAGE);
    }
  }

  return prisma;
}
