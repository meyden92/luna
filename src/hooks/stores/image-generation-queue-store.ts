import type { Prediction } from 'replicate';
import { createGenerationQueueStore } from './create-generation-queue-store';

export type GenerationMutationResponse = {
  results: Array<{
    index: number;
    prediction?: Prediction;
    resultImageUrl?: string;
    success?: boolean;
    error?: string;
  }>;
  successCount: number;
  totalCount: number;
  cached?: boolean;
  model?: string;
};

export type GenerationQueueStatus = 'queued' | 'processing' | 'succeeded' | 'failed';

export interface GenerationQueueItem {
  id: string;
  status: GenerationQueueStatus;
  progress: number;
  statusMessage?: string;
  modelLabel: string;
  modelId: string;
  prompt: string;
  fieldValues?: Record<string, unknown>;
  createdAt: number; // timestamp for serialization
  result?: GenerationMutationResponse;
  error?: string;
}

export const useImageGenerationQueueStore = createGenerationQueueStore<GenerationQueueItem>({
  inProgressStatuses: ['queued', 'processing'],
});
