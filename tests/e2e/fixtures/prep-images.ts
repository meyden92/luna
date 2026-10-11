/**
 * One-off image step for the fixture corpus (#104): turns the raw PNGs that
 * codex-imagegen produced into the format mix the suite needs. The converted
 * files in `files/` are committed and are the source of truth; the raw PNGs are
 * not kept, so this script is provenance, not a build step.
 *
 *   bun tests/e2e/fixtures/prep-images.ts <dir-with-raw-pngs>
 *
 * `generate-corpus.ts` produces everything else.
 */
import { join, resolve } from 'node:path';
import sharp from 'sharp';

const rawDir = process.argv[2];
if (!rawDir) throw new Error('usage: bun prep-images.ts <dir-with-raw-pngs>');
const outDir = resolve(import.meta.dirname, 'files');

const raw = (name: string) => sharp(join(rawDir, `${name}.png`));
const out = (name: string) => join(outDir, name);

await raw('landscape-photo').jpeg({ quality: 82 }).toFile(out('landscape-photo.jpg'));
await raw('forest-path').jpeg({ quality: 82 }).toFile(out('forest-path.jpg'));
await raw('portrait-tall').webp({ quality: 80 }).toFile(out('portrait-tall.webp'));
await raw('ocean-wave').webp({ quality: 80 }).toFile(out('ocean-wave.webp'));
await raw('panorama-wide').avif({ quality: 55 }).toFile(out('panorama-wide.avif'));
await raw('icon-small').png().toFile(out('icon-small.png'));
await raw('square-food').png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(out('square-food.png'));
await raw('robot-illustration').png({ compressionLevel: 9 }).toFile(out('robot-illustration.png'));
await raw('transparent-sticker').png({ compressionLevel: 9 }).toFile(out('transparent-sticker.png'));
await raw('transparent-logo').png({ compressionLevel: 9 }).toFile(out('transparent-logo.png'));

// Animated GIF from the two frames, 400ms each, looping forever.
await sharp(
  ['animation-frame-a', 'animation-frame-b'].map((n) => join(rawDir, `${n}.png`)),
  { join: { animated: true } },
)
  .gif({ delay: [400, 400], loop: 0 })
  .toFile(out('animation.gif'));
