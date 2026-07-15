-- =============================================================================
-- PontoFarma — TURBO de povoamento inicial (roda no banco CENTRAL)
-- =============================================================================
-- Não existe backfill para este nicho (o histórico da central é 100% esporte),
-- então o povoamento rápido é turbinar a COLETA ORGÂNICA por algumas horas:
--   1. Fontes 'farmacia' ativas: fetch_limit 1 → 8 (o limite vale para itens
--      NOVOS pós-dedup) e last_fetched_at = NULL (ficam "devidas" JÁ). Cada
--      feed entrega até 8 matérias no primeiro ciclo → ~40-50 no total.
--   2. Blog PontoFarma: aprovação DESLIGADA + teto 100/dia + 0 min entre
--      posts — as entregas fluem direto para o site durante o turbo.
--   3. Depois que o site estiver populado, RODE deploy/pontofarma/
--      populate_normal.sql para voltar ao regime normal (fetch 1, teto 20,
--      30 min, aprovação ligada). NÃO deixe o turbo ligado: ele consome IA
--      e enche o site além da conta.
--
-- Como disparar a coleta na hora: painel central → Fontes → botão de coleta
-- da fonte (ou "rodar ciclo") — o run manual IGNORA janela/agenda. Sem isso,
-- o collector pega tudo no próximo tick (1 min) DENTRO da janela de coleta
-- configurada (horário de Brasília).
-- Ritmo esperado: a reescrita é IA (Ollama) e processa a fila em série —
-- conte com ~1 a 3 horas para as dezenas de posts entrarem no ar.
-- Idempotente: rodar 2x é seguro (dedup global impede recoleta do que já
-- entrou; o fetch_limit só conta itens novos).
--
-- Uso (VPS, /opt/sp011):
--   DBURL=$(grep -m1 '^CENTRAL_DATABASE_URL=' .env.central | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
--   docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 < deploy/pontofarma/populate_turbo.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM blogs WHERE name ILIKE '%farma%' OR domain ILIKE '%pontofarma%'
  ) THEN
    RAISE EXCEPTION 'Blog PontoFarma nao encontrado — cadastre-o no painel central e rode sources_farma.sql antes.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM central_sources WHERE category = 'farmacia') THEN
    RAISE EXCEPTION 'Fontes farmacia nao encontradas — rode deploy/pontofarma/sources_farma.sql antes.';
  END IF;
END $$;

-- 1) Fontes do setor: 8 itens novos por ciclo e coleta devida imediatamente.
--    (As 2 fontes 'financas' ficam no ritmo normal — delas só interessa o que
--    casa com a regra de palavra-chave; turbinar encheria a fila de reescrita
--    com economia geral.)
UPDATE central_sources
SET fetch_limit = 8, last_fetched_at = NULL
WHERE category = 'farmacia' AND active;

-- 2) Blog em modo turbo: entrega direta, sem espera e com teto alto.
UPDATE blogs
SET require_approval = false,
    max_posts_per_day = 100,
    min_minutes_between_posts = 0,
    updated_at = now()
WHERE name ILIKE '%farma%' OR domain ILIKE '%pontofarma%';

COMMIT;

\echo ''
\echo '=== TURBO LIGADO — conferencia ==='
SELECT name, active, fetch_limit, schedule_hours, last_fetched_at
FROM central_sources WHERE category = 'farmacia' ORDER BY name;

SELECT name, domain, require_approval, max_posts_per_day, min_minutes_between_posts, status
FROM blogs WHERE name ILIKE '%farma%' OR domain ILIKE '%pontofarma%';

\echo ''
\echo 'Agora: painel central -> Fontes -> coletar/rodar ciclo (ou aguarde o'
\echo 'proximo tick dentro da janela). Depois de populado, rode'
\echo 'deploy/pontofarma/populate_normal.sql para voltar ao regime normal.'
