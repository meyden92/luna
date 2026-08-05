import { create } from 'zustand';
import { calculateAutoFitDimensions, calculateOptimalGridLayout } from '@/libs/image-grid/utils';
import {
  type CanvasSize,
  type CellDimensions,
  type ConfigUpdate,
  configUpdateSchema,
  DEFAULT_IMAGE_GRID_CONFIG,
  type GridCapacityWarning,
  type GridDimensions,
  type ImageGridConfig,
  type SelectedImage,
  selectedImageSchema,
} from '@/schemas/image-grid';

interface ImageGridStore {
  // State
  selectedImages: SelectedImage[];
  config: ImageGridConfig;
  isGenerating: boolean;
  previewUrl: string | null;

  // Actions
  addLocalImages: (files: File[]) => void;
  removeImage: (id: string) => void;
  reorderImages: (startIndex: number, endIndex: number) => void;
  updateConfig: (updates: ConfigUpdate, currentGridDimensions?: GridDimensions) => void;
  updateImageOffset: (imageId: string, offsetX: number, offsetY: number) => void;
  updateImageZoom: (imageId: string, zoom: number) => void;
  updateImagePositionAndZoom: (imageId: string, offsetX: number, offsetY: number, zoom: number) => void;
  clearImages: () => void;
  setGenerating: (isGenerating: boolean) => void;
  setPreviewUrl: (previewUrl: string | null) => void;
}

type ImageGridLayoutInput = Pick<ImageGridStore, 'selectedImages' | 'config'>;

export function deriveGridDimensions({ selectedImages, config }: ImageGridLayoutInput): GridDimensions {
  const imageCount = selectedImages.length;
  if (imageCount === 0) return { cols: 0, rows: 0 };

  if (config.useManualGrid && config.manualCols && config.manualRows) {
    return { cols: config.manualCols, rows: config.manualRows };
  }

  if (config.useFixedCellSize && config.fixedCellWidth && config.fixedCellHeight) {
    const maxCols = Math.floor((config.width + config.spacing) / (config.fixedCellWidth + config.spacing));
    const maxRows = Math.floor((config.height + config.spacing) / (config.fixedCellHeight + config.spacing));
    const maxCells = maxCols * maxRows;
    const constrainedImageCount = Math.min(imageCount, maxCells);
    const cols = Math.max(1, Math.min(maxCols, constrainedImageCount));
    const rows = Math.min(maxRows, Math.ceil(constrainedImageCount / cols));

    return { cols, rows };
  }

  return calculateOptimalGridLayout(imageCount, config.width, config.height);
}

export function deriveCellDimensions(
  state: ImageGridLayoutInput,
  gridDimensions: GridDimensions = deriveGridDimensions(state),
): CellDimensions {
  const { config } = state;
  const { cols, rows } = gridDimensions;

  if (cols === 0 || rows === 0) return { width: 0, height: 0 };

  if (config.useFixedCellSize && config.fixedCellWidth && config.fixedCellHeight) {
    return {
      width: Math.round(config.fixedCellWidth),
      height: Math.round(config.fixedCellHeight),
    };
  }

  const totalSpacingX = (cols - 1) * config.spacing;
  const totalSpacingY = (rows - 1) * config.spacing;
  const availableWidth = config.width - totalSpacingX;
  const availableHeight = config.height - totalSpacingY;

  return {
    width: Math.max(0, Math.round(availableWidth / cols)),
    height: Math.max(0, Math.round(availableHeight / rows)),
  };
}

