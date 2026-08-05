import { createHmac } from 'node:crypto';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { deriveSigningKey } from '@/libs/crypto/signing-keys';
import { env } from '@/libs/env';
import prisma from '@/libs/prismadb';

export type ViewTargetKind = 'file' | 'formShare' | 'album' | 'collect';

export async function recordViewEvent({
  targetKind,
  targetId,
  ownerId,
  serverMs,
}: {
  targetKind: ViewTargetKind;
  targetId: string;
  ownerId?: string | null;
  serverMs?: number;
}) {
  const headers = getRequestHeaders();
  const createdAt = new Date();
  const day = createdAt.toISOString().slice(0, 10);
  const visitorHash = hashVisitor(headers, day);
  const country = normalizeCountry(headers.get('cf-ipcountry'));
  const referrerHost = parseReferrerHost(headers.get('referer'));
  const deviceClass = classifyDevice(headers.get('user-agent'));

  await prisma.$transaction(async (tx) => {
    const existingVisitor = await tx.viewEvent.findFirst({
      where: {
        targetKind,
        targetId,
        visitorHash,
        createdAt: { gte: new Date(`${day}T00:00:00.000Z`) },
      },
      select: { id: true },
    });

    await tx.viewEvent.create({
      data: {
        targetKind,
        targetId,
        ownerId,
        country,
        referrerHost,
        deviceClass,
        visitorHash,
        serverMs,
      },
    });

    const rollup = await tx.viewDailyRollup.findUnique({
      where: { targetKind_targetId_day: { targetKind, targetId, day } },
    });
    if (!rollup) {
      await tx.viewDailyRollup.create({
        data: {
          targetKind,
          targetId,
          ownerId,
          day,
          views: 1,
          uniques: 1,
          referrerBreakdown: referrerHost ? { [referrerHost]: 1 } : {},
          countryBreakdown: country ? { [country]: 1 } : {},
          deviceBreakdown: { [deviceClass]: 1 },
        },
      });
      return;
    }

    await tx.viewDailyRollup.update({
      where: { id: rollup.id },
      data: {
        views: { increment: 1 },
        uniques: existingVisitor ? rollup.uniques : rollup.uniques + 1,
        referrerBreakdown: incrementBreakdown(rollup.referrerBreakdown, referrerHost),
        countryBreakdown: incrementBreakdown(rollup.countryBreakdown, country),
        deviceBreakdown: incrementBreakdown(rollup.deviceBreakdown, deviceClass),
      },
    });
  });
}

export async function getViewStats(targetKind: ViewTargetKind, targetId: string, ownerId: string) {
  const rollups = await prisma.viewDailyRollup.findMany({
    where: { targetKind, targetId, ownerId },
    orderBy: { day: 'desc' },
    take: 30,
  });

  const views = rollups.reduce((sum, row) => sum + row.views, 0);
  const uniques = rollups.reduce((sum, row) => sum + row.uniques, 0);
  return {
    views,
    uniques,
    days: rollups.map((row) => ({ day: row.day, views: row.views, uniques: row.uniques })).reverse(),
    referrers: sumBreakdowns(rollups.map((row) => row.referrerBreakdown)),
    countries: sumBreakdowns(rollups.map((row) => row.countryBreakdown)),
    devices: sumBreakdowns(rollups.map((row) => row.deviceBreakdown)),
  };
}

export async function getOwnerViewSummary(ownerId: string) {
  const rollups = await prisma.viewDailyRollup.findMany({
    where: { ownerId },
    orderBy: { day: 'desc' },
    take: 500,
  });

  return {
    views: rollups.reduce((sum, row) => sum + row.views, 0),
    uniques: rollups.reduce((sum, row) => sum + row.uniques, 0),
    referrers: sumBreakdowns(rollups.map((row) => row.referrerBreakdown)),
    countries: sumBreakdowns(rollups.map((row) => row.countryBreakdown)),
    devices: sumBreakdowns(rollups.map((row) => row.deviceBreakdown)),
    topTargets: Object.values(
      rollups.reduce<Record<string, { targetKind: string; targetId: string; views: number; uniques: number }>>((acc, row) => {
        const key = `${row.targetKind}:${row.targetId}`;
        acc[key] ??= { targetKind: row.targetKind, targetId: row.targetId, views: 0, uniques: 0 };
        acc[key].views += row.views;
        acc[key].uniques += row.uniques;
        return acc;
      }, {}),
    )
      .sort((a, b) => b.views - a.views)
      .slice(0, 10),
  };
}

function hashVisitor(headers: Headers, day: string): string {
  const ip = headers.get('cf-connecting-ip') ?? headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const ua = headers.get('user-agent') ?? 'unknown';
  return createHmac('sha256', deriveSigningKey('visitor-hash', env.ANALYTICS_SALT)).update(`${day}:${ip}:${ua}`).digest('hex');
}

function classifyDevice(userAgent: string | null): string {
  const ua = userAgent?.toLowerCase() ?? '';
  if (/bot|crawler|spider|slurp/.test(ua)) return 'bot';
  if (/ipad|tablet/.test(ua)) return 'tablet';
  if (/mobi|iphone|android/.test(ua)) return 'mobile';
  return 'desktop';
}

function parseReferrerHost(referrer: string | null): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.slice(0, 191);
  } catch {
    return null;
  }
}

function normalizeCountry(value: string | null): string | null {
  const country = value?.trim().toUpperCase();
  return country && /^[A-Z]{2}$/.test(country) ? country : null;
}

function incrementBreakdown(value: unknown, key: string | null): Record<string, number> {
  const current = normalizeBreakdown(value);
  if (!key) return current;
  current[key] = (current[key] ?? 0) + 1;
  return current;
}

function sumBreakdowns(values: unknown[]): Array<{ key: string; count: number }> {
  const aggregate: Record<string, number> = {};
  for (const value of values) {
    for (const [key, count] of Object.entries(normalizeBreakdown(value))) {
      aggregate[key] = (aggregate[key] ?? 0) + count;
    }
  }
  return Object.entries(aggregate)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function normalizeBreakdown(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, count]) => (typeof count === 'number' && Number.isFinite(count) ? [[key, count]] : [])),
  );
}
