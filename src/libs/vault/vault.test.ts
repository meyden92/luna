import { afterAll, describe, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { setVaultEntrySchema } from './registry';

/**
 * The Vault against a real Postgres. Uses two entries an instance rarely sets
 * and puts back whatever was stored for them before.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
process.env.FORM_FIELD_ENCRYPTION_KEY ||= randomBytes(32).toString('base64');

const SECRET = 'FAL_BILLING_KEY';
const CONFIG = 'PROXY_ALLOWED_DOMAINS';
const NAMES = [SECRET, CONFIG];

async function loadModules() {
  const [client, schema, vault] = await Promise.all([import('@/db/client'), import('@/db/schema/admin'), import('./vault')]);
  return { db: client.db, vaultEntry: schema.vaultEntry, ...vault };
}

type Modules = Awaited<ReturnType<typeof loadModules>>;
const m = hasDatabase ? await loadModules() : ({} as Modules);

const savedEnv = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));
const savedRows = hasDatabase ? await m.db.select().from(m.vaultEntry).where(inArray(m.vaultEntry.name, NAMES)) : [];
for (const name of NAMES) delete process.env[name];

afterAll(async () => {
  if (!hasDatabase) return;
  for (const name of NAMES) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
  await m.db.delete(m.vaultEntry).where(inArray(m.vaultEntry.name, NAMES));
  if (savedRows.length > 0) await m.db.insert(m.vaultEntry).values(savedRows);
});

describe('setVaultEntrySchema', () => {
  test('refuses names the Vault does not accept', () => {
    expect(setVaultEntrySchema.safeParse({ name: 'DATABASE_URL', value: 'x', password: 'p' }).success).toBe(false);
    expect(setVaultEntrySchema.safeParse({ name: CONFIG, value: 'x', password: 'p' }).success).toBe(true);
  });
});

describe.skipIf(!hasDatabase)('Vault', () => {
  test('stores a value encrypted and serves it at once', async () => {
    await m.ensureVaultLoaded();
    await m.setVaultEntry(SECRET, 'fal-billing-test-value', null);

    expect(m.getConfig(SECRET)).toBe('fal-billing-test-value');
    const [row] = await m.db.select().from(m.vaultEntry).where(eq(m.vaultEntry.name, SECRET));
    expect(row?.ciphertext).toBeDefined();
    expect(row?.ciphertext).not.toContain('fal-billing-test-value');
  });

  test('never describes a secret with its value, but shows plain config', async () => {
    await m.setVaultEntry(SECRET, 'fal-billing-test-value', null);
    await m.setVaultEntry(CONFIG, 'images.example.com', null);

    const described = m.describeVault();
    expect(JSON.stringify(described)).not.toContain('fal-billing-test-value');
    expect(described.find((entry) => entry.name === SECRET)).toMatchObject({ source: 'vault', stored: true });
    expect(described.find((entry) => entry.name === CONFIG)).toMatchObject({ source: 'vault', value: 'images.example.com' });
  });

  test('lets env win over a stored value', async () => {
    process.env[CONFIG] = 'env.example.com';
    try {
      await m.setVaultEntry(CONFIG, 'images.example.com', null);
      expect(m.getConfig(CONFIG)).toBe('env.example.com');
      expect(m.describeVault().find((entry) => entry.name === CONFIG)).toMatchObject({ source: 'env', stored: true });
    } finally {
      delete process.env[CONFIG];
    }
  });

  test('refuses a value its schema rejects', async () => {
    await expect(m.setVaultEntry('CDN_URL', 'not a url', null)).rejects.toThrow('CDN URL');
  });

  test('falls back to unset once cleared', async () => {
    await m.setVaultEntry(SECRET, 'fal-billing-test-value', null);
    await m.clearVaultEntry(SECRET, null);
    expect(m.getConfig(SECRET)).toBeUndefined();
    expect(m.describeVault().find((entry) => entry.name === SECRET)).toMatchObject({ source: 'unset', stored: false });
  });
});
