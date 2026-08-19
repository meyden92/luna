import { like } from 'drizzle-orm';
import { user } from '../../src/db/schema';
import { disconnectTestDb, getTestDb, TEST_EMAIL_DOMAIN } from './utils/db';

export default async function globalTeardown(): Promise<void> {
  if (process.env.E2E_KEEP_DATA === '1') {
    await disconnectTestDb();
    return;
  }
  const db = getTestDb();
  await db.delete(user).where(like(user.email, `%@${TEST_EMAIL_DOMAIN}`));
  await disconnectTestDb();
}
