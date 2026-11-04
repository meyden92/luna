import { describe, expect, test } from 'bun:test';
import { BILLING_EVENT_WAIT_MS, settledCosts, type UnsettledGeneration } from './settlement';

const now = new Date('2026-11-04T12:00:00Z');
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

const succeeded = (id: string, overrides: Partial<UnsettledGeneration> = {}): UnsettledGeneration => ({
  id,
  falRequestId: `req-${id}`,
  status: 'succeeded',
  estimatedCostUsd: 0.03,
  completedAt: minutesAgo(5),
  ...overrides,
});

describe('settledCosts', () => {
  test('a billed request costs what fal billed, summed over its events', () => {
    const events = [
      { requestId: 'req-a', endpointId: 'fake/image', costTotal: 1.2345 },
      { requestId: 'req-b', endpointId: 'fake/image', costTotal: 0.01 },
      { requestId: 'req-b', endpointId: 'fake/image', costTotal: 0.02 },
    ];
    expect(settledCosts({ generations: [succeeded('a'), succeeded('b')], events, now, billing: true })).toEqual([
      { id: 'a', actualCostUsd: 1.2345 },
      { id: 'b', actualCostUsd: 0.03 },
    ]);
  });

  test('without an event, a request waits a day for one, then books its estimate', () => {
    const fresh = succeeded('fresh', { completedAt: minutesAgo(60) });
    const stale = succeeded('stale', { completedAt: new Date(now.getTime() - BILLING_EVENT_WAIT_MS - 1) });
    expect(settledCosts({ generations: [fresh, stale], events: [], now, billing: true })).toEqual([{ id: 'stale', actualCostUsd: 0.03 }]);
  });

  test('without a billing key, every success books its estimate at once', () => {
    const unpriced = succeeded('unpriced', { estimatedCostUsd: null });
    expect(settledCosts({ generations: [succeeded('a'), unpriced], events: [], now, billing: false })).toEqual([
      { id: 'a', actualCostUsd: 0.03 },
      { id: 'unpriced', actualCostUsd: 0 },
    ]);
  });

  test('failed and cancelled Generations settle at nothing, whatever fal reports', () => {
    const failed = succeeded('failed', { status: 'failed' });
    const cancelled = succeeded('cancelled', { status: 'cancelled' });
    const events = [{ requestId: 'req-failed', endpointId: 'fake/image', costTotal: 9 }];
    expect(settledCosts({ generations: [failed, cancelled], events, now, billing: true })).toEqual([
      { id: 'failed', actualCostUsd: 0 },
      { id: 'cancelled', actualCostUsd: 0 },
    ]);
  });
});
