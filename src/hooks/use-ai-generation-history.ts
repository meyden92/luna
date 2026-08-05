import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import type { GenerationQueueState } from '@/hooks/stores/create-generation-queue-store';
import { type GenerationItem, useImageEditorQueueStore } from '@/hooks/stores/image-editor-queue-store';
import { type GenerationQueueItem, useImageGenerationQueueStore } from '@/hooks/stores/image-generation-queue-store';
import {
  type AiGenerationHistoryItem,
  type AiHistoryKind,
  aiHistoryQueryOptions,
  clearCompletedAiGenerations,
  deleteAiGeneration,
} from '@/server/fns/ai-history';

/**
 * Returns the gallery's `GenerationQueueState` by merging DB history with the
 * in-memory live store. Live (this-tab) items win on id collision so an
 * in-progress generation isn't duplicated by its own persisted row; DB rows
 * fill in past sessions. Sorted newest-first.
 */
function useAiGenerationHistory<TItem extends GenerationQueueItem | GenerationItem>(
  kind: AiHistoryKind,
  useLiveStore: <T>(selector: (state: GenerationQueueState<TItem>) => T) => T,
): GenerationQueueState<TItem> {
  const queryClient = useQueryClient();
  const historyQuery = aiHistoryQueryOptions(kind);
  const queryKey = historyQuery.queryKey;
  const liveGenerations = useLiveStore((state) => state.generations);
  const selectedGenerationId = useLiveStore((state) => state.selectedGenerationId);
  const addGeneration = useLiveStore((state) => state.addGeneration);
  const addGenerations = useLiveStore((state) => state.addGenerations);
  const updateGeneration = useLiveStore((state) => state.updateGeneration);
  const updateGenerationsByBatch = useLiveStore((state) => state.updateGenerationsByBatch);
  const liveRemove = useLiveStore((state) => state.removeGeneration);
  const liveClear = useLiveStore((state) => state.clearCompleted);
  const restoreGenerationSnapshot = useLiveStore((state) => state.restoreGenerationSnapshot);
  const setSelectedGenerationId = useLiveStore((state) => state.setSelectedGenerationId);

  const { data: dbItems } = useSuspenseQuery(historyQuery);

  const generations = useMemo(() => {
    const liveIds = new Set(liveGenerations.map((g) => g.id));
    return [...liveGenerations, ...(dbItems as unknown as TItem[]).filter((g) => !liveIds.has(g.id))].sort(
      (a, b) => b.createdAt - a.createdAt,
    );
  }, [dbItems, liveGenerations]);

  const removeMutation = useMutation({
    mutationFn: (id: string) => deleteAiGeneration({ data: { id } }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const previousDbItems = queryClient.getQueryData<AiGenerationHistoryItem[]>(queryKey);
      const previousSnapshot = { generations: liveGenerations, selectedGenerationId };

      liveRemove(id);
      queryClient.setQueryData<AiGenerationHistoryItem[]>(queryKey, (old) => old?.filter((generation) => generation.id !== id));

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
    mutationFn: () => clearCompletedAiGenerations({ data: { kind } }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      const previousDbItems = queryClient.getQueryData<AiGenerationHistoryItem[]>(queryKey);
      const previousSnapshot = { generations: liveGenerations, selectedGenerationId };

      liveClear();
      queryClient.setQueryData<AiGenerationHistoryItem[]>(queryKey, (old) =>
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

export const useImageGenerationHistory = (): GenerationQueueState<GenerationQueueItem> =>
  useAiGenerationHistory('generation', useImageGenerationQueueStore);

export const useImageEditHistory = (): GenerationQueueState<GenerationItem> => useAiGenerationHistory('edit', useImageEditorQueueStore);
