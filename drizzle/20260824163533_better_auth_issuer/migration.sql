ALTER TABLE "account" ADD COLUMN "issuer" text;--> statement-breakpoint
-- Better-Auth ≥1.7 keys accounts by (issuer, accountId). Existing rows are all
-- local providers (only 'credential' since the v4.0.0 cutover), whose synthetic
-- issuer is 'local:<providerId>' — the same value createLocalAccountIssuer()
-- produces at runtime.
UPDATE "account" SET "issuer" = 'local:' || "provider_id";--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_accountId_key" ON "account" ("issuer","account_id");
