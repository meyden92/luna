import { randomUUID } from 'node:crypto';
import { CopyObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getOwnedFile } from '@/db/queries/files';
import {
  admitGeneration,
  completeGeneration,
  failUnsubmittedGenerations,
  type Generation,
  getActiveStudioModel,
  getActiveStudioTemplate,
  getGeneration,
  getOwnedGeneration,
  getOwnedOutput,
  getStudioModel,
  listExpiredOutputs,
  listGenerationOutputs,
  listGenerationsToPoll,
  markGenerationCancelled,
  markOutputsExpired,
  type StoredOutput,
  type StudioModel,
  type StudioTemplate,
  saveOutputAsFile,
  setGenerationSubmitted,
  updateGenerationProgress,
} from '@/db/queries/studio';
import type { JsonValue } from '@/db/schema/json';
import { throwIfAborted } from '@/libs/abort';
import { env } from '@/libs/env';
import { FalError } from '@/libs/fal/client';
import { fileS3Key, s3Client } from '@/libs/S3Helper';
import { UserFacingError } from '@/libs/user-facing-error';
import { assertStudioEnabled, falClient, isStudioEnabled, studioWebhookTarget } from './config';
import { estimateCost } from './cost';
import { hasStudioListeners, publishStudioEvent } from './events';
import { extractOutputs, mediaKindOf, outputExtension } from './outputs';
import { buildRequestInput, isFileField, isFileRef, type RequestInput, RequestValidationError } from './request';
import type { FieldConfig, FileRef, GenerationError } from './types';
import { type GenerationView, toGenerationView } from './views';

/**
 * The server-side Generation pipeline: submit, poll, finish,
 * cancel, retry, Save to Files and the expiry sweep. Server-only.
 *
 * A Generation lives in the database, not in a browser request: fal delivers
 * the result by webhook when it can reach this instance, and the poller
 * finishes everything else, also after a restart. `finishGeneration` is the
 * one path both take, and it is idempotent.
 */

/** fal keeps uploaded inputs this long. */
const INPUT_LIFETIME_SECONDS = 24 * 60 * 60;
/** Unsaved Outputs are deleted after this. */
export const OUTPUT_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_INPUT_BYTES = 100 * 1024 * 1024;
/** A Generation recorded but not yet on fal after this was cut off by a restart. */
const SUBMISSION_GRACE_MS = 10 * 60 * 1000;
/** With webhooks on, the poller only checks Generations this old. */
const WEBHOOK_GRACE_MS = 2 * 60 * 1000;
const POLL_INTERVAL_MS = 3_000;
const WEBHOOK_POLL_INTERVAL_MS = 60_000;
const OUTPUT_DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;
/** Failed attempts to copy a result to S3 before the Generation is failed. */
const MAX_STORE_ATTEMPTS = 5;

/**
 * Process-wide pipeline state, on `globalThis` for the same reason as the
 * event listeners: the Nitro plugin and the routes may load separate module
 * instances in dev.
 */
const registry = globalThis as typeof globalThis & { __lunashareStudioPipeline?: PipelineState };
registry.__lunashareStudioPipeline ??= { finishing: new Set(), storeFailures: new Map(), poller: undefined, polling: false };
const state = registry.__lunashareStudioPipeline;

interface PipelineState {
  finishing: Set<string>;
  storeFailures: Map<string, number>;
  poller: ReturnType<typeof setInterval> | undefined;
  polling: boolean;
}

/**
 * What a Generation runs: an active Model or Template, or, for an admin's
 * test run from the Model editor, any Model with the editor's unsaved Fields.
 */
export type SubmitTarget = { modelId: string } | { templateId: string } | { draft: { modelId: string; fields: FieldConfig[] } };

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

/**
 * Validates, admits and submits a Generation.
 *
 * Validation and file ownership are checked before anything is recorded, so
 * a bad form never leaves a history entry. Once admitted, a failure to upload
 * or submit leaves a failed Generation carrying the reason.
 *
 * `uploads` holds the files the form sent, keyed as named by its
 * `{ source: 'upload' }` refs. `allowUrlRefs` lets *Retry* resend inputs that
 * are already on fal storage; a client never may.
 */
