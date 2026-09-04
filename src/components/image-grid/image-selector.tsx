import { GripVertical, Upload, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { SelectedImage } from '@/schemas/image-grid';
import styles from './image-selector.module.css';

interface ImageSelectorProps {
  selectedImages: SelectedImage[];
  onAddLocalImages: (files: File[]) => void;
  onRemoveImage: (id: string) => void;
  onReorderImages: (startIndex: number, endIndex: number) => void;
  onClearAll: () => void;
}

export function ImageSelector({ selectedImages, onAddLocalImages, onRemoveImage, onReorderImages, onClearAll }: ImageSelectorProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleLocalUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      // Basic validation for image files
      const validImageFiles = files.filter((file) => {
        const isImage = file.type.startsWith('image/');
        const isReasonableSize = file.size < 50 * 1024 * 1024; // 50MB limit
        return isImage && isReasonableSize;
      });

      if (validImageFiles.length > 0) {
        onAddLocalImages(validImageFiles);
      }

      if (validImageFiles.length < files.length) {
        console.warn(`${files.length - validImageFiles.length} files were skipped (not valid images or too large)`);
      }
    }
    e.target.value = '';
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());

    // Create a simple drag preview
    const img = e.currentTarget.querySelector('img');
    if (img) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 64;
      canvas.height = 64;

      if (ctx && img.complete) {
        ctx.drawImage(img, 0, 0, 64, 64);
        e.dataTransfer.setDragImage(canvas, 32, 32);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
    e.preventDefault();
    e.stopPropagation();

    const dragIndex = Number.parseInt(e.dataTransfer.getData('text/plain'), 10);

    if (!Number.isNaN(dragIndex) && dragIndex !== dropIndex) {
      onReorderImages(dragIndex, dropIndex);
    }

    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="stack space-6">
      <div className={styles.spread}>
        <Label className="type-lg weight-semibold">Select Images ({selectedImages.length})</Label>
        {selectedImages.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={onClearAll}
          >
            Clear All
          </Button>
        )}
      </div>

      {/* Selected Images Preview */}
      {selectedImages.length > 0 && (
        <div className="stack space-2">
          <Label className={styles.sectionLabel}>Selected Images</Label>
          <div className={styles.grid}>
            {selectedImages.map((image, index) => (
              <div
                key={image.id}
                className={styles.tile}
                data-dragging={draggedIndex === index ? '' : undefined}
                data-dragover={dragOverIndex === index && draggedIndex !== index ? '' : undefined}
                draggable={true}
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
              >
                {/* Image container */}
                <div className={styles.thumbFrame}>
                  <img
                    src={image.url}
                    alt={image.name}
                    className={styles.thumb}
                  />

                  {/* Order indicator */}
                  <div className={styles.order}>{index + 1}</div>
                </div>

                {/* Drag handle */}
                <div className={styles.handle}>
                  <GripVertical className={styles.handleIcon} />
                </div>

                {/* Remove button */}
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className={styles.remove}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onRemoveImage(image.id);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <X className={styles.removeIcon} />
                </Button>
              </div>
            ))}
          </div>

          {selectedImages.length > 1 && (
            <div className={`${styles.hints} stack space-1 margin-top-3`}>
              <p>💡 Drag images to reorder them in the grid</p>
              <p className={styles.hintFaint}>Numbers show the current order in the grid</p>
            </div>
          )}
        </div>
      )}

      {/* Image Upload */}
      <div className="stack space-4">
        <input
          id="image-upload"
          type="file"
          accept="image/*"
          multiple
          onChange={handleLocalUpload}
          className="hide"
        />

        <div
          className={styles.dropzone}
          onClick={() => document.getElementById('image-upload')?.click()}
        >
          <Upload className={styles.dropzoneIcon} />
          <p className={styles.dropzoneTitle}>Click to upload images</p>
          <p className={styles.dropzoneHint}>Select multiple images from your device</p>
        </div>
      </div>
    </div>
  );
}
