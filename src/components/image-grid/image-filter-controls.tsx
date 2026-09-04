import { Sliders } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import type { ImageFilters } from '@/schemas/image-grid';
import styles from './image-filter-controls.module.css';

/** One canvas filter, with the range the Slider exposes and the unit shown beside its value. */
const FILTER_ROWS = [
  { key: 'blur', label: 'Blur', unit: 'px', min: 0, max: 10, step: 0.5, fallback: 0 },
  { key: 'grayscale', label: 'Grayscale', unit: '%', min: 0, max: 100, step: 1, fallback: 0 },
  { key: 'saturation', label: 'Saturation', unit: '%', min: 0, max: 200, step: 1, fallback: 100 },
  { key: 'brightness', label: 'Brightness', unit: '%', min: 50, max: 150, step: 1, fallback: 100 },
  { key: 'contrast', label: 'Contrast', unit: '%', min: 50, max: 150, step: 1, fallback: 100 },
  { key: 'sepia', label: 'Sepia', unit: '%', min: 0, max: 100, step: 1, fallback: 0 },
] as const satisfies ReadonlyArray<{
  key: keyof ImageFilters;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  fallback: number;
}>;

const RESET_FILTERS: ImageFilters = { blur: 0, grayscale: 0, saturation: 100, brightness: 100, contrast: 100, sepia: 0 };

interface ImageFilterControlsProps {
  filters: ImageFilters;
  /** Applies a partial filter patch to the grid config. */
  onChange: (filters: Partial<ImageFilters>) => void;
}

/** Collapsible panel of the canvas filters applied to every cell of the grid. */
export function ImageFilterControls({ filters, onChange }: ImageFilterControlsProps) {
  const [showFilters, setShowFilters] = useState(false);

  return (
    <div className="stack space-4">
      <div className={styles.header}>
        <Label className="cluster space-2 type-sm weight-medium">
          <Sliders className={styles.labelIcon} />
          Image Filters
        </Label>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
        >
          {showFilters ? 'Hide' : 'Show'}
        </Button>
      </div>

      {showFilters && (
        <div className="stack space-4">
          {FILTER_ROWS.map((row) => (
            <div
              key={row.key}
              className="stack space-2"
            >
              <div className={styles.header}>
                <Label className="type-sm">{row.label}</Label>
                <span className={styles.value}>
                  {filters[row.key]}
                  {row.unit}
                </span>
              </div>
              <Slider
                value={[filters[row.key]]}
                onValueChange={(value) => {
                  const newValue = Array.isArray(value) ? value[0] : value;
                  onChange({ [row.key]: newValue ?? row.fallback });
                }}
                min={row.min}
                max={row.max}
                step={row.step}
                className={styles.fullWidth}
              />
            </div>
          ))}

          <Button
            variant="outline"
            size="sm"
            onClick={() => onChange(RESET_FILTERS)}
            className={styles.fullWidth}
          >
            Reset All Filters
          </Button>
        </div>
      )}
    </div>
  );
}
