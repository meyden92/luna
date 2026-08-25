import crypto from 'node:crypto';
import { createFileRoute } from '@tanstack/react-router';
import Replicate, { type Prediction } from 'replicate';
import { UPLOAD_CONFIG } from '@/config/upload-config';
import { getActiveEditingModel, markAiGenerationCancelled, upsertAiGeneration } from '@/db/queries/ai';
import type { JsonValue } from '@/db/schema/json';
import {
  firstReplicateOutput,
  isAbortError,
  pollReplicatePrediction,
  processCachedImages,
  throwIfAborted,
  uploadGeneratedImageErrorMessage,
  uploadGeneratedImageToS3,
  validateAiModelFields,
} from '@/libs/ai-generation-utils';
import { checkScopedRateLimit, retryAfterSeconds } from '@/libs/api/rate-limit';
import { env } from '@/libs/env';
import { requireAuthenticatedUser } from '@/libs/rbac/guards';
import { createPredictionAbortRegistry, createSseWriter, eventStreamResponse, SSE_HEARTBEAT_MS } from '@/libs/sse-stream';

const replicate = new Replicate({ auth: env.REPLICATE_API_TOKEN });

const STATUS_MESSAGES = [
  'Processing your image...',
  'AI is working its magic...',
  'Analyzing the composition...',
  'Applying transformations...',
  'Refining the details...',
  'Almost there...',
];

type EditImageResult = {
  index: number;
  originalImageUrl?: string[];
  resultImageUrl?: string;
  success?: boolean;
  error?: string;
};

