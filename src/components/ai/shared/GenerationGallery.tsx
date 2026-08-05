import { Trash2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { GenerationQueueState } from '@/hooks/stores/create-generation-queue-store';
import { GenerationCard, type GenerationCardContent, type GenerationCardItem } from './GenerationCard';

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
      <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
        <p className="text-muted-foreground">Generated images will appear here</p>
        <p className="text-sm text-muted-foreground/70 mt-1">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Gallery</h2>
          <p className="text-sm text-muted-foreground">
            {generationCount} generation{generationCount !== 1 ? 's' : ''}
          </p>
        </div>
        {hasCompleted && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => clearCompleted()}
            className="gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear Completed
          </Button>
        )}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
