import { disconnectTestPrisma, getTestPrisma, TEST_EMAIL_DOMAIN } from './utils/db';

export default async function globalTeardown(): Promise<void> {
  if (process.env.E2E_KEEP_DATA === '1') {
    await disconnectTestPrisma();
    return;
  }
  const prisma = getTestPrisma();
  await prisma.user.deleteMany({
    where: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } },
  });
  await disconnectTestPrisma();
}
