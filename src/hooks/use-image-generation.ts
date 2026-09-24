import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { type GenerationQueueStatus, useImageGenerationQueueStore } from '@/hooks/stores/image-generation-queue-store';
import { queryKeys } from '@/libs/query-keys';
import { streamSSE } from '@/libs/sse';

export interface GenerateParams {
  modelId: string;
  modelLabel: string;
  fieldValues: Record<string, unknown>;
  prompt: string;
  /** Folder the generated files are inserted into, or null to leave them unsorted. */
  saveToFolderId?: string | null;
}

interface StreamEvent {
  status: GenerationQueueStatus;
  progress: number;
  message?: string;
  error?: string;
  results?: Array<{
    index: number;
    resultImageUrl?: string;
    fileId?: string;
    success?: boolean;
    error?: string;
  }>;
  successCount?: number;
  totalCount?: number;
  model?: string;
  modelId?: string;
}

export function useImageGeneration() {
  const addGeneration = useImageGenerationQueueStore((state) => state.addGeneration);
  const updateGeneration = useImageGenerationQueueStore((state) => state.updateGeneration);
  const queryClient = useQueryClient();
  const abortControllersRef = useRef(new Map<string, AbortController>());

  const generate = useCallback(
    async (params: GenerateParams) => {
      const { modelId, modelLabel, fieldValues, prompt, saveToFolderId = null } = params;

      // Create generation ID
      const generationId = crypto.randomUUID();

      // Add to queue store immediately
      addGeneration({
        id: generationId,
        status: 'queued',
        modelLabel,
        modelId,
        prompt,
        fieldValues,
      });

      // Create abort controller for this generation
      const abortController = new AbortController();
      abortControllersRef.current.set(generationId, abortController);
      let finalStatus: GenerationQueueStatus | null = null;
      let finalError: string | undefined;
      let finalSuccessCount = 0;
      let finalTotalCount = 1;

      try {
        await streamSSE({
          url: '/api/generate/image/stream',
          headers: {
            'Content-Type': 'application/json',
          },
          // The folder is written last: a model may not declare a field by that
          // name, but if it ever did, the destination is not its to override.
          body: JSON.stringify({
            generationModelId: modelId,
            generationId,
            ...fieldValues,
            saveToFolderId,
          }),
          signal: abortController.signal,
          onEvent: (event) => {
            const data = event as StreamEvent;

            // Update store based on event
            if (data.status === 'succeeded' || data.status === 'failed') {
              finalStatus = data.status;
              finalError = data.error;
              finalSuccessCount = data.successCount || 0;
              finalTotalCount = data.totalCount || 1;
              updateGeneration(generationId, {
                status: data.status,
                progress: data.progress,
                statusMessage: data.message,
                error: data.error,
                result: data.results
                  ? {
                      results: data.results.map((r) => ({
                        index: r.index,
                        resultImageUrl: r.resultImageUrl,
                        fileId: r.fileId,
                        success: r.success,
                        error: r.error,
                      })),
                      successCount: data.successCount || 0,
                      totalCount: data.totalCount || 1,
                      model: data.model,
                    }
                  : undefined,
              });
            } else {
              updateGeneration(generationId, {
                status: data.status,
                progress: data.progress,
                statusMessage: data.message,
              });
            }
          },
        });

        // Stream closed → the server has persisted the history row; refresh it.
        queryClient.invalidateQueries({ queryKey: queryKeys.ai.imageGenerationHistory });
        if (finalStatus === 'failed') {
          toast.error(finalError || 'Image generation failed');
          return { success: false, error: finalError || 'Image generation failed', generationId };
        }

        if (finalError) {
          toast.error(`Generated ${finalSuccessCount}/${finalTotalCount} images. ${finalError}`);
          return { success: true, generationId };
        }

        toast.success(finalTotalCount > 1 ? `Generated ${finalSuccessCount}/${finalTotalCount} images` : 'Image generated');
        return { success: true, generationId };
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          updateGeneration(generationId, {
            status: 'failed',
            error: 'Generation was cancelled',
          });
          toast('Generation cancelled');
          return { success: false, error: 'Cancelled' };
        }

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        updateGeneration(generationId, {
          status: 'failed',
          error: errorMessage,
        });
        toast.error(errorMessage);
        return { success: false, error: errorMessage };
      } finally {
        abortControllersRef.current.delete(generationId);
      }
    },
    [addGeneration, updateGeneration, queryClient],
  );

  const cancel = useCallback((generationId: string) => {
    abortControllersRef.current.get(generationId)?.abort();
  }, []);

  return { generate, cancel };
}