async function handle(request: Request): Promise<Response> {
  let user: { id: string; email: string };
  try {
    const u = await requireAuthenticatedUser(request.headers);
    user = { id: u.id, email: u.email };
  } catch {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const rl = checkScopedRateLimit('generateEditImage', user.id);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': retryAfterSeconds(rl.retryAfterMs) },
    });
  }

  const formData = await request.formData();
  const editingModelId = formData.get('editingModelId') as string;
  const imageCount = Number.parseInt((formData.get('imageCount') as string) || '1', 10);
  const generationId = (formData.get('generationId') as string) || crypto.randomUUID();

  if (!editingModelId) {
    return new Response(JSON.stringify({ error: 'Editing model ID is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (imageCount < 1 || imageCount > 4) {
    return new Response(JSON.stringify({ error: 'Image count must be between 1 and 4' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const editingModel = await getActiveEditingModel(editingModelId);
  if (!editingModel) {
    return new Response(JSON.stringify({ error: 'Editing model not found or inactive' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const images: File[] = [];
  let i = 0;
  while (true) {
    const f = formData.get(`originalImage_${i}`) as File | null;
    if (!f) break;
    images.push(f);
    i++;
  }
  if (images.length === 0) {
    return new Response(JSON.stringify({ error: 'At least one image is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (images.length > 5) {
    return new Response(JSON.stringify({ error: 'Maximum 5 images allowed' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (images.some((img) => img.size > UPLOAD_CONFIG.MAX_FILE_SIZE)) {
    return new Response(JSON.stringify({ error: `Each image must be at most ${UPLOAD_CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB` }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const requestFieldValues: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('field_') && typeof value === 'string') {
      requestFieldValues[key.slice('field_'.length)] = value;
    }
  }

  const predictionAbort = createPredictionAbortRegistry(
    request.signal,
    (predictionId) => replicate.predictions.cancel(predictionId),
    '[edit-image]',
  );
  const { signal: abortSignal, registerPrediction, handleDisconnect } = predictionAbort;

  const stream = new ReadableStream({
    async start(controller) {
      const { send, close } = createSseWriter(controller, { signal: abortSignal, heartbeatMs: SSE_HEARTBEAT_MS });
      const requestSnapshot = { fieldValues: requestFieldValues, imageCount };
      const withRequestSnapshot = (result?: JsonValue): JsonValue => {
        if (result && typeof result === 'object' && !Array.isArray(result)) {
          return { ...result, ...requestSnapshot } as JsonValue;
        }
        return requestSnapshot as JsonValue;
      };
      // One statement per progress step, never a transaction spanning the
      // stream: a transaction held open for the minutes this poll runs would
      // pin a connection and block vacuum for its whole duration.
      const persist = async (status: string, imageUrls: string[] | undefined, errorMessage: string | null, result?: JsonValue) => {
        throwIfAborted(abortSignal);
        await upsertAiGeneration(
          {
            id: generationId,
            kind: 'edit',
            userId: user.id,
            modelId: editingModelId,
            modelLabel: editingModel.label,
            // `undefined` leaves the stored previews alone, matching the
            // semantics the Prisma upsert had — a later write must not erase
            // the input previews recorded earlier in the same stream.
            inputImageUrls: imageUrls as JsonValue | undefined,
            status,
            errorMessage,
            result: withRequestSnapshot(result),
          },
          user.id,
        ).catch((e: unknown) => console.error('[edit-image] persist failed', e));
      };
      const persistProcessing = (imageUrls?: string[]) => persist('processing', imageUrls, null);
      const persistTerminal = (
        status: 'succeeded' | 'failed',
        imageUrls: string[] | undefined,
        errorMessage?: string,
        result?: JsonValue,
      ) => persist(status, imageUrls, errorMessage ?? null, result);
      const persistCancelled = async () => {
        await markAiGenerationCancelled(generationId, user.id, user.id).catch((e: unknown) =>
          console.error('[edit-image] persist cancellation failed', e),
        );
      };

      let imageUrls: string[] | undefined;

      try {
        await persistProcessing();
        send({ status: 'uploading', progress: 0, message: 'Preparing images...' });
        imageUrls = (
          await processCachedImages({
            images,
            userId: user.id,
            send,
            purpose: 'image-edit',
            logPrefix: '[edit-image]',
            signal: abortSignal,
            useCombinedCache: true,
          })
        ).imageUrls;
        await persistProcessing(imageUrls);

        const validation = validateAiModelFields(editingModel.fields ?? [], (fieldName) => formData.get(`field_${fieldName}`));
        if (!validation.ok) {
          send({ status: 'failed', error: validation.error });
          await persistTerminal('failed', imageUrls, validation.error);
          close();
          return;
        }
        const validatedInput = validation.input;
        validatedInput.image_input = imageUrls;

        send({ status: 'processing', progress: 15, message: 'Creating AI prediction...' });

        const predictions = await Promise.all(
          Array.from({ length: imageCount }, async (_, index): Promise<{ prediction: Prediction; index: number }> => {
            const prediction = await replicate.predictions.create({
              model: editingModel.apiModelName,
              input: validatedInput,
              signal: abortSignal,
            });
            registerPrediction(prediction.id);
            throwIfAborted(abortSignal);
            return { prediction, index };
          }),
        );

        const results: EditImageResult[] = new Array(imageCount);
        let completedCount = 0;
        let msgIdx = 0;
        // Progress tracks predictions settled, not polls, so a poll tick only
        // rotates the status message — it must not invent a percentage.
        const sendPollProgress = () =>
          send({
            status: 'processing',
            progress: 20 + Math.round((completedCount / imageCount) * 65),
            message: STATUS_MESSAGES[msgIdx % STATUS_MESSAGES.length],
            completedCount,
            totalPredictions: imageCount,
          });
        const pollPrediction = async ({ prediction, index }: { prediction: Prediction; index: number }): Promise<void> => {
          let finalPrediction = prediction;
          try {
            const pollResult = await pollReplicatePrediction(replicate, prediction, {
              signal: abortSignal,
              onProgress: () => {
                msgIdx++;
                sendPollProgress();
              },
            });
            finalPrediction = pollResult.prediction;

            if (finalPrediction.status === 'failed') {
              results[index] = {
                index: index + 1,
                error: typeof finalPrediction.error === 'string' ? finalPrediction.error : 'Unknown error',
              };
            } else if (pollResult.timedOut) {
              results[index] = { index: index + 1, error: 'Generation timed out' };
            } else {
              const outputUrl = firstReplicateOutput(finalPrediction.output);
              if (finalPrediction.status !== 'succeeded' || !outputUrl) {
                results[index] = { index: index + 1, error: 'No output generated' };
              } else {
                try {
                  throwIfAborted(abortSignal);
                  send({ status: 'uploading', progress: 90, message: 'Saving result...' });
                  const ts = Date.now();
                  const slug = editingModel.apiModelName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                  const fname = `${slug}_result_${ts}_${index + 1}.png`;
                  const { url } = await uploadGeneratedImageToS3({
                    imageUrl: outputUrl,
                    fileName: fname,
                    userId: user.id,
                    tags: `image-editing, ${editingModel.label}, ai`,
                    title: `ai-${fname}`,
                    signal: abortSignal,
                    logPrefix: '[edit-image]',
                  });
                  results[index] = { index: index + 1, originalImageUrl: imageUrls, resultImageUrl: url, success: true };
                } catch (error) {
                  if (isAbortError(error) || abortSignal.aborted) throw error;
                  results[index] = { index: index + 1, error: uploadGeneratedImageErrorMessage(error, 'Failed to upload generated image') };
                }
              }
            }
          } catch (error) {
            if (isAbortError(error) || abortSignal.aborted) throw error;
            console.error('[edit-image] poll failed:', error);
            results[index] = { index: index + 1, error: 'Generation failed' };
          } finally {
            if (!abortSignal.aborted) {
              completedCount++;
              sendPollProgress();
            }
          }
        };

        const pollResults = await Promise.allSettled(predictions.map((entry) => pollPrediction(entry)));
        const abortRejection = pollResults.find(
          (result): result is PromiseRejectedResult => result.status === 'rejected' && (isAbortError(result.reason) || abortSignal.aborted),
        );
        if (abortRejection) throw abortRejection.reason;

        const successCount = results.filter((r) => r.success).length;
        const finalError = results.find((r) => r.error)?.error ?? (successCount > 0 ? undefined : 'Generation failed');
        send({
          status: successCount > 0 ? 'succeeded' : 'failed',
          progress: 100,
          error: finalError,
          results,
          successCount,
          totalCount: imageCount,
          originalImageUrl: imageUrls,
          model: editingModel.label,
          modelId: editingModel.id,
        });

        await persistTerminal(successCount > 0 ? 'succeeded' : 'failed', imageUrls, finalError, {
          originalImageUrl: imageUrls,
          results,
          successCount,
          totalCount: imageCount,
          model: editingModel.label,
        } as JsonValue);
      } catch (error) {
        if (isAbortError(error) || abortSignal.aborted) {
          await persistCancelled();
          return;
        }
        console.error('[edit-image stream] error:', error);
        send({
          status: 'failed',
          progress: 100,
          error: 'Generation failed',
        });

        await persistTerminal('failed', imageUrls, 'Generation failed');
      } finally {
        predictionAbort.cleanup();
        close();
      }
    },
    cancel() {
      handleDisconnect();
    },
  });

  return eventStreamResponse(stream);
}

export const Route = createFileRoute('/api/generate/edit-image/stream')({
  server: { handlers: { POST: ({ request }) => handle(request) } },
});
