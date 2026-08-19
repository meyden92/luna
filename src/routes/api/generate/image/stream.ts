import crypto from 'node:crypto';
import { createFileRoute } from '@tanstack/react-router';
import Replicate from 'replicate';
import { z } from 'zod';
import { getActiveGenerationModel, markAiGenerationCancelled, upsertAiGeneration } from '@/db/queries/ai';
import type { JsonValue } from '@/db/schema/json';
import {
  createPredictionAbortRegistry,
  createSseWriter,
  eventStreamResponse,
  isAbortError,
  normalizeReplicateOutput,
  pollReplicatePrediction,
  throwIfAborted,
  uploadGeneratedImageErrorMessage,
  uploadGeneratedImageToS3,
  validateAiModelFields,
} from '@/libs/ai-generation-utils';
import { checkScopedRateLimit, retryAfterSeconds } from '@/libs/api/rate-limit';
import { env } from '@/libs/env';
import { requireAuthenticatedUser } from '@/libs/rbac/guards';

const replicate = new Replicate({ auth: env.REPLICATE_API_TOKEN });

const STATUS_MESSAGES = [
  'Generating your image...',
  'AI is working its magic...',
  'Analyzing the composition...',
  'Crafting visual elements...',
  'Refining the details...',
  'Almost there...',
];

const generateImageBodySchema = z
  .object({
    generationModelId: z.string().min(1),
    generationId: z.preprocess((value) => (typeof value === 'string' && value.length > 0 ? value : undefined), z.string().optional()),
    prompt: z.preprocess((value) => (typeof value === 'string' ? value : ''), z.string()),
  })
  .catchall(z.unknown());

type GenerateImageBody = z.infer<typeof generateImageBodySchema>;

function collectModelFieldInput(fields: Array<{ name: string }>, body: GenerateImageBody): Record<string, unknown> {
  const input: Record<string, unknown> = {};

  for (const field of fields) {
    if (Object.hasOwn(body, field.name)) {
      input[field.name] = body[field.name];
    }
  }

  return input;
}

