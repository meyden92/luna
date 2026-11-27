const RATIO = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/;
const ORIENTED = /^(portrait|landscape)_(\d+)_(\d+)$/;

/**
 * The width-to-height ratio an option value names, whatever the input is
 * called: `16:9`, or fal's image size names (`square_hd`, `portrait_4_3`).
 * Null for anything else, `auto` included.
 */
export function aspectRatioOf(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  if (value === 'square' || value === 'square_hd') return 1;
  const ratio = RATIO.exec(value);
  if (ratio) {
    const width = Number(ratio[1]);
    const height = Number(ratio[2]);
    return width > 0 && height > 0 ? width / height : null;
  }
  const oriented = ORIENTED.exec(value);
  if (!oriented) return null;
  const long = Math.max(Number(oriented[2]), Number(oriented[3]));
  const short = Math.min(Number(oriented[2]), Number(oriented[3]));
  if (short === 0) return null;
  return oriented[1] === 'portrait' ? short / long : long / short;
}
