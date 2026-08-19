import { type Column, ilike, type SQL } from 'drizzle-orm';

/**
 * Case-insensitive matching helpers (issue #23).
 *
 * MariaDB's `utf8mb4_unicode_ci` made every string comparison case-insensitive
 * and the application inherited that without ever asking for it. Postgres `text`
 * is case-sensitive, so a literal port changes behaviour with no error and no
 * failing test. These helpers ask for the old behaviour explicitly.
 *
 * They live in one module because the escaping is the easy half to get wrong:
 * three copies had already diverged into two shapes, and one call site skipped
 * escaping altogether on the reasoning that its input was a "closed identifier"
 * — which permitted `_`, a single-character LIKE wildcard.
 */

/**
 * Escapes the LIKE metacharacters so a user-supplied value matches literally.
 *
 * `%` and `_` are both wildcards. `_` is the dangerous one, because it looks
 * inert: an identifier like `user_id` silently matches `userXid` unless escaped.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Case-insensitive equality — what `=` meant under `utf8mb4_unicode_ci`. */
export function equalsInsensitive(column: Column, value: string): SQL {
  return ilike(column, escapeLike(value));
}

/** Case-insensitive substring match — what Prisma's `contains:` meant. */
export function containsInsensitive(column: Column, value: string): SQL {
  return ilike(column, `%${escapeLike(value)}%`);
}

/** Case-insensitive prefix match — what Prisma's `startsWith:` meant. */
export function startsWithInsensitive(column: Column, value: string): SQL {
  return ilike(column, `${escapeLike(value)}%`);
}
