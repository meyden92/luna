import type { Generation, GenerationOutput } from '@/db/queries/generations';
import type { JsonValue } from '@/db/schema/json';
import { getPrivateSignedUrl } from '@/libs/S3Helper';
import { uploadsExpireAt } from './history-actions';
import type { GenerationProgress, GenerationStatus, MediaKind } from './types';

/**
 * What the browser sees of a Generation: status, progress, cost and Outputs
 * with signed URLs. Server-only (it signs URLs). Never carries the raw fal
 * error detail.
 */

export interface OutputView {
  id: string;
  index: number;
  mediaKind: MediaKind;
  contentType: string;
  /** Signed for an hour; null once expired. */
  url: string | null;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  expiresAt: string;
  expiredAt: string | null;
  savedFileId: string | null;
}

export interface GenerationView {
  id: string;
  name: string;
  /** The `prompt` the User entered, if the form had one. */
  prompt: string | null;
  modelId: string | null;
  templateId: string | null;
  /** Its values fill a Template's form: it never becomes a Template itself. */
  fromTemplate: boolean;
  /** When fal deletes its first upload; *Again* and *Retry* fall back to *Use settings* after. */
  uploadsExpireAt: string | null;
  status: GenerationStatus;
  progress: GenerationProgress | null;
  error: { message: string; type: string | null } | null;
  estimatedCostUsd: number | null;
  actualCostUsd: number | null;
  createdAt: string;
  completedAt: string | null;
  seenAt: string | null;
  outputs: OutputView[];
}

const OUTPUT_URL_TTL_SECONDS = 3600;

export async function toGenerationView(row: Generation, outputs: GenerationOutput[]): Promise<GenerationView> {
  return {
    id: row.id,
    name: row.name,
    prompt: typeof row.formValues.prompt === 'string' ? row.formValues.prompt : null,
    modelId: row.modelId,
    templateId: row.templateId,
    fromTemplate: row.fromTemplate,
    uploadsExpireAt: uploadsExpireAt(row.formValues as Record<string, JsonValue>),
    status: row.status,
    progress: row.progress,
    error: row.error ? { message: row.error.message, type: row.error.type ?? null } : null,
    estimatedCostUsd: row.estimatedCostUsd,
    actualCostUsd: row.actualCostUsd,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    seenAt: row.seenAt?.toISOString() ?? null,
    outputs: await Promise.all(
      outputs.map(async (output) => ({
        id: output.id,
        index: output.index,
        mediaKind: output.mediaKind,
        contentType: output.contentType,
        url: output.expiredAt ? null : await getPrivateSignedUrl(output.s3Key, OUTPUT_URL_TTL_SECONDS),
        sizeBytes: output.sizeBytes,
        width: output.width,
        height: output.height,
        durationSeconds: output.durationSeconds,
        expiresAt: output.expiresAt.toISOString(),
        expiredAt: output.expiredAt?.toISOString() ?? null,
        savedFileId: output.savedFileId,
      })),
    ),
  };
}
