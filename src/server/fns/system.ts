import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { listOwnerFileTags } from '@/db/queries/admin';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

export const getHealth = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'none' }))
  .handler(async () => {
    const { env } = await import('@/libs/env');
    return {
      status: 'ok',
      build: {
        commit: env.BUILD_COMMIT ?? 'unknown',
        time: env.BUILD_TIME ?? 'unknown',
      },
      timestamp: new Date().toISOString(),
    };
  });

export const listTags = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .handler(async ({ context }) => {
    const rows = await listOwnerFileTags(userIdFromCtx(context));

    const all = new Set<string>();
    for (const row of rows) {
      if (!row.tags) continue;
      for (const tag of row.tags.split(',')) {
        const trimmed = tag.trim();
        if (trimmed) all.add(trimmed);
      }
    }
    return Array.from(all).sort();
  });

const eventTitles = [
  'Team Meeting',
  'Project Review',
  'Client Call',
  'Sprint Planning',
  'Code Review',
  'Design Review',
  'Product Demo',
  'Standup',
  'Retrospective',
  'Workshop',
  'Training Session',
  'Interview',
  'Lunch & Learn',
  'Tech Talk',
  'Planning Poker',
  'Brainstorm Session',
  'Budget Review',
  'Strategy Meeting',
  'All Hands',
  'One-on-One',
  'Customer Demo',
  'Deployment',
  'Release Planning',
  'Performance Review',
  'Kickoff Meeting',
];
const eventColors = ['primary', 'secondary', 'success', 'warning', 'destructive'] as const;

const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randPick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
const formatLocalDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const mockCalendarSchema = z.object({
  year: z.number().int().min(1970).max(3000).optional(),
  month: z.number().int().min(0).max(11).optional(),
  delay: z.number().int().min(0).max(30_000).optional(),
});

export const getMockCalendar = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(mockCalendarSchema)
  .handler(async ({ data }) => {
    const year = data.year ?? new Date().getFullYear();
    const month = data.month ?? new Date().getMonth();
    const delay = data.delay ?? randInt(500, 1500);
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const events: Array<{ id: string; title: string; start: string; end?: string; color: string }> = [];
    const eventCount = randInt(15, 50);

    for (let i = 0; i < eventCount; i++) {
      const day = randInt(1, daysInMonth);
      const isMultiDay = Math.random() < 0.25;
      const start = new Date(year, month, day);
      const end = isMultiDay ? new Date(year, month, Math.min(day + randInt(1, 4), daysInMonth)) : undefined;
      events.push({
        id: `event-${year}-${month}-${i}`,
        title: randPick(eventTitles),
        start: formatLocalDate(start),
        end: end ? formatLocalDate(end) : undefined,
        color: randPick(eventColors),
      });
    }
    events.sort((a, b) => a.start.localeCompare(b.start));
    return { year, month, events, delay, generatedAt: new Date().toISOString() };
  });
