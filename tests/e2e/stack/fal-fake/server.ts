/**
 * The fake fal service of the E2E stack: answers exactly the calls the app's fal
 * client (`src/libs/fal/client.ts`) makes, over the catalog in `catalog.ts`,
 * plus `/__control/*` hooks for specs (see `tests/e2e/README.md`). It never
 * opens an outbound connection, and all state is in memory for one stack.
 *
 * Env: `PORT`; `PUBLIC_URL`, the origin the app container and the browser reach
 * it at, used in every URL it hands out; `FAL_KEY` and `FAL_BILLING_KEY`, the
 * keys it accepts; `MEDIA_DIR`, where the fixture media of `MEDIA` lie.
 */
import { join } from 'node:path';
import { FAKE_BALANCE_USD, FAKE_MODELS, fakeModel, type Json, type JsonObject, MEDIA, type MediaUrls, openapiDocument } from './catalog';

const PORT = Number(process.env.PORT ?? 8080);
const PUBLIC_URL = (process.env.PUBLIC_URL ?? `http://localhost:${PORT}`).replace(/\/+$/, '');
const FAL_KEY = required('FAL_KEY');
const FAL_BILLING_KEY = required('FAL_BILLING_KEY');
const MEDIA_DIR = process.env.MEDIA_DIR ?? join(import.meta.dirname, 'media');
/** How long an ordinary request stays `IN_PROGRESS`. */
const RUN_MS = 1000;
const BILLING_WINDOW_MS = 24 * 60 * 60 * 1000;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

interface QueuedRequest {
  id: string;
  endpointId: string;
  input: JsonObject;
  submittedAt: number;
  /** `[fail]` in the input: completes with a model error. */
  fail: boolean;
  /** `[slow]` in the input: stays `IN_PROGRESS` until released or cancelled. */
  held: boolean;
  /** `[cost=<usd>]` in the input: billed at this instead of the list price. */
  cost: number | null;
  releasedAt: number | null;
  cancelledAt: number | null;
}

interface Upload {
  id: string;
  fileUrl: string;
  fileName: string;
  contentType: string;
  expirationSeconds: number | null;
  bytes: Uint8Array<ArrayBuffer> | null;
}

const requests = new Map<string, QueuedRequest>();
const uploads = new Map<string, Upload>();
/** `/__control/schema` overrides, by endpoint id. */
const overrides = new Map<string, { input?: JsonObject; status?: 'active' | 'deprecated' }>();

const mediaUrls = Object.fromEntries(
  Object.entries(MEDIA).map(([kind, media]) => [kind, `${PUBLIC_URL}/media/${media.name}`]),
) as MediaUrls;

const json = (body: Json, status = 200, headers: Record<string, string> = {}) => Response.json(body, { status, headers });
const detail = (message: string, status: number) => json({ detail: message }, status);

function authorized(request: Request, key: string): boolean {
  return request.headers.get('authorization') === `Key ${key}`;
}

/** When the request finishes, or null while it runs. */
function completedAt(entry: QueuedRequest): number | null {
  if (entry.cancelledAt !== null) return entry.cancelledAt;
  if (entry.held && entry.releasedAt === null) return null;
  const done = (entry.releasedAt ?? entry.submittedAt) + RUN_MS;
  return Date.now() >= done ? done : null;
}

function succeeded(entry: QueuedRequest): boolean {
  return completedAt(entry) !== null && entry.cancelledAt === null && !entry.fail;
}

function queueUrls(entry: QueuedRequest) {
  const base = `${PUBLIC_URL}/${entry.endpointId}/requests/${entry.id}`;
  return { status_url: `${base}/status`, response_url: base, cancel_url: `${base}/cancel` };
}

function billedCost(entry: QueuedRequest): number {
  const model = fakeModel(entry.endpointId)!;
  const cost = entry.cost ?? model.price.unitPrice * model.units(entry.input);
  return Math.round(cost * 1e6) / 1e6;
}

const FAILURE_TYPE = 'fake_failure';

// ---------------------------------------------------------------------------
// Queue: POST /<endpoint>, then the URLs submit returned
// ---------------------------------------------------------------------------

