import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth';

/**
 * Downloads domain (issue #207). Downloads themselves live in memory only
 * (`src/libs/downloads/registry.ts`); the only persisted state is each Source's
 * optional Source session.
 */

/**
 * One Source session per Source: its cookies file, encrypted with
 * `encryptFieldValue`. Never returned by any server fn, and `encryptedValue` is
 * redacted from audit rows.
 */
export const sourceSession = pgTable('source_session', {
  id: text('id').primaryKey(),
  sourceKey: text('source_key').notNull().unique(),
  encryptedValue: text('encrypted_value').notNull(),
  updatedById: text('updated_by_id').references(() => user.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  // Set by the query layer on every write, like every other `updatedAt` here.
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
