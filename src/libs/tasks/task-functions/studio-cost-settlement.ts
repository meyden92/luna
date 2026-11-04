import { listUnsettledGenerations, settleGenerationCosts } from '@/db/queries/generations';
import { throwIfAborted } from '@/libs/abort';
import type { FalBillingEvent } from '@/libs/fal/client';
import { falClient, hasFalBillingKey, isStudioEnabled } from '@/libs/studio/config';
import { SETTLEMENT_BATCH_SIZE, settledCosts } from '@/libs/studio/settlement';
import type { TaskFunction } from '@/types/tasks';

/** Asks fal for events from this long before a batch's oldest completion, in case its clock or ours is off. */
const EVENT_WINDOW_MARGIN_MS = 60 * 60 * 1000;

/**
 * Replaces the estimates of finished Studio Generations with their actual
 * cost: fal's billing events when `FAL_BILLING_KEY` is set, else the estimate.
 * Failed and cancelled ones settle at nothing.
 */
export const settleStudioCostsExecutor: TaskFunction = async (...args) => {
  const { signal } = args[args.length - 1];
  throwIfAborted(signal);
  if (!isStudioEnabled()) return { summary: 'The Studio is off', details: { settledCount: 0 } };

  const billing = hasFalBillingKey();
  let settledCount = 0;
  let afterId: string | null = null;
  for (;;) {
    throwIfAborted(signal);
    const batch = await listUnsettledGenerations(afterId, SETTLEMENT_BATCH_SIZE);
    if (batch.length === 0) break;
    afterId = batch.at(-1)?.id ?? null;

    let events: FalBillingEvent[] = [];
    const requestIds = batch.flatMap((row) => (row.status === 'succeeded' && row.falRequestId ? [row.falRequestId] : []));
    if (billing && requestIds.length > 0) {
      const oldest = Math.min(...batch.map((row) => row.completedAt?.getTime() ?? Date.now()));
      events = await falClient().platform.billingEvents(requestIds, { start: new Date(oldest - EVENT_WINDOW_MARGIN_MS) });
    }
    settledCount += await settleGenerationCosts(settledCosts({ generations: batch, events, now: new Date(), billing }), new Date());
    if (batch.length < SETTLEMENT_BATCH_SIZE) break;
  }

  return {
    summary: settledCount > 0 ? `Settled the cost of ${settledCount} Studio Generations` : 'No Studio Generations to settle',
    details: { settledCount, billingEvents: billing, executedAt: new Date().toISOString() },
  };
};
