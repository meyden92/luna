CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY,
	"model" text NOT NULL,
	"action" text NOT NULL,
	"record_id" text NOT NULL,
	"user_id" text,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"change_set" text,
	"field_changes" jsonb,
	"metadata" jsonb,
	"summary" text
);
--> statement-breakpoint
CREATE TABLE "cached_image" (
	"id" text PRIMARY KEY,
	"url" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"hash" text NOT NULL,
	"purpose" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"owner_id" text NOT NULL,
	"last_accessed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "denylist_entry" (
	"id" text PRIMARY KEY,
	"hash_type" varchar(16) NOT NULL,
	"hash" varchar(128) NOT NULL,
	"source" varchar(64) DEFAULT 'private' NOT NULL,
	"severity" varchar(32) DEFAULT 'block' NOT NULL,
	"notes" text,
	"added_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_case" (
	"id" text PRIMARY KEY,
	"file_id" text NOT NULL,
	"status" varchar(32) DEFAULT 'quarantined' NOT NULL,
	"match_type" varchar(32) NOT NULL,
	"matched_entry_id" text,
	"distance" integer,
	"uploader_id" text,
	"reviewer_id" text,
	"resolution" text,
	"upload_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rbac_group" (
	"id" text PRIMARY KEY,
	"key" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_group_assignment" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"group_id" text NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_generation" (
	"id" text PRIMARY KEY,
	"kind" text NOT NULL,
	"user_id" text NOT NULL,
	"model_id" text NOT NULL,
	"model_label" text NOT NULL,
	"prompt" text,
	"input_image_urls" jsonb,
	"status" text NOT NULL,
	"error_message" text,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "editing_model" (
	"id" text PRIMARY KEY,
	"label" text NOT NULL,
	"description" text,
	"api_model_name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"image_input_field" text DEFAULT 'image_input' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "editing_model_field" (
	"id" text PRIMARY KEY,
	"model_id" text NOT NULL,
	"name" text NOT NULL,
	"label" text NOT NULL,
	"type" text NOT NULL,
	"description" text,
	"is_required" boolean DEFAULT false NOT NULL,
	"default_value" text,
	"min_value" text,
	"max_value" text,
	"step" text,
	"enum_options" text,
	"is_readonly" boolean DEFAULT false NOT NULL,
	"is_textarea" boolean DEFAULT false NOT NULL,
	"is_slider" boolean DEFAULT false NOT NULL,
	"show_char_count" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_model" (
	"id" text PRIMARY KEY,
	"label" text NOT NULL,
	"description" text,
	"api_model_name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "global_variable" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL UNIQUE,
	"label" text NOT NULL,
	"type" text NOT NULL,
	"description" text,
	"default_value" text,
	"options" jsonb,
	"required" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "image_preset" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"model_id" text NOT NULL,
	"name" varchar(100) NOT NULL,
	"field_values" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_field" (
	"id" text PRIMARY KEY,
	"model_id" text NOT NULL,
	"name" text NOT NULL,
	"label" text NOT NULL,
	"type" text NOT NULL,
	"description" text,
	"is_required" boolean DEFAULT false NOT NULL,
	"default_value" text,
	"min_value" text,
	"max_value" text,
	"step" text,
	"enum_options" text,
	"is_readonly" boolean DEFAULT false NOT NULL,
	"is_textarea" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_slider" boolean DEFAULT false NOT NULL,
	"show_char_count" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"description" text,
	"prompt" text NOT NULL,
	"input_image_count" integer DEFAULT 1 NOT NULL,
	"variables" jsonb,
	"preview_images" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"max_image_count" integer DEFAULT 4 NOT NULL,
	"min_image_count" integer DEFAULT 1 NOT NULL,
	"editing_model_id" text,
	"editing_model_field_values" jsonb
);
--> statement-breakpoint
CREATE TABLE "template_generation" (
	"id" text PRIMARY KEY,
	"template_id" text NOT NULL,
	"user_id" text NOT NULL,
	"variable_values" jsonb NOT NULL,
	"final_prompt" text NOT NULL,
	"result_file_id" text,
	"status" text DEFAULT 'success' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"replicate_id" text,
	"replicate_status" text,
	"original_image_urls" jsonb,
	"custom_title" text
);
--> statement-breakpoint
CREATE TABLE "template_global_variable" (
	"id" text PRIMARY KEY,
	"template_id" text NOT NULL,
	"global_variable_id" text NOT NULL,
	"added_options" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"required" boolean
);
--> statement-breakpoint
CREATE TABLE "egress_event" (
	"id" text PRIMARY KEY,
	"file_id" text,
	"owner_id" text NOT NULL,
	"token_id" text,
	"form_share_id" text,
	"rendition" varchar(32) DEFAULT 'original' NOT NULL,
	"bytes" bigint NOT NULL,
	"was_estimated" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "egress_rollup" (
	"id" text PRIMARY KEY,
	"owner_id" text NOT NULL,
	"file_id" text,
	"token_id" text,
	"rendition" varchar(32) DEFAULT 'original' NOT NULL,
	"period" varchar(7) NOT NULL,
	"bytes" bigint DEFAULT 0 NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "view_daily_rollup" (
	"id" text PRIMARY KEY,
	"target_kind" varchar(32) NOT NULL,
	"target_id" text NOT NULL,
	"owner_id" text,
	"day" varchar(10) NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"uniques" integer DEFAULT 0 NOT NULL,
	"referrer_breakdown" jsonb,
	"country_breakdown" jsonb,
	"device_breakdown" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "view_event" (
	"id" text PRIMARY KEY,
	"target_kind" varchar(32) NOT NULL,
	"target_id" text NOT NULL,
	"owner_id" text,
	"country" varchar(2),
	"referrer_host" text,
	"device_class" varchar(20) DEFAULT 'desktop' NOT NULL,
	"visitor_hash" varchar(64) NOT NULL,
	"server_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text
);
--> statement-breakpoint
CREATE TABLE "token" (
	"id" text PRIMARY KEY,
	"name" varchar(100) NOT NULL,
	"key" varchar(64) NOT NULL UNIQUE,
	"user_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"compress_image" boolean DEFAULT false NOT NULL,
	"convert_to_jpeg" boolean DEFAULT false NOT NULL,
	"jpeg_quality" integer DEFAULT 85 NOT NULL,
	"folder_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"strip_metadata" boolean DEFAULT false NOT NULL,
	"flow_id" text
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY,
	"email" text NOT NULL UNIQUE,
	"active" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"bio" varchar(150),
	"description" text,
	"is_profile_public" boolean DEFAULT true NOT NULL,
	"receive_email" boolean DEFAULT true NOT NULL,
	"ban_expires" timestamp with time zone,
	"ban_reason" text,
	"banned" boolean,
	"email_verified" boolean DEFAULT false NOT NULL,
	"name" text DEFAULT 'Mysterious User' NOT NULL,
	"role" text,
	"deleted_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"show_all_files_includes_foldered" boolean DEFAULT true NOT NULL,
	"is_super_admin" boolean DEFAULT false NOT NULL,
	"storage_quota_mib" integer DEFAULT 2048 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flow" (
	"id" text PRIMARY KEY,
	"name" varchar(120) NOT NULL,
	"owner_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"trigger_type" varchar(40) NOT NULL,
	"graph" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flow_run" (
	"id" text PRIMARY KEY,
	"flow_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"triggered_by" varchar(40) NOT NULL,
	"items" jsonb,
	"logs" jsonb,
	"error" text,
	"duration" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL UNIQUE,
	"description" text NOT NULL,
	"cron_expression" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"args" jsonb,
	"last_execution_at" timestamp with time zone,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"next_execution_at" timestamp with time zone,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"task_function" text NOT NULL,
	"timeout" integer DEFAULT 120000
);
--> statement-breakpoint
CREATE TABLE "task_execution" (
	"id" text PRIMARY KEY,
	"task_id" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"duration" integer,
	"result" jsonb,
	"error" text,
	"logs" jsonb,
	"triggered_by" text NOT NULL,
	"executed_by" text
);
--> statement-breakpoint
CREATE TABLE "form_share" (
	"id" text PRIMARY KEY,
	"title" text,
	"expires_at" timestamp with time zone,
	"max_views" integer,
	"view_count" integer DEFAULT 0 NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"owner_id" text NOT NULL,
	"expires_in_ms" integer
);
--> statement-breakpoint
CREATE TABLE "form_share_field" (
	"id" text PRIMARY KEY,
	"form_id" text NOT NULL,
	"label" text NOT NULL,
	"value" text NOT NULL,
	"type" text NOT NULL,
	"is_sensitive" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nicotine_entry" (
	"id" text PRIMARY KEY,
	"kind" varchar(20) NOT NULL,
	"note" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"owner_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file" (
	"id" text PRIMARY KEY,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"tags" text,
	"size" integer NOT NULL,
	"private" boolean DEFAULT false NOT NULL,
	"content_type" text NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"sha256" varchar(64),
	"md5" varchar(32),
	"phash" varchar(64),
	"scrub_report" jsonb,
	"moderation_status" varchar(32) DEFAULT 'clear' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"owner_id" text NOT NULL,
	"folder_id" text
);
--> statement-breakpoint
CREATE TABLE "file_metadata" (
	"id" text PRIMARY KEY,
	"file_id" text NOT NULL CONSTRAINT "file_metadata_fileId_key" UNIQUE,
	"artist" text,
	"description" text,
	"genre" text,
	"lyrics" text,
	"duration" integer,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_rendition" (
	"id" text PRIMARY KEY,
	"source_file_id" text NOT NULL,
	"param_hash" varchar(64) NOT NULL CONSTRAINT "file_rendition_paramHash_key" UNIQUE,
	"params" jsonb NOT NULL,
	"s3_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"private" boolean DEFAULT false NOT NULL,
	"last_accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folder" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"color" varchar(7),
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"owner_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ocr_result" (
	"id" text PRIMARY KEY,
	"file_id" text NOT NULL,
	"file_hash" text NOT NULL,
	"text" text NOT NULL,
	"words" jsonb NOT NULL,
	"lines" jsonb NOT NULL,
	"confidence" double precision NOT NULL,
	"statistics" jsonb NOT NULL,
	"image_width" integer NOT NULL,
	"image_height" integer NOT NULL,
	"language" text DEFAULT 'eng+deu' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snippet" (
	"id" text PRIMARY KEY,
	"title" text,
	"content" text NOT NULL,
	"language" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"owner_id" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_log_model_recordId_idx" ON "audit_log" ("model","record_id");--> statement-breakpoint
CREATE INDEX "audit_log_userId_fkey" ON "audit_log" ("user_id");--> statement-breakpoint
CREATE INDEX "audit_log_changeSet_idx" ON "audit_log" ("change_set");--> statement-breakpoint
CREATE INDEX "audit_log_timestamp_idx" ON "audit_log" ("timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "cached_image_ownerId_hash_key" ON "cached_image" ("owner_id","hash");--> statement-breakpoint
CREATE INDEX "cached_image_ownerId_idx" ON "cached_image" ("owner_id");--> statement-breakpoint
CREATE INDEX "cached_image_purpose_idx" ON "cached_image" ("purpose");--> statement-breakpoint
CREATE INDEX "cached_image_lastAccessedAt_idx" ON "cached_image" ("last_accessed_at");--> statement-breakpoint
CREATE INDEX "cached_image_url_idx" ON "cached_image" ("url");--> statement-breakpoint
CREATE UNIQUE INDEX "denylist_entry_hashType_hash_key" ON "denylist_entry" ("hash_type","hash");--> statement-breakpoint
CREATE INDEX "denylist_entry_source_idx" ON "denylist_entry" ("source");--> statement-breakpoint
CREATE INDEX "denylist_entry_addedBy_idx" ON "denylist_entry" ("added_by");--> statement-breakpoint
CREATE INDEX "moderation_case_fileId_idx" ON "moderation_case" ("file_id");--> statement-breakpoint
CREATE INDEX "moderation_case_status_createdAt_idx" ON "moderation_case" ("status","created_at");--> statement-breakpoint
CREATE INDEX "moderation_case_uploaderId_idx" ON "moderation_case" ("uploader_id");--> statement-breakpoint
CREATE INDEX "moderation_case_reviewerId_idx" ON "moderation_case" ("reviewer_id");--> statement-breakpoint
CREATE INDEX "rbac_group_key_idx" ON "rbac_group" ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "user_group_assignment_userId_groupId_key" ON "user_group_assignment" ("user_id","group_id");--> statement-breakpoint
CREATE INDEX "user_group_assignment_userId_idx" ON "user_group_assignment" ("user_id");--> statement-breakpoint
CREATE INDEX "user_group_assignment_groupId_idx" ON "user_group_assignment" ("group_id");--> statement-breakpoint
CREATE INDEX "user_group_assignment_createdByUserId_idx" ON "user_group_assignment" ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "ai_generation_userId_kind_createdAt_idx" ON "ai_generation" ("user_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "editing_model_isActive_idx" ON "editing_model" ("is_active");--> statement-breakpoint
CREATE INDEX "editing_model_createdBy_idx" ON "editing_model" ("created_by");--> statement-breakpoint
CREATE INDEX "editing_model_field_modelId_idx" ON "editing_model_field" ("model_id");--> statement-breakpoint
CREATE INDEX "generation_model_isActive_idx" ON "generation_model" ("is_active");--> statement-breakpoint
CREATE INDEX "generation_model_createdBy_idx" ON "generation_model" ("created_by");--> statement-breakpoint
CREATE INDEX "image_preset_userId_modelId_idx" ON "image_preset" ("user_id","model_id");--> statement-breakpoint
CREATE INDEX "model_field_modelId_idx" ON "model_field" ("model_id");--> statement-breakpoint
CREATE INDEX "template_isActive_idx" ON "template" ("is_active");--> statement-breakpoint
CREATE INDEX "template_createdBy_idx" ON "template" ("created_by");--> statement-breakpoint
CREATE INDEX "template_editingModelId_idx" ON "template" ("editing_model_id");--> statement-breakpoint
CREATE INDEX "template_generation_templateId_idx" ON "template_generation" ("template_id");--> statement-breakpoint
CREATE INDEX "template_generation_userId_idx" ON "template_generation" ("user_id");--> statement-breakpoint
CREATE INDEX "template_generation_createdAt_idx" ON "template_generation" ("created_at");--> statement-breakpoint
CREATE INDEX "template_generation_status_idx" ON "template_generation" ("status");--> statement-breakpoint
CREATE INDEX "template_generation_resultFileId_fkey" ON "template_generation" ("result_file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "template_global_variable_templateId_globalVariableId_key" ON "template_global_variable" ("template_id","global_variable_id");--> statement-breakpoint
CREATE INDEX "template_global_variable_templateId_idx" ON "template_global_variable" ("template_id");--> statement-breakpoint
CREATE INDEX "template_global_variable_globalVariableId_idx" ON "template_global_variable" ("global_variable_id");--> statement-breakpoint
CREATE INDEX "egress_event_ownerId_createdAt_idx" ON "egress_event" ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "egress_event_fileId_createdAt_idx" ON "egress_event" ("file_id","created_at");--> statement-breakpoint
CREATE INDEX "egress_event_tokenId_createdAt_idx" ON "egress_event" ("token_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "egress_rollup_ownerId_period_fileId_tokenId_rendition_key" ON "egress_rollup" ("owner_id","period","file_id","token_id","rendition");--> statement-breakpoint
CREATE INDEX "egress_rollup_ownerId_period_idx" ON "egress_rollup" ("owner_id","period");--> statement-breakpoint
CREATE INDEX "egress_rollup_fileId_period_idx" ON "egress_rollup" ("file_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "view_daily_rollup_targetKind_targetId_day_key" ON "view_daily_rollup" ("target_kind","target_id","day");--> statement-breakpoint
CREATE INDEX "view_daily_rollup_ownerId_day_idx" ON "view_daily_rollup" ("owner_id","day");--> statement-breakpoint
CREATE INDEX "view_event_targetKind_targetId_createdAt_idx" ON "view_event" ("target_kind","target_id","created_at");--> statement-breakpoint
CREATE INDEX "view_event_ownerId_createdAt_idx" ON "view_event" ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "view_event_visitorHash_idx" ON "view_event" ("visitor_hash");--> statement-breakpoint
CREATE INDEX "account_userId_fkey" ON "account" ("user_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_fkey" ON "session" ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" ("user_id");--> statement-breakpoint
CREATE INDEX "session_expiresAt_idx" ON "session" ("expires_at");--> statement-breakpoint
CREATE INDEX "token_key_idx" ON "token" ("key");--> statement-breakpoint
CREATE INDEX "token_userId_idx" ON "token" ("user_id");--> statement-breakpoint
CREATE INDEX "token_flowId_idx" ON "token" ("flow_id");--> statement-breakpoint
CREATE INDEX "user_id_idx" ON "user" ("id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");--> statement-breakpoint
CREATE INDEX "flow_ownerId_triggerType_enabled_idx" ON "flow" ("owner_id","trigger_type","enabled");--> statement-breakpoint
CREATE INDEX "flow_ownerId_isActive_idx" ON "flow" ("owner_id","is_active");--> statement-breakpoint
CREATE INDEX "flow_run_flowId_startedAt_idx" ON "flow_run" ("flow_id","started_at");--> statement-breakpoint
CREATE INDEX "flow_run_ownerId_startedAt_idx" ON "flow_run" ("owner_id","started_at");--> statement-breakpoint
CREATE INDEX "flow_run_status_idx" ON "flow_run" ("status");--> statement-breakpoint
CREATE INDEX "task_enabled_nextExecutionAt_idx" ON "task" ("enabled","next_execution_at");--> statement-breakpoint
CREATE INDEX "task_createdBy_fkey" ON "task" ("created_by");--> statement-breakpoint
CREATE INDEX "task_execution_taskId_startedAt_idx" ON "task_execution" ("task_id","started_at");--> statement-breakpoint
CREATE INDEX "task_execution_status_idx" ON "task_execution" ("status");--> statement-breakpoint
CREATE INDEX "task_execution_startedAt_idx" ON "task_execution" ("started_at");--> statement-breakpoint
CREATE INDEX "task_execution_executedBy_fkey" ON "task_execution" ("executed_by");--> statement-breakpoint
CREATE INDEX "form_share_ownerId_idx" ON "form_share" ("owner_id");--> statement-breakpoint
CREATE INDEX "form_share_expiresAt_idx" ON "form_share" ("expires_at");--> statement-breakpoint
CREATE INDEX "form_share_field_formId_idx" ON "form_share_field" ("form_id");--> statement-breakpoint
CREATE INDEX "nicotine_entry_owner_id_occurred_at_idx" ON "nicotine_entry" ("owner_id","occurred_at");--> statement-breakpoint
CREATE INDEX "nicotine_entry_owner_id_kind_occurred_at_idx" ON "nicotine_entry" ("owner_id","kind","occurred_at");--> statement-breakpoint
CREATE INDEX "file_ownerId_idx" ON "file" ("owner_id");--> statement-breakpoint
CREATE INDEX "file_folderId_idx" ON "file" ("folder_id");--> statement-breakpoint
CREATE INDEX "file_sha256_idx" ON "file" ("sha256");--> statement-breakpoint
CREATE INDEX "file_md5_idx" ON "file" ("md5");--> statement-breakpoint
CREATE INDEX "file_phash_idx" ON "file" ("phash");--> statement-breakpoint
CREATE INDEX "file_moderationStatus_idx" ON "file" ("moderation_status");--> statement-breakpoint
CREATE INDEX "file_ownerId_isDeleted_createdAt_id_idx" ON "file" ("owner_id","is_deleted","created_at","id");--> statement-breakpoint
CREATE INDEX "file_ownerId_isDeleted_folderId_createdAt_id_idx" ON "file" ("owner_id","is_deleted","folder_id","created_at","id");--> statement-breakpoint
CREATE INDEX "file_rendition_sourceFileId_idx" ON "file_rendition" ("source_file_id");--> statement-breakpoint
CREATE INDEX "file_rendition_lastAccessedAt_idx" ON "file_rendition" ("last_accessed_at");--> statement-breakpoint
CREATE INDEX "folder_ownerId_idx" ON "folder" ("owner_id");--> statement-breakpoint
CREATE INDEX "ocr_result_fileId_idx" ON "ocr_result" ("file_id");--> statement-breakpoint
CREATE INDEX "ocr_result_fileHash_idx" ON "ocr_result" ("file_hash");--> statement-breakpoint
CREATE INDEX "snippet_ownerId_idx" ON "snippet" ("owner_id");--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cached_image" ADD CONSTRAINT "cached_image_owner_id_user_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "user_group_assignment" ADD CONSTRAINT "user_group_assignment_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "user_group_assignment" ADD CONSTRAINT "user_group_assignment_group_id_rbac_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "rbac_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "user_group_assignment" ADD CONSTRAINT "user_group_assignment_created_by_user_id_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_generation" ADD CONSTRAINT "ai_generation_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "editing_model" ADD CONSTRAINT "editing_model_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "editing_model_field" ADD CONSTRAINT "editing_model_field_model_id_editing_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "editing_model"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "generation_model" ADD CONSTRAINT "generation_model_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "image_preset" ADD CONSTRAINT "image_preset_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "model_field" ADD CONSTRAINT "model_field_model_id_generation_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "generation_model"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "template" ADD CONSTRAINT "template_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "template" ADD CONSTRAINT "template_editing_model_id_editing_model_id_fkey" FOREIGN KEY ("editing_model_id") REFERENCES "editing_model"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "template_generation" ADD CONSTRAINT "template_generation_template_id_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "template"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "template_generation" ADD CONSTRAINT "template_generation_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "template_generation" ADD CONSTRAINT "template_generation_result_file_id_file_id_fkey" FOREIGN KEY ("result_file_id") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "template_global_variable" ADD CONSTRAINT "template_global_variable_template_id_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "template"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "template_global_variable" ADD CONSTRAINT "template_global_variable_NUd6DJHrYqC5_fkey" FOREIGN KEY ("global_variable_id") REFERENCES "global_variable"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "token" ADD CONSTRAINT "token_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "task_execution" ADD CONSTRAINT "task_execution_task_id_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "task_execution" ADD CONSTRAINT "task_execution_executed_by_user_id_fkey" FOREIGN KEY ("executed_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "form_share" ADD CONSTRAINT "form_share_owner_id_user_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "form_share_field" ADD CONSTRAINT "form_share_field_form_id_form_share_id_fkey" FOREIGN KEY ("form_id") REFERENCES "form_share"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nicotine_entry" ADD CONSTRAINT "nicotine_entry_owner_id_user_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_owner_id_user_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_folder_id_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "file_metadata" ADD CONSTRAINT "file_metadata_file_id_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "file"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "folder" ADD CONSTRAINT "folder_owner_id_user_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ocr_result" ADD CONSTRAINT "ocr_result_file_id_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "file"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "snippet" ADD CONSTRAINT "snippet_owner_id_user_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;