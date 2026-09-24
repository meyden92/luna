DROP TABLE "egress_event";--> statement-breakpoint
DROP TABLE "view_daily_rollup";--> statement-breakpoint
DROP TABLE "view_event";--> statement-breakpoint
-- Hand-written: collapse the per-file/token/rendition rows into one row per
-- (owner_id, period) so the new unique key below can be created.
UPDATE "egress_rollup" AS e SET "bytes" = m."bytes", "request_count" = m."request_count", "created_at" = m."created_at", "updated_at" = m."updated_at"
FROM (
  SELECT min("id") AS "id", sum("bytes")::bigint AS "bytes", sum("request_count")::integer AS "request_count", min("created_at") AS "created_at", max("updated_at") AS "updated_at"
  FROM "egress_rollup" GROUP BY "owner_id", "period"
) AS m
WHERE e."id" = m."id";--> statement-breakpoint
DELETE FROM "egress_rollup" AS e USING "egress_rollup" AS k
WHERE e."owner_id" = k."owner_id" AND e."period" = k."period" AND e."id" > k."id";--> statement-breakpoint
-- Hand-written: the prune-raw-analytics task's function no longer exists.
DELETE FROM "task" WHERE "name" = 'prune-raw-analytics';--> statement-breakpoint
DROP INDEX "egress_rollup_ownerId_period_fileId_tokenId_rendition_key";--> statement-breakpoint
DROP INDEX "egress_rollup_ownerId_period_idx";--> statement-breakpoint
DROP INDEX "egress_rollup_fileId_period_idx";--> statement-breakpoint
ALTER TABLE "egress_rollup" DROP COLUMN "file_id";--> statement-breakpoint
ALTER TABLE "egress_rollup" DROP COLUMN "token_id";--> statement-breakpoint
ALTER TABLE "egress_rollup" DROP COLUMN "rendition";--> statement-breakpoint
CREATE UNIQUE INDEX "egress_rollup_period_ownerId_key" ON "egress_rollup" ("period","owner_id");