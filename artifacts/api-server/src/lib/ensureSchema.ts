/**
 * ensureSchema — migrações idempotentes de coluna aplicadas no boot.
 *
 * O projeto aplica o schema via `drizzle-kit push` manualmente. Para colunas
 * novas e opcionais (que o app sabe degradar com segurança quando ausentes),
 * rodamos um `ADD COLUMN IF NOT EXISTS` no startup — assim um simples rebuild
 * do container já cria a coluna, sem passo manual de migração.
 *
 * IMPORTANTE: precisa rodar ANTES de qualquer `db.select().from(articlesTable)`,
 * porque o Drizzle gera `SELECT ..., social_title` (a coluna está no schema) e
 * isso falharia se a coluna ainda não existisse no banco.
 *
 * É seguro rodar a cada boot: `IF NOT EXISTS` é no-op quando a coluna já existe.
 */
import { db, type Db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

/**
 * `target` permite rodar as mesmas migrações num banco CANDIDATO (assistente de
 * instalação/troca de banco) sem tocar na conexão corrente do processo.
 */
export async function ensureSchema(target: Db = db): Promise<void> {
  const statements = [
    // Título compacto para as artes sociais (não afeta o blog).
    sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS social_title text`,
    // Resumo + hashtags gerados pela IA para a legenda das redes sociais.
    sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS social_summary text`,
    sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS social_hashtags text`,
    // id da notícia no painel central (ingest) — idempotência de reenvio.
    sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS central_id text`,
    // Crédito da fonte por notícia (NULL = segue settings.showSourceCredit).
    sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS show_source_credit boolean`,
    // Crédito da foto principal: texto livre + override por notícia
    // (NULL = segue settings.showImageCredit; texto vazio cai na fonte).
    sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS image_credit text`,
    sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS show_image_credit boolean`,
    // Idioma do painel admin por usuário (KSports: editor em inglês).
    sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'pt-BR'`,
    // Corte de revogação de token por logout (PRD-03) — se autocria no boot.
    sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS tokens_valid_from timestamp`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS articles_central_id_uniq ON articles (central_id) WHERE central_id IS NOT NULL`,
    // Nonces de ingest consumidos (PRD-14, anti-replay) — se autocria no boot.
    sql`CREATE TABLE IF NOT EXISTS ingest_nonces (signature text PRIMARY KEY, seen_at timestamptz NOT NULL DEFAULT now())`,
    // Variante Story (1080×1920) do template: { backgroundColor, elements }.
    sql`ALTER TABLE social_templates ADD COLUMN IF NOT EXISTS story jsonb`,
    // Analytics rodada 2: visitante anônimo, sinais de origem (UTM/host do
    // referrer), flag de tráfego interno e navegador/SO parseados no ingest.
    sql`ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS visitor_id text`,
    sql`ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS utm_source text`,
    sql`ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS utm_medium text`,
    sql`ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS utm_campaign text`,
    sql`ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS ref_host text`,
    sql`ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false`,
    sql`ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS browser text`,
    sql`ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS os text`,
    sql`CREATE INDEX IF NOT EXISTS analytics_visitor_ts_idx ON analytics_events (visitor_id, ts)`,
    // PRD 01 — dimensão interna de behavior_events (coluna aqui; marcação no PRD 03).
    // Até o PRD 03, o handler DROPA interno — toda linha nasce false (mudança inerte).
    sql`ALTER TABLE behavior_events ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false`,
    // PRD 01 — índices-base espelhados (hoje só na migração 0000_init.sql; no-op onde
    // já existem — fecham a lacuna "4 dos 5 índices dependem de drizzle-kit push manual").
    sql`CREATE INDEX IF NOT EXISTS analytics_ts_idx ON analytics_events (ts)`,
    sql`CREATE INDEX IF NOT EXISTS analytics_type_ts_idx ON analytics_events (type, ts)`,
    sql`CREATE INDEX IF NOT EXISTS analytics_session_idx ON analytics_events (session_id)`,
    sql`CREATE INDEX IF NOT EXISTS analytics_article_idx ON analytics_events (article_id)`,
    sql`CREATE INDEX IF NOT EXISTS behavior_type_ts_idx ON behavior_events (event_type, ts)`,
    sql`CREATE INDEX IF NOT EXISTS behavior_ts_idx ON behavior_events (ts)`,
    sql`CREATE INDEX IF NOT EXISTS behavior_session_idx ON behavior_events (session_id)`,
    sql`CREATE INDEX IF NOT EXISTS geo_stats_region_idx ON geo_stats (region)`,
    sql`CREATE INDEX IF NOT EXISTS geo_stats_city_idx ON geo_stats (city)`,
    // Conexões de publicação (WordPress, Site Externo, Blogger). Meta fica em social_accounts.
    sql`CREATE TABLE IF NOT EXISTS social_connections (
      id           text PRIMARY KEY,
      platform     text NOT NULL,
      name         text NOT NULL,
      site_url     text,
      username     text,
      secret_enc   text,
      config       text,
      auto_publish boolean NOT NULL DEFAULT false,
      status       text NOT NULL DEFAULT 'offline',
      last_test_at timestamptz,
      last_error   text,
      is_active    boolean NOT NULL DEFAULT true,
      created_at   timestamptz NOT NULL DEFAULT now(),
      updated_at   timestamptz NOT NULL DEFAULT now()
    )`,
  ];
  for (const stmt of statements) {
    try {
      await target.execute(stmt);
    } catch (err) {
      logger.warn({ err }, "ensureSchema: falha ao aplicar ALTER TABLE (não-fatal)");
    }
  }
  logger.info("ensureSchema: colunas verificadas/criadas");
}
