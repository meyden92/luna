import { createFileRoute } from '@tanstack/react-router';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { createImageItemFromImageUrl } from '@/components/ai/editor/ReferenceImageSection';
import { AiWorkspace } from '@/components/ai/shared/AiWorkspace';
import { TemplateGenerationGallery } from '@/components/ai/templates/TemplateGenerationGallery';
import { TemplateSidebar } from '@/components/ai/templates/TemplateSidebar';
import type { TemplateGenerationItem } from '@/hooks/stores/template-generation-queue-store';
import { useTemplateStreamGeneration } from '@/hooks/use-template-stream-generation';
import { templateHistoryQueryOptions } from '@/server/fns/ai-history';

async function imageItemsFromPreviews(previews: string[], idPrefix: string) {
  const timestamp = Date.now();
  return Promise.all(
    previews.filter(Boolean).map((preview, index) => createImageItemFromImageUrl(preview, `${idPrefix}-${timestamp}-${index}`)),
  );
}

export const Route = createFileRoute('/_dashboard/_ai/ai/templates')({
  head: () => ({ meta: [{ title: 'AI Templates | LunaShare' }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(templateHistoryQueryOptions()),
  component: AITemplatesPage,
});

function AITemplatesPage() {
  const { generate, cancel } = useTemplateStreamGeneration();

  const handleRetry = useCallback(
    async (generation: TemplateGenerationItem) => {
      try {
        const images =
          generation.inputImages && generation.inputImages.length > 0
            ? generation.inputImages
            : await imageItemsFromPreviews(generation.inputPreviews ?? [], `retry-${generation.id}`);

        if (images.length === 0) {
          toast.error('Reference images are unavailable');
          return;
        }

        void generate({
          template: { id: generation.templateId, name: generation.templateName },
          images,
          variableValues: generation.variableValues,
          imageCount: generation.imageCount ?? 1,
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not prepare reference images');
      }
    },
    [generate],
  );

  return (
    <AiWorkspace
      rail={<TemplateSidebar onGenerate={generate} />}
      title="Template Generation"
      subtitle="Select a template, upload reference images, and customize options to generate AI images."
    >
      <TemplateGenerationGallery
        onRetry={handleRetry}
        onCancel={(generation) => cancel({ batchId: generation.batchId, id: generation.id })}
      />
    </AiWorkspace>
  );
}
