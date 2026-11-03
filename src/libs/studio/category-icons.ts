/** The `lucide-react` icons a Category may use, by component name. Rendered by `components/studio/category-icon.tsx`. */
export const CATEGORY_ICONS = [
  'Image',
  'ImagePlus',
  'Images',
  'Brush',
  'Paintbrush',
  'Palette',
  'Sparkles',
  'WandSparkles',
  'ScanFace',
  'Smile',
  'Camera',
  'Video',
  'Clapperboard',
  'Film',
  'Music',
  'AudioLines',
  'Mic',
  'Box',
  'Shapes',
  'Layers',
  'Star',
  'Zap',
] as const;

export type CategoryIcon = (typeof CATEGORY_ICONS)[number];
