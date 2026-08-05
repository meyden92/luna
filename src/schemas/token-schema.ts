import { z } from 'zod';
import { MAX_SHAREX_JPEG_QUALITY, MIN_SHAREX_JPEG_QUALITY } from '@/libs/sharex-constants';

export const createTokenSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
});

export const deleteTokenSchema = z.object({
  tokenId: z.string(),
});

export const updateTokenSettingsSchema = z.object({
  tokenId: z.string().min(1, 'Token is required'),
  compressImage: z.boolean(),
  convertToJpeg: z.boolean(),
  jpegQuality: z
    .number()
    .int()
    .min(MIN_SHAREX_JPEG_QUALITY, `Quality must be at least ${MIN_SHAREX_JPEG_QUALITY}`)
    .max(MAX_SHAREX_JPEG_QUALITY, `Quality must be at most ${MAX_SHAREX_JPEG_QUALITY}`),
  folderId: z
    .string()
    .nullable()
    .optional()
    .transform((value) => {
      if (typeof value !== 'string') {
        return null;
      }
      const normalized = value.trim();
      return normalized.length === 0 ? null : normalized;
    }),
  stripMetadata: z.boolean().default(false),
  flowId: z
    .string()
    .nullable()
    .optional()
    .transform((value) => {
      if (typeof value !== 'string') return null;
      const normalized = value.trim();
      return normalized.length === 0 ? null : normalized;
    }),
});

export type CreateTokenInput = z.infer<typeof createTokenSchema>;
export type DeleteTokenInput = z.infer<typeof deleteTokenSchema>;
export type UpdateTokenSettingsInput = z.infer<typeof updateTokenSettingsSchema>;
