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
    // PRD 05 RF-4 — presença de click-id (booleano) na linha first-touch; habilita
    // as checagens contínuas do PRD 11/08 ("linha pago sem campanha correspondente").
    sql`ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS gclid boolean`,
    sql`ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS fbclid boolean`,
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
    // PRD 04 RF3 — dimensão interna de ad_daily_stats (marcado, nunca dropado — §17).
    // A CONTAGEM interna vai para estas colunas; leitores públicos somam só impressions/
    // clicks e passam a enxergar só o público sem mudar nenhuma query.
    sql`ALTER TABLE ad_daily_stats ADD COLUMN IF NOT EXISTS internal_impressions integer NOT NULL DEFAULT 0`,
    sql`ALTER TABLE ad_daily_stats ADD COLUMN IF NOT EXISTS internal_clicks integer NOT NULL DEFAULT 0`,
    // PRD-NEWSLETTER-01 (Fase 1) — inscritos da newsletter, isolados por blog.
    // Persistência do e-mail capturado (antes só métrica efêmera) + prova de
    // consentimento LGPD (IP/UA/origem/timestamp) e double opt-in por token.
    sql`CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id                 serial PRIMARY KEY,
      email              text NOT NULL UNIQUE,
      status             text NOT NULL DEFAULT 'pending',
      confirm_token      text,
      confirm_sent_at    timestamptz,
      confirmed_at       timestamptz,
      unsubscribe_token  text,
      unsubscribed_at    timestamptz,
      consent_ip         text,
      consent_user_agent text,
      source             text,
      created_at         timestamptz NOT NULL DEFAULT now(),
      updated_at         timestamptz NOT NULL DEFAULT now()
    )`,
    sql`CREATE INDEX IF NOT EXISTS newsletter_sub_status_idx ON newsletter_subscribers (status)`,
    sql`CREATE INDEX IF NOT EXISTS newsletter_sub_confirm_token_idx ON newsletter_subscribers (confirm_token)`,
    sql`CREATE INDEX IF NOT EXISTS newsletter_sub_unsub_token_idx ON newsletter_subscribers (unsubscribe_token)`,
    // PRD-NEWSLETTER-01 (Fase 3) — campanhas + fila de disparo, isoladas por blog.
    sql`CREATE TABLE IF NOT EXISTS newsletter_campaigns (
      id            serial PRIMARY KEY,
      subject       text NOT NULL,
      body_html     text NOT NULL DEFAULT '',
      status        text NOT NULL DEFAULT 'draft',
      scheduled_at  timestamptz,
      sent_at       timestamptz,
      recipients    integer NOT NULL DEFAULT 0,
      sent_count    integer NOT NULL DEFAULT 0,
      failed_count  integer NOT NULL DEFAULT 0,
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now()
    )`,
    sql`CREATE INDEX IF NOT EXISTS newsletter_campaign_status_idx ON newsletter_campaigns (status)`,
    // Moldura escolhida por campanha (NULL = moldura Padrão das settings).
    sql`ALTER TABLE newsletter_campaigns ADD COLUMN IF NOT EXISTS template_id integer`,
    // Ajuste de cabeçalho/rodapé SÓ desta campanha (NULL = segue a moldura).
    sql`ALTER TABLE newsletter_campaigns ADD COLUMN IF NOT EXISTS template_override jsonb`,
    // PRD-NEWSLETTER-01 (pós-MVP) — biblioteca de molduras (cabeçalho/rodapé),
    // isolada por blog. Config = NewsletterTemplate (cores/logo/textos + HTML).
    sql`CREATE TABLE IF NOT EXISTS newsletter_templates (
      id          serial PRIMARY KEY,
      name        text NOT NULL,
      config      jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now()
    )`,
    sql`CREATE TABLE IF NOT EXISTS newsletter_send_queue (
      id            serial PRIMARY KEY,
      kind          text NOT NULL DEFAULT 'campaign',
      campaign_id   integer,
      subscriber_id integer NOT NULL,
      email         text NOT NULL,
      status        text NOT NULL DEFAULT 'pending',
      attempts      integer NOT NULL DEFAULT 0,
      next_retry_at timestamptz,
      scheduled_at  timestamptz,
      sent_at       timestamptz,
      last_error    text,
      created_at    timestamptz NOT NULL DEFAULT now()
    )`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS newsletter_queue_campaign_sub_uniq ON newsletter_send_queue (campaign_id, subscriber_id)`,
    sql`CREATE INDEX IF NOT EXISTS newsletter_queue_status_retry_idx ON newsletter_send_queue (status, next_retry_at)`,
    sql`CREATE INDEX IF NOT EXISTS newsletter_queue_campaign_idx ON newsletter_send_queue (campaign_id)`,
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

  // PRD 04 RF2 — reparo dos dados históricos inflados de ad_daily_stats (roda no boot,
  // uma vez por banco, guardado pela existência do índice único). Depois das colunas
  // internas acima já existirem. Não-fatal: falha é logada e o boot segue.
  await ensureAdDailyStatsIntegrity(target);
}

/**
 * ensureAdDailyStatsIntegrity — desinfla ad_daily_stats e trava a regravação (PRD 04).
 *
 * O escritor legado (INSERT-sempre + UPDATE-em-todas-as-linhas do par, sem UNIQUE em
 * (ad_id,date)) acumulou linhas duplicadas com soma ~quadrática. Este reparo, numa
 * única transação:
 *   a. faz BACKUP do estado original (ad_daily_stats_backup_prd04);
 *   b. colapsa cada par para 1 linha com o valor real estimado (MAX−1 por campo —
 *      estimador validado contra produção: 65 = 65 no anúncio "Start", auditoria §9.1);
 *   c. cria o índice ÚNICO ad_daily_ad_date_uniq e dropa o comum ad_daily_ad_date_idx;
 *   d. grava o marcador settings.ads_reliable_since (datas anteriores = reparadas por
 *      estimativa; a partir dele = contagem exata do código novo).
 *
 * Guarda de idempotência: a EXISTÊNCIA do índice único. O estimador NÃO é idempotente
 * (reaplicar decrementaria de novo), por isso reparo+índice são a MESMA transação —
 * não existe estado "reparado sem índice" persistido. Falha → rollback e retry no
 * próximo boot; o all-time de adsTable permanece correto como contraprova.
 */
export async function ensureAdDailyStatsIntegrity(target: Db = db): Promise<void> {
  try {
    const guard = await target.execute(
      sql`SELECT 1 AS ok FROM pg_indexes WHERE tablename = 'ad_daily_stats' AND indexname = 'ad_daily_ad_date_uniq' LIMIT 1`,
    );
    const already = (((guard as { rows?: unknown[] }).rows?.length) ?? 0) > 0;
    if (already) return; // já reparado neste banco — nunca reexecuta

    await target.transaction(async (tx) => {
      // a. Backup do estado ORIGINAL (antes de qualquer reescrita). Descartável após
      //    validação (CA5); fora do schema Drizzle por design (tabela operacional).
      await tx.execute(
        sql`CREATE TABLE IF NOT EXISTS ad_daily_stats_backup_prd04 AS SELECT * FROM ad_daily_stats`,
      );
      // b1. Colapsa: mantém a linha de menor id do par com o valor real (MAX−1, piso 0).
      await tx.execute(sql`
        WITH rep AS (
          SELECT ad_id, date, min(id) AS keep_id,
                 CASE WHEN max(impressions) = 0 THEN 0 ELSE max(impressions) - 1 END AS imp_fix,
                 CASE WHEN max(clicks)      = 0 THEN 0 ELSE max(clicks)      - 1 END AS clk_fix
          FROM ad_daily_stats GROUP BY ad_id, date
        )
        UPDATE ad_daily_stats s
        SET impressions = rep.imp_fix, clicks = rep.clk_fix
        FROM rep
        WHERE s.id = rep.keep_id
      `);
      // b2. Remove as demais linhas do par (as que não são a keep_id).
      await tx.execute(sql`
        DELETE FROM ad_daily_stats s
        USING (SELECT ad_id, date, min(id) AS keep_id FROM ad_daily_stats GROUP BY ad_id, date) rep
        WHERE s.ad_id = rep.ad_id AND s.date = rep.date AND s.id <> rep.keep_id
      `);
      // c. Índice único (o upsert atômico depende dele) + drop do comum redundante.
      await tx.execute(sql`CREATE UNIQUE INDEX ad_daily_ad_date_uniq ON ad_daily_stats (ad_id, date)`);
      await tx.execute(sql`DROP INDEX IF EXISTS ad_daily_ad_date_idx`);
      // d. Marcador "dados de anúncio confiáveis desde" (data BRT do 1º boot pós-fix).
      await tx.execute(sql`
        INSERT INTO settings (key, value)
        SELECT 'ads_reliable_since', to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD')
        WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'ads_reliable_since')
      `);
    });
    logger.info("ensureSchema: ad_daily_stats reparado e índice único criado (PRD 04)");
  } catch (err) {
    logger.warn({ err }, "ensureSchema: reparo de ad_daily_stats falhou (não-fatal, retry no próximo boot)");
  }
}
