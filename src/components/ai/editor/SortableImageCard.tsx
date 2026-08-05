import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
      className={`group relative rounded-xl overflow-hidden bg-muted/30 ${isDragging ? 'opacity-50 z-50' : ''}`}
    >
      {/* Image Container */}
      <div className="relative aspect-square">
        <img
          src={image.preview}
          alt="Reference image"
          className="absolute inset-0 h-full w-full object-cover"
          sizes="200px"
          loading="lazy"
        />

        {/* Overlay - visible on hover */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />

        {/* Bottom-left label */}
        <div className="absolute bottom-2 left-2">
          <span className="px-2 py-1 text-xs font-medium bg-black/60 text-white rounded-md">Image</span>
        </div>

        {/* Drag handle - top left, visible on hover */}
        <button
          type="button"
          {...listeners}
          {...attributes}
          className="absolute top-2 left-2 p-1.5 bg-black/60 text-white rounded-md cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Remove button - top right, visible on hover */}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          className="absolute top-2 right-2 bg-black/60 text-white hover:bg-destructive hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Dimension indicator below image */}
      {dimensions && (
        <div className="px-2 py-1.5 text-xs text-muted-foreground text-center bg-card border-t border-border">{dimensions}</div>
      )}
    </div>
  );
}
