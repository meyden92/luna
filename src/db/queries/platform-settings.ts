import { eq } from 'drizzle-orm';
import { DEFAULT_PLATFORM_SETTINGS, type PlatformSettingsValues } from '@/schemas/platform-settings-schema';
import { type AuditHandle, writeAuditLog } from '../audit';
import { db } from '../client';
import { platformSettings } from '../schema/admin';

const SETTINGS_ID = 'default';

export async function getPlatformSettings(handle: AuditHandle = db): Promise<PlatformSettingsValues> {
  const [row] = await handle.select().from(platformSettings).where(eq(platformSettings.id, SETTINGS_ID));
  if (!row) return DEFAULT_PLATFORM_SETTINGS;
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...values } = row;
  return values;
}

/** Writes the single settings row, creating it with the defaults for every value not given. */
export async function updatePlatformSettings(values: Partial<PlatformSettingsValues>, userId: string | null, handle: AuditHandle = db) {
  const [before] = await handle.select().from(platformSettings).where(eq(platformSettings.id, SETTINGS_ID));
  if (!before) {
    const [created] = await handle
      .insert(platformSettings)
      .values({ id: SETTINGS_ID, ...DEFAULT_PLATFORM_SETTINGS, ...values })
      .returning();
    if (!created) throw new Error('Failed to create platform settings');
    await writeAuditLog(handle, { model: 'PlatformSettings', action: 'create', after: created, userId });
    return created;
  }
  const [after] = await handle
    .update(platformSettings)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(platformSettings.id, SETTINGS_ID))
    .returning();
  if (after) await writeAuditLog(handle, { model: 'PlatformSettings', action: 'update', before, after, userId });
  return after;
}