export function deriveActualCanvasSize(
  state: ImageGridLayoutInput,
  gridDimensions: GridDimensions = deriveGridDimensions(state),
  cellDimensions: CellDimensions = deriveCellDimensions(state, gridDimensions),
): CanvasSize {
  const { selectedImages, config } = state;
  const { cols, rows } = gridDimensions;
  const { width, height } = cellDimensions;
  const imageCount = selectedImages.length;

  if (cols === 0 || rows === 0 || imageCount === 0) {
    return { width: config.width, height: config.height };
  }

  const rowsWithImages = Math.ceil(imageCount / cols);
  const actualCols = Math.min(cols, imageCount);

  let contentWidth: number;
  if (rowsWithImages === 1) {
    contentWidth = actualCols * width + Math.max(0, actualCols - 1) * config.spacing;
  } else {
    contentWidth = cols * width + Math.max(0, cols - 1) * config.spacing;
  }

  const contentHeight = rowsWithImages * height + Math.max(0, rowsWithImages - 1) * config.spacing;

  if (config.useFixedCellSize) {
    return {
      width: Math.max(0, Math.round(contentWidth)),
      height: Math.max(0, Math.round(contentHeight)),
    };
  }

  if (!config.autoFit) {
    return { width: config.width, height: config.height };
  }

  return {
    width: Math.max(0, Math.round(Math.min(config.width, contentWidth))),
    height: Math.max(0, Math.round(Math.min(config.height, contentHeight))),
  };
}

export function deriveGridCapacityWarning({ selectedImages, config }: ImageGridLayoutInput): GridCapacityWarning | null {
  const imageCount = selectedImages.length;

  if (config.useManualGrid && config.manualCols && config.manualRows) {
    const maxCapacity = config.manualCols * config.manualRows;
    if (imageCount > maxCapacity) {
      return {
        message: `Grid can only fit ${maxCapacity} images, but ${imageCount} are selected`,
        type: 'warning',
      };
    }
  }

  if (config.useFixedCellSize && config.fixedCellWidth && config.fixedCellHeight && imageCount > 0) {
    const maxCols = Math.floor((config.width + config.spacing) / (config.fixedCellWidth + config.spacing));
    const maxRows = Math.floor((config.height + config.spacing) / (config.fixedCellHeight + config.spacing));
    const maxCells = maxCols * maxRows;

    if (maxCells === 0) {
      return {
        message: `Fixed cell size (${config.fixedCellWidth}×${config.fixedCellHeight}px) is too large for canvas`,
        type: 'warning',
      };
    }

    if (imageCount > maxCells) {
      return {
        message: `Fixed cell size allows only ${maxCells} images, but ${imageCount} are selected`,
        type: 'warning',
      };
    }
  }

  return null;
}

export function deriveImageGridLayout(state: ImageGridLayoutInput) {
  const gridDimensions = deriveGridDimensions(state);
  const cellDimensions = deriveCellDimensions(state, gridDimensions);
  const actualCanvasSize = deriveActualCanvasSize(state, gridDimensions, cellDimensions);

  return {
    gridDimensions,
    cellDimensions,
    actualCanvasSize,
    gridCapacityWarning: deriveGridCapacityWarning(state),
    hasImages: state.selectedImages.length > 0,
    canGenerate: state.selectedImages.length > 0 && state.config.width > 0 && state.config.height > 0,
  };
}

