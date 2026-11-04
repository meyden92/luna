import type { JsonValue } from '@/db/schema/json';

/**
 * A thin, typed client over fal.ai's REST APIs. Every host comes from
 * `FalConfig`, and queue status, result and cancel use the URLs fal returned
 * on submit. Pure: no env or database access.
 */

export interface FalConfig {
  key: string;
  /** A BILLING or FULL scope key; billing events need it. */
  billingKey?: string;
  /** `https://queue.fal.run` */
  queueBaseUrl: string;
  /** `https://rest.fal.ai`: storage uploads and the webhook JWKS. */
  restBaseUrl: string;
  /** `https://api.fal.ai/v1`: the Platform API. */
  apiBaseUrl: string;
  /** Per-request timeout. */
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/** A failed fal call, carrying fal's `error_type` where it sent one. */
export class FalError extends Error {
  readonly status: number;
  readonly errorType: string | undefined;
  readonly detail: JsonValue | undefined;

  constructor(message: string, options: { status: number; errorType?: string; detail?: JsonValue }) {
    super(message);
    this.name = 'FalError';
    this.status = options.status;
    this.errorType = options.errorType;
    this.detail = options.detail;
  }
}

export interface FalSubmitted {
  requestId: string;
  statusUrl: string;
  responseUrl: string;
  cancelUrl: string;
  queuePosition: number | null;
}

export type FalQueueStatus =
  | { status: 'IN_QUEUE'; queuePosition: number | null }
  | { status: 'IN_PROGRESS' }
  | { status: 'COMPLETED'; error: string | null; errorType: string | null };

/**
 * What a cancel achieved: removed from the queue, asked to stop while running
 * (it may still finish), already done, or unknown to fal.
 */
export type FalCancelOutcome = 'cancelled' | 'cancellation_requested' | 'already_completed' | 'not_found';

export interface FalModel {
  endpointId: string;
  displayName: string;
  category: string;
  description: string;
  status: 'active' | 'deprecated';
  thumbnailUrl: string | null;
  /** The endpoint's OpenAPI 3.0 document, when requested with `expandOpenapi`. */
  openapi: JsonValue | null;
}

export interface FalModelPage {
  models: FalModel[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface FalPrice {
  endpointId: string;
  unitPrice: number;
  unit: string;
  currency: string;
}

export interface FalBillingEvent {
  requestId: string;
  endpointId: string;
  costTotal: number;
}

export interface FalBalance {
  currentBalance: number;
  currency: string;
}

export interface FalModelsQuery {
  q?: string;
  category?: string;
  /** 1–50 endpoint ids. */
  endpointIds?: string[];
  expandOpenapi?: boolean;
  status?: 'active' | 'deprecated';
  cursor?: string;
  limit?: number;
}

export type FalClient = ReturnType<typeof createFalClient>;

type RawRecord = Record<string, JsonValue>;

const DEFAULT_TIMEOUT_MS = 30_000;

export function createFalClient(config: FalConfig) {
  const fetchImpl = config.fetch ?? fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const api = trimSlash(config.apiBaseUrl);

  async function call(url: string, init: RequestInit & { key?: string } = {}): Promise<Response> {
    const { key = config.key, headers, ...rest } = init;
    const response = await fetchImpl(url, {
      ...rest,
      headers: { Authorization: `Key ${key}`, Accept: 'application/json', ...headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw await falErrorFrom(response);
    return response;
  }

  async function callJson<T = RawRecord>(url: string, init: RequestInit & { key?: string } = {}): Promise<T> {
    const response = await call(url, init);
    return (await response.json()) as T;
  }

  const queue = {
    /** Submits to fal's queue; `webhookUrl` asks fal to POST the outcome there. */
    async submit(
      endpointId: string,
      input: Record<string, JsonValue>,
      options: { webhookUrl?: string | null } = {},
    ): Promise<FalSubmitted> {
      const url = new URL(`${trimSlash(config.queueBaseUrl)}/${endpointId}`);
      if (options.webhookUrl) url.searchParams.set('fal_webhook', options.webhookUrl);
      const body = await callJson(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      return {
        requestId: requiredString(body, 'request_id'),
        statusUrl: requiredString(body, 'status_url'),
        responseUrl: requiredString(body, 'response_url'),
        cancelUrl: requiredString(body, 'cancel_url'),
        queuePosition: typeof body.queue_position === 'number' ? body.queue_position : null,
      };
    },

    async status(statusUrl: string): Promise<FalQueueStatus> {
      const body = await callJson(statusUrl);
      if (body.status === 'IN_QUEUE') {
        return { status: 'IN_QUEUE', queuePosition: typeof body.queue_position === 'number' ? body.queue_position : null };
      }
      if (body.status === 'IN_PROGRESS') return { status: 'IN_PROGRESS' };
      if (body.status === 'COMPLETED') {
        return {
          status: 'COMPLETED',
          error: typeof body.error === 'string' ? body.error : null,
          errorType: typeof body.error_type === 'string' ? body.error_type : null,
        };
      }
      throw new FalError(`Unknown queue status: ${String(body.status)}`, { status: 502 });
    },

    /** The model's output JSON. A failed request rejects with a `FalError`. */
    async result(responseUrl: string): Promise<JsonValue> {
      return callJson<JsonValue>(responseUrl);
    },

    async cancel(cancelUrl: string): Promise<FalCancelOutcome> {
      const response = await fetchImpl(cancelUrl, {
        method: 'PUT',
        headers: { Authorization: `Key ${config.key}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status === 200) return 'cancelled';
      if (response.status === 202) return 'cancellation_requested';
      if (response.status === 400) return 'already_completed';
      if (response.status === 404) return 'not_found';
      throw await falErrorFrom(response);
    },
  };

  const storage = {
    /**
     * Uploads to fal storage and returns the file's URL for model inputs.
     * fal deletes the file after `expiresInSeconds`.
     */
    async upload(blob: Blob, options: { fileName: string; expiresInSeconds: number }): Promise<string> {
      const contentType = blob.type || 'application/octet-stream';
      const initiated = await callJson(`${trimSlash(config.restBaseUrl)}/storage/upload/initiate?storage_type=fal-cdn-v3`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Fal-Object-Lifecycle': JSON.stringify({ expiration_duration_seconds: options.expiresInSeconds }),
        },
        body: JSON.stringify({ content_type: contentType, file_name: options.fileName }),
      });
      const uploadUrl = requiredString(initiated, 'upload_url');
      const fileUrl = requiredString(initiated, 'file_url');
      // The upload URL is pre-signed: it takes no fal key.
      const put = await fetchImpl(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: blob,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!put.ok) throw await falErrorFrom(put);
      return fileUrl;
    },
  };

  const platform = {
    async models(query: FalModelsQuery = {}): Promise<FalModelPage> {
      const url = new URL(`${api}/models`);
      if (query.q) url.searchParams.set('q', query.q);
      if (query.category) url.searchParams.set('category', query.category);
      for (const id of query.endpointIds ?? []) url.searchParams.append('endpoint_id', id);
      if (query.expandOpenapi) url.searchParams.set('expand', 'openapi-3.0');
      if (query.status) url.searchParams.set('status', query.status);
      if (query.cursor) url.searchParams.set('cursor', query.cursor);
      if (query.limit) url.searchParams.set('limit', String(query.limit));
      const body = await callJson(url.toString());
      return {
        models: asRecords(body.models).map(toModel),
        nextCursor: typeof body.next_cursor === 'string' ? body.next_cursor : null,
        hasMore: body.has_more === true,
      };
    },

    /** Unit prices of up to 50 endpoints. */
    async pricing(endpointIds: string[]): Promise<FalPrice[]> {
      if (endpointIds.length === 0) return [];
      const url = new URL(`${api}/models/pricing`);
      for (const id of endpointIds) url.searchParams.append('endpoint_id', id);
      const body = await callJson(url.toString());
      return asRecords(body.prices).map((price) => ({
        endpointId: requiredString(price, 'endpoint_id'),
        unitPrice: Number(price.unit_price),
        unit: String(price.unit ?? ''),
        currency: String(price.currency ?? 'USD'),
      }));
    },

    /**
     * Billed costs of up to 50 requests, following every page. fal searches the
     * last 24 hours unless `start` says otherwise. Needs `billingKey`.
     */
    async billingEvents(requestIds: string[], options: { start?: Date } = {}): Promise<FalBillingEvent[]> {
      if (!config.billingKey) throw new FalError('No fal billing key is configured', { status: 401 });
      if (requestIds.length === 0) return [];
      const events: FalBillingEvent[] = [];
      let cursor: string | null = null;
      do {
        const url = new URL(`${api}/models/billing-events`);
        for (const id of requestIds) url.searchParams.append('request_id', id);
        if (options.start) url.searchParams.set('start', options.start.toISOString());
        if (cursor) url.searchParams.set('cursor', cursor);
        const body = await callJson(url.toString(), { key: config.billingKey });
        for (const event of asRecords(body.billing_events)) {
          events.push({
            requestId: requiredString(event, 'request_id'),
            endpointId: String(event.endpoint_id ?? ''),
            costTotal: Number(event.cost_total),
          });
        }
        cursor = body.has_more === true && typeof body.next_cursor === 'string' ? body.next_cursor : null;
      } while (cursor);
      return events;
    },

    /** The account's credit balance. Needs `billingKey`. */
    async balance(): Promise<FalBalance> {
      if (!config.billingKey) throw new FalError('No fal billing key is configured', { status: 401 });
      const body = await callJson(`${api}/account/billing?expand=credits`, { key: config.billingKey });
      const credits = isRecord(body.credits) ? body.credits : {};
      return { currentBalance: Number(credits.current_balance ?? 0), currency: String(credits.currency ?? 'USD') };
    },
  };

  return { queue, storage, platform };
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function isRecord(value: JsonValue | undefined): value is RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecords(value: JsonValue | undefined): RawRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function requiredString(body: RawRecord, key: string): string {
  const value = body[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new FalError(`fal response is missing ${key}`, { status: 502 });
  }
  return value;
}

function toModel(raw: RawRecord): FalModel {
  const metadata = isRecord(raw.metadata) ? raw.metadata : {};
  return {
    endpointId: requiredString(raw, 'endpoint_id'),
    displayName: String(metadata.display_name ?? raw.endpoint_id),
    category: String(metadata.category ?? ''),
    description: String(metadata.description ?? ''),
    status: metadata.status === 'deprecated' ? 'deprecated' : 'active',
    thumbnailUrl: typeof metadata.thumbnail_url === 'string' ? metadata.thumbnail_url : null,
    openapi: raw.openapi ?? null,
  };
}

/**
 * Reads fal's three error shapes: request-level `{ detail: string, error_type }`,
 * model-level `{ detail: [{ msg, type, loc }] }` and the Platform API's
 * `{ error: { type, message } }`.
 */
async function falErrorFrom(response: Response): Promise<FalError> {
  const headerType = response.headers.get('x-fal-error-type') ?? undefined;
  const text = await response.text().catch(() => '');
  let body: JsonValue = null;
  try {
    body = text ? (JSON.parse(text) as JsonValue) : null;
  } catch {
    body = text;
  }
  const status = response.status;
  if (isRecord(body)) {
    if (isRecord(body.error)) {
      const message = String(body.error.message ?? `fal request failed (${status})`);
      return new FalError(message, { status, errorType: typeof body.error.type === 'string' ? body.error.type : headerType, detail: body });
    }
    if (typeof body.detail === 'string') {
      const errorType = typeof body.error_type === 'string' ? body.error_type : headerType;
      return new FalError(body.detail, { status, errorType, detail: body });
    }
    if (Array.isArray(body.detail)) {
      const first = body.detail.find(isRecord);
      const message = first && typeof first.msg === 'string' ? first.msg : `fal request failed (${status})`;
      const errorType = first && typeof first.type === 'string' ? first.type : headerType;
      return new FalError(message, { status, errorType, detail: body.detail });
    }
  }
  return new FalError(`fal request failed (${status})`, { status, errorType: headerType, detail: body ?? undefined });
}
