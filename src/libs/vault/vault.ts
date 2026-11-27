import { hkdfSync } from 'node:crypto';
import { deleteVaultRow, listVaultRows, upsertVaultRow } from '@/db/queries/vault';
import { decryptWithKey, encryptWithKey } from '@/libs/encryption/field-encryption';
import { env } from '@/libs/env';
import { setServerCdnUrlSource } from '@/libs/runtime-config';
import { UserFacingError } from '@/libs/user-facing-error';
import {
  isVaultName,
  STORAGE_VAULT_NAMES,
  VAULT_ENTRIES,
  VAULT_NAMES,
  type VaultName,
  type VaultValue,
  vaultValueProblem,
} from './registry';

/**
 * The Vault: deployment config and secrets stored encrypted in the database and
 * resolved env first, then Vault, then default. Server-only.
 *
 * Values are served from an in-memory snapshot, so reads stay synchronous: the
 * snapshot must be loaded (`ensureVaultLoaded`) before the first read, and is
 * replaced on every write. One process serves the instance, so a write here is
 * seen by every reader.
 */

export type VaultSource = 'env' | 'vault' | 'default' | 'unset';

interface ResolvedEntry {
  value: unknown;
  source: VaultSource;
  /** A stored value that could not be used; the entry then resolves as if it were not stored. */
  problem?: string;
  storedAt?: Date;
}

interface Snapshot {
  version: number;
  entries: Map<VaultName, ResolvedEntry>;
}

interface VaultState {
  version: number;
  snapshot?: Snapshot;
  loading?: Promise<Snapshot>;
}

// On globalThis because the dev server evaluates this module once per Vite
// environment (Nitro plugins, SSR), and all of them must share one snapshot.
const STATE_KEY = Symbol.for('lunashare.vault');
const globalState = globalThis as { [STATE_KEY]?: VaultState };
globalState[STATE_KEY] ??= { version: 0 };
const state = globalState[STATE_KEY];

setServerCdnUrlSource(() => (state.snapshot ? getConfig('CDN_URL') : undefined));

function vaultKey(): Buffer {
  return Buffer.from(hkdfSync('sha256', Buffer.from(env.FORM_FIELD_ENCRYPTION_KEY, 'base64'), 'lunashare/vault/v1', 'vault-entry', 32));
}

/** Compose files pass unset variables through as empty strings, which must not hide a Vault value. */
function envValue(name: VaultName): string | undefined {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? undefined : value;
}

async function buildSnapshot(): Promise<Snapshot> {
  const key = vaultKey();
  const stored = new Map<VaultName, { value?: string; problem?: string; storedAt: Date }>();
  for (const row of await listVaultRows()) {
    if (!isVaultName(row.name)) continue;
    try {
      stored.set(row.name, { value: decryptWithKey(row.ciphertext, key, row.name), storedAt: row.updatedAt });
    } catch {
      console.error(`[vault] ${row.name} cannot be decrypted with the current FORM_FIELD_ENCRYPTION_KEY`);
      stored.set(row.name, { problem: 'Cannot be decrypted with the current master key. Set it again.', storedAt: row.updatedAt });
    }
  }

  const entries = new Map<VaultName, ResolvedEntry>();
  for (const name of VAULT_NAMES) {
    const schema = VAULT_ENTRIES[name].schema;
    const fromEnv = envValue(name);
    const fromVault = stored.get(name);
    const base = { storedAt: fromVault?.storedAt };

    if (fromEnv !== undefined) {
      const parsed = schema.safeParse(fromEnv);
      if (!parsed.success) throw new Error(`Invalid environment variable ${name}: ${parsed.error.issues[0]?.message}`);
      entries.set(name, { ...base, value: parsed.data, source: 'env' });
      continue;
    }

    let problem = fromVault?.problem;
    if (fromVault?.value !== undefined) {
      const parsed = schema.safeParse(fromVault.value);
      if (parsed.success) {
        entries.set(name, { ...base, value: parsed.data, source: 'vault' });
        continue;
      }
      problem = `The stored value is no longer valid: ${parsed.error.issues[0]?.message}. Set it again.`;
    }

    const definition = VAULT_ENTRIES[name];
    const defaultValue = 'defaultValue' in definition ? (definition.defaultValue as string) : undefined;
    entries.set(name, {
      ...base,
      problem,
      value: defaultValue === undefined ? undefined : schema.parse(defaultValue),
      source: defaultValue === undefined ? 'unset' : 'default',
    });
  }

  state.version += 1;
  return { version: state.version, entries };
}

function load(): Promise<Snapshot> {
  const loading = buildSnapshot().then((snapshot) => {
    state.snapshot = snapshot;
    return snapshot;
  });
  state.loading = loading;
  // A failed load (database not up yet) is retried by the next caller.
  loading.catch(() => {
    if (state.loading === loading) state.loading = undefined;
  });
  return loading;
}

/** Loads the snapshot once; every entry point awaits this before anything reads the Vault. */
export async function ensureVaultLoaded(): Promise<void> {
  await (state.loading ?? load());
}

function currentSnapshot(): Snapshot {
  if (!state.snapshot) throw new Error('The Vault was read before ensureVaultLoaded() finished');
  return state.snapshot;
}

type ResolvedValue<N extends VaultName> = (typeof VAULT_ENTRIES)[N] extends { defaultValue: string }
  ? VaultValue<N>
  : VaultValue<N> | undefined;

export function getConfig<N extends VaultName>(name: N): ResolvedValue<N> {
  return currentSnapshot().entries.get(name)?.value as ResolvedValue<N>;
}

/** Changes whenever any Vault value may have changed, for caches built from Vault values. */
export function vaultVersion(): number {
  return currentSnapshot().version;
}

export function isStorageConfigured(): boolean {
  return STORAGE_VAULT_NAMES.every((name) => getConfig(name) !== undefined);
}

export async function setVaultEntry(name: VaultName, value: string, userId: string | null): Promise<void> {
  const problem = vaultValueProblem(name, value);
  if (problem) throw new UserFacingError(`${VAULT_ENTRIES[name].label}: ${problem}`);
  await upsertVaultRow(name, encryptWithKey(value, vaultKey(), name), userId);
  await load();
}

export async function clearVaultEntry(name: VaultName, userId: string | null): Promise<void> {
  await deleteVaultRow(name, userId);
  await load();
}

export interface VaultEntryState {
  name: VaultName;
  source: VaultSource;
  /** Set only for plain config; a secret's value never leaves the server. */
  value?: string;
  /** A value is stored in the Vault, whether or not env overrides it. */
  stored: boolean;
  storedAt?: string;
  problem?: string;
}

/** What the admin page shows for every entry, without any secret value. */
export function describeVault(): VaultEntryState[] {
  const { entries } = currentSnapshot();
  return VAULT_NAMES.map((name) => {
    const entry = entries.get(name);
    const shownValue = VAULT_ENTRIES[name].secret || entry?.value === undefined ? undefined : String(entry.value);
    return {
      name,
      source: entry?.source ?? 'unset',
      ...(shownValue === undefined ? {} : { value: shownValue }),
      stored: entry?.storedAt !== undefined,
      ...(entry?.storedAt ? { storedAt: entry.storedAt.toISOString() } : {}),
      ...(entry?.problem ? { problem: entry.problem } : {}),
    };
  });
}
