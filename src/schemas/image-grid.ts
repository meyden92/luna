import { z } from 'zod';

// Image filters schema
export const imageFiltersSchema = z.object({
  blur: z.number().min(0).max(10).default(0),
  grayscale: z.number().min(0).max(100).default(0),
  saturation: z.number().min(0).max(200).default(100),
  brightness: z.number().min(50).max(150).default(100),
  contrast: z.number().min(50).max(150).default(100),
  sepia: z.number().min(0).max(100).default(0),
});

// Main image grid configuration schema
export const imageGridConfigSchema = z.object({
  width: z.number().min(100).max(4000).default(1200),
  height: z.number().min(100).max(4000).default(1200),
  spacing: z.number().min(0).max(100).default(0),
  manualCols: z.number().min(1).max(10).optional().default(3),
  manualRows: z.number().min(1).max(10).optional().default(3),
  useManualGrid: z.boolean().default(false),
  autoFit: z.boolean().default(true),
  useFixedCellSize: z.boolean().default(false),
  fixedCellWidth: z.number().min(50).max(1000).optional().default(300),
  fixedCellHeight: z.number().min(50).max(1000).optional().default(300),
  backgroundColor: z
    .string()
    .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .default('#ffffff'),
  filters: imageFiltersSchema.default({
    blur: 0,
    grayscale: 0,
    saturation: 100,
    brightness: 100,
    contrast: 100,
    sepia: 0,
  }),
});

// Selected image schema
export const selectedImageSchema = z.object({
  id: z.string(),
  file: z.instanceof(File),
  url: z.url(),
  name: z.string(),
  offsetX: z.number().min(-1).max(1).default(0),
  offsetY: z.number().min(-1).max(1).default(0),
  zoom: z.number().min(1).max(6).default(1),
});

// Grid dimensions schema
export const gridDimensionsSchema = z.object({
  cols: z.number().min(0),
  rows: z.number().min(0),
});

// Cell dimensions schema
export const cellDimensionsSchema = z.object({
  width: z.number().min(0),
  height: z.number().min(0),
});

// Canvas size schema
export const canvasSizeSchema = z.object({
  width: z.number().min(0),
  height: z.number().min(0),
});

// Grid capacity warning schema
export const gridCapacityWarningSchema = z.object({
  message: z.string(),
  type: z.literal('warning'),
});

// Image grid state schema
export const imageGridStateSchema = z.object({
  selectedImages: z.array(selectedImageSchema),
  config: imageGridConfigSchema,
  isGenerating: z.boolean().default(false),
  previewUrl: z.string().nullable().default(null),
});

// Configuration update schema (for partial updates)
export const configUpdateSchema = z.object({
  width: z.number().min(100).max(4000).optional(),
  height: z.number().min(100).max(4000).optional(),
  spacing: z.number().min(0).max(100).optional(),
  manualCols: z.number().min(1).max(10).optional(),
  manualRows: z.number().min(1).max(10).optional(),
  useManualGrid: z.boolean().optional(),
  autoFit: z.boolean().optional(),
  useFixedCellSize: z.boolean().optional(),
  fixedCellWidth: z.number().min(50).max(1000).optional(),
  fixedCellHeight: z.number().min(50).max(1000).optional(),
  backgroundColor: z
    .string()
    .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .optional(),
  filters: z
    .object({
      blur: z.number().min(0).max(10).optional(),
      grayscale: z.number().min(0).max(100).optional(),
      saturation: z.number().min(0).max(200).optional(),
      brightness: z.number().min(50).max(150).optional(),
      contrast: z.number().min(50).max(150).optional(),
      sepia: z.number().min(0).max(100).optional(),
    })
    .partial()
    .optional(),
});

// Image position update schema
export const imagePositionUpdateSchema = z.object({
  imageId: z.string(),
  offsetX: z.number().min(-1).max(1),
  offsetY: z.number().min(-1).max(1),
  zoom: z.number().min(1).max(6),
});

// Type exports inferred from schemas
export type ImageFilters = z.infer<typeof imageFiltersSchema>;
export type ImageGridConfig = z.infer<typeof imageGridConfigSchema>;
export type SelectedImage = z.infer<typeof selectedImageSchema>;
export type GridDimensions = z.infer<typeof gridDimensionsSchema>;
export type CellDimensions = z.infer<typeof cellDimensionsSchema>;
export type CanvasSize = z.infer<typeof canvasSizeSchema>;
export type GridCapacityWarning = z.infer<typeof gridCapacityWarningSchema>;
export type ImageGridState = z.infer<typeof imageGridStateSchema>;
export type ConfigUpdate = z.infer<typeof configUpdateSchema>;
export type ImagePositionUpdate = z.infer<typeof imagePositionUpdateSchema>;

// Validation helpers
export const validateImageGridConfig = (data: unknown) => imageGridConfigSchema.safeParse(data);
export const validateConfigUpdate = (data: unknown) => configUpdateSchema.safeParse(data);
export const validateSelectedImage = (data: unknown) => selectedImageSchema.safeParse(data);
export const validateImagePositionUpdate = (data: unknown) => imagePositionUpdateSchema.safeParse(data);

// Default values
export const DEFAULT_IMAGE_GRID_CONFIG = imageGridConfigSchema.parse({});
export const DEFAULT_IMAGE_FILTERS = imageFiltersSchema.parse({});
export const DEFAULT_IMAGE_GRID_STATE = imageGridStateSchema.parse({
  selectedImages: [],
  config: DEFAULT_IMAGE_GRID_CONFIG,
});
