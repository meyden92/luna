import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import * as ai from '@/db/queries/ai';
import type { JsonValue } from '@/db/schema/json';
import { queryKeys } from '@/libs/query-keys';
import { getCDNImage } from '@/libs/utils';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

// Cap history rows returned per kind (mirrors the old localStorage pruning spirit
// while keeping payloads bounded).
const HISTORY_LIMIT = 100;
const HISTORY_STALE_TIME = 30_000;

export type AiHistoryKind = 'generation' | 'edit';

function jsonObject(value: JsonValue | null): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function jsonStringArray(value: JsonValue | null): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function jsonRecord(value: unknown): Record<string, JsonValue> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, JsonValue>) : undefined;
}

/**
 * Shape returned to the gallery. Structurally compatible with the client
 * `GenerationQueueItem` (kind 'generation') and `GenerationItem` (kind 'edit')
 * store types. Processing rows are intentionally preserved so a refresh does
 * not rehydrate in-flight generations as completed items.
 */
export interface AiGenerationHistoryItem {
  id: string;
  status: 'processing' | 'succeeded' | 'failed';
  progress: number;
  createdAt: number;
  modelLabel: string;
  modelId: string;
  prompt?: string;
  fieldValues?: Record<string, JsonValue>;
  imageCount?: number;
  inputPreviews?: string[];
  result?: JsonValue;
  error?: string;
}

export const listAiGenerations = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(z.object({ kind: z.enum(['generation', 'edit']) }))
  .handler(async ({ data, context }) => {
    const userId = userIdFromCtx(context);
    const rows = await ai.listAiGenerations(userId, data.kind, HISTORY_LIMIT);
    return rows.map((r): AiGenerationHistoryItem => {
      const resultObject = jsonObject(r.result);
      return {
        id: r.id,
        status: r.status === 'failed' ? 'failed' : r.status === 'processing' ? 'processing' : 'succeeded',
        progress: r.status === 'processing' ? 10 : 100,
        createdAt: r.createdAt.getTime(),
        modelLabel: r.modelLabel,
        modelId: r.modelId,
        prompt: r.prompt ?? undefined,
        fieldValues: jsonRecord(resultObject?.fieldValues),
        imageCount: typeof resultObject?.imageCount === 'number' ? resultObject.imageCount : undefined,
        inputPreviews: jsonStringArray(r.inputImageUrls),
        result: r.result ?? undefined,
        error: r.errorMessage ?? undefined,
      };
    });
  });

export const deleteAiGeneration = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    const userId = userIdFromCtx(context);
    // Delete only the history row — never the underlying generated File, which
    // remains in the user's gallery.
    await ai.deleteAiGeneration(data.id, userId, userId);
    return { success: true };
  });

export const clearCompletedAiGenerations = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(z.object({ kind: z.enum(['generation', 'edit']) }))
  .handler(async ({ data, context }) => {
    const userId = userIdFromCtx(context);
    const deletedCount = await ai.deleteCompletedAiGenerations(userId, data.kind, userId);
    return { deletedCount };
  });

/**
 * Template history. `TemplateGeneration` rows are persisted server-side by the
 * template SSE endpoint; here we map them to the client `TemplateGenerationItem`
 * shape. The DB stores status 'success' which is normalized to 'succeeded'.
 */
export interface TemplateHistoryItem {
  id: string;
  status: 'processing' | 'succeeded' | 'failed';
  progress: number;
  createdAt: number;
  templateId: string;
  templateName: string;
  variableValues: JsonValue;
  inputPreviews: string[];
  batchId: string;
  batchIndex: number;
  result?: { originalImageUrls: string[]; resultImageUrl: string; finalPrompt: string; generationId: string };
  error?: string;
}

export const listTemplateGenerations = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .handler(async ({ context }) => {
    const userId = userIdFromCtx(context);
    const rows = await ai.listTemplateGenerationHistory(userId, HISTORY_LIMIT);
    return rows.map((r): TemplateHistoryItem => {
      const originalImageUrls = jsonStringArray(r.originalImageUrls);
      const resultImageUrl = r.resultFile?.url ? getCDNImage(r.resultFile.url, userId) : null;
      return {
        id: r.id,
        status: r.status === 'failed' ? 'failed' : r.status === 'processing' ? 'processing' : 'succeeded',
        progress: r.status === 'processing' ? 10 : 100,
        createdAt: r.createdAt.getTime(),
        templateId: r.templateId,
        templateName: r.template.name,
        variableValues: r.variableValues ?? {},
        inputPreviews: originalImageUrls,
        batchId: r.id,
        batchIndex: 0,
        result: resultImageUrl ? { originalImageUrls, resultImageUrl, finalPrompt: r.finalPrompt, generationId: r.id } : undefined,
        error: r.errorMessage ?? undefined,
      };
    });
  });

export const deleteTemplateGenerationRow = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    const userId = userIdFromCtx(context);
    // Remove only the history row; the generated File stays in the user's gallery.
    await ai.deleteTemplateGenerationRow(data.id, userId, userId);
    return { success: true };
  });

export const clearCompletedTemplateGenerations = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .handler(async ({ context }) => {
    const userId = userIdFromCtx(context);
    const deletedCount = await ai.deleteCompletedTemplateGenerations(userId, userId);
    return { deletedCount };
  });

export const aiHistoryQueryOptions = (kind: AiHistoryKind) =>
  queryOptions({
    queryKey: kind === 'generation' ? queryKeys.ai.imageGenerationHistory : queryKeys.ai.imageEditHistory,
    queryFn: () => listAiGenerations({ data: { kind } }),
    staleTime: HISTORY_STALE_TIME,
  });

export const templateHistoryQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.ai.templateHistory,
    queryFn: () => listTemplateGenerations(),
    staleTime: HISTORY_STALE_TIME,
  });
