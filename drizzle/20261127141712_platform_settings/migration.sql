CREATE TABLE "platform_settings" (
	"id" text PRIMARY KEY,
	"rendition_path" text NOT NULL,
	"studio_output_path" text NOT NULL,
	"template_preview_path" text NOT NULL,
	"template_reference_path" text NOT NULL,
	"avatar_path" text NOT NULL,
	"default_storage_quota_mib" integer NOT NULL,
	"download_proxy_max_mib" integer NOT NULL,
	"downloader_max_video_mib" integer NOT NULL,
	"downloader_max_preparing_per_user" integer NOT NULL,
	"downloader_expiry_minutes" integer NOT NULL,
	"avatar_max_upload_mib" integer NOT NULL,
	"sharex_max_upload_mib" integer NOT NULL,
	"sharex_upload_concurrency" integer NOT NULL,
	"phash_distance_threshold" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "studio_settings" ADD COLUMN "output_lifetime_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_settings" ADD COLUMN "input_max_mib" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_settings" ADD COLUMN "template_preview_max_mib" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_settings" ADD COLUMN "template_reference_max_mib" integer DEFAULT 100 NOT NULL;