export async function submitGeneration(options: {
  userId: string;
  target: SubmitTarget;
  values: Record<string, JsonValue>;
  uploads?: Map<string, File>;
  allowUrlRefs?: boolean;
}): Promise<GenerationView> {
  const fal = falClient();
  const { userId, values } = options;
  const { model, template, fields } = await resolveTarget(options.target);
  const schema = model.schemaSnapshot.input;

  const draft = buildRequestInput({ fields, schema, values, variables: template?.variables });
  const files = await checkFileInputs(draft, fields, userId, options.uploads ?? new Map(), options.allowUrlRefs ?? false);

  const row = await admitGeneration({
    userId,
    modelId: model.id,
    templateId: template?.id ?? null,
    name: template?.name ?? model.name,
    endpointId: model.endpointId,
    formValues: values,
    estimatedCostUsd: estimateCost(model.pricing, draft, schema),
  });

  let finished: Generation = row;
  try {
    const urls = await uploadFileInputs(files);
    const requestInput = withFileUrls(draft, files, urls);
    const submitted = await fal.queue.submit(model.endpointId, requestInput, { webhookUrl: studioWebhookTarget() });
    finished =
      (await setGenerationSubmitted(row.id, {
        falRequestId: submitted.requestId,
        statusUrl: submitted.statusUrl,
        responseUrl: submitted.responseUrl,
        cancelUrl: submitted.cancelUrl,
        requestInput,
        formValues: withUploadedRefs(values, files, urls),
        progress: submitted.queuePosition === null ? null : { queuePosition: submitted.queuePosition },
      })) ?? row;
  } catch (error) {
    finished = (await completeGeneration(row.id, { status: 'failed', error: generationError(error) })) ?? row;
  }

  return publishGeneration(finished, true);
}

async function resolveTarget(
  target: SubmitTarget,
): Promise<{ model: StudioModel; template: StudioTemplate | null; fields: FieldConfig[] }> {
  if ('templateId' in target) {
    const found = await getActiveStudioTemplate(target.templateId);
    if (!found) throw new UserFacingError('This Template is not available.');
    return { ...found, fields: found.template.fields };
  }
  if ('draft' in target) {
    const model = await getStudioModel(target.draft.modelId);
    if (!model) throw new UserFacingError('This Model no longer exists.');
    return { model, template: null, fields: target.draft.fields };
  }
  const model = await getActiveStudioModel(target.modelId);
  if (!model) throw new UserFacingError('This Model is not available.');
  return { model, template: null, fields: model.fields };
}

/** One file input of a draft request: where it goes and how to read it. */
interface FileInput {
  field: string;
  /** The position in an array input, or null for a single file. */
  position: number | null;
  ref: FileRef;
  load: (() => Promise<{ blob: Blob; fileName: string }>) | null;
}

/** Checks every file input is the User's, still exists and is a media kind the Field accepts. */
async function checkFileInputs(
  draft: RequestInput,
  fields: FieldConfig[],
  userId: string,
  uploads: Map<string, File>,
  allowUrlRefs: boolean,
): Promise<FileInput[]> {
  const inputs: FileInput[] = [];
  const problems: { field: string; message: string }[] = [];

  for (const field of fields) {
    const value = draft[field.name];
    if (!isFileField(field) || value === undefined) continue;
    const refs = Array.isArray(value) ? value : [value];
    for (const [position, ref] of refs.entries()) {
      if (!isFileRef(ref)) continue;
      const label = field.label ?? field.name;
      const checked = await checkFileRef(ref, userId, uploads, allowUrlRefs);
      if (typeof checked === 'string') {
        problems.push({ field: field.name, message: `${label}: ${checked}` });
        continue;
      }
      const kind = checked.contentType ? mediaKindOf(checked.contentType) : null;
      if (checked.contentType && field.accept && (!kind || !field.accept.includes(kind))) {
        problems.push({ field: field.name, message: `${label} does not accept this kind of file.` });
        continue;
      }
      inputs.push({ field: field.name, position: Array.isArray(value) ? position : null, ref, load: checked.load });
    }
  }

  if (problems.length > 0) throw new RequestValidationError(problems);
  return inputs;
}

