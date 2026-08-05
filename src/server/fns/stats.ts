import { createServerFn } from '@tanstack/react-start';
import prisma from '@/libs/prismadb';

export const getLandingStats = createServerFn({ method: 'GET' }).handler(async () => {
  const [userCount, fileCount] = await Promise.all([
    prisma.user.count({ where: { isDeleted: false } }),
    prisma.file.count({ where: { isDeleted: false } }),
  ]);
  return { userCount, fileCount };
});
