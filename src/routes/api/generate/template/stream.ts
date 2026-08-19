import crypto from 'node:crypto';
import { createFileRoute } from '@tanstack/react-router';
import Replicate, { type Prediction } from 'replicate';
import { UPLOAD_CONFIG } from '@/config/upload-config';
import { getActiveTemplateForGeneration, markTemplateGenerationsFailed, upsertTemplateGeneration } from '@/db/queries/ai';
import type { JsonValue } from '@/db/schema/json';
import {
  createPredictionAbortRegistry,
  createSseWriter,
  eventStreamResponse,
  firstReplicateOutput,
  isAbortError,
  pollReplicatePrediction,
  processCachedImages,
  throwIfAborted,
  uploadGeneratedImageErrorMessage,
  uploadGeneratedImageToS3,
} from '@/libs/ai-generation-utils';
import { checkScopedRateLimit, retryAfterSeconds } from '@/libs/api/rate-limit';
import { env } from '@/libs/env';
import { requireAuthenticatedUser } from '@/libs/rbac/guards';
import type { TemplateVariable } from '@/types/template';

const replicate = new Replicate({ auth: env.REPLICATE_API_TOKEN });

const STATUS_MESSAGES = [
  'Processing your image...',
  'AI is working its magic...',
  'Analyzing the composition...',
  'Applying transformations...',
  'Refining the details...',
  'Almost there...',
];

function parseGenerationIds(value: FormDataEntryValue | null, count: number): string[] {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return Array.from({ length: count }, (_, index) => {
          const id = parsed[index];
          return typeof id === 'string' && id.length > 0 ? id : crypto.randomUUID();
        });
      }
    } catch {
      /* fall back to generated IDs */
    }
  }

  return Array.from({ length: count }, () => crypto.randomUUID());
}

type TemplateVariableOption = NonNullable<TemplateVariable['options']>[number];

function cloneTemplateVariableOptions(value: JsonValue | null): TemplateVariableOption[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return JSON.parse(JSON.stringify(value)) as TemplateVariableOption[];
}