async function checkFileRef(
  ref: FileRef,
  userId: string,
  uploads: Map<string, File>,
  allowUrlRefs: boolean,
): Promise<string | { contentType: string | null; load: FileInput['load'] }> {
  switch (ref.source) {
    case 'upload': {
      const upload = uploads.get(ref.key);
      if (!upload) return 'the uploaded file is missing.';
      if (upload.size > MAX_INPUT_BYTES) return 'the file is larger than 100 MB.';
      return { contentType: upload.type, load: async () => ({ blob: upload, fileName: upload.name || 'input' }) };
    }
    case 'file': {
      const owned = await getOwnedFile(ref.fileId, userId);
      if (!owned || owned.isDeleted) return 'the file no longer exists.';
      if (owned.size > MAX_INPUT_BYTES) return 'the file is larger than 100 MB.';
      return {
        contentType: owned.contentType,
        load: () => readObject(fileS3Key(owned.ownerId, owned.url), owned.contentType, owned.title),
      };
    }
    case 'output': {
      const owned = await getOwnedOutput(ref.outputId, userId);
      if (!owned) return 'this Output no longer exists.';
      if (owned.output.expiredAt) return 'this Output has expired.';
      const { output } = owned;
      return {
        contentType: output.contentType,
        load: () => readObject(output.s3Key, output.contentType, `${output.index}.${outputExtension(output.contentType, output.s3Key)}`),
      };
    }
    case 'url':
      return allowUrlRefs ? { contentType: null, load: null } : 'files must be uploaded or picked.';
  }
}

async function readObject(key: string, contentType: string, fileName: string): Promise<{ blob: Blob; fileName: string }> {
  const object = await s3Client.send(new GetObjectCommand({ Bucket: env.AWS_BUCKET_NAME, Key: key }));
  if (!object.Body) throw new Error(`S3 object ${key} has no body`);
  return { blob: new Blob([new Uint8Array(await object.Body.transformToByteArray())], { type: contentType }), fileName };
}

/** Uploads each file input to fal storage; `url` refs are already there. Returns the URLs in input order. */
async function uploadFileInputs(inputs: FileInput[]): Promise<string[]> {
  const fal = falClient();
  return Promise.all(
    inputs.map(async (input) => {
      if (input.ref.source === 'url') return input.ref.url;
      if (!input.load) throw new Error('file input without a loader');
      const { blob, fileName } = await input.load();
      return fal.storage.upload(blob, { fileName, expiresInSeconds: INPUT_LIFETIME_SECONDS });
    }),
  );
}

/** The draft with every file input replaced by its fal URL: the exact `request_input`. */
function withFileUrls(draft: RequestInput, inputs: FileInput[], urls: string[]): Record<string, JsonValue> {
  const input = { ...draft } as Record<string, JsonValue>;
  inputs.forEach((file, index) => {
    const url = urls[index] as string;
    const current = input[file.field];
    if (file.position === null) input[file.field] = url;
    else if (Array.isArray(current)) input[file.field] = current.map((item, position) => (position === file.position ? url : item));
  });
  return input;
}

/**
 * `form_values` as stored: an upload becomes a `url` ref to its copy on fal
 * storage, so *Retry* can resend it while fal keeps it.
 */
function withUploadedRefs(values: Record<string, JsonValue>, inputs: FileInput[], urls: string[]): Record<string, JsonValue> {
  const stored: Record<string, JsonValue> = { ...values };
  inputs.forEach((input, index) => {
    if (input.ref.source !== 'upload') return;
    const ref: JsonValue = { source: 'url', url: urls[index] as string };
    const current = stored[input.field];
    if (input.position === null) stored[input.field] = ref;
    else if (Array.isArray(current)) stored[input.field] = current.map((item, position) => (position === input.position ? ref : item));
  });
  return stored;
}

