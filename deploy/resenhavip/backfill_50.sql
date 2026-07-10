-- =============================================================================
-- Resenha Vip — backfill IMEDIATO: publica até 50 notícias de esporte do
-- histórico, reaproveitando as reescritas do Esporte Agora (roda no CENTRAL)
-- =============================================================================
-- Diferente do backfill_30 do Esporte Agora, aqui NADA passa pela IA:
--   * A reescrita é a MESMA já usada/compartilhada (pt→pt nunca gera variante
--     — a entrega nasce apontando para a rewrite compartilhada 'ok').
--   * A categoria vem pronta, nesta ordem:
--       1. target_category da entrega do Esporte Agora (inclusive a que a IA
--          já decidiu lá — decisão reaproveitada de graça);
--       2. categoria explícita da própria notícia (7 slugs do menu);
--       3. 'outros', só para notícia genérica que o EA publicou.
--     Notícia sem categoria resolvível fica DE FORA (nunca nasce
--     awaiting_localization aqui).
--   * Toda entrega nasce 'pending' (não passa por aprovação — backfill é
--     publicação intencional) escalonada a cada 10s, da mais ANTIGA para a
--     mais nova → o lote inteiro entra no ar em ~8 min (worker envia 5 a
--     cada 15s) e a notícia mais fresca termina no topo da home.
--
-- Dedupe: NOT EXISTS + UNIQUE (news_item_id, blog_id) — o que já foi entregue
-- ao Resenha Vip é pulado. Idempotente: rodar 2x pega as PRÓXIMAS 50.
--
-- Uso (VPS, /opt/sp011 — mesmo DBURL do sources_pt.sql):
--   DBURL=$(grep -m1 '^CENTRAL_DATABASE_URL=' .env.central | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
--   docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 < deploy/resenhavip/backfill_50.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Guardas: blog cadastrado e ONLINE (entregar com o blog fora do ar queima
-- as 5 tentativas HTTP de cada entrega → dead)
DO $$
DECLARE b RECORD;
BEGIN
  SELECT id, status, is_active INTO b FROM blogs
  WHERE name ILIKE '%resenha%' OR domain ILIKE '%resenhavip%' LIMIT 1;
  IF b.id IS NULL THEN
    RAISE EXCEPTION 'Blog Resenha Vip nao encontrado — cadastre no painel central antes.';
  END IF;
  IF NOT b.is_active THEN
    RAISE EXCEPTION 'Blog Resenha Vip esta INATIVO no painel — ative antes do backfill.';
  END IF;
  IF b.status <> 'online' THEN
    RAISE EXCEPTION 'Blog Resenha Vip esta "%" (nao online) — rode "Testar conexao" no painel antes, senao as entregas morrem em retry.', b.status;
  END IF;
END $$;

WITH blog AS (
  SELECT id FROM blogs
  WHERE name ILIKE '%resenha%' OR domain ILIKE '%resenhavip%'
  LIMIT 1
),
ea AS (
  SELECT id FROM blogs
  WHERE name ILIKE '%esporte%agora%' OR domain ILIKE '%esporteagora%'
  LIMIT 1
),
candidates AS (
  SELECT ni.id AS news_item_id,
         -- mesma reescrita do EA quando houver; senão a compartilhada
         COALESCE(dea.rewrite_id, r.id) AS rewrite_id,
         ni.title,
         ni.created_at,
         COALESCE(
           dea.target_category,
           CASE WHEN ni.category IN ('copa-do-mundo','futebol','volei','tenis','f1','futebol-americano','e-sports')
                THEN ni.category END,
           CASE WHEN dea.status = 'delivered' THEN 'outros' END
         ) AS target_category
  FROM news_items ni
  JOIN central_sources cs ON cs.id = ni.source_id
  JOIN rewrites r ON r.news_item_id = ni.id AND r.blog_id IS NULL AND r.status = 'ok'
  LEFT JOIN deliveries dea ON dea.news_item_id = ni.id AND dea.blog_id = (SELECT id FROM ea)
  WHERE ni.status = 'distributed'
    AND COALESCE(cs.language, 'pt-BR') = 'pt-BR'      -- nunca texto EN
    AND COALESCE(r.language,  'pt-BR') = 'pt-BR'
    AND (
      dea.id IS NOT NULL                               -- tudo que o EA recebeu é esporte
      OR cs.category IN ('copa-do-mundo','futebol','volei','tenis','f1','futebol-americano','e-sports','outros')
      OR cs.category = 'esportes'
      OR ni.category IN ('copa-do-mundo','futebol','volei','tenis','f1','futebol-americano','e-sports','esportes')
    )
    AND NOT EXISTS (                                   -- "não repetidas" no RV
      SELECT 1 FROM deliveries d
      WHERE d.news_item_id = ni.id AND d.blog_id = (SELECT id FROM blog)
    )
),
resolved AS (
  -- só o que tem categoria pronta (zero IA); as 50 mais recentes
  SELECT * FROM candidates
  WHERE target_category IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 50
),
numbered AS (
  -- mais ANTIGA primeiro: a notícia mais fresca publica por último → topo da home
  SELECT c.*, row_number() OVER (ORDER BY c.created_at ASC) AS rn
  FROM resolved c
),
ins AS (
  INSERT INTO deliveries
    (id, news_item_id, rewrite_id, blog_id, status, attempts,
     next_retry_at, scheduled_at, target_category, target_tag)
  SELECT gen_random_uuid()::text,
         n.news_item_id,
         n.rewrite_id,
         (SELECT id FROM blog),
         'pending',
         0,
         NULL,
         now() + (n.rn * interval '10 seconds'),
         n.target_category,
         NULL
  FROM numbered n
  ON CONFLICT (news_item_id, blog_id) DO NOTHING
  RETURNING target_category
)
SELECT count(*) AS entregas_criadas FROM ins;

COMMIT;

-- ── Conferência: o lote agendado (ordem de publicação) ──
\echo ''
\echo '=== BACKFILL AGENDADO (Resenha Vip) ==='
SELECT to_char(d.scheduled_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI:SS') AS publica_as,
       d.status, d.target_category AS categoria,
       left(ni.title, 70) AS titulo
FROM deliveries d
JOIN news_items ni ON ni.id = d.news_item_id
JOIN blogs b ON b.id = d.blog_id
WHERE (b.name ILIKE '%resenha%' OR b.domain ILIKE '%resenhavip%')
  AND d.status = 'pending'
ORDER BY d.scheduled_at;

\echo ''
\echo '=== RESUMO POR CATEGORIA ==='
SELECT d.target_category AS categoria, count(*) AS posts
FROM deliveries d
JOIN blogs b ON b.id = d.blog_id
WHERE (b.name ILIKE '%resenha%' OR b.domain ILIKE '%resenhavip%')
  AND d.status = 'pending'
GROUP BY d.target_category
ORDER BY posts DESC;