async function submit(request: Request, endpointId: string): Promise<Response> {
  if (!fakeModel(endpointId)) return detail(`Application '${endpointId}' not found`, 404);
  const input = (await request.json()) as JsonObject;
  const text = JSON.stringify(input);
  const cost = /\[cost=([0-9.]+)\]/.exec(text);
  const entry: QueuedRequest = {
    id: crypto.randomUUID(),
    endpointId,
    input,
    submittedAt: Date.now(),
    fail: text.includes('[fail]'),
    held: text.includes('[slow]'),
    cost: cost ? Number(cost[1]) : null,
    releasedAt: null,
    cancelledAt: null,
  };
  requests.set(entry.id, entry);
  return json({ request_id: entry.id, ...queueUrls(entry), queue_position: 0 });
}

function status(entry: QueuedRequest): Response {
  if (completedAt(entry) === null) return json({ status: 'IN_PROGRESS', request_id: entry.id, ...queueUrls(entry), logs: null });
  const error: JsonObject =
    entry.cancelledAt !== null
      ? { error: 'Request was cancelled', error_type: 'request_cancelled' }
      : entry.fail
        ? { error: 'The fake failed this request: its input contains [fail].', error_type: FAILURE_TYPE }
        : {};
  return json({ status: 'COMPLETED', request_id: entry.id, ...queueUrls(entry), logs: null, ...error });
}

function result(entry: QueuedRequest): Response {
  if (completedAt(entry) === null) return detail('Request is still in progress', 400);
  if (entry.cancelledAt !== null) return json({ detail: 'Request was cancelled', error_type: 'request_cancelled' }, 400);
  if (entry.fail) {
    const failure = { loc: ['body'], msg: 'The fake failed this request: its input contains [fail].', type: FAILURE_TYPE };
    return json({ detail: [failure] }, 422, { 'x-fal-error-type': FAILURE_TYPE });
  }
  return json(fakeModel(entry.endpointId)!.result(entry.input, mediaUrls));
}

/** 202: a running request is asked to stop, and completes as cancelled. Every request runs, so none answers 200. */
function cancel(entry: QueuedRequest): Response {
  if (completedAt(entry) !== null) return detail('Request already completed', 400);
  entry.cancelledAt = Date.now();
  return json({ status: 'CANCELLATION_REQUESTED' }, 202);
}

function queueRoute(request: Request, path: string): Promise<Response> | Response {
  if (!authorized(request, FAL_KEY)) return detail('Invalid fal key', 401);
  const match = /^\/(.+)\/requests\/([^/]+)(\/status|\/cancel)?$/.exec(path);
  if (!match) return request.method === 'POST' ? submit(request, path.slice(1)) : detail('Not found', 404);
  const [, endpointId, id, action] = match;
  const entry = requests.get(id!);
  if (!entry || entry.endpointId !== endpointId) return detail('Request not found', 404);
  if (action === '/status' && request.method === 'GET') return status(entry);
  if (action === '/cancel' && request.method === 'PUT') return cancel(entry);
  if (!action && request.method === 'GET') return result(entry);
  return detail('Method not allowed', 405);
}

// ---------------------------------------------------------------------------
// Storage: initiate, then PUT the bytes to the upload URL
// ---------------------------------------------------------------------------

async function initiateUpload(request: Request): Promise<Response> {
  if (!authorized(request, FAL_KEY)) return detail('Invalid fal key', 401);
  const body = (await request.json()) as { content_type?: string; file_name?: string };
  const lifecycle = JSON.parse(request.headers.get('x-fal-object-lifecycle') ?? '{}') as { expiration_duration_seconds?: number };
  const id = crypto.randomUUID();
  const fileName = body.file_name || 'file';
  const upload: Upload = {
    id,
    fileUrl: `${PUBLIC_URL}/files/${id}/${encodeURIComponent(fileName)}`,
    fileName,
    contentType: body.content_type || 'application/octet-stream',
    expirationSeconds: lifecycle.expiration_duration_seconds ?? null,
    bytes: null,
  };
  uploads.set(id, upload);
  return json({ upload_url: `${PUBLIC_URL}/storage/put/${id}`, file_url: upload.fileUrl });
}

async function putUpload(request: Request, id: string): Promise<Response> {
  const upload = uploads.get(id);
  if (!upload) return detail('Upload not found', 404);
  upload.bytes = new Uint8Array(await request.arrayBuffer());
  return new Response(null, { status: 200 });
}

