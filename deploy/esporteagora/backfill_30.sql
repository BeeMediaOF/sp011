-- =============================================================================
-- Esporte Agora — backfill: publica até 30 notícias de esporte do HISTÓRICO
-- da central que ainda não foram entregues ao blog (roda no banco CENTRAL)
-- =============================================================================
-- O que faz:
--   * Seleciona as 30 notícias de esporte mais recentes com reescrita
--     compartilhada pronta em pt-BR (fontes PT de esporte — as do
--     sources_pt.sql e as antigas com categoria 'esportes') que AINDA NÃO
--     têm entrega para o Esporte Agora (dedupe pelo UNIQUE news+blog).
--   * Categoria explícita de esporte → entrega nasce 'pending' com
--     target_category = slug do menu (publica direto, sem IA).
--   * Fonte genérica (outros/esportes) → nasce 'awaiting_localization': o
--     localizer SÓ CLASSIFICA (pt→pt não traduz) e move para
--     pending/awaiting_approval conforme o "Exigir aprovação" do blog.
--   * scheduled_at escalonado a cada 3 min, da notícia mais ANTIGA para a
--     mais nova (a mais fresca é publicada por último e fica no topo da
--     home). ~90 min para o lote inteiro.
--
-- Idempotente: rodar 2x não duplica (ON CONFLICT DO NOTHING) — mas a 2ª vez
-- pega as PRÓXIMAS 30 ainda sem entrega, se existirem.
-- Atenção: as entregas criadas contam no teto diário (max_posts_per_day) —
-- o fluxo orgânico de hoje pode ser empurrado para amanhã se o teto bater.
--
-- Uso (VPS, /opt/sp011 — mesmo DBURL do sources_pt.sql):
--   DBURL=$(grep -m1 '^CENTRAL_DATABASE_URL=' .env.central | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
--   docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 < deploy/esporteagora/backfill_30.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Guardas: blog cadastrado e ONLINE (entregar com o blog fora do ar queima
-- as 5 tentativas HTTP de cada entrega → dead)
DO $$
DECLARE b RECORD;
BEGIN
  SELECT id, status, is_active INTO b FROM blogs
  WHERE name ILIKE '%esporte%agora%' OR domain ILIKE '%esporteagora%' LIMIT 1;
  IF b.id IS NULL THEN
    RAISE EXCEPTION 'Blog Esporte Agora nao encontrado — cadastre no painel central antes.';
  END IF;
  IF NOT b.is_active THEN
    RAISE EXCEPTION 'Blog Esporte Agora esta INATIVO no painel — ative antes do backfill.';
  END IF;
  IF b.status <> 'online' THEN
    RAISE EXCEPTION 'Blog Esporte Agora esta "%" (nao online) — rode "Testar conexao" no painel antes, senao as entregas morrem em retry.', b.status;
  END IF;
END $$;

WITH blog AS (
  SELECT id FROM blogs
  WHERE name ILIKE '%esporte%agora%' OR domain ILIKE '%esporteagora%'
  LIMIT 1
),
candidates AS (
  SELECT ni.id AS news_item_id,
         r.id  AS rewrite_id,
         ni.title,
         ni.created_at,
         -- categoria explícita do menu → publica direto; senão IA classifica
         CASE WHEN ni.category IN ('copa-do-mundo','futebol','volei','tenis','f1','futebol-americano','e-sports')
              THEN ni.category END AS target_category
  FROM news_items ni
  JOIN central_sources cs ON cs.id = ni.source_id
  JOIN rewrites r ON r.news_item_id = ni.id AND r.blog_id IS NULL AND r.status = 'ok'
  WHERE ni.status = 'distributed'
    AND COALESCE(cs.language, 'pt-BR') = 'pt-BR'      -- nunca texto EN
    AND COALESCE(r.language,  'pt-BR') = 'pt-BR'
    AND (
      -- fontes do Esporte Agora (sources_pt.sql)
      cs.category IN ('copa-do-mundo','futebol','volei','tenis','f1','futebol-americano','e-sports','outros')
      -- fontes/notícias PT de esporte antigas (era dos testes do ksports)
      OR cs.category = 'esportes'
      OR ni.category IN ('copa-do-mundo','futebol','volei','tenis','f1','futebol-americano','e-sports','esportes')
    )
    AND NOT EXISTS (                                   -- "não repetidas"
      SELECT 1 FROM deliveries d
      WHERE d.news_item_id = ni.id AND d.blog_id = (SELECT id FROM blog)
    )
  ORDER BY ni.created_at DESC
  LIMIT 30
),
numbered AS (
  -- mais ANTIGA primeiro: a notícia mais fresca publica por último → topo da home
  SELECT c.*, row_number() OVER (ORDER BY c.created_at ASC) AS rn
  FROM candidates c
),
ins AS (
  INSERT INTO deliveries
    (id, news_item_id, rewrite_id, blog_id, status, attempts,
     next_retry_at, scheduled_at, target_category, target_tag)
  SELECT gen_random_uuid()::text,
         n.news_item_id,
         n.rewrite_id,
         (SELECT id FROM blog),
         CASE WHEN n.target_category IS NULL THEN 'awaiting_localization' ELSE 'pending' END,
         0,
         NULL,
         now() + (n.rn * interval '3 minutes'),
         n.target_category,
         NULL
  FROM numbered n
  ON CONFLICT (news_item_id, blog_id) DO NOTHING
  RETURNING status
)
SELECT count(*) AS entregas_criadas,
       count(*) FILTER (WHERE status = 'pending')               AS publicacao_direta,
       count(*) FILTER (WHERE status = 'awaiting_localization') AS ia_vai_classificar
FROM ins;

COMMIT;

-- ── Conferência: o lote agendado (ordem de publicação) ──
\echo ''
\echo '=== BACKFILL AGENDADO (Esporte Agora) ==='
SELECT to_char(d.scheduled_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS publica_as,
       d.status, COALESCE(d.target_category, '(IA decide)') AS categoria,
       left(ni.title, 70) AS titulo
FROM deliveries d
JOIN news_items ni ON ni.id = d.news_item_id
JOIN blogs b ON b.id = d.blog_id
WHERE (b.name ILIKE '%esporte%agora%' OR b.domain ILIKE '%esporteagora%')
  AND d.status IN ('pending','awaiting_localization')
ORDER BY d.scheduled_at;
