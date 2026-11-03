import {
  AudioLines,
  Box,
  Brush,
  Camera,
  Clapperboard,
  Film,
  Image,
  ImagePlus,
  Images,
  Layers,
  type LucideIcon,
  type LucideProps,
  Mic,
  Music,
  Paintbrush,
  Palette,
  ScanFace,
  Shapes,
  Smile,
  Sparkles,
  Star,
  Video,
  WandSparkles,
  Zap,
} from 'lucide-react';
import type { CategoryIcon as CategoryIconName } from '@/libs/studio/category-icons';

const ICONS: Record<CategoryIconName, LucideIcon> = {
  AudioLines,
  Box,
  Brush,
  Camera,
  Clapperboard,
  Film,
  Image,
  ImagePlus,
  Images,
  Layers,
  Mic,
  Music,
  Paintbrush,
  Palette,
  ScanFace,
  Shapes,
  Smile,
  Sparkles,
  Star,
  Video,
  WandSparkles,
  Zap,
};

/** A Category's icon; an unknown name falls back to `Image`. */
export function CategoryIcon({ name, ...props }: LucideProps & { name: string }) {
  const Icon = ICONS[name as CategoryIconName] ?? Image;
  return <Icon {...props} />;
}
