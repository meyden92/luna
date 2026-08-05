import type { Prediction } from 'replicate';
import { createGenerationQueueStore } from './create-generation-queue-store';

export type MutationResponse = {
  originalImageUrl: string | string[];
  results: Array<{
    index: number;
    originalImageUrl?: string | string[];
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

export type GenerationStatus = 'queued' | 'uploading' | 'processing' | 'succeeded' | 'failed';

export interface GenerationInputImage {
  id: string;
  file: File;
  preview: string;
  width?: number;
  height?: number;
}

export interface GenerationItem {
  id: string;
  status: GenerationStatus;
  progress: number;
  statusMessage?: string;
  modelLabel: string;
  modelId: string;
  fieldValues?: Record<string, unknown>;
  imageCount?: number;
  inputImages?: GenerationInputImage[];
  inputPreviews: string[];
  createdAt: number; // timestamp for serialization
  result?: MutationResponse;
  error?: string;
}

export const useImageEditorQueueStore = createGenerationQueueStore<GenerationItem>({
  inProgressStatuses: ['queued', 'uploading', 'processing'],
});
