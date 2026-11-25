import { describe, expect, test } from 'bun:test';
import { syncExcludeMatcher } from './sync-exclude';

describe('syncExcludeMatcher', () => {
  test('a trailing star matches everything under a prefix', () => {
    const excluded = syncExcludeMatcher(['templates/*']);
    expect(excluded('templates/a.png')).toBe(true);
    expect(excluded('templates/nested/a.png')).toBe(true);
    expect(excluded('user1/templates/a.png')).toBe(false);
  });

  test('a leading star matches a suffix', () => {
    const excluded = syncExcludeMatcher(['*.tmp']);
    expect(excluded('user1/upload.tmp')).toBe(true);
    expect(excluded('user1/upload.tmp.png')).toBe(false);
  });

  test('stars on both sides match a segment anywhere', () => {
    const excluded = syncExcludeMatcher(['*/edit-image/*']);
    expect(excluded('user1/edit-image/a.png')).toBe(true);
    expect(excluded('user1/a.png')).toBe(false);
  });

  test('a pattern without a star matches only that exact key', () => {
    const excluded = syncExcludeMatcher(['cache/']);
    expect(excluded('cache/')).toBe(true);
    expect(excluded('cache/a.png')).toBe(false);
  });

  test('regex characters in a pattern are literal', () => {
    const excluded = syncExcludeMatcher(['user1/a.b(1)*']);
    expect(excluded('user1/a.b(1).png')).toBe(true);
    expect(excluded('user1/axb(1).png')).toBe(false);
  });

  test('no patterns exclude nothing', () => {
    expect(syncExcludeMatcher([])('anything')).toBe(false);
  });
});
