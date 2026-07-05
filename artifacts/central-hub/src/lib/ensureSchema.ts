/**
 * Migração aditiva no boot (padrão do repo): CREATE TABLE/INDEX IF NOT EXISTS
 * para todo o schema central, de modo que um rebuild do container já cria a
 * estrutura sem passo manual. `drizzle-kit push` continua disponível em dev.
 * Cada statement é não-fatal (try/catch) — igual ao ensureSchema do blog.
 */
import { db } from "@workspace/central-db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

const STATEMENTS: Array<{ name: string; query: ReturnType<typeof sql> }> = [
  {
    name: "central_users",
    query: sql`CREATE TABLE IF NOT EXISTS central_users (
      id text PRIMARY KEY,
      email text NOT NULL UNIQUE,
      name text NOT NULL,
      password_hash text NOT NULL,
      role text NOT NULL DEFAULT 'admin',
      is_active boolean NOT NULL DEFAULT true,
      last_login_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
  },
  {
    name: "blogs",
    query: sql`CREATE TABLE IF NOT EXISTS blogs (
      id text PRIMARY KEY,
      name text NOT NULL,
      domain text,
      api_url text NOT NULL,
      ingest_secret_enc text,
      is_active boolean NOT NULL DEFAULT true,
      require_approval boolean NOT NULL DEFAULT false,
      delivery_mode text NOT NULL DEFAULT 'publish',
      max_posts_per_day integer,
      min_minutes_between_posts integer,
      status text NOT NULL DEFAULT 'offline',
      last_seen_at timestamptz,
      last_error text,
      notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
  },
  {
    name: "central_sources",
    query: sql`CREATE TABLE IF NOT EXISTS central_sources (
      id text PRIMARY KEY,
      name text NOT NULL,
      url text NOT NULL,
      category text NOT NULL DEFAULT 'geral',
      active boolean NOT NULL DEFAULT true,
      schedule_hours integer NOT NULL DEFAULT 0,
      fetch_limit integer,
      give_credit boolean NOT NULL DEFAULT false,
      custom_prompt text,
      last_fetched_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
  },
  {
    name: "news_items",
    query: sql`CREATE TABLE IF NOT EXISTS news_items (
      id text PRIMARY KEY,
      source_id text NOT NULL,
      source_name text NOT NULL,
      guid text,
      original_url text,
      canonical_url text,
      title text NOT NULL,
      title_norm text NOT NULL,
      description text,
      content_raw text,
      image_url text,
      category text NOT NULL DEFAULT 'geral',
      tags text,
      published_at_source timestamptz,
      status text NOT NULL DEFAULT 'collected',
      fail_reason text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
  },
  { name: "news_items_title_norm_idx", query: sql`CREATE INDEX IF NOT EXISTS news_items_title_norm_idx ON news_items (title_norm)` },
  { name: "news_items_guid_idx", query: sql`CREATE INDEX IF NOT EXISTS news_items_guid_idx ON news_items (guid)` },
  { name: "news_items_original_url_idx", query: sql`CREATE INDEX IF NOT EXISTS news_items_original_url_idx ON news_items (original_url)` },
  { name: "news_items_status_idx", query: sql`CREATE INDEX IF NOT EXISTS news_items_status_idx ON news_items (status)` },
  { name: "news_items_created_at_idx", query: sql`CREATE INDEX IF NOT EXISTS news_items_created_at_idx ON news_items (created_at)` },
  {
    name: "rewrites",
    query: sql`CREATE TABLE IF NOT EXISTS rewrites (
      id text PRIMARY KEY,
      news_item_id text NOT NULL,
      blog_id text,
      title text,
      subtitle text,
      social_title text,
      social_summary text,
      social_hashtags text,
      content_html text,
      slug text,
      keywords text,
      provider text,
      model text,
      attempts integer NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'ok',
      error_message text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
  },
  { name: "rewrites_shared_uniq", query: sql`CREATE UNIQUE INDEX IF NOT EXISTS rewrites_shared_uniq ON rewrites (news_item_id) WHERE blog_id IS NULL` },
  {
    name: "distribution_rules",
    query: sql`CREATE TABLE IF NOT EXISTS distribution_rules (
      id text PRIMARY KEY,
      blog_id text NOT NULL,
      name text NOT NULL,
      is_active boolean NOT NULL DEFAULT true,
      priority integer NOT NULL DEFAULT 0,
      categories_include jsonb,
      categories_exclude jsonb,
      sources_include jsonb,
      sources_exclude jsonb,
      keywords_include jsonb,
      keywords_exclude jsonb,
      target_category text,
      target_tag text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
  },
  { name: "distribution_rules_blog_idx", query: sql`CREATE INDEX IF NOT EXISTS distribution_rules_blog_idx ON distribution_rules (blog_id)` },
  {
    name: "deliveries",
    query: sql`CREATE TABLE IF NOT EXISTS deliveries (
      id text PRIMARY KEY,
      news_item_id text NOT NULL,
      rewrite_id text NOT NULL,
      blog_id text NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      attempts integer NOT NULL DEFAULT 0,
      next_retry_at timestamptz,
      scheduled_at timestamptz,
      delivered_at timestamptz,
      target_category text,
      target_tag text,
      remote_article_id text,
      remote_url text,
      last_error text,
      last_http_status integer,
      approved_by text,
      approved_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
  },
  { name: "deliveries_news_blog_uniq", query: sql`CREATE UNIQUE INDEX IF NOT EXISTS deliveries_news_blog_uniq ON deliveries (news_item_id, blog_id)` },
  { name: "deliveries_status_retry_idx", query: sql`CREATE INDEX IF NOT EXISTS deliveries_status_retry_idx ON deliveries (status, next_retry_at)` },
  { name: "deliveries_blog_idx", query: sql`CREATE INDEX IF NOT EXISTS deliveries_blog_idx ON deliveries (blog_id)` },
  {
    name: "delivery_attempts",
    query: sql`CREATE TABLE IF NOT EXISTS delivery_attempts (
      id serial PRIMARY KEY,
      delivery_id text NOT NULL,
      attempt_no integer NOT NULL,
      http_status integer,
      ok boolean NOT NULL DEFAULT false,
      error_message text,
      duration_ms integer,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
  },
  { name: "delivery_attempts_delivery_idx", query: sql`CREATE INDEX IF NOT EXISTS delivery_attempts_delivery_idx ON delivery_attempts (delivery_id)` },
  {
    name: "ai_usage_events",
    query: sql`CREATE TABLE IF NOT EXISTS ai_usage_events (
      id serial PRIMARY KEY,
      news_item_id text,
      rewrite_id text,
      provider text NOT NULL,
      model text,
      key_hint text,
      input_tokens integer,
      output_tokens integer,
      total_tokens integer,
      purpose text NOT NULL DEFAULT 'rewrite',
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
  },
  { name: "ai_usage_created_at_idx", query: sql`CREATE INDEX IF NOT EXISTS ai_usage_created_at_idx ON ai_usage_events (created_at)` },
  { name: "ai_usage_provider_idx", query: sql`CREATE INDEX IF NOT EXISTS ai_usage_provider_idx ON ai_usage_events (provider)` },
  {
    name: "central_event_logs",
    query: sql`CREATE TABLE IF NOT EXISTS central_event_logs (
      id serial PRIMARY KEY,
      ts timestamptz NOT NULL DEFAULT now(),
      level text NOT NULL DEFAULT 'info',
      module text NOT NULL,
      ref_type text,
      ref_id text,
      message text NOT NULL,
      meta jsonb
    )`,
  },
  { name: "central_event_logs_ts_idx", query: sql`CREATE INDEX IF NOT EXISTS central_event_logs_ts_idx ON central_event_logs (ts)` },
  { name: "central_event_logs_module_ts_idx", query: sql`CREATE INDEX IF NOT EXISTS central_event_logs_module_ts_idx ON central_event_logs (module, ts)` },
  {
    name: "central_settings",
    query: sql`CREATE TABLE IF NOT EXISTS central_settings (
      key text PRIMARY KEY,
      value jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
  },
];

export async function ensureSchema(): Promise<void> {
  for (const stmt of STATEMENTS) {
    try {
      await db.execute(stmt.query);
    } catch (err) {
      // Não-fatal: statement individual pode falhar (ex.: permissão), o boot segue.
      logger.warn({ err, statement: stmt.name }, "ensureSchema: statement falhou (não-fatal)");
    }
  }
  logger.info("ensureSchema (central) concluído");
}