function generationError(error: unknown): GenerationError {
  if (error instanceof FalError) {
    return {
      message: error.message,
      ...(error.errorType ? { type: error.errorType } : {}),
      ...(error.detail ? { detail: error.detail } : {}),
    };
  }
  if (error instanceof UserFacingError) return { message: error.message };
  console.error('[studio] Generation failed outside fal:', error);
  return { message: 'The Generation could not be started.' };
}

// ---------------------------------------------------------------------------
// Poll and finish
// ---------------------------------------------------------------------------

/**
 * Starts the poller once per process, from the `init-tasks` Nitro plugin.
 * Every 3 s without webhooks; every 60 s for Generations older than 2 minutes
 * with them, as a safety net for lost deliveries. Open Generations are read
 * from the database, so a restart resumes them.
 */
export function startGenerationPoller(): void {
  if (!isStudioEnabled() || state.poller) return;
  const webhooks = studioWebhookTarget() !== null;
  state.poller = setInterval(
    () => {
      if (state.polling) return;
      state.polling = true;
      pollGenerations(webhooks)
        .catch((error) => console.error('[studio] Poll failed:', error))
        .finally(() => {
          state.polling = false;
        });
    },
    webhooks ? WEBHOOK_POLL_INTERVAL_MS : POLL_INTERVAL_MS,
  );
}

/** One poller pass over every open Generation. */
export async function pollGenerations(webhooks: boolean): Promise<void> {
  const now = Date.now();
  for (const row of await failUnsubmittedGenerations(new Date(now - SUBMISSION_GRACE_MS))) await publishGeneration(row);
  const rows = await listGenerationsToPoll(webhooks ? new Date(now - WEBHOOK_GRACE_MS) : null);
  for (const row of rows) {
    await checkGeneration(row).catch((error) => console.error(`[studio] Checking Generation ${row.id} failed:`, error));
  }
}

async function checkGeneration(row: Generation): Promise<void> {
  if (!row.statusUrl) return;
  let status: Awaited<ReturnType<ReturnType<typeof falClient>['queue']['status']>>;
  try {
    status = await falClient().queue.status(row.statusUrl);
  } catch (error) {
    // fal no longer knows the request: nothing will ever finish it.
    if (error instanceof FalError && error.status === 404) {
      const failed = await completeGeneration(row.id, { status: 'failed', error: generationError(error) });
      if (failed) await publishGeneration(failed);
      return;
    }
    throw error;
  }

  if (status.status === 'COMPLETED') return finishGeneration(row.id);
  if (row.status === 'cancelled') return;
  if (status.status === 'IN_PROGRESS' && row.status === 'queued') {
    const running = await updateGenerationProgress(row.id, { status: 'running', progress: null, startedAt: new Date() });
    if (running) await publishGeneration(running);
  }
  if (status.status === 'IN_QUEUE' && row.progress?.queuePosition !== (status.queuePosition ?? undefined)) {
    const progress = status.queuePosition === null ? null : { queuePosition: status.queuePosition };
    const queued = await updateGenerationProgress(row.id, { status: 'queued', progress });
    if (queued) await publishGeneration(queued);
  }
}

/**
 * Fetches a finished request's result, copies its Outputs to private S3 and
 * marks the Generation succeeded, or failed with fal's error. Idempotent: a
 * repeated call, from the webhook and the poller alike, changes nothing.
 * Network failures throw, so the poller retries on its next pass.
 */
