import { z } from 'zod';
import { DEFAULT_STORAGE_PATH_TEMPLATES, type StoragePathName, storagePathProblem } from '@/libs/storage-paths';
import { DEFAULT_STORAGE_QUOTA_MIB, MAX_STORAGE_QUOTA_MIB } from '@/libs/storage-quota';

const storagePath = (name: StoragePathName) =>
  z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      const problem = storagePathProblem(name, value);
      if (problem) ctx.addIssue({ code: 'custom', message: problem });
    });

/** Settings → Storage. */
export const storageSettingsSchema = z.object({
  renditionPath: storagePath('renditionPath'),
  studioOutputPath: storagePath('studioOutputPath'),
  templatePreviewPath: storagePath('templatePreviewPath'),
  templateReferencePath: storagePath('templateReferencePath'),
  avatarPath: storagePath('avatarPath'),
});

const whole = (min: number, max: number) => z.number().int().min(min).max(max);

/** Settings → Limits. Sizes are in MiB. */
export const limitSettingsSchema = z.object({
  defaultStorageQuotaMib: whole(0, MAX_STORAGE_QUOTA_MIB),
  downloadProxyMaxMib: whole(1, 10_240),
  downloaderMaxVideoMib: whole(1, 102_400),
  downloaderMaxPreparingPerUser: whole(1, 20),
  downloaderExpiryMinutes: whole(1, 10_080),
  avatarMaxUploadMib: whole(1, 100),
  sharexMaxUploadMib: whole(1, 10_240),
  sharexUploadConcurrency: whole(1, 50),
  // A pHash has 64 bits, so 64 is the largest possible distance.
  phashDistanceThreshold: whole(0, 64),
});

export type StorageSettings = z.infer<typeof storageSettingsSchema>;
export type LimitSettings = z.infer<typeof limitSettingsSchema>;
export type PlatformSettingsValues = StorageSettings & LimitSettings;

/** What an instance without a settings row runs with. */
export const DEFAULT_PLATFORM_SETTINGS: PlatformSettingsValues = {
  ...DEFAULT_STORAGE_PATH_TEMPLATES,
  defaultStorageQuotaMib: DEFAULT_STORAGE_QUOTA_MIB,
  downloadProxyMaxMib: 200,
  downloaderMaxVideoMib: 500,
  downloaderMaxPreparingPerUser: 2,
  downloaderExpiryMinutes: 60,
  avatarMaxUploadMib: 8,
  sharexMaxUploadMib: 90,
  sharexUploadConcurrency: 2,
  phashDistanceThreshold: 8,
};
