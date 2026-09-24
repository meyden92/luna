import { describe, expect, it } from 'bun:test';
import { groupFilesByDate } from './file-groups';

/** Saturday 26 September 2026, 14:00 — so the week bucket can hold Mon–Thu. */
const NOW = new Date('2026-09-26T14:00:00Z');

const at = (iso: string) => ({ createdAt: iso });
const group = (isoDates: string[]) => groupFilesByDate(isoDates.map(at), (file) => file.createdAt, NOW);

describe('groupFilesByDate', () => {
  it('names the four relative buckets and falls back to months', () => {
    const groups = group([
      '2026-09-26T09:00:00Z', // today
      '2026-09-25T21:40:00Z', // yesterday
      '2026-09-21T10:00:00Z', // Monday, so still this week
      '2026-09-12T10:00:00Z', // earlier in September
      '2026-08-04T10:00:00Z', // a named month
      '2025-08-04T10:00:00Z', // a named month in another year
    ]);

    expect(groups.map((g) => g.label)).toEqual([
      'Today',
      'Yesterday',
      'Earlier this week',
      'Earlier in September',
      'August',
      'August 2025',
    ]);
  });

  it('puts the day before the week started in the month bucket, not the week', () => {
    // Sunday 20 September is before Monday 21, which is when this week began.
    const groups = group(['2026-09-21T10:00:00Z', '2026-09-20T08:00:00Z']);

    expect(groups.map((g) => g.label)).toEqual(['Earlier this week', 'Earlier in September']);
  });

  it('labels a single day by its weekday and a span by its ends', () => {
    const [, week] = group(['2026-09-26T09:00:00Z', '2026-09-23T10:00:00Z', '2026-09-21T08:00:00Z']);

    expect(week?.label).toBe('Earlier this week');
    expect(week?.dateLabel).toBe('Sep 21 – 23');
  });

  it('names both ends of a range that crosses a month', () => {
    // The custom-month bucket is keyed by month, so a range only crosses one at
    // the boundary of "Earlier in <month>" — which September 1st to 19th is.
    const [, september] = group(['2026-09-26T09:00:00Z', '2026-09-01T10:00:00Z', '2026-09-19T10:00:00Z']);

    expect(september?.dateLabel).toBe('Sep 1 – 19');
  });

  it('follows the order files arrive in, so it tracks the chosen sort', () => {
    const oldestFirst = group(['2026-08-04T10:00:00Z', '2026-09-12T10:00:00Z', '2026-09-26T09:00:00Z']);

    expect(oldestFirst.map((g) => g.label)).toEqual(['August', 'Earlier in September', 'Today']);
  });

  it('keeps every file, and only once', () => {
    const dates = ['2026-09-26T09:00:00Z', '2026-09-26T10:00:00Z', '2026-09-25T21:40:00Z'];
    const groups = group(dates);

    expect(groups.flatMap((g) => g.files)).toHaveLength(dates.length);
    expect(groups.find((g) => g.label === 'Today')?.files).toHaveLength(2);
  });
});