export async function finishGeneration(generationId: string): Promise<void> {
  if (state.finishing.has(generationId)) return;
  state.finishing.add(generationId);
  try {
    const row = await getGeneration(generationId);
    if (!row?.responseUrl || row.status === 'succeeded' || row.status === 'failed' || row.completedAt) return;

    let result: JsonValue;
    try {
      result = await falClient().queue.result(row.responseUrl);
    } catch (error) {
      if (!(error instanceof FalError)) throw error;
      const failed = await completeGeneration(row.id, { status: 'failed', error: generationError(error) });
      if (failed) await publishGeneration(failed);
      return;
    }

    const extracted = extractOutputs(result);
    if (extracted.length === 0) {
      const failed = await completeGeneration(row.id, { status: 'failed', error: { message: 'fal returned no media.', detail: result } });
      if (failed) await publishGeneration(failed);
      return;
    }

    let outputs: StoredOutput[];
    try {
      outputs = await Promise.all(extracted.map((output, index) => storeOutput(row, output, index)));
    } catch (error) {
      const attempts = (state.storeFailures.get(row.id) ?? 0) + 1;
      state.storeFailures.set(row.id, attempts);
      if (attempts < MAX_STORE_ATTEMPTS) throw error;
      console.error(`[studio] Giving up storing the Outputs of ${row.id}:`, error);
      const failed = await completeGeneration(row.id, { status: 'failed', error: { message: 'The result could not be stored.' } });
      if (failed) await publishGeneration(failed);
      return;
    }
    state.storeFailures.delete(row.id);

    const succeeded = await completeGeneration(row.id, { status: 'succeeded', outputs });
    if (succeeded) await publishGeneration(succeeded);
  } finally {
    state.finishing.delete(generationId);
  }
}

