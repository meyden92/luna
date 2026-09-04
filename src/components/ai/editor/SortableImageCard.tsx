import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import styles from './SortableImageCard.module.css';

export interface ImageItem {
  id: string;
  file: File;
  preview: string;
  width?: number;
  height?: number;
}

interface SortableImageCardProps {
  image: ImageItem;
  onRemove: () => void;
}

export function SortableImageCard({ image, onRemove }: SortableImageCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: image.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const dimensions = image.width && image.height ? `${image.width}×${image.height}` : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={styles.card}
      data-dragging={isDragging ? '' : undefined}
    >
      {/* Image Container */}
      <div className={styles.frame}>
        <img
          src={image.preview}
          alt="Reference image"
          className={styles.image}
          sizes="200px"
          loading="lazy"
        />

        {/* Overlay - visible on hover */}
        <div className={styles.veil} />

        {/* Bottom-left label */}
        <span className={styles.tag}>Image</span>

        {/* Drag handle - top left, visible on hover */}
        <button
          type="button"
          {...listeners}
          {...attributes}
          className={styles.handle}
        >
          <GripVertical className={styles.icon} />
        </button>

        {/* Remove button - top right, visible on hover */}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          className={styles.remove}
        >
          <X className={styles.icon} />
        </Button>
      </div>

      {/* Dimension indicator below image */}
      {dimensions && <div className={styles.dimensions}>{dimensions}</div>}
    </div>
  );
}