async function handle(request: Request): Promise<Response> {
  let user: { id: string; email: string };
  try {
    const u = await requireAuthenticatedUser(request.headers);
    user = { id: u.id, email: u.email };
  } catch {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const rl = checkScopedRateLimit('generateImage', user.id);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': retryAfterSeconds(rl.retryAfterMs) },
    });
  }

  const parsedBody = generateImageBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return new Response(JSON.stringify({ error: 'generationModelId is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = parsedBody.data;
  const generationModelId = body.generationModelId;
  const generationId = body.generationId ?? crypto.randomUUID();
  const prompt = body.prompt;

  const generationModel = await getActiveGenerationModel(generationModelId);
  if (!generationModel) {
    return new Response(JSON.stringify({ error: 'Generation model not found or inactive' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const rawInput = collectModelFieldInput(generationModel.fields ?? [], body);

  const predictionAbort = createPredictionAbortRegistry(
    request.signal,
    (predictionId) => replicate.predictions.cancel(predictionId),
    '[generate-image]',
  );
  const { signal: abortSignal, registerPrediction, abortWork } = predictionAbort;

  const stream = new ReadableStream({
    async start(controller) {
      const { send, close } = createSseWriter(controller, { signal: abortSignal });
      const requestSnapshot = { fieldValues: rawInput };
      const withRequestSnapshot = (result?: JsonValue): JsonValue => {
        if (result && typeof result === 'object' && !Array.isArray(result)) {
          return { ...result, ...requestSnapshot } as JsonValue;
        }
        return requestSnapshot as JsonValue;
      };
      // One statement per progress step, never a transaction spanning the
      // stream: a transaction held open for the minutes this poll runs would
      // pin a connection and block vacuum for its whole duration.
      const persist = async (status: string, errorMessage: string | null, result?: JsonValue) => {
        throwIfAborted(abortSignal);
        await upsertAiGeneration(
          {
            id: generationId,
            kind: 'generation',
            userId: user.id,
            modelId: generationModelId,
            modelLabel: generationModel.label,
            prompt,
            status,
            errorMessage,
            result: withRequestSnapshot(result),
          },
          user.id,
        ).catch((e: unknown) => console.error('[generate-image] persist failed', e));
      };
      const persistProcessing = () => persist('processing', null);
      const persistTerminal = (status: 'succeeded' | 'failed', errorMessage?: string, result?: JsonValue) =>
        persist(status, errorMessage ?? null, result);
      const fail = async (error: string) => {
        send({ status: 'failed', progress: 100, error });
        await persistTerminal('failed', error);
      };
      const persistCancelled = async () => {
        await markAiGenerationCancelled(generationId, user.id, user.id).catch((e: unknown) =>
          console.error('[generate-image] persist cancellation failed', e),
        );
      };

      try {
        await persistProcessing();
        send({ status: 'processing', progress: 5, message: 'Validating input...' });

        const validation = validateAiModelFields(generationModel.fields ?? [], (fieldName) => rawInput[fieldName]);
        if (!validation.ok) {
          await fail(validation.error);
          close();
          return;
        }
        const validatedInput = validation.input;

        send({ status: 'processing', progress: 10, message: 'Creating AI prediction...' });

        const prediction = await replicate.predictions.create({
          model: generationModel.apiModelName,
          input: validatedInput,
          signal: abortSignal,
        });
        registerPrediction(prediction.id);

        let msgIdx = 0;
        const pollResult = await pollReplicatePrediction(replicate, prediction, {
          signal: abortSignal,
          onProgress: ({ retries: currentRetries }) => {
            const progress = 15 + Math.min(currentRetries * 0.5, 70);
            send({
              status: 'processing',
              progress: Math.round(progress),
              message: STATUS_MESSAGES[msgIdx % STATUS_MESSAGES.length],
            });
            msgIdx++;
          },
        });

        const finalPrediction = pollResult.prediction;

        if (finalPrediction.status === 'failed') {
          const error = finalPrediction.error || 'Generation failed';
          send({ status: 'failed', progress: 100, error });
          await persistTerminal('failed', String(error));
          close();
          return;
        }
        if (pollResult.timedOut) {
          send({ status: 'failed', progress: 100, error: 'Generation timed out' });
          await persistTerminal('failed', 'Generation timed out');
          close();
          return;
        }
        const outputUrls = normalizeReplicateOutput(finalPrediction.output);
        if (finalPrediction.status !== 'succeeded' || outputUrls.length === 0) {
          send({ status: 'failed', progress: 100, error: 'No output generated' });
          await persistTerminal('failed', 'No output generated');
          close();
          return;
        }

        const results: Array<{ index: number; resultImageUrl?: string; success?: boolean; error?: string }> = [];

        send({ status: 'processing', progress: 85, message: 'Saving results...' });

        for (let i = 0; i < outputUrls.length; i++) {
          const imageUrl = outputUrls[i];
          throwIfAborted(abortSignal);
          if (!imageUrl) continue;
          try {
            const ts = Date.now();
            const slug = generationModel.apiModelName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const filename = `${slug}_result_${ts}_${i + 1}.png`;
            const { url } = await uploadGeneratedImageToS3({
              imageUrl,
              fileName: filename,
              userId: user.id,
              tags: `image-generation, ${generationModel.label}, ai`,
              title: `ai-${filename}`,
              signal: abortSignal,
              logPrefix: '[generate-image]',
            });
            results.push({ index: i + 1, resultImageUrl: url, success: true });
          } catch (error) {
            if (isAbortError(error) || abortSignal.aborted) throw error;
            results.push({ index: i + 1, error: uploadGeneratedImageErrorMessage(error, 'Failed to upload generated image') });
          }
        }

        const successCount = results.filter((r) => r.success).length;
        const finalError = results.find((r) => r.error)?.error ?? (successCount > 0 ? undefined : 'Failed to upload generated image');
        send({
          status: successCount > 0 ? 'succeeded' : 'failed',
          progress: 100,
          error: finalError,
          results,
          successCount,
          totalCount: outputUrls.length,
          model: generationModel.label,
          modelId: generationModel.id,
        });

        await persistTerminal(successCount > 0 ? 'succeeded' : 'failed', finalError, {
          results,
          successCount,
          totalCount: outputUrls.length,
          model: generationModel.label,
        } as JsonValue);
      } catch (err) {
        if (isAbortError(err) || abortSignal.aborted) {
          await persistCancelled();
          return;
        }
        console.error('[generate-image] error:', err);
        send({ status: 'failed', progress: 100, error: 'Generation failed' });

        await persistTerminal('failed', 'Generation failed');
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

export const Route = createFileRoute('/api/generate/image/stream')({
  server: { handlers: { POST: ({ request }) => handle(request) } },
});
