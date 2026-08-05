import { generationDownloadFilename } from '@/components/ai/shared/GenerationCard';
import { GenerationGallery as SharedGenerationGallery } from '@/components/ai/shared/GenerationGallery';
import type { GenerationItem } from '@/hooks/stores/image-editor-queue-store';
import { useImageEditHistory } from '@/hooks/use-ai-generation-history';
import { GenerationLightbox } from './GenerationLightbox';

function getResultImageUrl(generation: GenerationItem) {
  const successResult = getFirstSuccessfulResult(generation);
  return successResult?.resultImageUrl || null;
}

function getFirstSuccessfulResult(generation: GenerationItem) {
  return generation.result?.results?.find((r) => r.success && r.resultImageUrl);
}

function getSuccessfulResultImageUrls(generation: GenerationItem) {
  return generation.result?.results?.flatMap((r) => (r.success && r.resultImageUrl ? [r.resultImageUrl] : [])) ?? [];
}

function getResultBatchIndex(resultIndex: number | undefined) {
  return typeof resultIndex === 'number' ? Math.max(resultIndex - 1, 0) : undefined;
}

interface GenerationGalleryProps {
  onRetry?: (generation: GenerationItem) => void;
  onCancel?: (generation: GenerationItem) => void;
}

export function GenerationGallery({ onRetry, onCancel }: GenerationGalleryProps) {
  return (
    <SharedGenerationGallery<GenerationItem>
      useQueueStore={useImageEditHistory}
      emptyHint='Click "Generate" to start'
      onRetry={onRetry}
      onCancel={onCancel}
      getCardContent={(generation) => {
        const firstResult = getFirstSuccessfulResult(generation);
        const resultImageUrls = getSuccessfulResultImageUrls(generation);
        const totalCount = generation.result?.totalCount ?? generation.imageCount ?? 1;

        return {
          label: totalCount > 1 ? `${generation.modelLabel} · ${totalCount} outputs` : generation.modelLabel,
          resultImageUrl: getResultImageUrl(generation),
          resultImageUrls,
          fallbackImage: generation.inputPreviews[0],
          downloadFilename: generationDownloadFilename(
            generation.modelLabel,
            generation.createdAt,
            getResultBatchIndex(firstResult?.index),
          ),
        };
      }}
      renderLightbox={({ generation, open, onOpenChange }) => (
        <GenerationLightbox
          generation={generation}
          open={open}
          onOpenChange={onOpenChange}
        />
      )}
    />
  );
}
