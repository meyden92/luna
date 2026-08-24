ALTER TABLE "user" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "display_username" text;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "active" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_username_key" UNIQUE("username");--> statement-breakpoint
-- No User row is removed here: everything a User owns hangs off `user.id`, and
-- the Discord identifier lives only in `account.account_id`.
DELETE FROM "account" WHERE "provider_id" = 'discord';--> statement-breakpoint
-- Avatars pointed at Discord's CDN, which no longer serves this instance.
UPDATE "user" SET "image" = NULL WHERE "image" IS NOT NULL;--> statement-breakpoint
-- Sessions minted under the old scheme must not outlive it.
DELETE FROM "session";--> statement-breakpoint
-- `active` gates nothing and defaulted false, so every User rendered as
-- "Pending" in the admin panel. Match the corrected default above.
UPDATE "user" SET "active" = true WHERE "active" = false;
