CREATE TABLE IF NOT EXISTS "provider_models_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_type" varchar(50) NOT NULL,
	"models" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_models_cache_provider" ON "provider_models_cache" USING btree ("provider_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_models_cache_fetched_at" ON "provider_models_cache" USING btree ("fetched_at");