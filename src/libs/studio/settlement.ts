import type { FalBillingEvent } from '@/libs/fal/client';
import { roundUsd } from './cost';
import type { GenerationError, GenerationStatus } from './types';

/**
 * Cost settlement: which finished Generations get which actual cost, from
 * fal's billing events. Pure; the `settle-studio-costs` task feeds it.
 */

/** How many request ids one billing-events call asks about. */
export const SETTLEMENT_BATCH_SIZE = 50;
/** How long a success waits for its billing event before its estimate is booked. */
export const BILLING_EVENT_WAIT_MS = 24 * 60 * 60 * 1000;

export interface UnsettledGeneration {
  id: string;
  falRequestId: string | null;
  status: GenerationStatus;
  error: GenerationError | null;
  estimatedCostUsd: number | null;
  completedAt: Date | null;
}

/**
 * The actual cost of each finished Generation that can be settled now. fal
 * bills only successful output, so failed and cancelled ones cost nothing,
 * except a failure fal billed (`error.billed`), which settles like a success.
 * A success costs its billing events, or its estimate without a billing key
 * or once a day passed without an event. Successes still waiting are left out.
 */
export function settledCosts({
  generations,
  events,
  now,
  billing,
}: {
  generations: UnsettledGeneration[];
  events: FalBillingEvent[];
  now: Date;
  billing: boolean;
}): { id: string; actualCostUsd: number }[] {
  const billed = new Map<string, number>();
  for (const event of events) billed.set(event.requestId, (billed.get(event.requestId) ?? 0) + event.costTotal);

  return generations.flatMap((row) => {
    const billedFailure = row.status === 'failed' && row.error?.billed === true;
    if ((row.status === 'failed' && !billedFailure) || row.status === 'cancelled') return [{ id: row.id, actualCostUsd: 0 }];
    if (row.status !== 'succeeded' && !billedFailure) return [];
    const cost = row.falRequestId ? billed.get(row.falRequestId) : undefined;
    if (cost !== undefined) return [{ id: row.id, actualCostUsd: roundUsd(cost) }];
    const waited = row.completedAt ? now.getTime() - row.completedAt.getTime() : Number.POSITIVE_INFINITY;
    if (billing && waited <= BILLING_EVENT_WAIT_MS) return [];
    return [{ id: row.id, actualCostUsd: row.estimatedCostUsd ?? 0 }];
  });
}
