import { generationDownloadFilename } from '@/components/ai/shared/GenerationCard';
import { GenerationGallery as SharedGenerationGallery } from '@/components/ai/shared/GenerationGallery';
import type { TemplateGenerationItem } from '@/hooks/stores/template-generation-queue-store';
import { useTemplateGenerationHistory } from '@/hooks/use-template-generation-history';
import { TemplateGenerationLightbox } from './TemplateGenerationLightbox';

interface TemplateGenerationGalleryProps {
  onRetry?: (generation: TemplateGenerationItem) => void;
  onCancel?: (generation: TemplateGenerationItem) => void;
}

export function TemplateGenerationGallery({ onRetry, onCancel }: TemplateGenerationGalleryProps) {
  return (
    <SharedGenerationGallery<TemplateGenerationItem>
      useQueueStore={useTemplateGenerationHistory}
      emptyHint='Select a template and click "Generate" to start'
      onRetry={onRetry}
      onCancel={onCancel}
      getCardContent={(generation) => ({
        label:
          generation.imageCount && generation.imageCount > 1
            ? `${generation.templateName} · ${generation.batchIndex + 1}/${generation.imageCount}`
            : generation.templateName,
        resultImageUrl: generation.result?.resultImageUrl || null,
        fallbackImage: generation.inputPreviews[0],
        downloadFilename: generationDownloadFilename(generation.templateName, generation.createdAt, generation.batchIndex),
      })}
      renderLightbox={({ generation, open, onOpenChange }) => (
        <TemplateGenerationLightbox
          generation={generation}
          open={open}
          onOpenChange={onOpenChange}
        />
      )}
    />
  );
}
