import { GripVertical, Upload, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { SelectedImage } from '@/schemas/image-grid';

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Label className="text-lg font-semibold">Select Images ({selectedImages.length})</Label>
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
        <div className="space-y-2">
          <Label className="text-sm font-medium text-muted-foreground">Selected Images</Label>
          <div className="grid grid-cols-6 gap-2 max-h-80 overflow-y-auto">
            {selectedImages.map((image, index) => (
              <div
                key={image.id}
                className={`relative group cursor-move transition-all duration-200 rounded-lg ${
                  draggedIndex === index ? 'opacity-50 scale-95 rotate-3 z-10' : ''
                } ${
                  dragOverIndex === index && draggedIndex !== index
                    ? 'ring-2 ring-primary ring-offset-2 bg-primary/10'
                    : 'hover:ring-1 hover:ring-primary/30'
                }`}
                draggable={true}
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
              >
                {/* Image container */}
                <div className="relative overflow-hidden rounded border bg-muted">
                  <img
                    src={image.url}
                    alt={image.name}
                    className="w-full h-16 object-cover pointer-events-none"
                  />

                  {/* Order indicator */}
                  <div className="absolute top-1 left-1 bg-primary text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-medium">
                    {index + 1}
                  </div>
                </div>

                {/* Drag handle */}
                <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="bg-black/70 rounded p-1">
                    <GripVertical className="h-3 w-3 text-white" />
                  </div>
                </div>

                {/* Remove button */}
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 opacity-0 group-hover:opacity-100 transition-opacity z-20"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onRemoveImage(image.id);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>

          {selectedImages.length > 1 && (
            <div className="text-center mt-3 space-y-1">
              <p className="text-xs text-muted-foreground">💡 Drag images to reorder them in the grid</p>
              <p className="text-xs text-muted-foreground opacity-75">Numbers show the current order in the grid</p>
            </div>
          )}
        </div>
      )}

      {/* Image Upload */}
      <div className="space-y-4">
        <input
          id="image-upload"
          type="file"
          accept="image/*"
          multiple
          onChange={handleLocalUpload}
          className="hidden"
        />

        <div
          className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => document.getElementById('image-upload')?.click()}
        >
          <Upload className="w-12 h-12 mx-auto mb-4" />
          <p className="text-lg font-medium mb-2">Click to upload images</p>
          <p className="text-sm">Select multiple images from your device</p>
        </div>
      </div>
    </div>
  );
}