function uploadedFile(id: string): Response {
  const upload = uploads.get(id);
  if (!upload?.bytes) return detail('File not found', 404);
  return new Response(upload.bytes, { headers: { 'content-type': upload.contentType } });
}

// ---------------------------------------------------------------------------
// Platform API: /v1/models, /v1/models/pricing, /v1/models/billing-events, /v1/account/billing
// ---------------------------------------------------------------------------

function models(url: URL): Response {
  const q = url.searchParams.get('q')?.toLowerCase();
  const category = url.searchParams.get('category');
  const ids = url.searchParams.getAll('endpoint_id');
  const wanted = url.searchParams.get('status');
  const expand = url.searchParams.get('expand') === 'openapi-3.0';
  const matching = FAKE_MODELS.filter((model) => {
    const statusNow = overrides.get(model.endpointId)?.status ?? 'active';
    const text = `${model.endpointId} ${model.displayName} ${model.description}`.toLowerCase();
    return (
      (!q || text.includes(q)) &&
      (!category || model.category === category) &&
      (ids.length === 0 || ids.includes(model.endpointId)) &&
      (!wanted || statusNow === wanted)
    );
  });
  const offset = Number(url.searchParams.get('cursor') ?? 0);
  const limit = Number(url.searchParams.get('limit') ?? 50);
  const page = matching.slice(offset, offset + limit);
  const hasMore = offset + limit < matching.length;
  return json({
    models: page.map((model) => {
      const override = overrides.get(model.endpointId);
      return {
        endpoint_id: model.endpointId,
        metadata: {
          display_name: model.displayName,
          category: model.category,
          description: model.description,
          status: override?.status ?? 'active',
          thumbnail_url: mediaUrls.image,
        },
        ...(expand ? { openapi: openapiDocument(model, override?.input ?? model.input) } : {}),
      };
    }),
    next_cursor: hasMore ? String(offset + limit) : null,
    has_more: hasMore,
  });
}

function pricing(url: URL): Response {
  const prices = url.searchParams
    .getAll('endpoint_id')
    .map(fakeModel)
    .filter((model) => model !== undefined)
    .map((model) => ({ endpoint_id: model.endpointId, unit_price: model.price.unitPrice, unit: model.price.unit, currency: 'USD' }));
  return json({ prices, next_cursor: null, has_more: false });
}

/** One event per succeeded request among `request_id`, completed since `start` (default: the last 24 hours). */
function billingEvents(url: URL): Response {
  const ids = new Set(url.searchParams.getAll('request_id'));
  const start = url.searchParams.get('start');
  const since = start ? Date.parse(start) : Date.now() - BILLING_WINDOW_MS;
  const events = [...requests.values()]
    .filter((entry) => ids.has(entry.id) && succeeded(entry) && completedAt(entry)! >= since)
    .map((entry) => ({
      request_id: entry.id,
      endpoint_id: entry.endpointId,
      cost_total: billedCost(entry),
      timestamp: new Date(completedAt(entry)!).toISOString(),
    }));
  return json({ billing_events: events, next_cursor: null, has_more: false });
}

function platformRoute(request: Request, url: URL, path: string): Response {
  if (request.method !== 'GET') return detail('Method not allowed', 405);
  if (path === '/v1/models/billing-events') {
    return authorized(request, FAL_BILLING_KEY) ? billingEvents(url) : detail('A billing key is required', 401);
  }
  if (path === '/v1/account/billing') {
    if (!authorized(request, FAL_BILLING_KEY)) return detail('A billing key is required', 401);
    const body: JsonObject = { username: 'e2e' };
    if (url.searchParams.getAll('expand').includes('credits')) body.credits = { current_balance: FAKE_BALANCE_USD, currency: 'USD' };
    return json(body);
  }
  if (!authorized(request, FAL_KEY)) return detail('Invalid fal key', 401);
  if (path === '/v1/models') return models(url);
  if (path === '/v1/models/pricing') return pricing(url);
  return detail('Not found', 404);
}

// ---------------------------------------------------------------------------
// Media fixtures
// ---------------------------------------------------------------------------

