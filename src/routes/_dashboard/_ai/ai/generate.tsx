import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback } from 'react';
import { GenerateSidebar } from '@/components/ai/generator/GenerateSidebar';
import { GeneratorGallery } from '@/components/ai/generator/GeneratorGallery';
import { AiWorkspace } from '@/components/ai/shared/AiWorkspace';
import type { GenerationQueueItem } from '@/hooks/stores/image-generation-queue-store';
import { useImageGeneration } from '@/hooks/use-image-generation';
import { queryKeys } from '@/libs/query-keys';
import { listAiModels } from '@/server/fns/ai';
import { aiHistoryQueryOptions } from '@/server/fns/ai-history';

const generationModelsQuery = queryOptions({
  queryKey: queryKeys.aiModels.generation,
  queryFn: () => listAiModels({ data: { type: 'generation' } }),
  refetchOnMount: false,
  refetchOnWindowFocus: false,
});

export const Route = createFileRoute('/_dashboard/_ai/ai/generate')({
  head: () => ({ meta: [{ title: 'AI Generate | LunaShare' }] }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(generationModelsQuery),
      context.queryClient.ensureQueryData(aiHistoryQueryOptions('generation')),
    ]),
  component: AIGeneratePage,
});

function AIGeneratePage() {
  const { data: generationModels } = useSuspenseQuery(generationModelsQuery);
  const { generate, cancel } = useImageGeneration();

  const handleRetry = useCallback(
    (generation: GenerationQueueItem) => {
      const fieldValues = generation.fieldValues ?? { prompt: generation.prompt };
      const prompt = typeof fieldValues.prompt === 'string' ? fieldValues.prompt : generation.prompt;

      void generate({
        modelId: generation.modelId,
        modelLabel: generation.modelLabel,
        fieldValues,
        prompt,
      });
    },
    [generate],
  );

  return (
    <AiWorkspace
      rail={
        <GenerateSidebar
          generationModels={generationModels || []}
          onGenerate={generate}
        />
      }
      title="Prompt Generation"
      subtitle="Describe what you want to create, pick a model, and let Luna do the rest."
    >
      <GeneratorGallery
        onRetry={handleRetry}
        onCancel={(generation) => cancel(generation.id)}
      />
    </AiWorkspace>
  );
}
