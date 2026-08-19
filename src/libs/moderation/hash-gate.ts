import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { findExactDenylistMatch, listPhashDenylistEntries, quarantineFile } from '@/db/queries/moderation';
import type { JsonValue } from '@/db/schema/json';

export type FileHashes = {
  sha256: string;
  md5: string;
  phash: string | null;
};

export type ModerationGateResult =
  | { allowed: true; hashes: FileHashes }
  | { allowed: false; hashes: FileHashes; matchType: 'sha256' | 'md5' | 'phash'; matchedEntryId: string; distance: number | null };

const PHASH_DISTANCE_THRESHOLD = 8;
const PHASH_PAGE_SIZE = 500;

export async function computeFileHashes(buffer: Buffer | Uint8Array, contentType: string): Promise<FileHashes> {
  const source = Buffer.from(buffer);
  return {
    sha256: createHash('sha256').update(source).digest('hex'),
    md5: createHash('md5').update(source).digest('hex'),
    phash: contentType.startsWith('image/') ? await computePerceptualHash(source) : null,
  };
}

export async function checkModerationGate(buffer: Buffer | Uint8Array, contentType: string): Promise<ModerationGateResult> {
  const hashes = await computeFileHashes(buffer, contentType);
  const match = await findDenylistMatchForHashes(hashes);
  return match ? { allowed: false, hashes, ...match } : { allowed: true, hashes };
}

/**
 * The denylist gate. The exact half is case-normalised on both sides inside
 * `findExactDenylistMatch` — see the query module for why one side is not
 * enough. The perceptual half is a Hamming-distance scan and is unaffected by
 * collation, so it stays a paged read plus in-process comparison.
 */
export async function findDenylistMatchForHashes(
  hashes: FileHashes,
): Promise<{ matchType: 'sha256' | 'md5' | 'phash'; matchedEntryId: string; distance: number | null } | null> {
  const exact = await findExactDenylistMatch(hashes);
  if (exact?.hashType === 'sha256' || exact?.hashType === 'md5') {
    return { matchType: exact.hashType, matchedEntryId: exact.id, distance: null };
  }

  if (!hashes.phash) return null;

  let cursor: string | undefined;
  for (;;) {
    const candidates = await listPhashDenylistEntries({ cursor, limit: PHASH_PAGE_SIZE });
    if (candidates.length === 0) break;
    for (const candidate of candidates) {
      const distance = hammingDistance(hashes.phash, candidate.hash);
      if (distance <= PHASH_DISTANCE_THRESHOLD) {
        return { matchType: 'phash', matchedEntryId: candidate.id, distance };
      }
    }
    cursor = candidates.at(-1)?.id;
    if (candidates.length < PHASH_PAGE_SIZE || !cursor) break;
  }

  return null;
}

export async function createModerationCase({
  fileId,
  gate,
  uploaderId,
  uploadMetadata,
}: {
  fileId: string;
  gate: Exclude<ModerationGateResult, { allowed: true }>;
  uploaderId: string;
  uploadMetadata?: JsonValue;
}) {
  return quarantineFile(
    {
      fileId,
      hashes: gate.hashes,
      matchType: gate.matchType,
      matchedEntryId: gate.matchedEntryId,
      distance: gate.distance,
      uploaderId,
      uploadMetadata,
    },
    uploaderId,
  );
}

export async function computePerceptualHash(buffer: Buffer): Promise<string | null> {
  try {
    const { data } = await sharp(buffer).resize(8, 8, { fit: 'fill' }).grayscale().raw().toBuffer({ resolveWithObject: true });
    const values = Array.from(data);
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    return values.map((value) => (value >= average ? '1' : '0')).join('');
  } catch {
    return null;
  }
}

export function hammingDistance(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  let distance = Math.abs(a.length - b.length);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) distance += 1;
  }
  return distance + Math.max(0, max - Math.max(a.length, b.length));
}
