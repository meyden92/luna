import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import type { ImageItem } from '@/components/ai/editor/SortableImageCard';
import { type GenerationStatus, useImageEditorQueueStore } from '@/hooks/stores/image-editor-queue-store';
import { queryKeys } from '@/libs/query-keys';
import { streamSSE } from '@/libs/sse';

export interface EditGenerateParams {
  images: ImageItem[];
  modelId: string;
  modelLabel: string;
  fieldValues: Record<string, unknown>;
  imageCount?: number;
}

interface StreamEvent {
  status: GenerationStatus | 'uploading';
  progress: number;
  message?: string;
  error?: string;
  results?: Array<{
    index: number;
    resultImageUrl?: string;
    success?: boolean;
    error?: string;
  }>;
  successCount?: number;
  totalCount?: number;
  originalImageUrl?: string[];
  model?: string;
  modelId?: string;
}

export function useEditImageGeneration() {
  const addGeneration = useImageEditorQueueStore((state) => state.addGeneration);
  const updateGeneration = useImageEditorQueueStore((state) => state.updateGeneration);
  const abortControllersRef = useRef(new Map<string, AbortController>());
  const queryClient = useQueryClient();

  const generate = useCallback(
    async (params: EditGenerateParams) => {
      const { images, modelId, modelLabel, fieldValues, imageCount = 1 } = params;

      let cacheInvalidated = false;

      // Create generation ID
      const generationId = crypto.randomUUID();

      // Get input preview URLs (use preview URLs which are object URLs or CDN URLs)
      const inputPreviews = images.map((img) => img.preview);

      // Add to queue store immediately
      addGeneration({
        id: generationId,
        status: 'queued',
        modelLabel,
        modelId,
        fieldValues,
        imageCount,
        inputImages: images,
        inputPreviews,
      });

      // Build FormData
      const formData = new FormData();
      formData.append('editingModelId', modelId);
      formData.append('imageCount', imageCount.toString());
      formData.append('generationId', generationId);

      // Append images
      for (let i = 0; i < images.length; i++) {
        formData.append(`originalImage_${i}`, images[i]!.file);
      }

      // Append field values with field_ prefix
      for (const [key, value] of Object.entries(fieldValues)) {
        if (value !== undefined && value !== null) {
          formData.append(`field_${key}`, String(value));
        }
      }

      // Create abort controller for this generation
      const abortController = new AbortController();
      abortControllersRef.current.set(generationId, abortController);
      let finalStatus: GenerationStatus | null = null;
      let finalError: string | undefined;
      let finalSuccessCount = 0;
      let finalTotalCount = imageCount;

      try {
        await streamSSE({
          url: '/api/generate/edit-image/stream',
          body: formData,
          signal: abortController.signal,
          onEvent: (event) => {
            const data = event as StreamEvent;

            // Map status to store format
            let storeStatus: GenerationStatus = data.status as GenerationStatus;
            if (data.status === 'uploading') {
              storeStatus = 'uploading';
            }

            // Invalidate cache query when uploads are done (status moves to 'processing')
            // This ensures the CacheImageSelector shows newly uploaded images
            if (data.status === 'processing' && !cacheInvalidated) {
              cacheInvalidated = true;
              queryClient.invalidateQueries({ queryKey: queryKeys.cachedImages.all });
            }

            // Update store based on event
            if (data.status === 'succeeded' || data.status === 'failed') {
              finalStatus = storeStatus;
              finalError = data.error;
              finalSuccessCount = data.successCount || 0;
              finalTotalCount = data.totalCount || imageCount;
              updateGeneration(generationId, {
                status: storeStatus,
                progress: data.progress,
                statusMessage: data.message,
                error: data.error,
                result: data.results
                  ? {
                      originalImageUrl: data.originalImageUrl || inputPreviews,
                      results: data.results.map((r) => ({
                        index: r.index,
                        resultImageUrl: r.resultImageUrl,
                        success: r.success,
                        error: r.error,
                      })),
                      successCount: data.successCount || 0,
                      totalCount: data.totalCount || imageCount,
                      model: data.model,
                    }
                  : undefined,
              });
            } else {
              updateGeneration(generationId, {
                status: storeStatus,
                progress: data.progress,
                statusMessage: data.message,
              });
            }
          },
        });

        // Stream closed → the server has persisted the history row; refresh it.
        queryClient.invalidateQueries({ queryKey: queryKeys.ai.imageEditHistory });
        if (finalStatus === 'failed') {
          toast.error(finalError || 'Image edit failed');
          return { success: false, error: finalError || 'Image edit failed', generationId };
        }

        if (finalError) {
          toast.error(`Edited ${finalSuccessCount}/${finalTotalCount} images. ${finalError}`);
          return { success: true, generationId };
        }

        toast.success(finalTotalCount > 1 ? `Edited ${finalSuccessCount}/${finalTotalCount} images` : 'Image edit complete');
        return { success: true, generationId };
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          updateGeneration(generationId, {
            status: 'failed',
            error: 'Generation was cancelled',
          });
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
