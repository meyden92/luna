import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { RATE_LIMITS } from '@/libs/api/rate-limit';
import { UserFacingError } from '@/libs/user-facing-error';
import { clearVaultEntrySchema, setVaultEntrySchema } from '@/libs/vault/registry';
import { clearVaultEntry, describeVault, isStorageConfigured, setVaultEntry } from '@/libs/vault/vault';
import { userIdFromCtx as adminIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

/**
 * The Vault's admin endpoints. No response ever carries a secret value: the
 * page learns only where each entry comes from and whether one is stored.
 */

export const getVaultForAdmin = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(() => describeVault());

export const getStorageStatus = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(() => ({ storageConfigured: isStorageConfigured() }));

/** Refuses unless `password` is the signed-in admin's current password. */
async function assertPassword(password: string): Promise<void> {
  const { auth } = await import('@/libs/auth/auth');
  try {
    await auth.api.verifyPassword({ body: { password }, headers: getRequestHeaders() });
  } catch {
    throw new UserFacingError('That password is not correct.');
  }
}

export const saveVaultEntry = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin', rateLimit: RATE_LIMITS.vaultWrite }))
  .validator(setVaultEntrySchema)
  .handler(async ({ data, context }) => {
    await assertPassword(data.password);
    await setVaultEntry(data.name, data.value, adminIdFromCtx(context));
    return { name: data.name };
  });

export const removeVaultEntry = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin', rateLimit: RATE_LIMITS.vaultWrite }))
  .validator(clearVaultEntrySchema)
  .handler(async ({ data, context }) => {
    await assertPassword(data.password);
    await clearVaultEntry(data.name, adminIdFromCtx(context));
    return { name: data.name };
  });
