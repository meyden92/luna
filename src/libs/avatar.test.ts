import { describe, expect, test } from 'bun:test';
import exifr from 'exifr';
import sharp from 'sharp';
import { AVATAR_MAX_UPLOAD_BYTES, AVATAR_SIZE, AvatarRejectedError, normalizeAvatar } from './avatar';

/**
 * The Avatar normalisation seam from issue #54.
 *
 * This is the one thing the end-to-end suite cannot assert. Playwright can see
 * that a picture renders; it cannot see that the stored object is square WebP
 * and that the GPS coordinates baked into the photograph did not survive the
 * trip to a public CDN. Both are the reason re-encoding exists at all, so both
 * are asserted here, on the bytes themselves.
 */

/** A deliberately non-square photograph carrying GPS EXIF, as a phone produces. */
async function photoWithGps(width = 1200, height = 800): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 40, b: 90 } },
  })
    .withExif({
      IFD0: { Make: 'LunaShare Test Camera' },
      // libvips names the GPS IFD `IFD3`.
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '51/1 30/1 0/1', GPSLongitudeRef: 'W', GPSLongitude: '0/1 7/1 0/1' },
    })
    .jpeg()
    .toBuffer();
}

describe('normalizeAvatar', () => {
  test('re-encodes any input to a square WebP of the fixed Avatar size', async () => {
    const normalized = await normalizeAvatar(await photoWithGps(1200, 800));

    const meta = await sharp(normalized).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(AVATAR_SIZE);
    expect(meta.height).toBe(AVATAR_SIZE);
  });

  test('drops the location the photograph was taken at', async () => {
    const original = await photoWithGps();
    // Guard the fixture with an independent reader: a test that strips nothing
    // proves nothing. `exifr` only reads the JPEG side — it refuses the WebP
    // output outright — so the absence is asserted on the EXIF block itself.
    expect(await exifr.gps(original)).toBeTruthy();

    const normalized = await normalizeAvatar(original);
    expect((await sharp(normalized).metadata()).exif).toBeUndefined();
  });

  test('rejects input above the upload ceiling before decoding it', async () => {
    // Not a real image: reaching the decoder at all would be the bug.
    const oversized = Buffer.alloc(AVATAR_MAX_UPLOAD_BYTES + 1);

    expect(normalizeAvatar(oversized)).rejects.toThrow(AvatarRejectedError);
  });

  test('rejects bytes that are not an image', async () => {
    expect(normalizeAvatar(Buffer.from('<?php echo "not an avatar"; ?>'))).rejects.toThrow(AvatarRejectedError);
  });
});
