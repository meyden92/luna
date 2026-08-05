import prisma from '@/libs/prismadb';

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
  const byteCount = typeof bytes === 'bigint' ? bytes : BigInt(Math.max(0, Math.floor(bytes)));
  if (byteCount <= 0n) return;

  const period = new Date().toISOString().slice(0, 7);
  const existing = await prisma.egressRollup.findFirst({
    where: {
      ownerId,
      period,
      fileId: fileId ?? null,
      tokenId: tokenId ?? null,
      rendition,
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.egressRollup.update({
      where: { id: existing.id },
      data: {
        bytes: { increment: byteCount },
        requestCount: { increment: 1 },
      },
    });
  } else {
    await prisma.egressRollup.create({
      data: {
        ownerId,
        period,
        fileId: fileId ?? null,
        tokenId: tokenId ?? null,
        rendition,
        bytes: byteCount,
        requestCount: 1,
      },
    });
  }

  void prisma.egressEvent
    .create({
      data: {
        ownerId,
        bytes: byteCount,
        fileId: fileId ?? null,
        tokenId: tokenId ?? null,
        formShareId: formShareId ?? null,
        rendition,
        wasEstimated,
      },
    })
    .catch(() => undefined);
}

export async function getEgressSummary(ownerId: string) {
  const period = new Date().toISOString().slice(0, 7);
  const current = await prisma.egressRollup.aggregate({
    where: { ownerId, period },
    _sum: { bytes: true, requestCount: true },
  });
  const topFiles = await prisma.egressRollup.findMany({
    where: { ownerId, period, fileId: { not: null } },
    orderBy: { bytes: 'desc' },
    take: 10,
  });

  return {
    period,
    bytes: (current._sum.bytes ?? 0n).toString(),
    requestCount: current._sum.requestCount ?? 0,
    topFiles: topFiles.map((row) => ({
      fileId: row.fileId,
      bytes: row.bytes.toString(),
      requestCount: row.requestCount,
      rendition: row.rendition,
    })),
  };
}

export async function getTopEgressConsumers() {
  const period = new Date().toISOString().slice(0, 7);
  const rows = await prisma.egressRollup.groupBy({
    by: ['ownerId'],
    where: { period },
    _sum: { bytes: true, requestCount: true },
    orderBy: { _sum: { bytes: 'desc' } },
    take: 20,
  });
  return rows.map((row) => ({
    ownerId: row.ownerId,
    bytes: (row._sum.bytes ?? 0n).toString(),
    requestCount: row._sum.requestCount ?? 0,
  }));
}
