import { createFileRoute } from '@tanstack/react-router';
import Replicate from 'replicate';
import { UPLOAD_CONFIG } from '@/config/upload-config';
import { getEditingModelById } from '@/db/queries/ai';
import { isAbortError, pollReplicatePrediction } from '@/libs/ai-generation-utils';
import { checkScopedRateLimit, retryAfterSeconds } from '@/libs/api/rate-limit';
import { env } from '@/libs/env';
import { ForbiddenError, requireAdmin } from '@/libs/rbac/guards';
import { createSseWriter, eventStreamResponse, SSE_HEARTBEAT_MS } from '@/libs/sse-stream';

const replicate = new Replicate({ auth: env.REPLICATE_API_TOKEN });

const STATUS_MESSAGES = [
  'Processing your image...',
  'AI is working its magic...',
  'Analyzing the composition...',
  'Applying transformations...',
  'Refining the details...',
  'Almost there...',
];

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * Admin-only "sample" generation used to test unsaved template settings.
 *
 * Unlike the user-facing generation, this is ephemeral: input images are sent
 * to Replicate as inline data URIs and the raw prediction output URL is streamed
 * straight back. Nothing is uploaded to S3 or written to the database.
 */
async function handle(request: Request): Promise<Response> {
  let userId: string;
  try {
    const user = await requireAdmin(request.headers);
    userId = user.id;
  } catch (e) {
    return e instanceof ForbiddenError ? json({ error: 'Forbidden' }, 403) : json({ error: 'Unauthorized' }, 401);
  }

  const rl = checkScopedRateLimit('testGenerate', userId);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': retryAfterSeconds(rl.retryAfterMs) },
    });
  }

  const formData = await request.formData();
  const editingModelId = formData.get('editingModelId') as string;
  const finalPrompt = (formData.get('finalPrompt') as string) || '';

  let fieldValues: Record<string, unknown> = {};
  try {
    fieldValues = JSON.parse((formData.get('editingModelFieldValues') as string) || '{}');
  } catch {
    fieldValues = {};
  }

  if (!editingModelId) return json({ error: 'Editing model is required' }, 400);

  const images: File[] = [];
  let i = 0;
  while (true) {
    const f = formData.get(`image_${i}`) as File | null;
    if (!f) break;
    images.push(f);
    i++;
  }
  if (images.length === 0) return json({ error: 'At least one sample image is required' }, 400);
  if (images.some((img) => img.size > UPLOAD_CONFIG.MAX_FILE_SIZE)) {
    return json({ error: `Each image must be at most ${UPLOAD_CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB` }, 413);
  }

  const editingModel = await getEditingModelById(editingModelId);
  if (!editingModel) return json({ error: 'Editing model not found' }, 404);

  const abortController = new AbortController();
  const abortSignal = abortController.signal;
  let predictionId: string | null = null;
  let predictionCanceled = false;
  const cancelPrediction = () => {
    if (!predictionId || predictionCanceled) return;
    predictionCanceled = true;
    void replicate.predictions
      .cancel(predictionId)
      .catch((error: unknown) => console.error('[test-generate] cancel prediction failed', predictionId, error));
  };
  const abortWork = () => {
    if (!abortSignal.aborted) abortController.abort();
    cancelPrediction();
  };

  if (request.signal.aborted) abortWork();
  else request.signal.addEventListener('abort', abortWork, { once: true });

  const dataUris = await Promise.all(
    images.map(async (img) => {
      const buffer = Buffer.from(await img.arrayBuffer());
      return `data:${img.type || 'image/png'};base64,${buffer.toString('base64')}`;
    }),
  );

  const stream = new ReadableStream({
    async start(controller) {
      const { send, close } = createSseWriter(controller, { signal: abortSignal, heartbeatMs: SSE_HEARTBEAT_MS });

      try {
        send({ status: 'processing', progress: 10, message: 'Creating AI prediction...' });

        const input: Record<string, unknown> = { ...fieldValues };
        for (const [key, value] of Object.entries(input)) {
          if (value === '{template_prompt}') input[key] = finalPrompt;
        }
        input[editingModel.imageInputField || 'image_input'] = dataUris;

        const prediction = await replicate.predictions.create({ model: editingModel.apiModelName, input, signal: abortSignal });
        predictionId = prediction.id;
        if (abortSignal.aborted) cancelPrediction();

        let msgIdx = 0;
        const pollResult = await pollReplicatePrediction(replicate, prediction, {
          signal: abortSignal,
          onProgress: ({ retries }) => {
            send({
              status: 'processing',
              progress: Math.round(15 + Math.min(retries * 0.6, 75)),
              message: STATUS_MESSAGES[msgIdx++ % STATUS_MESSAGES.length],
            });
          },
        });
        const finalPrediction = pollResult.prediction;

        if (finalPrediction.status === 'failed') {
          send({
            status: 'failed',
            progress: 100,
            error: typeof finalPrediction.error === 'string' ? finalPrediction.error : 'Generation failed',
          });
          return;
        }
        if (pollResult.timedOut) {
          send({ status: 'failed', progress: 100, error: 'Generation timed out' });
          return;
        }

        const output = Array.isArray(finalPrediction.output) ? finalPrediction.output[0] : finalPrediction.output;
        if (!output) {
          send({ status: 'failed', progress: 100, error: 'No output generated' });
          return;
        }

        send({ status: 'succeeded', progress: 100, resultImageUrl: String(output), finalPrompt });
      } catch (error) {
        if (isAbortError(error) || abortSignal.aborted) return;
        console.error('[test-generate] error:', error);
        send({ status: 'failed', progress: 100, error: 'Generation failed' });
      } finally {
        request.signal.removeEventListener('abort', abortWork);
        close();
      }
    },
    cancel() {
      abortWork();
    },
  });

  return eventStreamResponse(stream);
}

export const Route = createFileRoute('/api/admin/templates/test-generate')({
  server: { handlers: { POST: ({ request }) => handle(request) } },
});
