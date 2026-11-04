import { createFileRoute } from '@tanstack/react-router';
import { getGenerationByRequestId } from '@/db/queries/generations';
import { verifyFalWebhook } from '@/libs/fal/webhook';
import { falWebhookKeys, isStudioEnabled, studioWebhookTarget } from '@/libs/studio/config';
import { finishGeneration } from '@/libs/studio/pipeline';

/**
 * fal's delivery of a finished request. Authenticated by fal's ED25519
 * signature over the raw body, not by a session; the CSRF middleware only
 * covers server functions. Answers at once and finishes the Generation in the
 * background, since fal retries slow deliveries; the poller covers a crash.
 */
async function handle(request: Request): Promise<Response> {
  if (!isStudioEnabled() || !studioWebhookTarget()) return new Response(null, { status: 404 });

  const body = new Uint8Array(await request.arrayBuffer());
  const verification = await verifyFalWebhook({
    headers: request.headers,
    body,
    publicKeys: await falWebhookKeys(),
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  if (!verification.ok) return new Response(null, { status: 401 });

  const row = await getGenerationByRequestId(verification.requestId);
  // Unknown: possibly delivered before submit stored the request id. fal retries.
  if (!row) return new Response(null, { status: 404 });

  void finishGeneration(row.id).catch((error) => console.error(`[studio] Finishing Generation ${row.id} from its webhook failed:`, error));
  return new Response(null, { status: 200 });
}

export const Route = createFileRoute('/api/studio/fal-webhook')({
  server: { handlers: { POST: ({ request }) => handle(request) } },
});
