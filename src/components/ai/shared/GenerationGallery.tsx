import { Trash2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { GenerationQueueState } from '@/hooks/stores/create-generation-queue-store';
import { GenerationCard, type GenerationCardContent, type GenerationCardItem } from './GenerationCard';
import styles from './GenerationGallery.module.css';

interface GenerationGalleryProps<TItem extends GenerationCardItem> {
  useQueueStore: () => GenerationQueueState<TItem>;
  /** Second line of the empty state, e.g. 'Click "Generate" to start' */
  emptyHint: string;
  getCardContent: (generation: TItem) => GenerationCardContent;
  renderLightbox: (lightbox: { generation: TItem | null; open: boolean; onOpenChange: (open: boolean) => void }) => ReactNode;
  onRetry?: (generation: TItem) => void;
  onCancel?: (generation: TItem) => void;
}

export function GenerationGallery<TItem extends GenerationCardItem>({
  useQueueStore,
  emptyHint,
  getCardContent,
  renderLightbox,
  onRetry,
  onCancel,
}: GenerationGalleryProps<TItem>) {
  const { generations, selectedGenerationId, removeGeneration, clearCompleted, setSelectedGenerationId } = useQueueStore();
  const [lightboxGeneration, setLightboxGeneration] = useState<TItem | null>(null);

  const hasCompleted = generations.some((g) => g.status === 'succeeded' || g.status === 'failed');
  const generationCount = generations.length;

  const handleClick = (generation: TItem) => {
    // Open lightbox for succeeded generations
    if (generation.status === 'succeeded') {
      setLightboxGeneration(generation);
    } else {
      // Toggle selection for non-succeeded items
      setSelectedGenerationId(generation.id === selectedGenerationId ? null : generation.id);
    }
  };

  if (generationCount === 0) {
    return (
      <div className={styles.empty}>
        <p>Generated images will appear here</p>
        <p className={styles.emptyHint}>{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="stack space-4">
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Gallery</h2>
          <p className={styles.count}>
            {generationCount} generation{generationCount !== 1 ? 's' : ''}
          </p>
        </div>
        {hasCompleted && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => clearCompleted()}
            className={styles.clearButton}
          >
            <Trash2 className={styles.clearIcon} />
            Clear Completed
          </Button>
        )}
      </div>

      {/* Grid */}
      <div className={styles.grid}>
        {generations.map((generation) => (
          <GenerationCard
            key={generation.id}
            generation={generation}
            content={getCardContent(generation)}
            onRemove={removeGeneration}
            onRetry={onRetry}
            onCancel={onCancel}
            onClick={handleClick}
            isSelected={generation.id === selectedGenerationId}
          />
        ))}
      </div>

      {/* Lightbox */}
      {renderLightbox({
        generation: lightboxGeneration,
        open: lightboxGeneration !== null,
        onOpenChange: (open) => !open && setLightboxGeneration(null),
      })}
    </div>
  );
}
