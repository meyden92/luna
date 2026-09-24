import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { z } from 'zod';
import { GenerateWorkspace } from '@/components/ai/generate-workspace';
import type { GenerationModel } from '@/components/ai/generation-options';
import { templatesQueryOptions } from '@/components/ai/template-data';
import { queryKeys } from '@/libs/query-keys';
import { listAiModels } from '@/server/fns/ai';
import { aiHistoryQueryOptions, templateHistoryQueryOptions } from '@/server/fns/ai-history';

const generationModelsQuery = queryOptions({
  queryKey: queryKeys.aiModels.generation,
  queryFn: () => listAiModels({ data: { type: 'generation' } }) as Promise<GenerationModel[]>,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
});

const editingModelsQuery = queryOptions({
  queryKey: queryKeys.aiModels.editing,
  queryFn: () => listAiModels({ data: { type: 'editing' } }) as Promise<GenerationModel[]>,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
});

/**
 * `tab` only seeds the screen — the tabs are state after that, so a tab change
 * does not push a history entry. `ref` hands an image to Edit from elsewhere in
 * the app and is cleared once it has been picked up.
 */
const searchSchema = z.object({
  tab: z.enum(['create', 'edit', 'templates', 'history']).optional(),
  ref: z.string().optional(),
});

export const Route = createFileRoute('/_dashboard/_ai/ai/generate')({
  head: () => ({ meta: [{ title: 'Generate | LunaShare' }] }),
  validateSearch: searchSchema,
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(generationModelsQuery),
      context.queryClient.ensureQueryData(editingModelsQuery),
      context.queryClient.ensureQueryData(templatesQueryOptions),
      context.queryClient.ensureQueryData(aiHistoryQueryOptions('generation')),
      context.queryClient.ensureQueryData(aiHistoryQueryOptions('edit')),
      context.queryClient.ensureQueryData(templateHistoryQueryOptions()),
    ]),
  component: GeneratePage,
});

function GeneratePage() {
  const { tab, ref } = Route.useSearch();
  const navigate = useNavigate();
  const { data: generationModels } = useSuspenseQuery(generationModelsQuery);
  const { data: editingModels } = useSuspenseQuery(editingModelsQuery);
  const { data: templates } = useSuspenseQuery(templatesQueryOptions);

  const clearReference = useCallback(() => {
    // Both search params only seed the screen, so the URL can go back to bare.
    void navigate({ to: '/ai/generate', search: {}, replace: true });
  }, [navigate]);

  return (
    <GenerateWorkspace
      generationModels={generationModels ?? []}
      editingModels={editingModels ?? []}
      templates={templates.templates}
      initialTab={tab ?? (ref ? 'edit' : 'create')}
      initialReference={ref}
      onInitialReferenceUsed={clearReference}
    />
  );
}
