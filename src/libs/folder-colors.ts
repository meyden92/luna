/**
 * The palette a new folder's colour dot is drawn from. A folder's colour is
 * runtime data persisted as hex, which is why this list is hex rather than the
 * `--folder-*` tokens; tokens.css declares the same values for the stylesheets
 * that only read them (the Storage bar), and the two must stay in step.
 */
export const FOLDER_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'] as const;

/** The dot colour for a folder that never got one. */
export const FOLDER_COLOR_NONE = '#6b7280';

/** A colour for a new folder, avoiding the ones already on screen while any are left. */
export function nextFolderColor(taken: readonly (string | null)[]): string {
  const used = new Set(taken.filter((color): color is string => color !== null));
  const free = FOLDER_COLORS.filter((color) => !used.has(color));
  const pool: readonly string[] = free.length > 0 ? free : FOLDER_COLORS;
  return pool[Math.floor(Math.random() * pool.length)] ?? FOLDER_COLORS[0];
}
