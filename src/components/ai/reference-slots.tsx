import { ImagePlus, X } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/libs/utils';
import { ImagePickerDialog } from './image-picker-dialog';
import type { ReferenceImage } from './reference-image';
import styles from './reference-slots.module.css';

interface ReferenceSlotsProps {
  images: ReferenceImage[];
  onChange: (images: ReferenceImage[]) => void;
  /** How many references this model or template accepts. */
  max?: number;
  /** Offer the images used in Edit before as a picker source. */
  previousUploads?: boolean;
  className?: string;
}

/** The row of reference images, with a dashed slot that opens the picker. */
function ReferenceSlots({ images, onChange, max = 4, previousUploads, className }: ReferenceSlotsProps) {
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const remaining = max - images.length;

  return (
    <>
      <div className={cn(styles.slots, className)}>
        {images.map((image, index) => (
          <div
            key={image.id}
            className={styles.slot}
          >
            <img
              src={image.preview}
              alt=""
            />
            <button
              type="button"
              aria-label="Remove reference image"
              className={styles.remove}
              onClick={() => onChange(images.filter((_, position) => position !== index))}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        {remaining > 0 && (
          <button
            type="button"
            className={cn(styles.slot, styles.add)}
            onClick={() => setPickerOpen(true)}
          >
            <ImagePlus size={18} />
            {images.length > 0 ? 'Add' : 'Add image'}
          </button>
        )}
      </div>

      <ImagePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        remaining={remaining}
        previousUploads={previousUploads}
        onSelect={(picked) => onChange([...images, ...picked].slice(0, max))}
      />
    </>
  );
}

export { ReferenceSlots };
