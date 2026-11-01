import { describe, expect, test } from 'bun:test';
import { isNewerVersion } from './app-version';

describe('isNewerVersion', () => {
  test('compares each part numerically, not as text', () => {
    expect(isNewerVersion('v4.10.0', 'v4.9.3')).toBe(true);
    expect(isNewerVersion('v4.9.3', 'v4.10.0')).toBe(false);
    expect(isNewerVersion('v5.0.0', 'v4.99.99')).toBe(true);
    expect(isNewerVersion('v4.6.1', 'v4.6.0')).toBe(true);
  });

  test('is false for the same version, with or without the v prefix', () => {
    expect(isNewerVersion('v4.6.0', '4.6.0')).toBe(false);
  });

  test('is false when either side is not a release version', () => {
    expect(isNewerVersion('v4.7.0', 'dev')).toBe(false);
    expect(isNewerVersion('nightly', 'v4.6.0')).toBe(false);
  });
});