export const useImageGridStore = create<ImageGridStore>((set) => ({
  // Initial state
  selectedImages: [],
  config: DEFAULT_IMAGE_GRID_CONFIG,
  isGenerating: false,
  previewUrl: null,

  // Actions
  addLocalImages: (files: File[]) => {
    const validFiles = files.filter((file) => {
      const isImage = file.type.startsWith('image/');
      const isReasonableSize = file.size < 50 * 1024 * 1024; // 50MB limit
      return isImage && isReasonableSize;
    });

    const newImages: SelectedImage[] = validFiles.map((file) => {
      const imageData = {
        id: `local-${crypto.randomUUID()}`,
        file,
        url: URL.createObjectURL(file),
        name: file.name,
        offsetX: 0,
        offsetY: 0,
        zoom: 1.0,
      };

      // Validate with Zod schema
      const result = selectedImageSchema.safeParse(imageData);
      if (!result.success) {
        console.warn('Invalid image data:', result.error);
        // Return a default valid image if validation fails
        return selectedImageSchema.parse({
          ...imageData,
          offsetX: 0,
          offsetY: 0,
          zoom: 1,
        });
      }
      return result.data;
    });

    set((state) => ({
      selectedImages: [...state.selectedImages, ...newImages],
    }));
  },

  removeImage: (id: string) => {
    set((state) => {
      const imageToRemove = state.selectedImages.find((img) => img.id === id);
      if (imageToRemove?.url.startsWith('blob:')) {
        URL.revokeObjectURL(imageToRemove.url);
      }

      return {
        selectedImages: state.selectedImages.filter((img) => img.id !== id),
      };
    });
  },

  reorderImages: (startIndex: number, endIndex: number) => {
    set((state) => {
      const newImages = [...state.selectedImages];
      const [removed] = newImages.splice(startIndex, 1);
      if (removed) {
        newImages.splice(endIndex, 0, removed);
      }
      return { selectedImages: newImages };
    });
  },

  updateConfig: (updates: ConfigUpdate, currentGridDimensions?: GridDimensions) => {
    set((state) => {
      // Validate updates with Zod
      const validationResult = configUpdateSchema.safeParse(updates);
      if (!validationResult.success) {
        console.warn('Invalid config updates:', validationResult.error);
        return state; // Don't update if validation fails
      }

      const validatedUpdates = validationResult.data;
      const newConfig = { ...state.config };

      // Merge updates, handling filters specially
      Object.entries(validatedUpdates).forEach(([key, value]) => {
        if (key === 'filters' && value && typeof value === 'object') {
          // Merge filter updates with existing filters
          newConfig.filters = { ...newConfig.filters, ...value };
        } else if (value !== undefined) {
          (newConfig as any)[key] = value;
        }
      });

      // The config is already valid since we started with a valid config
      // and only applied validated updates

      // Smart default for manual grid: use current auto-calculated values when switching to manual
      if (validatedUpdates.useManualGrid && !state.config.useManualGrid && currentGridDimensions) {
        newConfig.manualCols = Math.max(1, Math.min(10, currentGridDimensions.cols));
        newConfig.manualRows = Math.max(1, Math.min(10, currentGridDimensions.rows));
      }

      // When switching from manual to auto grid, preserve current layout
      if (validatedUpdates.useManualGrid === false && state.config.useManualGrid) {
        const autoLayout = calculateOptimalGridLayout(state.selectedImages.length, newConfig.width, newConfig.height);

        // If auto layout is very different from manual, suggest better canvas dimensions
        if (Math.abs(autoLayout.cols - (state.config.manualCols || 3)) > 1) {
          const suggestedDimensions = calculateAutoFitDimensions(
            { width: newConfig.width, height: newConfig.height },
            state.selectedImages.length,
          );
          if (!newConfig.autoFit) {
            newConfig.width = suggestedDimensions.width;
            newConfig.height = suggestedDimensions.height;
          }
        }
      }

      return { config: newConfig };
    });
  },

  updateImageOffset: (imageId: string, offsetX: number, offsetY: number) => {
    set((state) => ({
      selectedImages: state.selectedImages.map((img) =>
        img.id === imageId ? { ...img, offsetX: Math.max(-1, Math.min(1, offsetX)), offsetY: Math.max(-1, Math.min(1, offsetY)) } : img,
      ),
    }));
  },

  updateImageZoom: (imageId: string, zoom: number) => {
    set((state) => ({
      selectedImages: state.selectedImages.map((img) => (img.id === imageId ? { ...img, zoom: Math.max(1, Math.min(6, zoom)) } : img)),
    }));
  },

  updateImagePositionAndZoom: (imageId: string, offsetX: number, offsetY: number, zoom: number) => {
    set((state) => ({
      selectedImages: state.selectedImages.map((img) =>
        img.id === imageId
          ? {
              ...img,
              offsetX: Math.max(-1, Math.min(1, offsetX)),
              offsetY: Math.max(-1, Math.min(1, offsetY)),
              zoom: Math.max(1, Math.min(6, zoom)),
            }
          : img,
      ),
    }));
  },

  clearImages: () => {
    set((state) => {
      // Clean up blob URLs
      state.selectedImages.forEach((image) => {
        if (image.url.startsWith('blob:')) {
          URL.revokeObjectURL(image.url);
        }
      });

      // Clean up preview URL
      if (state.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(state.previewUrl);
      }

      return {
        selectedImages: [],
        previewUrl: null,
      };
    });
  },

  setGenerating: (isGenerating: boolean) => {
    set({ isGenerating });
  },

  setPreviewUrl: (previewUrl: string | null) => {
    set((state) => {
      // Clean up previous preview URL if it's a blob URL
      if (state.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(state.previewUrl);
      }
      return { previewUrl };
    });
  },
}));
