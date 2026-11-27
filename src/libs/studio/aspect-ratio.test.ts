import { describe, expect, test } from 'bun:test';
import { aspectRatioOf } from './aspect-ratio';

describe('aspectRatioOf', () => {
  test('reads width:height values', () => {
    expect(aspectRatioOf('16:9')).toBeCloseTo(16 / 9);
    expect(aspectRatioOf('9:16')).toBeCloseTo(9 / 16);
    expect(aspectRatioOf('2.39:1')).toBeCloseTo(2.39);
  });

  test("reads fal's image size names, portrait taller than wide", () => {
    expect(aspectRatioOf('square_hd')).toBe(1);
    expect(aspectRatioOf('portrait_4_3')).toBeCloseTo(3 / 4);
    expect(aspectRatioOf('portrait_16_9')).toBeCloseTo(9 / 16);
    expect(aspectRatioOf('landscape_16_9')).toBeCloseTo(16 / 9);
  });

  test('names no ratio for auto, other values and zero sides', () => {
    for (const value of ['auto', 'png', '1024x768', '0:1', 'landscape_0_3', 16, null]) expect(aspectRatioOf(value)).toBeNull();
  });
});
