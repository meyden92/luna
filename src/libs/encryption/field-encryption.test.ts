import { describe, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { decryptWithKey, encryptWithKey } from './field-encryption';

describe('encryptWithKey', () => {
  const key = randomBytes(32);

  test('round-trips with the same key and additional data', () => {
    const encrypted = encryptWithKey('s3cret', key, 'FAL_KEY');
    expect(encrypted).not.toContain('s3cret');
    expect(decryptWithKey(encrypted, key, 'FAL_KEY')).toBe('s3cret');
  });

  test('refuses a ciphertext presented under different additional data', () => {
    const encrypted = encryptWithKey('s3cret', key, 'FAL_KEY');
    expect(() => decryptWithKey(encrypted, key, 'FAL_BILLING_KEY')).toThrow();
    expect(() => decryptWithKey(encrypted, key)).toThrow();
  });

  test('refuses a different key', () => {
    const encrypted = encryptWithKey('s3cret', key, 'FAL_KEY');
    expect(() => decryptWithKey(encrypted, randomBytes(32), 'FAL_KEY')).toThrow();
  });
});
