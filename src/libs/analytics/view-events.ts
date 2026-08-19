import { createHmac } from 'node:crypto';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { listOwnerDailyRollups, listTargetDailyRollups, recordView, utcDay } from '@/db/queries/analytics';
import { deriveSigningKey } from '@/libs/crypto/signing-keys';
import { env } from '@/libs/env';

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
  // The UTC calendar day doubles as the visitor-hash salt, so it is computed
  // once here and handed to the write — the bucket and the hash cannot disagree.
  const day = utcDay(createdAt);

  await recordView({
    targetKind,
    targetId,
    ownerId: ownerId ?? null,
    day,
    createdAt,
    visitorHash: hashVisitor(headers, day),
    country: normalizeCountry(headers.get('cf-ipcountry')),
    referrerHost: parseReferrerHost(headers.get('referer')),
    deviceClass: classifyDevice(headers.get('user-agent')),
    serverMs: serverMs ?? null,
  });
}

export async function getViewStats(targetKind: ViewTargetKind, targetId: string, ownerId: string) {
  const rollups = await listTargetDailyRollups({ targetKind, targetId, ownerId, limit: 30 });

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
  const rollups = await listOwnerDailyRollups(ownerId, 500);

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
