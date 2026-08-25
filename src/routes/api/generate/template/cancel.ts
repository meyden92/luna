import { createFileRoute } from '@tanstack/react-router';
import Replicate from 'replicate';
import { z } from 'zod';
import { listCancellableTemplateGenerations, markTemplateGenerationsFailed } from '@/db/queries/ai';
import { checkScopedRateLimit, retryAfterSeconds } from '@/libs/api/rate-limit';
import { env } from '@/libs/env';
import { requireAuthenticatedUser } from '@/libs/rbac/guards';

const replicate = new Replicate({ auth: env.REPLICATE_API_TOKEN });

/**
 * Cancels a template batch the user deliberately stopped.
 *
 * The streaming endpoint no longer cancels predictions when its request closes,
 * because a dropped transport looks exactly like a user pressing Cancel and
 * killing the predictions threw away runs that were about to succeed (issue
 * #59). Cancellation therefore needs a channel that only a deliberate cancel
 * uses, which is this one.
 */
const cancelBodySchema = z.object({
  generationIds: z.array(z.string().min(1)).min(1).max(4),
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function handle(request: Request): Promise<Response> {
  let userId: string;
  try {
    userId = (await requireAuthenticatedUser(request.headers)).id;
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

  const rl = checkScopedRateLimit('cancelTemplate', userId);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': retryAfterSeconds(rl.retryAfterMs) },
    });
  }

  const parsed = cancelBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'generationIds is required' }, 400);

  const generations = await listCancellableTemplateGenerations(parsed.data.generationIds, userId);

  // Best-effort: a prediction that already settled cannot be cancelled, and the
  // row still has to end up failed either way.
  await Promise.all(
    generations.map(({ replicateId }) =>
      replicateId
        ? replicate.predictions.cancel(replicateId).catch((error: unknown) => {
            console.error('[template] cancel prediction failed', replicateId, error);
          })
        : Promise.resolve(),
    ),
  );

  // Covers every requested id, not just the ones that reached Replicate: a
  // batch cancelled before its predictions were created has rows to close too.
  const cancelled = await markTemplateGenerationsFailed(
    { ids: parsed.data.generationIds, ownerId: userId, errorMessage: 'Generation was cancelled' },
    userId,
  );

  return json({ cancelled }, 200);
}

export const Route = createFileRoute('/api/generate/template/cancel')({
  server: { handlers: { POST: ({ request }) => handle(request) } },
});
