import { describe, expect, test } from 'bun:test';
import { resolveUploadContentType } from './upload-content-type';

/** Builds `packets` 188-byte MPEG-TS packets, each starting with the 0x47 sync byte. */
function transportStream(packets: number): Uint8Array {
  const bytes = new Uint8Array(packets * 188);
  for (let i = 0; i < packets; i++) bytes[i * 188] = 0x47;
  return bytes;
}

const typescriptSource = new TextEncoder().encode(`${'export const answer: number = 42;\n'.repeat(20)}`);

describe('resolveUploadContentType', () => {
  test('keeps video/mp2t for a real MPEG transport stream', () => {
    expect(resolveUploadContentType('video/mp2t', 'clip.ts', transportStream(10))).toBe('video/mp2t');
  });

  test('stores TypeScript source declared as video/mp2t as text/plain', () => {
    expect(resolveUploadContentType('video/mp2t', 'index.ts', typescriptSource)).toBe('text/plain');
  });

  test('treats a short file as not a transport stream', () => {
    expect(resolveUploadContentType('video/mp2t', 'tiny.ts', new TextEncoder().encode('G'))).toBe('text/plain');
  });

  test('a stream whose later packets lose sync is not video', () => {
    const broken = transportStream(10);
    broken[188 * 3] = 0;
    expect(resolveUploadContentType('video/mp2t', 'x.ts', broken)).toBe('text/plain');
  });

  test('non-TypeScript extension without stream bytes falls back to octet-stream', () => {
    expect(resolveUploadContentType('video/mp2t', 'blob.bin', typescriptSource)).toBe('application/octet-stream');
  });

  test('leaves other content types untouched', () => {
    expect(resolveUploadContentType('image/png', 'a.png', typescriptSource)).toBe('image/png');
  });
});
