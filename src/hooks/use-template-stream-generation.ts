import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import type { ImageItem } from '@/components/ai/editor/SortableImageCard';
import { type TemplateGenerationStatus, useTemplateGenerationQueueStore } from '@/hooks/stores/template-generation-queue-store';
import { queryKeys } from '@/libs/query-keys';
import { streamSSE } from '@/libs/sse';

export interface Template {
  id: string;
  name: string;
}

export interface TemplateGenerateParams {
  template: Template;
  images: ImageItem[];
  variableValues: Record<string, unknown>;
  imageCount: number;
}

interface StreamEvent {
  status: TemplateGenerationStatus;
  progress: number;
  message?: string;
  error?: string;
  batchId: string;
  results?: Array<{
    index: number;
    resultImageUrl?: string;
    generationId?: string;
    success?: boolean;
    error?: string;
  }>;
  originalImageUrls?: string[];
  finalPrompt?: string;
  successCount?: number;
  totalCount?: number;
}

type TemplateCancelTarget = string | { batchId?: string; id?: string };

export function useTemplateStreamGeneration() {
  const addGenerations = useTemplateGenerationQueueStore((state) => state.addGenerations);
  const updateGeneration = useTemplateGenerationQueueStore((state) => state.updateGeneration);
  const updateGenerationsByBatch = useTemplateGenerationQueueStore((state) => state.updateGenerationsByBatch);
  const abortControllersRef = useRef(new Map<string, AbortController>());
  const queryClient = useQueryClient();

  const generate = useCallback(
    async (params: TemplateGenerateParams) => {
      const { template, images, variableValues, imageCount } = params;

      let cacheInvalidated = false;

      // Create batch ID to group all generations from this request
      const batchId = crypto.randomUUID();
      const generationIds = Array.from({ length: imageCount }, () => crypto.randomUUID());

      // Get input preview URLs
      const inputPreviews = images.map((img) => img.preview);

      // Create individual generation items for each image in the batch
      const generationItems = generationIds.map((generationId, index) => ({
        id: generationId,
        status: 'queued' as const,
        templateId: template.id,
        templateName: template.name,
        variableValues,
        imageCount,
        inputImages: images,
        inputPreviews,
        batchId,
        batchIndex: index,
      }));

      // Add all generation items to queue store immediately
      addGenerations(generationItems);

      // Build FormData
      const formData = new FormData();
      formData.append('templateId', template.id);
      formData.append('imageCount', imageCount.toString());
      formData.append('batchId', batchId);
      formData.append('generationIds', JSON.stringify(generationIds));

      // Append images
      for (let i = 0; i < images.length; i++) {
        formData.append(`originalImage_${i}`, images[i]!.file);
      }

      // Append variable values with variable_ prefix
      for (const [key, value] of Object.entries(variableValues)) {
        if (value !== undefined && value !== null) {
          formData.append(`variable_${key}`, String(value));
        }
      }

      // Create abort controller for this generation
      const abortController = new AbortController();
      abortControllersRef.current.set(batchId, abortController);
      for (const generationId of generationIds) {
        abortControllersRef.current.set(generationId, abortController);
      }
      let finalStatus: TemplateGenerationStatus | null = null;
      let finalError: string | undefined;
      let finalSuccessCount = 0;
      let finalTotalCount = imageCount;

      try {
        await streamSSE({
          url: '/api/generate/template/stream',
          body: formData,
          signal: abortController.signal,
          onEvent: (event) => {
            const data = event as StreamEvent;

            // Invalidate cache query when uploads are done (status moves to 'processing')
            if (data.status === 'processing' && !cacheInvalidated) {
              cacheInvalidated = true;
              queryClient.invalidateQueries({ queryKey: queryKeys.cachedImages.all });
            }

            if (data.status === 'succeeded' || data.status === 'failed') {
              finalStatus = data.status;
              finalError = data.error;
              finalSuccessCount = data.successCount || 0;
              finalTotalCount = data.totalCount || imageCount;
            }

            // Handle individual results
            if (data.results && data.results.length > 0) {
              // Update each generation item with its specific result
              for (const result of data.results) {
                const item = generationItems[result.index];
                if (item) {
                  updateGeneration(item.id, {
                    status: result.success ? 'succeeded' : 'failed',
                    progress: 100,
                    error: result.error,
                    result: result.success
                      ? {
                          originalImageUrls: data.originalImageUrls || inputPreviews,
                          resultImageUrl: result.resultImageUrl || '',
                          finalPrompt: data.finalPrompt || '',
                          generationId: result.generationId || '',
                        }
                      : undefined,
                  });
                }
              }
            } else {
              // Update all items in batch with progress/status (during uploading/processing)
              updateGenerationsByBatch(batchId, {
                status: data.status,
                progress: data.progress,
                statusMessage: data.message,
                error: data.error,
              });
            }
          },
        });

        // Stream closed → the server has persisted the TemplateGeneration rows; refresh history.
        queryClient.invalidateQueries({ queryKey: queryKeys.ai.templateHistory });
        if (finalStatus === 'failed') {
          toast.error(finalError || 'Template generation failed');
          return { success: false, error: finalError || 'Template generation failed', batchId };
        }

        if (finalError) {
          toast.error(`Generated ${finalSuccessCount}/${finalTotalCount} template images. ${finalError}`);
          return { success: true, batchId };
        }

        toast.success(
          finalTotalCount > 1 ? `Generated ${finalSuccessCount}/${finalTotalCount} template images` : 'Template generation complete',
        );
        return { success: true, batchId };
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          updateGenerationsByBatch(batchId, {
            status: 'failed',
            error: 'Generation was cancelled',
          });
          return { success: false, error: 'Cancelled' };
        }

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        updateGenerationsByBatch(batchId, {
          status: 'failed',
          error: errorMessage,
        });
        toast.error(errorMessage);
        return { success: false, error: errorMessage };
      } finally {
        abortControllersRef.current.delete(batchId);
        for (const generationId of generationIds) {
          abortControllersRef.current.delete(generationId);
        }
      }
    },
    [addGenerations, updateGeneration, updateGenerationsByBatch, queryClient],
  );

  const cancel = useCallback((target: TemplateCancelTarget) => {
    const keys =
      typeof target === 'string'
        ? [target]
        : [target.batchId, target.id].filter((key): key is string => typeof key === 'string' && key.length > 0);
    const controller = keys.map((key) => abortControllersRef.current.get(key)).find(Boolean);
    controller?.abort();
  }, []);

  const cancelBatch = useCallback(
    (batchId: string) => {
      cancel({ batchId });
    },
    [cancel],
  );

  return { generate, cancel, cancelBatch };
}
