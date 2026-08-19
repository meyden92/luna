import {
  getEgressPeriodTotals,
  insertEgressEvent,
  listTopEgressFiles,
  listTopEgressOwners,
  upsertEgressRollup,
  utcMonth,
} from '@/db/queries/analytics';

export type EgressRenditionKind = 'original' | 'rendition' | 'embed' | 'download';

export async function recordEgress({
  ownerId,
  bytes,
  fileId,
  tokenId,
  formShareId,
  rendition = 'original',
  wasEstimated = true,
}: {
  ownerId: string;
  bytes: number | bigint;
  fileId?: string | null;
  tokenId?: string | null;
  formShareId?: string | null;
  rendition?: EgressRenditionKind;
  wasEstimated?: boolean;
}) {
  const byteCount = typeof bytes === 'bigint' ? Number(bytes) : Math.max(0, Math.floor(bytes));
  if (byteCount <= 0) return;

  const period = utcMonth(new Date());
  await upsertEgressRollup({
    ownerId,
    period,
    bytes: byteCount,
    fileId: fileId ?? null,
    tokenId: tokenId ?? null,
    rendition,
  });

  // The per-request event is best-effort: it is only ever read for forensics, and
  // this runs on a hot read path where a failed insert must not fail the request.
  void insertEgressEvent({
    ownerId,
    bytes: byteCount,
    fileId: fileId ?? null,
    tokenId: tokenId ?? null,
    formShareId: formShareId ?? null,
    rendition,
    wasEstimated,
  }).catch(() => undefined);
}

export async function getEgressSummary(ownerId: string) {
  const period = utcMonth(new Date());
  const [totals, topFiles] = await Promise.all([
    getEgressPeriodTotals(ownerId, period),
    listTopEgressFiles({ ownerId, period, limit: 10 }),
  ]);

  return {
    period,
    bytes: totals.bytes,
    requestCount: totals.requestCount,
    topFiles: topFiles.map((row) => ({
      fileId: row.fileId,
      bytes: row.bytes.toString(),
      requestCount: row.requestCount,
      rendition: row.rendition,
    })),
  };
}

export async function getTopEgressConsumers() {
  const period = utcMonth(new Date());
  const rows = await listTopEgressOwners({ period, limit: 20 });
  return rows.map((row) => ({
    ownerId: row.ownerId,
    bytes: row.bytes ?? '0',
    requestCount: Number(row.requestCount ?? 0),
  }));
}
