import { describe, expect, test } from 'bun:test';
import { createSseWriter, eventStreamResponse, SSE_HEARTBEAT_MS } from './sse-stream';

/**
 * A stream waiting on slow upstream work emits no bytes for minutes, and in
 * production it dies at ~10s of silence; the Studio's event stream sits idle
 * the same way between Generation updates. Nothing else in the suite exercises
 * a stream that is deliberately doing nothing, and a heartbeat that keeps
 * ticking after the client has gone would hold the request open for good.
 */

const HEARTBEAT_MS = 20;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Stands in for the `ReadableStream` controller, recording what was written. */
function recordingController() {
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  const controller = {
    enqueue: (chunk: Uint8Array) => chunks.push(decoder.decode(chunk)),
    close: () => {},
  } as unknown as ReadableStreamDefaultController<Uint8Array>;
  return { chunks, controller };
}

describe('createSseWriter heartbeat', () => {
  test('writes keepalive comments while the stream is idle', async () => {
    const { chunks, controller } = recordingController();

    const { close } = createSseWriter(controller, { heartbeatMs: HEARTBEAT_MS });
    await sleep(HEARTBEAT_MS * 3.5);
    close();

    // Comment frames, so an SSE client skips them and no client has to change.
    expect(chunks.every((chunk) => chunk.startsWith(':'))).toBe(true);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  test('stops once the stream is closed', async () => {
    const { chunks, controller } = recordingController();

    const { close } = createSseWriter(controller, { heartbeatMs: HEARTBEAT_MS });
    await sleep(HEARTBEAT_MS * 2.5);
    close();
    const atClose = chunks.length;
    await sleep(HEARTBEAT_MS * 3);

    expect(chunks.length).toBe(atClose);
  });

  test('stops when the client disconnects, without waiting for close', async () => {
    const { chunks, controller } = recordingController();
    const disconnect = new AbortController();

    createSseWriter(controller, { heartbeatMs: HEARTBEAT_MS, signal: disconnect.signal });
    await sleep(HEARTBEAT_MS * 2.5);
    disconnect.abort();
    const atDisconnect = chunks.length;
    await sleep(HEARTBEAT_MS * 3);

    expect(chunks.length).toBe(atDisconnect);
  });

  test('omits the heartbeat entirely when no interval is configured', async () => {
    const { chunks, controller } = recordingController();

    const { send, close } = createSseWriter(controller, {});
    await sleep(HEARTBEAT_MS * 3);
    send({ status: 'processing' });
    close();

    expect(chunks).toEqual(['data: {"status":"processing"}\n\n']);
  });
});

describe('eventStreamResponse', () => {
  test('tells proxies not to buffer the body', () => {
    const response = eventStreamResponse(new ReadableStream<Uint8Array>());

    // Buffering a stream holds its bytes back until the buffer fills, which
    // makes an idle generation look dead to every hop in front of it (#59).
    expect(response.headers.get('X-Accel-Buffering')).toBe('no');
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(response.headers.get('Cache-Control')).toBe('no-cache');
  });
});

/**
 * The heartbeat tests above drive a stand-in controller, which proves the writer
 * enqueues but not that the frames survive a real response body. This reads
 * bytes back off an actual `eventStreamResponse` — everything the production
 * path does except the proxy hops in front of it.
 */
describe('heartbeat over a real response body', () => {
  test('a reader sees keepalives arrive while the producer is idle', async () => {
    let writer!: ReturnType<typeof createSseWriter>;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        writer = createSseWriter(controller, { heartbeatMs: HEARTBEAT_MS });
        writer.send({ status: 'processing', message: 'Creating AI predictions...' });
      },
    });

    const reader = eventStreamResponse(stream).body!.getReader();
    const decoder = new TextDecoder();
    const frames: string[] = [];
    // Three reads past the first event: the producer sends nothing more, so
    // anything that arrives is a keepalive.
    for (let i = 0; i < 4; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      frames.push(decoder.decode(value));
    }
    writer.close();

    expect(frames[0]).toBe('data: {"status":"processing","message":"Creating AI predictions..."}\n\n');
    expect(frames.slice(1)).toEqual([': ping\n\n', ': ping\n\n', ': ping\n\n']);
  });
});

/**
 * The idle-timeout kill, reproduced at its real source.
 *
 * Production serves this app through Nitro's bun preset, which calls
 * `Bun.serve` with no `idleTimeout` — so Bun's 10-second default applies and it
 * kills any response whose socket goes quiet for that long, logging "request
 * timed out after 10 seconds". A stream silent while it waits on the provider
 * is dropped by the server itself, which a route can misread as a client
 * cancellation.
 *
 * `bun run dev` is Vite's Node server and has no such timeout, which is exactly
 * why this only ever showed up deployed. A shortened `idleTimeout` stands in for
 * the 10-second default here so the test costs seconds rather than a minute.
 */
/**
 * The idle-timeout kill, reproduced at its real source.
 *
 * Production serves this app through Nitro's bun preset, which calls
 * `Bun.serve` with no `idleTimeout`, so Bun's 10-second default kills any
 * response whose socket goes quiet for that long — "request timed out after 10
 * seconds". A stream silent while it waits on the provider is dropped by the
 * server itself, which a route can misread as a client cancellation.
 *
 * `bun run dev` is Vite's Node server and has no such timeout, which is exactly
 * why this only ever appeared deployed and why no cheaper test would have
 * caught it. Costs a few seconds: Bun's idle timer is coarse, and `idleTimeout:
 * 1` measurably does not kill a stream until ~4s, so the quiet stretch has to
 * clear that to mean anything.
 */
/**
 * Why the interval exists at all, and why its value is not a matter of taste.
 *
 * Production serves this app through Nitro's bun preset, which calls
 * `Bun.serve` with no `idleTimeout` (`.output/server/index.mjs`), so Bun's
 * 10-second default governs every response: it drops any request whose socket
 * goes quiet for that long, logging "request timed out after 10 seconds". A
 * stream silent while it waits on the provider is dropped by the server
 * itself, which a route can misread as a client cancellation.
 *
 * `bun run dev` is Vite's Node server and has no such timeout, which is why
 * this only ever appeared deployed.
 *
 * Measured against Bun 1.3.14 rather than assumed: the default is a true idle
 * timer that writes reset, and a stream sending a comment every 3s survived 45
 * seconds of otherwise doing nothing. Not asserted through a real socket here —
 * that would test Bun's timeout semantics rather than this module's, and the
 * only settings that behave as an idle timer are slow enough to tax every run.
 * The keepalives reaching a reader is covered above; this covers the value.
 */
describe('heartbeat interval', () => {
  test('stays comfortably inside the Bun default idle timeout', () => {
    // The preset never overrides Bun's 10s default, so this constant is the
    // only thing keeping an idle event stream's connection alive.
    expect(SSE_HEARTBEAT_MS).toBeLessThan(10_000 / 2);
  });
});
