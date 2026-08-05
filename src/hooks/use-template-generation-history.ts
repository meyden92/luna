import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import type { GenerationQueueState } from '@/hooks/stores/create-generation-queue-store';
import { type TemplateGenerationItem, useTemplateGenerationQueueStore } from '@/hooks/stores/template-generation-queue-store';
import {
  clearCompletedTemplateGenerations,
  deleteTemplateGenerationRow,
  type TemplateHistoryItem,
  templateHistoryQueryOptions,
} from '@/server/fns/ai-history';

/**
 * Template gallery state: DB history (TemplateGeneration rows) merged with the
 * in-memory live store. Live items win on id collision; DB rows fill in past
 * sessions. Sorted newest-first.
 */
export function useTemplateGenerationHistory(): GenerationQueueState<TemplateGenerationItem> {
  const queryClient = useQueryClient();
  const liveGenerations = useTemplateGenerationQueueStore((state) => state.generations);
  const selectedGenerationId = useTemplateGenerationQueueStore((state) => state.selectedGenerationId);
  const addGeneration = useTemplateGenerationQueueStore((state) => state.addGeneration);
  const addGenerations = useTemplateGenerationQueueStore((state) => state.addGenerations);
  const updateGeneration = useTemplateGenerationQueueStore((state) => state.updateGeneration);
  const updateGenerationsByBatch = useTemplateGenerationQueueStore((state) => state.updateGenerationsByBatch);
  const liveRemove = useTemplateGenerationQueueStore((state) => state.removeGeneration);
  const liveClear = useTemplateGenerationQueueStore((state) => state.clearCompleted);
  const restoreGenerationSnapshot = useTemplateGenerationQueueStore((state) => state.restoreGenerationSnapshot);
  const setSelectedGenerationId = useTemplateGenerationQueueStore((state) => state.setSelectedGenerationId);
  const historyQuery = templateHistoryQueryOptions();
  const queryKey = historyQuery.queryKey;

  const { data: dbItems } = useSuspenseQuery(historyQuery);

  const generations = useMemo(() => {
    const liveIds = new Set(liveGenerations.map((g) => g.id));
    return [...liveGenerations, ...(dbItems as unknown as TemplateGenerationItem[]).filter((g) => !liveIds.has(g.id))].sort(
      (a, b) => b.createdAt - a.createdAt,
    );
  }, [dbItems, liveGenerations]);

  const removeMutation = useMutation({
    mutationFn: (id: string) => deleteTemplateGenerationRow({ data: { id } }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const previousDbItems = queryClient.getQueryData<TemplateHistoryItem[]>(queryKey);
      const previousSnapshot = { generations: liveGenerations, selectedGenerationId };

      liveRemove(id);
      queryClient.setQueryData<TemplateHistoryItem[]>(queryKey, (old) => old?.filter((generation) => generation.id !== id));

      return { previousDbItems, previousSnapshot };
    },
    onError: (_error, _id, context) => {
      if (context?.previousDbItems !== undefined) {
        queryClient.setQueryData(queryKey, context.previousDbItems);
      }
      if (context?.previousSnapshot) restoreGenerationSnapshot(context.previousSnapshot);
      toast.error('Failed to remove generation');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const clearCompletedMutation = useMutation({
    mutationFn: () => clearCompletedTemplateGenerations(),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      const previousDbItems = queryClient.getQueryData<TemplateHistoryItem[]>(queryKey);
      const previousSnapshot = { generations: liveGenerations, selectedGenerationId };

      liveClear();
      queryClient.setQueryData<TemplateHistoryItem[]>(queryKey, (old) =>
        old?.filter((generation) => generation.status !== 'succeeded' && generation.status !== 'failed'),
      );

      return { previousDbItems, previousSnapshot };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousDbItems !== undefined) {
        queryClient.setQueryData(queryKey, context.previousDbItems);
      }
      if (context?.previousSnapshot) restoreGenerationSnapshot(context.previousSnapshot);
      toast.error('Failed to clear completed generations');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const removeGeneration = useCallback(
    (id: string) => {
      removeMutation.mutate(id);
    },
    [removeMutation],
  );

  const clearCompleted = useCallback(() => {
    clearCompletedMutation.mutate();
  }, [clearCompletedMutation]);

  return {
    generations,
    selectedGenerationId,
    addGeneration,
    addGenerations,
    updateGeneration,
    updateGenerationsByBatch,
    removeGeneration,
    clearCompleted,
    restoreGenerationSnapshot,
    setSelectedGenerationId,
  };
}
