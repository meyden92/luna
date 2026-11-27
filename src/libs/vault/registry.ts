import { z } from 'zod';

/**
 * Every name the Vault accepts. Values are strings, as env would hold them, and
 * are parsed with the entry's schema when read. Shared with the browser, so it
 * must not import server-only modules.
 */

export type VaultGroup = 'storage' | 'studio' | 'signing' | 'network';

interface VaultEntryDefinition {
  group: VaultGroup;
  label: string;
  description: string;
  /** Secret values are never shown again once saved; plain config is shown. */
  secret: boolean;
  schema: z.ZodType;
  defaultValue?: string;
}

export const VAULT_ENTRIES = {
  AWS_ENDPOINT: {
    group: 'storage',
    label: 'S3 endpoint',
    description: 'Endpoint of the S3-compatible service, e.g. https://<account>.r2.cloudflarestorage.com.',
    secret: false,
    schema: z.string().min(1),
  },
  AWS_REGION: {
    group: 'storage',
    label: 'S3 region',
    description: 'Region of the bucket; auto for Cloudflare R2.',
    secret: false,
    schema: z.string().min(1),
  },
  AWS_BUCKET_NAME: {
    group: 'storage',
    label: 'Bucket',
    description: 'A new bucket does not move existing objects.',
    secret: false,
    schema: z.string().min(1),
  },
  AWS_ACCESS_KEY_ID: {
    group: 'storage',
    label: 'Access key id',
    description: 'S3 access key id with read and write access to the bucket.',
    secret: true,
    schema: z.string().min(1),
  },
  AWS_SECRET_ACCESS_KEY: {
    group: 'storage',
    label: 'Secret access key',
    description: 'S3 secret access key belonging to the access key id.',
    secret: true,
    schema: z.string().min(1),
  },
  CDN_URL: {
    group: 'storage',
    label: 'CDN URL',
    description: 'Public base URL that serves the bucket, path included, e.g. https://deliver.example.com.',
    secret: false,
    schema: z.url(),
  },
  FAL_KEY: {
    group: 'studio',
    label: 'fal key',
    description: 'Turns the Studio on. Without it the Studio is hidden.',
    secret: true,
    schema: z.string().min(1),
  },
  FAL_BILLING_KEY: {
    group: 'studio',
    label: 'fal billing key',
    description: 'A BILLING or FULL scope fal key. Without it, estimated costs are booked as actual.',
    secret: true,
    schema: z.string().min(1),
  },
  RENDITION_SIGNING_SECRET: {
    group: 'signing',
    label: 'Rendition signing secret',
    description:
      'Signs transform-on-URL links. A new secret invalidates every signed link at once. Derived from the master key when unset.',
    secret: true,
    schema: z.string().min(16),
  },
  DELIVERY_COOKIE_SECRET: {
    group: 'signing',
    label: 'Delivery cookie secret',
    description:
      'Signs delivery cookies. A new secret signs every viewer out of private files at once. Derived from the master key when unset.',
    secret: true,
    schema: z.string().min(16),
  },
  TRUSTED_PROXY_HOPS: {
    group: 'network',
    label: 'Trusted proxy hops',
    description:
      'Reverse proxies in front of the app that append to X-Forwarded-For, e.g. 1 for Cloudflare alone; 0 uses the connection address.',
    secret: false,
    schema: z.coerce.number().int().min(0),
    defaultValue: '0',
  },
  PROXY_ALLOWED_DOMAINS: {
    group: 'network',
    label: 'Image proxy hosts',
    description: 'Extra hosts the image proxy may fetch from, comma-separated. The CDN host is always allowed.',
    secret: false,
    schema: z.string().min(1),
  },
} as const satisfies Record<string, VaultEntryDefinition>;

export type VaultName = keyof typeof VAULT_ENTRIES;
export type VaultValue<N extends VaultName> = z.output<(typeof VAULT_ENTRIES)[N]['schema']>;

export const VAULT_NAMES = Object.keys(VAULT_ENTRIES) as VaultName[];

export const VAULT_GROUPS: { group: VaultGroup; title: string }[] = [
  { group: 'storage', title: 'Storage' },
  { group: 'studio', title: 'Studio' },
  { group: 'signing', title: 'Signing' },
  { group: 'network', title: 'Network' },
];

export const STORAGE_VAULT_NAMES = VAULT_NAMES.filter((name) => VAULT_ENTRIES[name].group === 'storage');

export function isVaultName(name: string): name is VaultName {
  return Object.hasOwn(VAULT_ENTRIES, name);
}

/** The problem with a value for `name`, or null when the Vault accepts it. */
export function vaultValueProblem(name: VaultName, value: string): string | null {
  const result = VAULT_ENTRIES[name].schema.safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? 'Invalid value');
}

export const setVaultEntrySchema = z.object({
  name: z.enum(VAULT_NAMES as [VaultName, ...VaultName[]]),
  value: z.string().trim().min(1, 'Enter a value'),
  password: z.string().min(1, 'Enter your password'),
});

export const clearVaultEntrySchema = z.object({
  name: z.enum(VAULT_NAMES as [VaultName, ...VaultName[]]),
  password: z.string().min(1, 'Enter your password'),
});
