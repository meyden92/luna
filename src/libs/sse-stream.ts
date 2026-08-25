/**
 * Server-sent-event transport for the streaming generation endpoints, kept
 * apart from `ai-generation-utils` because that module reaches the database and
 * S3 at import time and these pieces are pure — which is what makes them
 * testable without an environment.
 */

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  // Nginx and the proxies that copy its conventions buffer a response body by
  // default, which holds a stream's bytes back until the buffer fills. Issue
  // #59: a stream that emits nothing for ten seconds is what a buffering hop
  // can drop.
  'X-Accel-Buffering': 'no',
};

/** How often an otherwise idle stream emits a keepalive comment. */
export const SSE_HEARTBEAT_MS = 5000;

export type SseSend = (payload: unknown) => void;

export function eventStreamResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, { headers: SSE_HEADERS });
}

/**
 * `heartbeatMs` keeps the response body from going silent: an SSE comment every
 * interval, which the spec says a client ignores and `streamSSE` already skips
 * because it only reads `data: ` lines. Without it a generation emits nothing
 * for the minutes a prediction polls (issue #59).
 */
export function createSseWriter(
  controller: ReadableStreamDefaultController<Uint8Array>,
  options: { signal?: AbortSignal; mapPayload?: (payload: unknown) => unknown; heartbeatMs?: number } = {},
): { send: SseSend; close: () => void } {
  const encoder = new TextEncoder();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const write = (frame: string) => {
    if (closed || options.signal?.aborted) return;
    controller.enqueue(encoder.encode(frame));
  };

  const close = () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    options.signal?.removeEventListener('abort', close);
    try {
      controller.close();
    } catch {
      /* stream already canceled */
    }
  };

  const send: SseSend = (payload) => {
    const data = options.mapPayload ? options.mapPayload(payload) : payload;
    write(`data: ${JSON.stringify(data)}\n\n`);
  };

  if (options.heartbeatMs) {
    heartbeat = setInterval(() => write(': ping\n\n'), options.heartbeatMs);
    // A disconnect fires the signal but not necessarily `close()` — the timer
    // has to stop either way or it keeps the request alive for its full poll.
    options.signal?.addEventListener('abort', close, { once: true });
  }

  return { send, close };
}

/**
 * Tracks the Replicate predictions a stream created, so a client going away can
 * stop the server-side work polling and uploading for it.
 *
 * `cancelPredictionsOnDisconnect` decides what "going away" costs. A transport
 * drop and a user pressing Cancel arrive identically — both are just a closed
 * request — so a route may only cancel the predictions if it is certain the
 * disconnect was deliberate. Where a reconciler can finish an orphaned
 * prediction later (`checkTemplateGenerations`), pass `false` and let an
 * explicit cancel endpoint do the cancelling instead: issue #59 is a dropped
 * QUIC stream destroying two predictions that were about to succeed.
 */
export function createPredictionAbortRegistry(
  requestSignal: AbortSignal,
  cancelPrediction: (predictionId: string) => Promise<unknown>,
  logPrefix: string,
  options: { cancelPredictionsOnDisconnect?: boolean } = {},
): {
  signal: AbortSignal;
  registerPrediction: (predictionId: string) => void;
  handleDisconnect: () => void;
  cleanup: () => void;
} {
  const cancelOnDisconnect = options.cancelPredictionsOnDisconnect ?? true;
  const abortController = new AbortController();
  const abortSignal = abortController.signal;
  const predictionIds = new Set<string>();
  const canceledPredictionIds = new Set<string>();

  const cancelRegisteredPrediction = (predictionId: string) => {
    if (canceledPredictionIds.has(predictionId)) return;
    canceledPredictionIds.add(predictionId);
    void cancelPrediction(predictionId).catch((error: unknown) =>
      console.error(`${logPrefix} cancel prediction failed`, predictionId, error),
    );
  };

  const handleDisconnect = () => {
    if (!abortSignal.aborted) abortController.abort();
    if (!cancelOnDisconnect) return;
    for (const predictionId of predictionIds) cancelRegisteredPrediction(predictionId);
  };

  const registerPrediction = (predictionId: string) => {
    predictionIds.add(predictionId);
    if (cancelOnDisconnect && abortSignal.aborted) cancelRegisteredPrediction(predictionId);
  };

  if (requestSignal.aborted) handleDisconnect();
  else requestSignal.addEventListener('abort', handleDisconnect, { once: true });

  return {
    signal: abortSignal,
    registerPrediction,
    handleDisconnect,
    cleanup: () => requestSignal.removeEventListener('abort', handleDisconnect),
  };
}
