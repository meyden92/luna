CREATE TABLE "sync_excluded_path" (
	"id" text PRIMARY KEY,
	"pattern" text NOT NULL UNIQUE,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sync_excluded_path" ADD CONSTRAINT "sync_excluded_path_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
INSERT INTO "sync_excluded_path" ("id", "pattern") VALUES
	(gen_random_uuid()::text, 'cache/*'),
	(gen_random_uuid()::text, 'templates/*'),
	(gen_random_uuid()::text, '*/edit-image/*');