const glb = triangleGlb();

function media(name: string): Response {
  const entry = Object.values(MEDIA).find((item) => item.name === name);
  if (!entry) return detail('Not found', 404);
  const body = name === MEDIA.model3d.name ? glb : Bun.file(join(MEDIA_DIR, name));
  return new Response(body, { headers: { 'content-type': entry.contentType } });
}

/** A binary glTF holding one triangle: the smallest mesh a viewer renders. */
function triangleGlb(): Uint8Array<ArrayBuffer> {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const gltf = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
    bufferViews: [{ buffer: 0, byteLength: positions.byteLength }],
    buffers: [{ byteLength: positions.byteLength }],
  };
  // Chunks are 4-byte aligned: JSON padded with spaces, binary with zeros.
  const text = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonChunk = new Uint8Array(Math.ceil(text.length / 4) * 4).fill(0x20);
  jsonChunk.set(text);
  const binChunk = new Uint8Array(positions.buffer);
  const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); // "glTF"
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonChunk.length, true);
  view.setUint32(16, 0x4e4f534a, true); // "JSON"
  out.set(jsonChunk, 20);
  const binStart = 20 + jsonChunk.length;
  view.setUint32(binStart, binChunk.length, true);
  view.setUint32(binStart + 4, 0x004e4942, true); // "BIN"
  out.set(binChunk, binStart + 8);
  return out;
}

// ---------------------------------------------------------------------------
// Control hooks for specs (no auth)
// ---------------------------------------------------------------------------

async function controlRoute(request: Request, path: string): Promise<Response> {
  if (path === '/__control/health') return json({ ok: true });
  if (path === '/__control/requests' && request.method === 'GET') {
    return json({
      requests: [...requests.values()].map((entry) => ({
        request_id: entry.id,
        endpoint_id: entry.endpointId,
        input: entry.input,
        status: completedAt(entry) === null ? 'IN_PROGRESS' : 'COMPLETED',
        held: entry.held && entry.releasedAt === null,
        cancelled: entry.cancelledAt !== null,
        submitted_at: new Date(entry.submittedAt).toISOString(),
      })),
    });
  }
  if (path === '/__control/uploads' && request.method === 'GET') {
    return json({
      uploads: [...uploads.values()].map((upload) => ({
        file_url: upload.fileUrl,
        file_name: upload.fileName,
        content_type: upload.contentType,
        size: upload.bytes?.byteLength ?? null,
        expiration_duration_seconds: upload.expirationSeconds,
      })),
    });
  }
  if (path === '/__control/release' && request.method === 'POST') {
    const { request_id: id } = (await request.json()) as { request_id?: string };
    const entry = id ? requests.get(id) : undefined;
    if (!entry) return detail('Request not found', 404);
    if (!entry.held || entry.releasedAt !== null || entry.cancelledAt !== null) return detail('Request is not held', 409);
    entry.releasedAt = Date.now();
    return json({ released: entry.id });
  }
  if (path === '/__control/schema' && request.method === 'POST') {
    const body = (await request.json()) as { endpoint_id?: string; input?: JsonObject; status?: 'active' | 'deprecated' };
    if (!body.endpoint_id || !fakeModel(body.endpoint_id)) return detail('Unknown endpoint', 404);
    // Each call states the whole override: what it omits is back to the catalog's.
    overrides.set(body.endpoint_id, { input: body.input, status: body.status });
    return json({ endpoint_id: body.endpoint_id });
  }
  return detail('Not found', 404);
}

Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path.startsWith('/__control/')) return controlRoute(request, path);
    if (path.startsWith('/v1/')) return platformRoute(request, url, path);
    if (path === '/storage/upload/initiate' && request.method === 'POST') return initiateUpload(request);
    if (path.startsWith('/storage/put/') && request.method === 'PUT') return putUpload(request, path.slice('/storage/put/'.length));
    if (path.startsWith('/files/') && request.method === 'GET') return uploadedFile(path.split('/')[2] ?? '');
    if (path.startsWith('/media/') && request.method === 'GET') return media(decodeURIComponent(path.slice('/media/'.length)));
    return queueRoute(request, path);
  },
});

console.log(`fal-fake listening on ${PORT}, handing out ${PUBLIC_URL}`);
