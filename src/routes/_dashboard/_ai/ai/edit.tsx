import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { EditSidebar } from '@/components/ai/editor/EditSidebar';
import { GenerationGallery } from '@/components/ai/editor/GenerationGallery';
import { createImageItemFromImageUrl } from '@/components/ai/editor/ReferenceImageSection';
import { AiWorkspace } from '@/components/ai/shared/AiWorkspace';
import type { GenerationItem } from '@/hooks/stores/image-editor-queue-store';
import { useEditImageGeneration } from '@/hooks/use-edit-image-generation';
import { queryKeys } from '@/libs/query-keys';
import { listAiModels } from '@/server/fns/ai';
import { aiHistoryQueryOptions } from '@/server/fns/ai-history';

const editingModelsQuery = queryOptions({
  queryKey: queryKeys.aiModels.editing,
  queryFn: () => listAiModels({ data: { type: 'editing' } }),
  refetchOnMount: false,
  refetchOnWindowFocus: false,
});

const editSearchSchema = z.object({
  ref: z.string().optional(),
});

async function imageItemsFromPreviews(previews: string[], idPrefix: string) {
  const timestamp = Date.now();
  return Promise.all(
    previews.filter(Boolean).map((preview, index) => createImageItemFromImageUrl(preview, `${idPrefix}-${timestamp}-${index}`)),
  );
}

export const Route = createFileRoute('/_dashboard/_ai/ai/edit')({
  head: () => ({ meta: [{ title: 'AI Edit | LunaShare' }] }),
  validateSearch: editSearchSchema,
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(editingModelsQuery),
      context.queryClient.ensureQueryData(aiHistoryQueryOptions('edit')),
    ]),
  component: AIEditPage,
});

function AIEditPage() {
  const { data: editingModels } = useSuspenseQuery(editingModelsQuery);
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { generate, cancel } = useEditImageGeneration();

  const handleRetry = useCallback(
    async (generation: GenerationItem) => {
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
          images,
          modelId: generation.modelId,
          modelLabel: generation.modelLabel,
          fieldValues: generation.fieldValues ?? {},
          imageCount: generation.imageCount ?? generation.result?.totalCount ?? 1,
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not prepare reference images');
      }
    },
    [generate],
  );

  const handleReferenceImageSeeded = useCallback(() => {
    void navigate({ to: '/ai/edit', search: {}, replace: true });
  }, [navigate]);

  return (
    <AiWorkspace
      rail={
        <EditSidebar
          editingModels={editingModels ?? []}
          onGenerate={generate}
          referenceImageUrl={search.ref}
          onReferenceImageSeeded={handleReferenceImageSeeded}
        />
      }
      title="Image Generation"
      subtitle="Upload reference images and configure settings to generate AI images."
    >
      <GenerationGallery
        onRetry={handleRetry}
        onCancel={(generation) => cancel(generation.id)}
      />
    </AiWorkspace>
  );
}
