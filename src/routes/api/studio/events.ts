import { createFileRoute } from '@tanstack/react-router';
import { requireAuthenticatedUser } from '@/libs/rbac/guards';
import { createSseWriter, eventStreamResponse, SSE_HEARTBEAT_MS } from '@/libs/sse-stream';
import { isStudioEnabled } from '@/libs/studio/config';
import { subscribeStudioEvents } from '@/libs/studio/events';

/**
 * The signed-in User's Studio events as server-sent events: one
 * `generation.updated` per change of any of their Generations, from any tab
 * or the poller. Held open by the dashboard while the Studio is enabled.
 */
async function handle(request: Request): Promise<Response> {
  if (!isStudioEnabled()) return new Response(null, { status: 404 });

  let userId: string;
  try {
    userId = (await requireAuthenticatedUser(request.headers)).id;
  } catch {
    return Response.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  let unsubscribe = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const { send, close } = createSseWriter(controller, { signal: request.signal, heartbeatMs: SSE_HEARTBEAT_MS });
      unsubscribe = subscribeStudioEvents(userId, send);
      request.signal.addEventListener(
        'abort',
        () => {
          unsubscribe();
          close();
        },
        { once: true },
      );
    },
    cancel() {
      unsubscribe();
    },
  });
  return eventStreamResponse(stream);
}

export const Route = createFileRoute('/api/studio/events')({
  server: { handlers: { GET: ({ request }) => handle(request) } },
});
