import { describe, expect, test } from 'bun:test';
import { budgetLabel, expiryLabel, formatUsd } from './format';

describe('formatUsd', () => {
  test('shows cents, more digits for fractions of a cent, and whole amounts bare', () => {
    expect(formatUsd(0.03)).toBe('0.03 $');
    expect(formatUsd(0.5)).toBe('0.50 $');
    expect(formatUsd(0.0012)).toBe('0.0012 $');
    expect(formatUsd(12.4)).toBe('12.40 $');
    expect(formatUsd(20)).toBe('20 $');
  });
});

describe('budgetLabel', () => {
  test('states the spend against the limit, or that there is none', () => {
    expect(budgetLabel({ limitUsd: 20, spentUsd: 12.4 })).toBe('12.40 of 20 $');
    expect(budgetLabel({ limitUsd: null, spentUsd: 3 })).toBe('No Budget limit');
  });
});

describe('expiryLabel', () => {
  const now = new Date('2026-11-04T12:00:00Z');
  const output = (values: { expiresAt: string; expiredAt?: string; savedFileId?: string }) => ({
    expiredAt: null,
    savedFileId: null,
    ...values,
  });

  test('counts down to the first unsaved Output expiring', () => {
    expect(expiryLabel([output({ expiresAt: '2026-11-10T12:00:00Z' }), output({ expiresAt: '2026-11-11T12:00:00Z' })], now)).toBe(
      'expires in 6 days',
    );
    expect(expiryLabel([output({ expiresAt: '2026-11-04T17:00:00Z' })], now)).toBe('expires in 5 hours');
  });

  test('says the Output expired once the unsaved ones are gone, and nothing when all are saved', () => {
    const expired = output({ expiresAt: '2026-11-01T12:00:00Z', expiredAt: '2026-11-01T13:00:00Z' });
    const saved = output({ expiresAt: '2026-11-10T12:00:00Z', savedFileId: 'file-1' });
    expect(expiryLabel([expired, saved], now)).toBe('Output expired');
    expect(expiryLabel([saved], now)).toBeNull();
    expect(expiryLabel([], now)).toBeNull();
  });
});