/** Copies one result file to `studio/<userId>/<generationId>/<index>.<ext>`, private. */
async function storeOutput(row: Generation, output: ReturnType<typeof extractOutputs>[number], index: number): Promise<StoredOutput> {
  const response = await fetch(output.url, { signal: AbortSignal.timeout(OUTPUT_DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Downloading Output ${index} failed with ${response.status}`);
  const body = new Uint8Array(await response.arrayBuffer());
  const s3Key = `studio/${row.userId}/${row.id}/${index}.${outputExtension(output.contentType, output.url)}`;
  await new Upload({
    client: s3Client,
    params: { Bucket: env.AWS_BUCKET_NAME, Key: s3Key, Body: body, ContentType: output.contentType, ACL: 'private' },
  }).done();
  return {
    index,
    mediaKind: output.mediaKind,
    contentType: output.contentType,
    s3Key,
    sizeBytes: body.byteLength,
    width: output.width === null ? null : Math.round(output.width),
    height: output.height === null ? null : Math.round(output.height),
    durationSeconds: output.durationSeconds,
    // Stored even past the quota: fal has already been paid. Submitting stays blocked until there is room again.
    expiresAt: new Date(Date.now() + OUTPUT_LIFETIME_MS),
  };
}

// ---------------------------------------------------------------------------
// Cancel and retry
// ---------------------------------------------------------------------------

/**
 * Cancels a waiting or running Generation through fal. A request fal had
 * already started may still finish; its result is then kept.
 */
export async function cancelGeneration(userId: string, generationId: string): Promise<GenerationView> {
  assertStudioEnabled();
  const row = await getOwnedGeneration(generationId, userId);
  if (!row) throw new UserFacingError('Generation not found.');
  if (row.status !== 'queued' && row.status !== 'running')
    throw new UserFacingError('Only a waiting or running Generation can be cancelled.');
  if (!row.cancelUrl) throw new UserFacingError('This Generation is still being submitted. Try again in a moment.');

  const outcome = await falClient().queue.cancel(row.cancelUrl);
  if (outcome === 'already_completed') await finishGeneration(row.id);
  else await markGenerationCancelled(row.id, outcome !== 'cancellation_requested');

  return publishGeneration((await getGeneration(row.id)) ?? row, true);
}

/** Submits a finished Generation's `form_values` again, as a new Generation. */
export async function retryGeneration(userId: string, generationId: string): Promise<GenerationView> {
  assertStudioEnabled();
  const row = await getOwnedGeneration(generationId, userId);
  if (!row) throw new UserFacingError('Generation not found.');
  if (row.status === 'queued' || row.status === 'running') throw new UserFacingError('This Generation is still running.');
  const target = row.templateId ? { templateId: row.templateId } : row.modelId ? { modelId: row.modelId } : null;
  if (!target) throw new UserFacingError('The Model of this Generation no longer exists.');
  return submitGeneration({ userId, target, values: row.formValues as Record<string, JsonValue>, allowUrlRefs: true });
}

// ---------------------------------------------------------------------------
// Save to Files and expiry
// ---------------------------------------------------------------------------

/**
 * Moves an Output's object into the Files area as a private file and links
 * it, so it no longer expires and counts once, as the file.
 */
export async function saveOutputToFiles(userId: string, outputId: string): Promise<{ fileId: string }> {
  assertStudioEnabled();
  const owned = await getOwnedOutput(outputId, userId);
  if (!owned) throw new UserFacingError('Output not found.');
  const { output, generationName } = owned;
  if (output.savedFileId) return { fileId: output.savedFileId };
  if (output.expiredAt) throw new UserFacingError('This Output has expired.');

  const extension = outputExtension(output.contentType, output.s3Key);
  const title = `${generationName.replace(/[\\/:*?"<>|\r\n]+/g, '_').trim() || 'Studio'} ${output.index + 1}.${extension}`;
  const storedName = `${randomUUID()}-${title}`;
  const key = `${userId}/${storedName}`;
  await s3Client.send(
    new CopyObjectCommand({
      Bucket: env.AWS_BUCKET_NAME,
      Key: key,
      CopySource: `${env.AWS_BUCKET_NAME}/${encodeURIComponent(output.s3Key).replace(/%2F/g, '/')}`,
      ContentType: output.contentType,
      ACL: 'private',
    }),
  );

  let fileId: string;
  try {
    const created = await saveOutputAsFile(
      output.id,
      {
        ownerId: userId,
        size: output.sizeBytes,
        url: encodeURIComponent(storedName),
        private: true,
        tags: 'studio',
        title,
        contentType: output.contentType,
        dimensions: output.width && output.height ? { width: output.width, height: output.height, description: '' } : undefined,
        s3Key: key,
      },
      userId,
    );
    fileId = created.id;
  } catch (error) {
    await s3Client.send(new DeleteObjectCommand({ Bucket: env.AWS_BUCKET_NAME, Key: key })).catch(() => {});
    throw error;
  }

  await s3Client.send(new DeleteObjectCommand({ Bucket: env.AWS_BUCKET_NAME, Key: output.s3Key })).catch((error) => {
    console.error(`[studio] Removing the moved Output object ${output.s3Key} failed:`, error);
  });
  const row = await getGeneration(output.generationId);
  if (row) await publishGeneration(row);
  return { fileId };
}

/**
 * Deletes the objects of unsaved Outputs past their expiry and records it.
 * The Generations and Output rows stay. Returns how many expired.
 */
export async function sweepExpiredOutputs(signal?: AbortSignal): Promise<number> {
  const now = new Date();
  let expired = 0;
  for (;;) {
    throwIfAborted(signal);
    const batch = await listExpiredOutputs(now, 500);
    if (batch.length === 0) return expired;
    await s3Client.send(
      new DeleteObjectsCommand({
        Bucket: env.AWS_BUCKET_NAME,
        Delete: { Objects: batch.map(({ s3Key }) => ({ Key: s3Key })), Quiet: true },
      }),
      { abortSignal: signal },
    );
    expired += await markOutputsExpired(
      batch.map(({ id }) => id),
      now,
    );
    if (batch.length < 500) return expired;
  }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/**
 * Sends `generation.updated` to the User's open streams. Builds the view
 * (signing Output URLs) only when someone listens or the caller needs it.
 */
async function publishGeneration(row: Generation, alwaysBuild: true): Promise<GenerationView>;
async function publishGeneration(row: Generation): Promise<GenerationView | null>;
async function publishGeneration(row: Generation, alwaysBuild = false): Promise<GenerationView | null> {
  const listening = hasStudioListeners(row.userId);
  if (!listening && !alwaysBuild) return null;
  const view = await toGenerationView(row, await listGenerationOutputs(row.id));
  if (listening) publishStudioEvent(row.userId, { type: 'generation.updated', generation: view });
  return view;
}
