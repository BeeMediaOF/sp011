CREATE TYPE "public"."user_role" AS ENUM('admin', 'editor');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'inactive', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."log_severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."article_origin" AS ENUM('manual', 'rss', 'perplexity');--> statement-breakpoint
CREATE TYPE "public"."article_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."ad_position" AS ENUM('slot_01', 'slot_02', 'slot_03', 'slot_04', 'slot_05', 'slot_06', 'slot_07', 'slot_08', 'slot_09', 'slot_10', 'slot_11', 'topo', 'centro', 'lateral', 'rodape', 'slidebar_250', 'slidebar_500', 'banner', 'sidebar', 'central');--> statement-breakpoint
CREATE TYPE "public"."analytics_device" AS ENUM('mobile', 'desktop', 'tablet');--> statement-breakpoint
CREATE TYPE "public"."analytics_event_type" AS ENUM('pageview', 'read', 'category', 'scroll', 'share');--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'editor' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_login" timestamp,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp,
	"password_changed_at" timestamp,
	"must_change_password" integer DEFAULT 0 NOT NULL,
	"avatar_base64" text,
	"two_factor_secret" text,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"user_email" text,
	"action" text NOT NULL,
	"module" text NOT NULL,
	"description" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"user_email" text,
	"event_type" text NOT NULL,
	"severity" "log_severity" DEFAULT 'low' NOT NULL,
	"description" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"route" text,
	"payload_summary" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"role" text DEFAULT 'editor' NOT NULL,
	"permission_key" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "role_perm_unique" UNIQUE("role","permission_key")
);
--> statement-breakpoint
CREATE TABLE "contact_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"subject" text,
	"message" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"social_title" text,
	"social_summary" text,
	"social_hashtags" text,
	"subtitle" text DEFAULT '' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'geral' NOT NULL,
	"tag" text DEFAULT 'GERAL' NOT NULL,
	"image_url" text DEFAULT '' NOT NULL,
	"author" text DEFAULT 'Redação' NOT NULL,
	"published_at" timestamp with time zone,
	"status" "article_status" DEFAULT 'draft' NOT NULL,
	"origin" "article_origin",
	"rss_source_id" text,
	"rss_source_name" text,
	"rss_source_url" text,
	"ai_rewritten" boolean DEFAULT false,
	"slug" text,
	"keywords" text,
	"draft_reason" text,
	"canonical_url" text,
	"central_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ads" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"image_base64" text NOT NULL,
	"link" text NOT NULL,
	"position" "ad_position" DEFAULT 'slot_01' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"target_devices" text DEFAULT 'desktop,mobile,tablet' NOT NULL,
	"image_url" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" "analytics_event_type" NOT NULL,
	"path" text NOT NULL,
	"title" text,
	"category" text,
	"article_id" text,
	"session_id" text NOT NULL,
	"duration" integer,
	"device" "analytics_device" NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"ua" text,
	"referrer" text,
	"scroll_depth" integer,
	"platform" text,
	"city" text,
	"region" text
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"ip" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"reset_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rss_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"category" text DEFAULT 'geral' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"schedule_hours" integer DEFAULT 0 NOT NULL,
	"fetch_limit" integer,
	"give_credit" boolean DEFAULT false NOT NULL,
	"auto_mode" text DEFAULT 'none' NOT NULL,
	"last_fetched_at" timestamp with time zone,
	"custom_prompt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "perplexity_topics" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"query" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'geral' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"schedule_hours" integer DEFAULT 24 NOT NULL,
	"max_results" integer DEFAULT 3 NOT NULL,
	"auto_mode" text DEFAULT 'draft' NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rss_event_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"type" text NOT NULL,
	"source_name" text NOT NULL,
	"article_title" text NOT NULL,
	"message" text
);
--> statement-breakpoint
CREATE TABLE "endpoint_rate_limits" (
	"ip" text NOT NULL,
	"endpoint" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"reset_at" timestamp with time zone NOT NULL,
	"blocked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "endpoint_rate_limits_ip_endpoint_pk" PRIMARY KEY("ip","endpoint")
);
--> statement-breakpoint
CREATE TABLE "article_views" (
	"article_id" text PRIMARY KEY NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_views" (
	"category" text PRIMARY KEY NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text,
	"auth" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "geo_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"city" text,
	"region" text,
	"country" text DEFAULT 'BR' NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"meta_app_id" text,
	"meta_app_secret" text,
	"page_id" text,
	"page_name" text,
	"instagram_id" text,
	"instagram_name" text,
	"access_token" text,
	"token_expires_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'feed' NOT NULL,
	"width" integer DEFAULT 1080 NOT NULL,
	"height" integer DEFAULT 1350 NOT NULL,
	"background_color" text DEFAULT '#1a1a1a' NOT NULL,
	"elements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"story" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_publication_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"article_id" text NOT NULL,
	"social_account_id" text NOT NULL,
	"template_id" text,
	"type" text DEFAULT 'feed' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"caption" text,
	"scheduled_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"meta_post_id" text,
	"error_message" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"name" text NOT NULL,
	"site_url" text,
	"username" text,
	"secret_enc" text,
	"config" text,
	"auto_publish" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'offline' NOT NULL,
	"last_test_at" timestamp with time zone,
	"last_error" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_daily_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"ad_id" text NOT NULL,
	"date" text NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "behavior_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"value" text,
	"session_id" text NOT NULL,
	"device" text,
	"article_id" text,
	"ts" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "articles_slug_idx" ON "articles" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "articles_status_idx" ON "articles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "articles_category_idx" ON "articles" USING btree ("category");--> statement-breakpoint
CREATE INDEX "articles_published_at_idx" ON "articles" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "analytics_ts_idx" ON "analytics_events" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "analytics_type_ts_idx" ON "analytics_events" USING btree ("type","ts");--> statement-breakpoint
CREATE INDEX "analytics_session_idx" ON "analytics_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "analytics_article_idx" ON "analytics_events" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "geo_stats_region_idx" ON "geo_stats" USING btree ("region");--> statement-breakpoint
CREATE INDEX "geo_stats_city_idx" ON "geo_stats" USING btree ("city");--> statement-breakpoint
CREATE INDEX "ad_daily_ad_date_idx" ON "ad_daily_stats" USING btree ("ad_id","date");--> statement-breakpoint
CREATE INDEX "ad_daily_date_idx" ON "ad_daily_stats" USING btree ("date");--> statement-breakpoint
CREATE INDEX "behavior_type_ts_idx" ON "behavior_events" USING btree ("event_type","ts");--> statement-breakpoint
CREATE INDEX "behavior_ts_idx" ON "behavior_events" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "behavior_session_idx" ON "behavior_events" USING btree ("session_id");