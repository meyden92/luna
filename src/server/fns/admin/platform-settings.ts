import { createServerFn } from '@tanstack/react-start';
import { getPlatformSettings, updatePlatformSettings } from '@/db/queries/platform-settings';
import { limitSettingsSchema, storageSettingsSchema } from '@/schemas/platform-settings-schema';
import { userIdFromCtx as adminIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

export const getPlatformSettingsForAdmin = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(() => getPlatformSettings());

export const saveStorageSettings = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(storageSettingsSchema)
  .handler(async ({ data, context }) => {
    await updatePlatformSettings(data, adminIdFromCtx(context));
    return data;
  });

export const saveLimitSettings = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(limitSettingsSchema)
  .handler(async ({ data, context }) => {
    await updatePlatformSettings(data, adminIdFromCtx(context));
    return data;
  });
