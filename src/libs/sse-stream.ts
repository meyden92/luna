/**
 * Server-sent-event transport for streaming endpoints. Pure — no database or S3
 * at import time — which is what makes it testable without an environment.
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

/**
 * How often an otherwise idle stream emits a keepalive comment.
 *
 * Bound by the server, not by taste: production runs on Nitro's bun preset,
 * which calls `Bun.serve` without an `idleTimeout`, so Bun's 10-second default
 * kills any response whose socket goes quiet for that long (issue #59). Three
 * seconds leaves room for a missed tick or a stalled event loop.
 */
export const SSE_HEARTBEAT_MS = 3000;

export type SseSend = (payload: unknown) => void;

export function eventStreamResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, { headers: SSE_HEADERS });
}

/**
 * `heartbeatMs` keeps the response body from going silent: an SSE comment every
 * interval, which the spec says a client ignores. Without it a stream waiting
 * on slow upstream work emits nothing for minutes (issue #59).
 */
export function createSseWriter(
  controller: ReadableStreamDefaultController<Uint8Array>,
  options: { signal?: AbortSignal; mapPayload?: (payload: unknown) => unknown; heartbeatMs?: number } = {},
): { send: SseSend; close: () => void } {
  const encoder = new TextEncoder();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

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

  const write = (frame: string) => {
    if (closed || options.signal?.aborted) return;
    try {
      controller.enqueue(encoder.encode(frame));
    } catch {
      // The stream errored without aborting the signal. `write` runs from a
      // timer as well as from `send`, and an uncaught throw there would escape
      // the event loop rather than the request.
      close();
    }
  };

  const send: SseSend = (payload) => {
    const data = options.mapPayload ? options.mapPayload(payload) : payload;
    write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // A disconnect fires the signal but not necessarily `close()`, and a
  // heartbeat left ticking would keep the request alive for its whole poll.
  options.signal?.addEventListener('abort', close, { once: true });
  if (options.heartbeatMs) heartbeat = setInterval(() => write(': ping\n\n'), options.heartbeatMs);

  return { send, close };
}
