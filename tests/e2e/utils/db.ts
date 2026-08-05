import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../../../.prisma/generated/client/client';

export const TEST_EMAIL_DOMAIN = 'lunashare.test';
export const TEST_USER_EMAIL = `e2e-user@${TEST_EMAIL_DOMAIN}`;
export const TEST_ADMIN_EMAIL = `e2e-admin@${TEST_EMAIL_DOMAIN}`;
export const SESSION_COOKIE_NAME = 'lunashare.session_token';

let client: PrismaClient | undefined;

export function getTestPrisma(): PrismaClient {
  if (client) return client;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set — Playwright tests need it to seed users.');
  }
  const adapter = new PrismaMariaDb(url);
  client = new PrismaClient({ adapter });
  return client;
}

export async function disconnectTestPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}
