import { describe, expect, test } from 'bun:test';
import { createPredictionAbortRegistry, createSseWriter, eventStreamResponse } from './sse-stream';

/**
 * Issue #59: a template generation emits no bytes between "Creating AI
 * predictions..." and the first prediction settling, which is minutes of an
 * idle response body, and the stream died at ~10s in production. Nothing else
 * in the suite exercises a stream that is deliberately doing nothing, and a
 * heartbeat that keeps ticking after the client has gone would hold the request
 * open for the whole poll.
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

    // Comment frames, so `streamSSE` skips them and no client has to change.
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

/**
 * Issue #59: a dropped transport and a user pressing Cancel reach the server as
 * the same disconnect, and cancelling the Replicate predictions on it destroyed
 * work the reconciler could have finished. Which of the two a route wants is
 * now a flag, and nothing else would catch it being read the wrong way round.
 */
describe('createPredictionAbortRegistry disconnect policy', () => {
  test('cancels registered predictions on disconnect by default', () => {
    const canceled: string[] = [];
    const request = new AbortController();
    const registry = createPredictionAbortRegistry(request.signal, async (id) => void canceled.push(id), '[test]');
    registry.registerPrediction('pred-1');
    registry.registerPrediction('pred-2');

    request.abort();

    expect(registry.signal.aborted).toBe(true);
    expect(canceled).toEqual(['pred-1', 'pred-2']);
  });

  test('leaves predictions running on disconnect when asked to, but still stops server-side work', () => {
    const canceled: string[] = [];
    const request = new AbortController();
    const registry = createPredictionAbortRegistry(request.signal, async (id) => void canceled.push(id), '[test]', {
      cancelPredictionsOnDisconnect: false,
    });
    registry.registerPrediction('pred-1');

    request.abort();

    // Polling and uploads still have to stop — there is nobody left to send to.
    expect(registry.signal.aborted).toBe(true);
    expect(canceled).toEqual([]);
  });

  test('leaves a prediction registered after the disconnect running too', () => {
    const canceled: string[] = [];
    const request = new AbortController();
    const registry = createPredictionAbortRegistry(request.signal, async (id) => void canceled.push(id), '[test]', {
      cancelPredictionsOnDisconnect: false,
    });

    request.abort();
    registry.registerPrediction('pred-late');

    expect(canceled).toEqual([]);
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
