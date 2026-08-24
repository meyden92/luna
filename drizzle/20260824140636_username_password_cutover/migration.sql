ALTER TABLE "user" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "display_username" text;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "active" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_username_key" UNIQUE("username");--> statement-breakpoint
-- Issue #54: the Discord cutover. Schema and data change together so no
-- deployed state ever has username columns beside Discord-shaped data.
--
-- User rows are never touched here beyond their columns: everything a User owns
-- hangs off `user.id`, and `file.owner_id` is ON DELETE RESTRICT, so Postgres
-- itself refuses to lose an owner. Only the Account rows go.
DELETE FROM "account" WHERE "provider_id" = 'discord';--> statement-breakpoint
-- Avatars pointed at Discord's CDN. Users set their own from the profile now.
UPDATE "user" SET "image" = NULL WHERE "image" IS NOT NULL;--> statement-breakpoint
-- Sessions minted under the old scheme must not outlive it.
DELETE FROM "session";--> statement-breakpoint
-- `active` gated nothing and defaulted false, so every existing User rendered
-- as "Pending" in the admin panel forever. The default is corrected above;
-- this makes the existing rows agree with it.
UPDATE "user" SET "active" = true WHERE "active" = false;
