import { listTopEgressOwners, upsertEgressRollup, utcMonth } from '@/db/queries/analytics';

/** Adds one delivery's bytes to the owner's rollup for the current UTC month. */
export async function recordEgress({ ownerId, bytes }: { ownerId: string; bytes: number | bigint }) {
  const byteCount = typeof bytes === 'bigint' ? Number(bytes) : Math.max(0, Math.floor(bytes));
  if (byteCount <= 0) return;

  await upsertEgressRollup({ ownerId, period: utcMonth(new Date()), bytes: byteCount });
}

export function getTopEgressConsumers() {
  return listTopEgressOwners({ period: utcMonth(new Date()), limit: 20 });
}
