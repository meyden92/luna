import { createGenerationQueueStore } from './create-generation-queue-store';

export type TemplateGenerationStatus = 'queued' | 'uploading' | 'processing' | 'succeeded' | 'failed';

export interface TemplateGenerationResult {
  originalImageUrls: string[];
  resultImageUrl: string;
  finalPrompt: string;
  generationId: string; // DB generation ID
}

export interface TemplateGenerationInputImage {
  id: string;
  file: File;
  preview: string;
  width?: number;
  height?: number;
}

export interface TemplateGenerationItem {
  id: string;
  status: TemplateGenerationStatus;
  progress: number;
  statusMessage?: string;
  templateId: string;
  templateName: string;
  variableValues: Record<string, unknown>;
  imageCount?: number;
  inputImages?: TemplateGenerationInputImage[];
  inputPreviews: string[]; // Reference image previews
  batchId: string; // Groups items from same generation request
  batchIndex: number; // Position in batch (0, 1, 2, 3)
  createdAt: number;
  result?: TemplateGenerationResult;
  error?: string;
}

export const useTemplateGenerationQueueStore = createGenerationQueueStore<TemplateGenerationItem>({
  inProgressStatuses: ['queued', 'uploading', 'processing'],
});
