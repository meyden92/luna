import { randomUUID } from 'node:crypto';
import { CopyObjectCommand, DeleteObjectsCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getOwnedFile } from '@/db/queries/files';
import {
  admitGeneration,
  completeGeneration,
  deleteOwnedGeneration,
  failUnsubmittedGenerations,
  type Generation,
  getGeneration,
  getOwnedGeneration,
  getOwnedOutput,
  isGenerationFinished,
  listAvailableOutputIds,
  listExpiredOutputs,
  listGenerationOutputs,
  listGenerationsToPoll,
  listUnmovedSavedOutputs,
  markGenerationCancelled,
  markOutputsExpired,
  OUTPUT_KEY_PREFIX,
  type StoredOutput,
  saveOutputAsFile,
  setGenerationSubmitted,
  setOutputKey,
  updateGenerationProgress,
} from '@/db/queries/generations';
import { getActiveStudioModel, getActiveStudioTemplate, getStudioModel, type StudioModel, type StudioTemplate } from '@/db/queries/studio';
import type { JsonValue } from '@/db/schema/json';
import { throwIfAborted } from '@/libs/abort';
import { env } from '@/libs/env';
import { FalError, type FalQueueStatus } from '@/libs/fal/client';
import { fileS3Key, getDownloadSignedUrl, s3Client } from '@/libs/S3Helper';
import { UserFacingError } from '@/libs/user-facing-error';
import { assertStudioEnabled, falClient, isStudioEnabled, studioWebhookTarget } from './config';
import { estimateCost } from './cost';
import { hasStudioListeners, publishStudioEvent } from './events';
import { reseedValues, reusableValues, uploadsExpireAt } from './history-actions';
import { type ExtractedOutput, extractOutputs, mediaKindOf, outputExtension } from './outputs';
import { buildRequestInput, isFileField, isFileRef, type RequestInput, RequestValidationError } from './request';
import { ACTIVE_GENERATION_STATUSES, type FieldConfig, type FileRef, type GenerationError, type VariableConfig } from './types';
import { fileVariableTargets } from './variables';
import { type GenerationView, toGenerationView } from './views';

/**
 * The server-side Generation pipeline: submit, poll, finish,
 * cancel, retry, Save to Files and the expiry sweep. Server-only.
 *
 * A Generation lives in the database, not in a browser request: fal delivers
 * the result by webhook when it can reach this instance, and the poller
 * finishes everything else, also after a restart. `finishGeneration` is the
 * one path both take, and it is idempotent.
 *
 * Output objects are deleted before their rows let go of them (see
 * `generations.ts`): a delete S3 refuses leaves the row due, and the hourly
 * sweep tries again.
 */

/** fal keeps uploaded inputs this long. */
const INPUT_LIFETIME_SECONDS = 24 * 60 * 60;
/** Unsaved Outputs are deleted after this. */
const OUTPUT_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_INPUT_BYTES = 100 * 1024 * 1024;
/** A Generation recorded but not yet on fal after this was cut off by a restart. */
const SUBMISSION_GRACE_MS = 10 * 60 * 1000;
/** With webhooks on, the poller only checks Generations this old. */
const WEBHOOK_GRACE_MS = 2 * 60 * 1000;
const POLL_INTERVAL_MS = 3_000;
const WEBHOOK_POLL_INTERVAL_MS = 60_000;
const OUTPUT_DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Process-wide pipeline state, on `globalThis` for the same reason as the
 * event listeners: the Nitro plugin and the routes may load separate module
 * instances in dev.
 */
const registry = globalThis as typeof globalThis & { __lunashareStudioPipeline?: PipelineState };
registry.__lunashareStudioPipeline ??= { finishing: new Set(), poller: undefined, polling: false };
const state = registry.__lunashareStudioPipeline;

interface PipelineState {
  finishing: Set<string>;
  poller: ReturnType<typeof setInterval> | undefined;
  polling: boolean;
}

/**
 * What a Generation runs: an active Model or Template, or, for an admin's
 * test run from the Model or Template editor, any Model with the editor's
 * unsaved Fields and Variables.
 */