async function handle(request: Request): Promise<Response> {
  let user: { id: string; email: string };
  try {
    const u = await requireAuthenticatedUser(request.headers);
    user = { id: u.id, email: u.email };
  } catch {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const rl = checkScopedRateLimit('generateTemplate', user.id);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': retryAfterSeconds(rl.retryAfterMs) },
    });
  }

  const formData = await request.formData();
  const templateId = formData.get('templateId') as string;
  const imageCount = Number.parseInt((formData.get('imageCount') as string) || '1', 10);
  const batchId = (formData.get('batchId') as string) || crypto.randomUUID();
  const generationIds = parseGenerationIds(formData.get('generationIds'), imageCount);

  if (!templateId)
    return new Response(JSON.stringify({ error: 'Template ID is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  if (imageCount < 1 || imageCount > 4)
    return new Response(JSON.stringify({ error: 'Image count must be between 1 and 4' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });

  const template = await getActiveTemplateForGeneration(templateId);
  if (!template)
    return new Response(JSON.stringify({ error: 'Template not found or inactive' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  if (!template.editingModel)
    return new Response(JSON.stringify({ error: 'Template has no editing model configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });

  const images: File[] = [];
  let i = 0;
  while (true) {
    const f = formData.get(`originalImage_${i}`) as File | null;
    if (!f) break;
    images.push(f);
    i++;
  }
  if (images.length === 0)
    return new Response(JSON.stringify({ error: 'At least one image is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  if (images.length < template.inputImageCount) {
    return new Response(JSON.stringify({ error: `This template requires ${template.inputImageCount} reference image(s)` }), {
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

  const predictionAbort = createPredictionAbortRegistry(
    request.signal,
    (predictionId) => replicate.predictions.cancel(predictionId),
    '[template]',
  );
  const { signal: abortSignal, registerPrediction, abortWork } = predictionAbort;

  const stream = new ReadableStream({
    async start(controller) {
      const { send, close } = createSseWriter(controller, {
        signal: abortSignal,
        mapPayload: (data) => ({ ...(data as object), batchId }),
      });

      try {
        send({ status: 'uploading', progress: 0, message: 'Preparing images...' });
        const { imageUrls } = await processCachedImages({
          images,
          userId: user.id,
          send,
          purpose: 'template-edit',
          logPrefix: '[template]',
          signal: abortSignal,
          cacheControl: 'public, max-age=31536000, immutable',
        });

        const templateVariables: TemplateVariable[] = Array.isArray(template.variables)
          ? [...(template.variables as unknown as TemplateVariable[])]
          : [];

        for (const tgv of template.globalVariables ?? []) {
          const gv = tgv.globalVariable;
          const added = cloneTemplateVariableOptions(tgv.addedOptions);
          const opts = cloneTemplateVariableOptions(gv.options);
          if (added.length > 0) opts.push(...added);
          templateVariables.push({
            id: `global-${gv.id}`,
            name: gv.name,
            label: gv.label,
            type: gv.type as TemplateVariable['type'],
            required: tgv.required ?? gv.required,
            options: opts,
            defaultValue: gv.defaultValue,
            description: gv.description,
          });
        }

        const variableValues: Record<string, unknown> = {};
        let finalPrompt = template.prompt;
        const persistGeneration = async (
          index: number,
          data: {
            status: 'processing' | 'success' | 'failed';
            finalPrompt: string;
            errorMessage?: string;
            replicateId?: string;
            replicateStatus?: string;
            resultFileId?: string | null;
          },
        ): Promise<string> => {
          throwIfAborted(abortSignal);
          const generationId = generationIds[index] ?? crypto.randomUUID();
          // One statement per progress step, never a transaction spanning the
          // stream: this runs repeatedly over the minutes a prediction polls,
          // and a transaction open that long would pin a connection for it.
          await upsertTemplateGeneration(
            {
              id: generationId,
              templateId,
              userId: user.id,
              variableValues: variableValues as JsonValue,
              finalPrompt: data.finalPrompt,
              status: data.status,
              errorMessage: data.errorMessage ?? null,
              // Omitted rather than nulled when absent, so a later progress
              // write cannot erase the prediction id recorded earlier.
              replicateId: data.replicateId,
              replicateStatus: data.replicateStatus,
              originalImageUrls: imageUrls as JsonValue,
              resultFileId: data.resultFileId,
            },
            user.id,
          ).catch((e: unknown) => console.error('[template] persist failed', e));
          return generationId;
        };
        const persistBatchFailure = async (errorMessage: string) => {
          await Promise.all(
            generationIds.map((_, index) =>
              persistGeneration(index, {
                status: 'failed',
                finalPrompt,
                errorMessage,
                resultFileId: null,
              }),
            ),
          );
        };
        for (const v of templateVariables) {
          const value = formData.get(`variable_${v.name}`);
          if (v.type === 'boolean') variableValues[v.name] = value === 'true';
          else if (v.type === 'number') variableValues[v.name] = value ? Number.parseInt(value as string, 10) : 0;
          else variableValues[v.name] = value || '';

          if (v.required && (!value || (typeof value === 'string' && value.trim() === ''))) {
            send({ status: 'failed', error: `Variable '${v.label}' is required` });
            await persistBatchFailure(`Variable '${v.label}' is required`);
            close();
            return;
          }
        }

        for (const [n, v] of Object.entries(variableValues)) {
          const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          finalPrompt = finalPrompt.replace(new RegExp(`\\{${escaped}\\}`, 'g'), () => String(v));
        }

        const validatedInput: Record<string, unknown> = {};
        const configured =
          template.editingModelFieldValues && typeof template.editingModelFieldValues === 'object'
            ? (template.editingModelFieldValues as Record<string, unknown>)
            : {};
        Object.assign(validatedInput, configured);
        for (const [k, v] of Object.entries(validatedInput)) {
          if (v === '{template_prompt}') validatedInput[k] = finalPrompt;
        }

        const editingModel = template.editingModel!;
        validatedInput[editingModel.imageInputField || 'image_input'] = imageUrls;

        await Promise.all(
          generationIds.map((_, index) =>
            persistGeneration(index, {
              status: 'processing',
              finalPrompt,
              resultFileId: null,
            }),
          ),
        );

        send({ status: 'processing', progress: 15, message: 'Creating AI predictions...' });

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

        await Promise.all(
          predictions.map(({ prediction, index }) =>
            persistGeneration(index, {
              status: 'processing',
              finalPrompt,
              replicateId: prediction.id,
              replicateStatus: 'streaming',
              resultFileId: null,
            }),
          ),
        );

        const results: Array<Record<string, unknown>> = new Array(imageCount);
        let completedCount = 0;
        let msgIdx = 0;
        const pollPrediction = async ({ prediction, index }: { prediction: Prediction; index: number }): Promise<void> => {
          let finalPrediction = prediction;
          try {
            const pollResult = await pollReplicatePrediction(replicate, prediction, {
              signal: abortSignal,
              onProgress: ({ prediction: progressPrediction }) => {
                finalPrediction = progressPrediction;
                msgIdx++;
              },
            });
            finalPrediction = pollResult.prediction;

            if (finalPrediction.status === 'failed') {
              const error = finalPrediction.error || 'Unknown error';
              const generationId = await persistGeneration(index, {
                status: 'failed',
                finalPrompt,
                errorMessage: String(error),
                replicateId: finalPrediction.id,
                replicateStatus: finalPrediction.status,
                resultFileId: null,
              });
              results[index] = { index, generationId, error, success: false };
            } else if (pollResult.timedOut) {
              const generationId = await persistGeneration(index, {
                status: 'failed',
                finalPrompt,
                errorMessage: 'Generation timed out',
                replicateId: finalPrediction.id,
                replicateStatus: finalPrediction.status,
                resultFileId: null,
              });
              results[index] = { index, generationId, error: 'Generation timed out', success: false };
            } else {
              const outputUrl = firstReplicateOutput(finalPrediction.output);
              if (finalPrediction.status !== 'succeeded' || !outputUrl) {
                const generationId = await persistGeneration(index, {
                  status: 'failed',
                  finalPrompt,
                  errorMessage: 'No output generated',
                  replicateId: finalPrediction.id,
                  replicateStatus: finalPrediction.status,
                  resultFileId: null,
                });
                results[index] = { index, generationId, error: 'No output generated', success: false };
              } else {
                try {
                  throwIfAborted(abortSignal);
                  send({ status: 'uploading', progress: 90, message: 'Saving result...' });
                  const ts = Date.now();
                  const slug = template.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                  const fname = `template_${slug}_${ts}_${index + 1}.png`;
                  const { url, fileId } = await uploadGeneratedImageToS3({
                    imageUrl: outputUrl,
                    fileName: fname,
                    userId: user.id,
                    tags: `template, ${template.name}, ai`,
                    title: `ai-${fname}`,
                    signal: abortSignal,
                    logPrefix: '[template]',
                  });
                  const generationId = await persistGeneration(index, {
                    status: 'success',
                    finalPrompt,
                    replicateId: finalPrediction.id,
                    replicateStatus: finalPrediction.status,
                    resultFileId: fileId,
                  });
                  results[index] = { index, originalImageUrls: imageUrls, resultImageUrl: url, generationId, success: true };
                } catch (error) {
                  if (isAbortError(error) || abortSignal.aborted) throw error;
                  console.error('Error uploading result:', error);
                  const errorMessage = uploadGeneratedImageErrorMessage(error, 'Failed to save generated image');
                  const generationId = await persistGeneration(index, {
                    status: 'failed',
                    finalPrompt,
                    errorMessage,
                    replicateId: finalPrediction.id,
                    replicateStatus: finalPrediction.status,
                    resultFileId: null,
                  });
                  results[index] = { index, generationId, error: errorMessage, success: false };
                }
              }
            }
          } catch (error) {
            if (isAbortError(error) || abortSignal.aborted) throw error;
            console.error('[template] poll failed:', error);
            const generationId = await persistGeneration(index, {
              status: 'failed',
              finalPrompt,
              errorMessage: 'Generation failed',
              replicateId: finalPrediction.id,
              replicateStatus: finalPrediction.status,
              resultFileId: null,
            });
            results[index] = { index, generationId, error: 'Generation failed', success: false };
          } finally {
            if (!abortSignal.aborted) {
              completedCount++;
              send({
                status: 'processing',
                progress: 20 + Math.round((completedCount / imageCount) * 65),
                message: STATUS_MESSAGES[msgIdx % STATUS_MESSAGES.length],
                completedCount,
                totalPredictions: imageCount,
              });
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
          originalImageUrls: imageUrls,
          finalPrompt,
          templateId: template.id,
          templateName: template.name,
        });
      } catch (error) {
        if (isAbortError(error) || abortSignal.aborted) {
          await markTemplateGenerationsFailed(
            { ids: generationIds, ownerId: user.id, errorMessage: 'Generation was cancelled' },
            user.id,
          ).catch((e: unknown) => console.error('[template] persist cancellation failed', e));
          return;
        }
        console.error('[template stream] error:', error);
        send({ status: 'failed', progress: 100, error: 'Generation failed' });
        await markTemplateGenerationsFailed({ ids: generationIds, ownerId: user.id, errorMessage: 'Generation failed' }, user.id).catch(
          (e: unknown) => console.error('[template] persist failure failed', e),
        );
      } finally {
        predictionAbort.cleanup();
        close();
      }
    },
    cancel() {
      abortWork();
    },
  });

  return eventStreamResponse(stream);
}

export const Route = createFileRoute('/api/generate/template/stream')({
  server: { handlers: { POST: ({ request }) => handle(request) } },
});
