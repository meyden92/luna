CREATE TABLE "source_session" (
	"id" text PRIMARY KEY,
	"source_key" text NOT NULL UNIQUE,
	"encrypted_value" text NOT NULL,
	"updated_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_session" ADD CONSTRAINT "source_session_updated_by_id_user_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;