export type SubmitTarget =
  | { modelId: string }
  | { templateId: string }
  | { draft: { modelId: string; fields: FieldConfig[]; variables?: VariableConfig[] } };

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
 * `{ source: 'upload' }` refs. `allowUrlRefs` lets *Again* and *Retry* resend
 * inputs that are already on fal storage; a client never may.
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
  const { model, template, fields, variables, fromTemplate } = await resolveTarget(options.target);
  const schema = model.schemaSnapshot.input;

  const draft = buildRequestInput({ fields, schema, values, variables });
  const files = await checkFileInputs(
    draft,
    fileVariableTargets(fields, variables),
    userId,
    options.uploads ?? new Map(),
    options.allowUrlRefs ?? false,
  );

  const row = await admitGeneration({
    userId,
    modelId: model.id,
    templateId: template?.id ?? null,
    fromTemplate,
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

/** What a target runs. `fromTemplate`: the form is a Template's, also for a Template editor draft (it has `variables`). */
async function resolveTarget(target: SubmitTarget): Promise<{
  model: StudioModel;
  template: StudioTemplate | null;
  fields: FieldConfig[];
  variables: VariableConfig[];
  fromTemplate: boolean;
}> {
  if ('templateId' in target) {
    const found = await getActiveStudioTemplate(target.templateId);
    if (!found) throw new UserFacingError('This Template is not available.');
    return { ...found, fields: found.template.fields, variables: found.template.variables, fromTemplate: true };
  }
  if ('draft' in target) {
    const model = await getStudioModel(target.draft.modelId);
    if (!model) throw new UserFacingError('This Model no longer exists.');
    const { fields, variables } = target.draft;
    return { model, template: null, fields, variables: variables ?? [], fromTemplate: variables !== undefined };
  }
  const model = await getActiveStudioModel(target.modelId);
  if (!model) throw new UserFacingError('This Model is not available.');
  return { model, template: null, fields: model.fields, variables: [], fromTemplate: false };
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
 * storage, with when fal deletes it, so *Again* and *Retry* can resend it
 * until then. Found by its part name, wherever it sits: under a Field or a
 * file Variable.
 */
function withUploadedRefs(values: Record<string, JsonValue>, inputs: FileInput[], urls: string[]): Record<string, JsonValue> {
  const expiresAt = new Date(Date.now() + INPUT_LIFETIME_SECONDS * 1000).toISOString();
  const uploaded = new Map<string, string>();
  inputs.forEach((input, index) => {
    if (input.ref.source === 'upload') uploaded.set(input.ref.key, urls[index] as string);
  });
  const stored = (value: JsonValue): JsonValue => {
    if (!isFileRef(value) || value.source !== 'upload') return value;
    const url = uploaded.get(value.key);
    return url ? { source: 'url', url, expiresAt } : value;
  };
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, Array.isArray(value) ? value.map(stored) : stored(value)]),
  );
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
  let status: FalQueueStatus;
  try {
    status = await falClient().queue.status(row.statusUrl);
  } catch (error) {
    // fal no longer knows the request: nothing will ever finish it.
    if (error instanceof FalError && error.status === 404) return failGeneration(row.id, generationError(error));
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
 * Anything that may pass (network, S3, fal answering 429 or 5xx for a request
 * that did not fail) throws, and the poller tries again on its next pass.
 */
export async function finishGeneration(generationId: string): Promise<void> {
  if (state.finishing.has(generationId)) return;
  state.finishing.add(generationId);
  try {
    const row = await getGeneration(generationId);
    if (!row?.responseUrl || isGenerationFinished(row)) return;

    let result: JsonValue;
    try {
      result = await falClient().queue.result(row.responseUrl);
    } catch (error) {
      if (!(error instanceof FalError) || !(await isRequestFailure(row, error))) throw error;
      return failGeneration(row.id, generationError(error));
    }

    // Deleted while fal could still finish it: fal billed it, but nobody wants its Outputs.
    if (row.deletedAt) {
      await completeGeneration(row.id, { status: 'succeeded', outputs: [] });
      return;
    }

    // From here on fal completed the request and billed it, so a failure still costs.
    const extracted = extractOutputs(result);
    if (extracted.length === 0) return failGeneration(row.id, { message: 'fal returned no media.', detail: result, billed: true });

    const outputs = await storeOutputs(row, extracted);
    if (!outputs) return failGeneration(row.id, { message: 'fal no longer has the media, so no Output could be stored.', billed: true });

    const succeeded = await completeGeneration(row.id, { status: 'succeeded', outputs });
    if (succeeded) await publishGeneration(succeeded);
  } finally {
    state.finishing.delete(generationId);
  }
}

/**
 * Whether a failed result fetch is the request's own outcome, which no later
 * fetch changes: fal no longer has it (404), or the request is completed and
 * either its status names an error or its result URL refused it with a 4xx no
 * retry changes. fal reports some failures, such as its content checker's
 * rejection, only on the result URL, with no error in the status (#248).
 */
async function isRequestFailure(row: Generation, error: FalError): Promise<boolean> {
  if (error.status === 404) return true;
  if (!row.statusUrl) return false;
  const status = await falClient().queue.status(row.statusUrl);
  return status.status === 'COMPLETED' && (status.error !== null || isPermanentClientError(error.status));
}

/** A 4xx a retry cannot change: not a timeout (408) or rate limit (429). */
function isPermanentClientError(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

async function failGeneration(generationId: string, error: GenerationError): Promise<void> {
  const failed = await completeGeneration(generationId, { status: 'failed', error });
  if (failed) await publishGeneration(failed);
}

/** fal answered a download of its media with a 4xx that no retry changes: the media is gone. */
class MediaGoneError extends Error {}

/**
 * Copies every result file to its Output key. Returns null when fal no longer
 * serves one of them, after deleting the copies already made. Any other
 * failure throws, leaving the copies: the next attempt writes the same keys.
 */
async function storeOutputs(row: Generation, extracted: ExtractedOutput[]): Promise<StoredOutput[] | null> {
  const settled = await Promise.allSettled(extracted.map((output, index) => storeOutput(row, output, index)));
  const stored = settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
  if (stored.length === extracted.length) return stored;

  const failures = settled.flatMap((result) => (result.status === 'rejected' ? [result.reason as unknown] : []));
  const passing = failures.find((failure) => !(failure instanceof MediaGoneError));
  if (passing) throw passing;
  // No row records these copies yet: if deleting them fails, this throws and the Generation stays open.
  await deleteObjects(extracted.map((output, index) => outputKey(row, output, index)));
  return null;
}

function outputKey(row: Generation, output: ExtractedOutput, index: number): string {
  return `${OUTPUT_KEY_PREFIX}${row.userId}/${row.id}/${index}.${outputExtension(output.contentType, output.url)}`;
}

/** Copies one result file to its key, private. */
async function storeOutput(row: Generation, output: ExtractedOutput, index: number): Promise<StoredOutput> {
  const response = await fetch(output.url, { signal: AbortSignal.timeout(OUTPUT_DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok) {
    const message = `Downloading Output ${index} failed with ${response.status}`;
    throw isPermanentClientError(response.status) ? new MediaGoneError(message) : new Error(message);
  }
  const body = new Uint8Array(await response.arrayBuffer());
  const s3Key = outputKey(row, output, index);
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
  if (!ACTIVE_GENERATION_STATUSES.includes(row.status)) throw new UserFacingError('Only a waiting or running Generation can be cancelled.');
  if (!row.cancelUrl) throw new UserFacingError('This Generation is still being submitted. Try again in a moment.');

  const outcome = await falClient().queue.cancel(row.cancelUrl);
  if (outcome === 'already_completed') await finishGeneration(row.id);
  else await markGenerationCancelled(row.id, outcome !== 'cancellation_requested');

  return publishGeneration((await getGeneration(row.id)) ?? row, true);
}

/**
 * Submits a finished Generation's `form_values` again, as a new Generation:
 * *Retry*, and with `reseed` *Again*, which draws a new seed when Users set it.
 * Refuses once fal deleted an upload (see `uploadsExpireAt`).
 */
export async function retryGeneration(userId: string, generationId: string, { reseed = false } = {}): Promise<GenerationView> {
  assertStudioEnabled();
  const row = await getOwnedGeneration(generationId, userId);
  if (!row) throw new UserFacingError('Generation not found.');
  if (ACTIVE_GENERATION_STATUSES.includes(row.status)) throw new UserFacingError('This Generation is still running.');
  const target = rerunTarget(row);
  let values = row.formValues as Record<string, JsonValue>;
  const expiry = uploadsExpireAt(values);
  if (expiry && Date.parse(expiry) <= Date.now()) {
    throw new UserFacingError('A file uploaded for this Generation has expired. Use its settings and attach the file again.');
  }
  if (reseed) values = reseedValues((await resolveTarget(target)).fields, values);
  return submitGeneration({ userId, target, values, allowUrlRefs: true });
}

/** What *Again*, *Retry* and *Use settings* run: never the bare Model for values a Template's form collected. */
function rerunTarget(row: Generation): { templateId: string } | { modelId: string } {
  if (row.templateId) return { templateId: row.templateId };
  if (row.fromTemplate) throw new UserFacingError('The Template of this Generation is no longer available.');
  if (row.modelId) return { modelId: row.modelId };
  throw new UserFacingError('The Model of this Generation no longer exists.');
}

/**
 * *Use settings*: what the Generation ran and its `form_values` as the form
 * can take them again, keeping only the Files and Outputs that still exist.
 */
export async function generationSettings(userId: string, generationId: string) {
  assertStudioEnabled();
  const row = await getOwnedGeneration(generationId, userId);
  if (!row) throw new UserFacingError('Generation not found.');
  const target = rerunTarget(row);
  const values = row.formValues as Record<string, JsonValue>;
  const refs = Object.values(values)
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter(isFileRef);
  const outputs = await listAvailableOutputIds(
    userId,
    refs.flatMap((ref) => (ref.source === 'output' ? [ref.outputId] : [])),
  );
  const files = new Set<string>();
  for (const ref of refs) {
    if (ref.source !== 'file') continue;
    const owned = await getOwnedFile(ref.fileId, userId);
    if (owned && !owned.isDeleted) files.add(ref.fileId);
  }
  return {
    modelId: 'modelId' in target ? target.modelId : row.modelId,
    templateId: 'templateId' in target ? target.templateId : null,
    values: reusableValues(values, (ref) =>
      ref.source === 'output' ? outputs.has(ref.outputId) : ref.source === 'file' && files.has(ref.fileId),
    ),
  };
}

/**
 * Deletes a finished Generation from the history with its Outputs' objects;
 * Outputs saved to Files stay as files, and its cost stays booked.
 */
export async function deleteGeneration(userId: string, generationId: string): Promise<void> {
  assertStudioEnabled();
  const due = await deleteOwnedGeneration(generationId, userId);
  if (!due) throw new UserFacingError('Generation not found.');
  publishStudioEvent(userId, { type: 'generation.deleted', id: generationId });
  // The Outputs are due now; deleting them here only saves waiting for the sweep, which retries whatever S3 kept.
  await expireOutputs(due, new Date()).catch((error) =>
    console.error(`[studio] Deleting the Outputs of ${generationId} failed; the expiry sweep retries:`, error),
  );
}

/** A short-lived URL that downloads an Output as `<Generation name> <n>.<ext>`. */
export async function outputDownloadUrl(userId: string, outputId: string): Promise<string> {
  assertStudioEnabled();
  const owned = await getOwnedOutput(outputId, userId);
  if (!owned) throw new UserFacingError('Output not found.');
  if (owned.output.expiredAt) throw new UserFacingError('This Output has expired.');
  return getDownloadSignedUrl(owned.output.s3Key, outputTitle(owned.generationName, owned.output));
}

/** "<Generation name> <n>.<ext>", safe as a file name. */
function outputTitle(generationName: string, output: { index: number; contentType: string; s3Key: string }): string {
  const extension = outputExtension(output.contentType, output.s3Key);
  return `${generationName.replace(/[\\/:*?"<>|\r\n]+/g, '_').trim() || 'Studio'} ${output.index + 1}.${extension}`;
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

  const title = outputTitle(generationName, output);
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
      },
      userId,
    );
    fileId = created.id;
  } catch (error) {
    // No row records the copy, so it goes too; if it cannot, both failures are reported.
    await deleteObjects([key]).catch((cleanup: unknown) => {
      throw new AggregateError([error, cleanup], 'Saving the Output failed, and its copy could not be deleted');
    });
    throw error;
  }

  // The Output keeps its own key until that object is gone; if deleting it fails, the expiry sweep finishes the move.
  await deleteObjects([output.s3Key])
    .then(() => setOutputKey(output.id, key))
    .catch((error) => console.error(`[studio] Deleting the moved Output object ${output.s3Key} failed; the expiry sweep retries:`, error));
  const row = await getGeneration(output.generationId);
  if (row) await publishGeneration(row);
  return { fileId };
}

/** How many Outputs the sweep handles per round. S3 deletes at most 1000 objects per call. */
const SWEEP_BATCH_SIZE = 500;

/**
 * Deletes the objects of unsaved Outputs past their expiry and records it,
 * then finishes moves to Files whose old object is still there. The
 * Generations and Output rows stay. Stops at the first object S3 refuses to
 * delete, throwing, so the next run tries again. Returns how many expired.
 */
export async function sweepExpiredOutputs(signal?: AbortSignal): Promise<number> {
  const now = new Date();
  let expired = 0;
  for (;;) {
    throwIfAborted(signal);
    const batch = await listExpiredOutputs(now, SWEEP_BATCH_SIZE);
    expired += await expireOutputs(batch, now, signal);
    if (batch.length < SWEEP_BATCH_SIZE) break;
  }
  for (;;) {
    throwIfAborted(signal);
    const batch = await listUnmovedSavedOutputs(SWEEP_BATCH_SIZE);
    for (const output of batch) {
      await deleteObjects([output.s3Key], signal);
      await setOutputKey(output.id, fileS3Key(output.fileOwnerId, output.fileUrl));
    }
    if (batch.length < SWEEP_BATCH_SIZE) return expired;
  }
}

/**
 * Deletes the Outputs' objects and marks them expired. An Output whose object
 * S3 kept is not marked, so it stays due; the error is rethrown once the
 * others are marked. Returns how many were marked.
 */
async function expireOutputs(outputs: { id: string; s3Key: string }[], now: Date, signal?: AbortSignal): Promise<number> {
  try {
    await deleteObjects(
      outputs.map((output) => output.s3Key),
      signal,
    );
  } catch (error) {
    if (!(error instanceof ObjectDeletionError)) throw error;
    const kept = new Set(error.keys);
    await markOutputsExpired(
      outputs.filter((output) => !kept.has(output.s3Key)).map((output) => output.id),
      now,
    );
    throw error;
  }
  return markOutputsExpired(
    outputs.map((output) => output.id),
    now,
  );
}

/** S3 kept some of the objects it was asked to delete. */
class ObjectDeletionError extends Error {
  readonly keys: string[];

  constructor(keys: string[], detail: string) {
    super(`S3 kept ${keys.length} object(s) it was asked to delete: ${detail}`);
    this.keys = keys;
  }
}

/**
 * Deletes up to 1000 objects, an absent one counting as deleted. Throws an
 * `ObjectDeletionError` naming the keys S3 kept, and S3's own error when the
 * call fails as a whole.
 */
async function deleteObjects(keys: string[], signal?: AbortSignal): Promise<void> {
  if (keys.length === 0) return;
  const response = await s3Client.send(
    new DeleteObjectsCommand({ Bucket: env.AWS_BUCKET_NAME, Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } }),
    { abortSignal: signal },
  );
  const errors = response.Errors ?? [];
  if (errors.length > 0) {
    throw new ObjectDeletionError(
      errors.flatMap((error) => (error.Key ? [error.Key] : [])),
      errors.map((error) => `${error.Key}: ${error.Code} ${error.Message}`).join('; '),
    );
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
  // A deleted Generation is gone from the history; an update would bring it back.
  const listening = !row.deletedAt && hasStudioListeners(row.userId);
  if (!listening && !alwaysBuild) return null;
  const view = await toGenerationView(row, await listGenerationOutputs(row.id));
  if (listening) publishStudioEvent(row.userId, { type: 'generation.updated', generation: view });
  return view;
}
