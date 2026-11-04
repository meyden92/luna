CREATE TABLE "generation" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"model_id" text,
	"template_id" text,
	"from_template" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"endpoint_id" text NOT NULL,
	"form_values" jsonb NOT NULL,
	"request_input" jsonb,
	"fal_request_id" text,
	"status_url" text,
	"response_url" text,
	"cancel_url" text,
	"status" varchar(16) DEFAULT 'queued' NOT NULL,
	"progress" jsonb,
	"error" jsonb,
	"estimated_cost_usd" numeric(12,6),
	"actual_cost_usd" numeric(12,6),
	"cost_settled_at" timestamp with time zone,
	"seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "generation_output" (
	"id" text PRIMARY KEY,
	"generation_id" text NOT NULL,
	"index" integer NOT NULL,
	"media_kind" varchar(16) NOT NULL,
	"content_type" text NOT NULL,
	"s3_key" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"duration_seconds" double precision,
	"expires_at" timestamp with time zone NOT NULL,
	"expired_at" timestamp with time zone,
	"saved_file_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_budget_override" (
	"user_id" text PRIMARY KEY,
	"monthly_budget_usd" numeric(12,2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_category" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"icon" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_model" (
	"id" text PRIMARY KEY,
	"category_id" text NOT NULL,
	"endpoint_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"schema_snapshot" jsonb NOT NULL,
	"schema_checked_at" timestamp with time zone,
	"pending_schema" jsonb,
	"deprecated" boolean DEFAULT false NOT NULL,
	"fields" jsonb DEFAULT '[]' NOT NULL,
	"pricing" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_settings" (
	"id" text PRIMARY KEY,
	"default_monthly_budget_usd" numeric(12,2),
	"max_active_generations_per_user" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_template" (
	"id" text PRIMARY KEY,
	"category_id" text NOT NULL,
	"model_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"fields" jsonb DEFAULT '[]' NOT NULL,
	"variables" jsonb DEFAULT '[]' NOT NULL,
	"preview_keys" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "editing_model_field" DROP CONSTRAINT "editing_model_field_model_id_editing_model_id_fkey";--> statement-breakpoint
ALTER TABLE "model_field" DROP CONSTRAINT "model_field_model_id_generation_model_id_fkey";--> statement-breakpoint
ALTER TABLE "template" DROP CONSTRAINT "template_editing_model_id_editing_model_id_fkey";--> statement-breakpoint
ALTER TABLE "template_generation" DROP CONSTRAINT "template_generation_template_id_template_id_fkey";--> statement-breakpoint
ALTER TABLE "template_global_variable" DROP CONSTRAINT "template_global_variable_template_id_template_id_fkey";--> statement-breakpoint
ALTER TABLE "template_global_variable" DROP CONSTRAINT "template_global_variable_NUd6DJHrYqC5_fkey";--> statement-breakpoint
DROP TABLE "cached_image";--> statement-breakpoint
DROP TABLE "ai_generation";--> statement-breakpoint
DROP TABLE "editing_model";--> statement-breakpoint
DROP TABLE "editing_model_field";--> statement-breakpoint
DROP TABLE "generation_model";--> statement-breakpoint
DROP TABLE "global_variable";--> statement-breakpoint
DROP TABLE "image_preset";--> statement-breakpoint
DROP TABLE "model_field";--> statement-breakpoint
DROP TABLE "template";--> statement-breakpoint
DROP TABLE "template_generation";--> statement-breakpoint
DROP TABLE "template_global_variable";--> statement-breakpoint
CREATE INDEX "generation_userId_createdAt_idx" ON "generation" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "generation_status_idx" ON "generation" ("status");--> statement-breakpoint
CREATE INDEX "generation_modelId_idx" ON "generation" ("model_id");--> statement-breakpoint
CREATE INDEX "generation_templateId_idx" ON "generation" ("template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_falRequestId_key" ON "generation" ("fal_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_output_generationId_index_key" ON "generation_output" ("generation_id","index");--> statement-breakpoint
CREATE INDEX "generation_output_expiresAt_idx" ON "generation_output" ("expires_at");--> statement-breakpoint
CREATE INDEX "generation_output_savedFileId_idx" ON "generation_output" ("saved_file_id");--> statement-breakpoint
CREATE INDEX "studio_model_categoryId_idx" ON "studio_model" ("category_id");--> statement-breakpoint
CREATE INDEX "studio_template_categoryId_idx" ON "studio_template" ("category_id");--> statement-breakpoint
CREATE INDEX "studio_template_modelId_idx" ON "studio_template" ("model_id");--> statement-breakpoint
ALTER TABLE "generation" ADD CONSTRAINT "generation_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "generation" ADD CONSTRAINT "generation_model_id_studio_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "studio_model"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "generation" ADD CONSTRAINT "generation_template_id_studio_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "studio_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "generation_output" ADD CONSTRAINT "generation_output_generation_id_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "generation"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "generation_output" ADD CONSTRAINT "generation_output_saved_file_id_file_id_fkey" FOREIGN KEY ("saved_file_id") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "studio_budget_override" ADD CONSTRAINT "studio_budget_override_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "studio_model" ADD CONSTRAINT "studio_model_category_id_studio_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "studio_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "studio_template" ADD CONSTRAINT "studio_template_category_id_studio_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "studio_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "studio_template" ADD CONSTRAINT "studio_template_model_id_studio_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "studio_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "studio_template" ADD CONSTRAINT "studio_template_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
-- The removed Replicate task has no function left to run; its executions cascade.
DELETE FROM "task" WHERE "task_function" = 'checkTemplateGenerations';
