import { closestCenter, DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext } from '@dnd-kit/sortable';
import { Plus, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CacheImageSelector } from '@/components/ai/image/CacheImageSelector';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { proxyImage } from '@/server/fns/storage';
import styles from './ReferenceImageSection.module.css';
import { type ImageItem, SortableImageCard } from './SortableImageCard';

const DEFAULT_maxImages = 10;

export const loadImageDimensions = (preview: string): Promise<{ width: number; height: number }> => {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      resolve({ width: 0, height: 0 });
    };
    img.src = preview;
  });
};

export async function createImageItemFromImageUrl(imageUrl: string, id: string): Promise<ImageItem> {
  const response =
    imageUrl.startsWith('blob:') || imageUrl.startsWith('data:') ? await fetch(imageUrl) : await proxyImage({ data: { imageUrl } });

  const blob = await response.blob();
  const filename = imageUrl.split('/').pop()?.split('?')[0] || 'reference-image.png';
  const file = new File([blob], filename, { type: blob.type || 'image/png' });
  const preview = URL.createObjectURL(blob);
  const dimensions = await loadImageDimensions(preview);

  return {
    id,
    file,
    preview,
    width: dimensions.width,
    height: dimensions.height,
  };
}

interface ReferenceImageSectionProps {
  images: ImageItem[];
  onImagesChange: (images: ImageItem[]) => void;
  maxImages?: number;
  purpose?: string;
  initialImageUrl?: string;
  onInitialImageLoaded?: () => void;
}

export function ReferenceImageSection({
  images,
  onImagesChange,
  maxImages = DEFAULT_maxImages,
  purpose = 'image-edit',
  initialImageUrl,
  onInitialImageLoaded,
}: ReferenceImageSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const seededInitialImageRef = useRef<string | null>(null);
  const [selectedCacheHashes, setSelectedCacheHashes] = useState<string[]>([]);

  // Sync selectedCacheHashes with images prop - derive hashes from current images
  useEffect(() => {
    const currentCacheHashes = images
      .filter((img) => img.id.startsWith('cache-'))
      .map((img) => {
        // Cache image IDs have format: cache-{hash}-{timestamp}
        const parts = img.id.split('-');
        return parts[1] || '';
      })
      .filter(Boolean);

    setSelectedCacheHashes(currentCacheHashes);
  }, [images]);

  useEffect(() => {
    if (!initialImageUrl || seededInitialImageRef.current === initialImageUrl) return;

    if (images.length >= maxImages) {
      seededInitialImageRef.current = initialImageUrl;
      onInitialImageLoaded?.();
      return;
    }

    seededInitialImageRef.current = initialImageUrl;
    let cancelled = false;

    createImageItemFromImageUrl(initialImageUrl, `ref-${Date.now()}`)
      .then((image) => {
        if (cancelled) {
          URL.revokeObjectURL(image.preview);
          return;
        }
        onImagesChange([...images, image]);
      })
      .catch((error) => {
        console.error('Error loading reference image:', error);
      })
      .finally(() => {
        if (!cancelled) {
          onInitialImageLoaded?.();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialImageUrl, images, maxImages, onImagesChange, onInitialImageLoaded]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = images.findIndex((item) => item.id === active.id);
      const newIndex = images.findIndex((item) => item.id === over.id);
      onImagesChange(arrayMove(images, oldIndex, newIndex));
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const remainingSlots = maxImages - images.length;
    const filesToProcess = Array.from(files).slice(0, remainingSlots);

    const newImages: ImageItem[] = await Promise.all(
      filesToProcess.map(async (file, i) => {
        const preview = URL.createObjectURL(file);
        const dimensions = await loadImageDimensions(preview);
        return {
          id: `${Date.now()}-${i}`,
          file,
          preview,
          width: dimensions.width,
          height: dimensions.height,
        };
      }),
    );

    onImagesChange([...images, ...newImages]);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = (id: string) => {
    const removed = images.find((img) => img.id === id);
    if (removed) {
      URL.revokeObjectURL(removed.preview);

      // If this was a cached image, remove its hash from selectedCacheHashes
      // Cache image IDs have format: cache-{hash}-{timestamp}
      if (id.startsWith('cache-')) {
        const parts = id.split('-');
        // Hash is the second part (index 1)
        const hash = parts[1];
        if (hash) {
          setSelectedCacheHashes((prev) => prev.filter((h) => h !== hash));
        }
      }
    }
    onImagesChange(images.filter((img) => img.id !== id));
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleCachedImageSelect = async (imageUrl: string, hash: string) => {
    if (images.length >= maxImages) return;

    try {
      const newImage = await createImageItemFromImageUrl(imageUrl, `cache-${hash}-${Date.now()}`);

      onImagesChange([...images, newImage]);
      setSelectedCacheHashes((prev) => [...prev, hash]);
    } catch (error) {
      console.error('Error loading cached image:', error);
    }
  };

  const handleCachedImageDeselect = (hash: string) => {
    // Find and remove the image with matching hash
    const imageToRemove = images.find((img) => img.id.startsWith(`cache-${hash}-`));
    if (imageToRemove) {
      URL.revokeObjectURL(imageToRemove.preview);
      onImagesChange(images.filter((img) => img.id !== imageToRemove.id));
    }
    setSelectedCacheHashes((prev) => prev.filter((h) => h !== hash));
  };

  const remainingSlots = maxImages - images.length;

  return (
    <div className="stack space-3">
      <Label className={styles.label}>Reference Images</Label>

      <Input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        className="hide"
      />

      {images.length === 0 ? (
        <div className="stack space-3">
          <div
            onClick={handleBrowseClick}
            className={styles.dropzone}
          >
            <div className={styles.dropIcon}>
              <Upload />
            </div>
            <p className={styles.dropTitle}>Upload reference images</p>
            <p className={styles.dropHint}>PNG, JPG up to 10MB each (max {maxImages} images)</p>
          </div>
          <CacheImageSelector
            onImageSelect={handleCachedImageSelect}
            onImageDeselect={handleCachedImageDeselect}
            selectedHashes={selectedCacheHashes}
            maxSelection={remainingSlots}
            disabled={remainingSlots === 0}
            purpose={purpose}
          />
        </div>
      ) : (
        <div className="stack space-3">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={images.map((img) => img.id)}
              strategy={rectSortingStrategy}
            >
              <div className={styles.imageGrid}>
                {images.map((image) => (
                  <SortableImageCard
                    key={image.id}
                    image={image}
                    onRemove={() => handleRemoveImage(image.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {images.length < maxImages && (
            <div className={styles.addRow}>
              <Button
                type="button"
                variant="outline"
                onClick={handleBrowseClick}
                className={styles.addButton}
              >
                <Plus className={styles.addIcon} />
                Add More ({images.length}/{maxImages})
              </Button>
              <CacheImageSelector
                onImageSelect={handleCachedImageSelect}
                onImageDeselect={handleCachedImageDeselect}
                selectedHashes={selectedCacheHashes}
                maxSelection={remainingSlots}
                disabled={remainingSlots === 0}
                purpose={purpose}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
