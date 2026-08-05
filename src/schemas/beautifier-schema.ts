import { z } from 'zod';

const hexColorSchema = z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/);

export const beautifierBackgroundStyleSchema = z.enum(['solid', 'soft-grid', 'checker']);

export const beautifierConfigSchema = z.object({
  width: z.number().int().min(640).max(3840).default(1600),
  height: z.number().int().min(640).max(3840).default(1200),
  padding: z.number().int().min(32).max(420).default(150),
  backgroundColor: hexColorSchema.default('#f4f1e8'),
  backgroundStyle: beautifierBackgroundStyleSchema.default('soft-grid'),
  frameColor: hexColorSchema.default('#ffffff'),
  frameWidth: z.number().int().min(0).max(80).default(18),
  imageRadius: z.number().int().min(0).max(160).default(34),
  shadowStrength: z.number().int().min(0).max(100).default(58),
  rotation: z.number().min(-8).max(8).default(0),
});

export const beautifierConfigUpdateSchema = beautifierConfigSchema.partial();

export const beautifierSourceFileSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  contentType: z.string(),
  size: z.number().nullable(),
  createdAt: z.string(),
  cdnUrl: z.url(),
  downloadUrl: z.string(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  private: z.boolean(),
});

export const beautifierSourceFileQuerySchema = z.object({
  fileId: z.string().min(1),
});

export const saveBeautifiedImageSchema = z.object({
  sourceFileId: z.string().min(1),
  title: z.string().trim().min(1).max(180).optional(),
  imageDataUrl: z.string().regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/),
  config: beautifierConfigSchema,
});

export type BeautifierBackgroundStyle = z.infer<typeof beautifierBackgroundStyleSchema>;
export type BeautifierConfig = z.infer<typeof beautifierConfigSchema>;
export type BeautifierConfigUpdate = z.infer<typeof beautifierConfigUpdateSchema>;
export type BeautifierSourceFile = z.infer<typeof beautifierSourceFileSchema>;
export type SaveBeautifiedImageInput = z.infer<typeof saveBeautifiedImageSchema>;

export const DEFAULT_BEAUTIFIER_CONFIG = beautifierConfigSchema.parse({});
