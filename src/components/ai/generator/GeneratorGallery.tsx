import { generationDownloadFilename } from '@/components/ai/shared/GenerationCard';
import { GenerationGallery as SharedGenerationGallery } from '@/components/ai/shared/GenerationGallery';
import type { GenerationQueueItem } from '@/hooks/stores/image-generation-queue-store';
import { useImageGenerationHistory } from '@/hooks/use-ai-generation-history';
import styles from './GeneratorGallery.module.css';
import { GeneratorLightbox } from './GeneratorLightbox';

function getResultImageUrl(generation: GenerationQueueItem) {
  const successResult = getFirstSuccessfulResult(generation);
  return successResult?.resultImageUrl || null;
}

function getFirstSuccessfulResult(generation: GenerationQueueItem) {
  return generation.result?.results?.find((r) => r.success && r.resultImageUrl);
}

function getSuccessfulResultImageUrls(generation: GenerationQueueItem) {
  return generation.result?.results?.flatMap((r) => (r.success && r.resultImageUrl ? [r.resultImageUrl] : [])) ?? [];
}

function getResultBatchIndex(resultIndex: number | undefined) {
  return typeof resultIndex === 'number' ? Math.max(resultIndex - 1, 0) : undefined;
}

interface GeneratorGalleryProps {
  onRetry?: (generation: GenerationQueueItem) => void;
  onCancel?: (generation: GenerationQueueItem) => void;
}

export function GeneratorGallery({ onRetry, onCancel }: GeneratorGalleryProps) {
  return (
    <SharedGenerationGallery<GenerationQueueItem>
      useQueueStore={useImageGenerationHistory}
      emptyHint='Click "Generate" to start'
      onRetry={onRetry}
      onCancel={onCancel}
      getCardContent={(generation) => {
        const isProcessing = generation.status === 'queued' || generation.status === 'processing';
        const truncatedPrompt = generation.prompt.length > 60 ? `${generation.prompt.substring(0, 60)}...` : generation.prompt;
        const firstResult = getFirstSuccessfulResult(generation);
        const resultImageUrls = getSuccessfulResultImageUrls(generation);
        const totalCount = generation.result?.totalCount ?? 1;
        return {
          label: totalCount > 1 ? `${generation.modelLabel} · ${totalCount} outputs` : generation.modelLabel,
          resultImageUrl: getResultImageUrl(generation),
          resultImageUrls,
          downloadFilename: generationDownloadFilename(
            generation.modelLabel,
            generation.createdAt,
            getResultBatchIndex(firstResult?.index),
          ),
          placeholder: (
            <div
              className={styles.placeholder}
              data-processing={isProcessing ? '' : undefined}
            >
              <p className={styles.placeholderText}>{truncatedPrompt}</p>
            </div>
          ),
        };
      }}
      renderLightbox={({ generation, open, onOpenChange }) => (
        <GeneratorLightbox
          generation={generation}
          open={open}
          onOpenChange={onOpenChange}
        />
      )}
    />
  );
}
