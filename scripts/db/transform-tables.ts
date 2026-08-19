/**
 * What the transform leaves behind and what it rewrites (issues #24, #23, #42).
 *
 * Its own module because both the transform and the verification read it, and a
 * second hand-maintained copy would drift from whichever was edited first.
 */

/**
 * Tables deliberately not carried across (#24). Everything else migrates: at
 * ~5.5 MB carrying a table costs nothing, and every exclusion is a decision
 * that can be wrong.
 */
export const EXCLUDED_FROM_TRANSFER: Record<string, string> = {
  audit_log:
    '177 MB / 73k rows, expendable per the map owner. Dropping it also destroys the cleartext credentials in #27 rather than carrying them across. The table still exists and fills from the first audited write.',
  task_execution: 'execution records, not intent — consistent with the audit scope in #13',
  _prisma_migrations: "Prisma's own bookkeeping; drizzle-kit owns migration state now",
};

/**
 * Columns lower-cased in flight, keyed by source table and source column name.
 *
 * Case-sensitivity is the one class of error no row count or constraint catches.
 * MariaDB's utf8mb4_unicode_ci matched case-insensitively and Postgres `text`
 * does not, so a case-mismatched row silently stops matching (#23). Historical
 * rows have to be normalised here: fixing only the write path leaves every
 * existing row broken, which is the half-fix #23 proved does nothing.
 */
export const LOWERCASED: Record<string, string[]> = {
  // The two sides of the moderation hash gate. It FAILS OPEN when a hash does
  // not match: no error, nothing in the logs, content simply stops being
  // blocked (#42). Reproduced on a live Postgres in #23.
  file: ['sha256', 'md5', 'phash', 'moderationStatus'],
  denylist_entry: ['hash'],
  // Moderation status is compared as a string and is collation-sensitive in the
  // same way (#42). Production holds a single value, `clear`, already lower-case
  // across all 4,230 rows -- so this is a no-op on history and a guarantee
  // going forward, which is #23's stated preference: hashes and closed
  // vocabularies have a canonical form, and making the data consistent is more
  // robust than making every comparison forgiving.
  moderation_case: ['status'],
  // Case-variant duplicate accounts become possible on Postgres otherwise (#36).
  user: ['email'],
  // Tightening the token lookup would silently break existing tokens, so this
  // was checked before being applied: every production token key is 64-char
  // lower-case hex already, making normalisation a no-op on history and a
  // guarantee going forward.
  token: ['key'],
};

/**
 * Hash-shaped columns NOT normalised, because no call site compares them for
 * equality across a case boundary today. Listed so the batches that own them
 * make a decision rather than inherit an oversight: `ocr_result.fileHash`,
 * `cached_image.hash`, `file_rendition.paramHash`, `view_event.visitorHash`.
 *
 * `view_event.visitorHash` was reviewed under #41 and deliberately left alone:
 * it is only ever produced by `createHmac(...).digest('hex')` on both the write
 * and the read side, so no case boundary exists for it.
 */
