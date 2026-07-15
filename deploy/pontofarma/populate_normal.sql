-- =============================================================================
-- PontoFarma — volta ao regime NORMAL depois do turbo de povoamento
-- (roda no banco CENTRAL; par do deploy/pontofarma/populate_turbo.sql)
-- =============================================================================
-- Reverte:
--   1. Fontes 'farmacia': fetch_limit 8 → 1 (1 item novo por ciclo, o mesmo
--      regime dos demais blogs da rede).
--   2. Blog PontoFarma: teto 20/dia, 30 min entre posts e aprovação LIGADA
--      (recomendação do GO_LIVE para os primeiros dias — desligue "Exigir
--      aprovação" no painel quando confiar no fluxo).
-- Idempotente: rodar 2x é seguro.
--
-- Uso (VPS, /opt/sp011):
--   DBURL=$(grep -m1 '^CENTRAL_DATABASE_URL=' .env.central | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
--   docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 < deploy/pontofarma/populate_normal.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

UPDATE central_sources
SET fetch_limit = 1
WHERE category = 'farmacia';

UPDATE blogs
SET require_approval = true,
    max_posts_per_day = 20,
    min_minutes_between_posts = 30,
    updated_at = now()
WHERE name ILIKE '%farma%' OR domain ILIKE '%pontofarma%';

COMMIT;

\echo ''
\echo '=== REGIME NORMAL RESTAURADO — conferencia ==='
SELECT name, active, fetch_limit, schedule_hours
FROM central_sources WHERE category = 'farmacia' ORDER BY name;

SELECT name, domain, require_approval, max_posts_per_day, min_minutes_between_posts, status
FROM blogs WHERE name ILIKE '%farma%' OR domain ILIKE '%pontofarma%';
