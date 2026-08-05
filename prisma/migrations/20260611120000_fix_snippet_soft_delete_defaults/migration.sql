-- Backfill isDeleted before tightening it to NOT NULL.
UPDATE `snippet` SET `isDeleted` = false WHERE `isDeleted` IS NULL;

-- AlterTable: deletedAt must become nullable BEFORE rows can be reset to NULL.
ALTER TABLE `snippet` MODIFY `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    MODIFY `deletedAt` DATETIME(3) NULL;

-- Snippets are never soft-deleted today, so every existing row carries a bogus
-- creation-time `deletedAt`; reset them now that the column is nullable.
UPDATE `snippet` SET `deletedAt` = NULL;
