import { describe, expect, test } from 'bun:test';
import { budgetLimit, budgetRefusal, budgetState, utcMonthStart } from './budget';

describe('utcMonthStart', () => {
  test('is midnight UTC on the first of the month, also in the month’s last second', () => {
    expect(utcMonthStart(new Date('2026-11-30T23:59:59.999Z')).toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(utcMonthStart(new Date('2026-12-01T00:00:00.000Z')).toISOString()).toBe('2026-12-01T00:00:00.000Z');
  });

  test('counts months back across a year boundary', () => {
    expect(utcMonthStart(new Date('2026-02-14T10:00:00Z'), -5).toISOString()).toBe('2025-09-01T00:00:00.000Z');
    expect(utcMonthStart(new Date('2026-12-14T10:00:00Z'), 1).toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('budgetLimit', () => {
  test('an override wins over the default, null meaning unlimited', () => {
    expect(budgetLimit(20, undefined)).toBe(20);
    expect(budgetLimit(null, undefined)).toBeNull();
    expect(budgetLimit(20, { monthlyBudgetUsd: null })).toBeNull();
    expect(budgetLimit(null, { monthlyBudgetUsd: 5 })).toBe(5);
  });
});

describe('budgetState', () => {
  test('the remainder is what is left of the limit, never below zero', () => {
    expect(budgetState(20, 12.4)).toEqual({ limitUsd: 20, spentUsd: 12.4, remainingUsd: 7.6 });
    expect(budgetState(1, 1.25)).toEqual({ limitUsd: 1, spentUsd: 1.25, remainingUsd: 0 });
  });

  test('an unlimited Budget has no remainder', () => {
    expect(budgetState(null, 3)).toEqual({ limitUsd: null, spentUsd: 3, remainingUsd: null });
  });

  test('sums of decimal prices come out exact', () => {
    expect(budgetState(0.09, 0.06).remainingUsd).toBe(0.03);
  });
});

describe('budgetRefusal', () => {
  test('an estimate that fits exactly is allowed', () => {
    expect(budgetRefusal(budgetState(0.09, 0.06), 0.03)).toBeNull();
  });

  test('an estimate over the remainder is refused, naming both amounts', () => {
    expect(budgetRefusal(budgetState(0.05, 0.03), 0.03)).toBe(
      'This would cost about 0.03 $, but only 0.02 $ of your monthly Budget is left.',
    );
  });

  test('an unlimited Budget refuses nothing', () => {
    expect(budgetRefusal(budgetState(null, 1000), 50)).toBeNull();
  });

  test('a Model without a price is refused only once nothing is left', () => {
    expect(budgetRefusal(budgetState(1, 0.5), null)).toBeNull();
    expect(budgetRefusal(budgetState(1, 1), null)).toBe('Your monthly Budget of 1 $ is used up.');
  });
});
