-- =============================================================================
-- CRÉDITO.VC — FASE 2: APAGA. Só rode depois de ler os números da FASE 1.
--
--   docker compose exec -T pg-blogs psql -U postgres -d creditovc -v ON_ERROR_STOP=1 < deploy/creditovc/limpeza_intrusas_fase2.sql
--
-- Dois critérios, ambos objetivos:
--   A. categoria FORA da taxonomia cadastrada no admin (páginas órfãs — o
--      leitor não chega nelas, e o `otros`/`outros` inteiro cai aqui);
--   B. pauta fora do nicho (esporte, política eleitoral, loteria, guerra) mesmo
--      que tenha caído numa categoria válida.
--
-- Roda em transação única: ou apaga tudo, ou não apaga nada.
-- Antes do DELETE são apagadas as linhas que apontam para o artigo (analytics,
-- fila social), senão a FK derruba a transação.
-- =============================================================================
BEGIN;

CREATE TEMP TABLE intrusas ON COMMIT DROP AS
WITH validas AS (
  SELECT jsonb_array_elements(value::jsonb->'categories')->>'slug' AS slug
  FROM settings WHERE key = 'site_settings'
)
SELECT a.id
FROM articles a
WHERE a.category NOT IN (SELECT slug FROM validas)
   OR a.title || ' ' || coalesce(a.subtitle, '') ~* '(futebol|vasco|flamengo|corinthians|palmeiras|s[aã]o paulo x|santos x|neymar|libertadores|brasileir[aã]o|campeonato|copa do mundo|est[aá]dio|t[eé]cnico do|mega-sena|lotof[aá]cil|loteria|sorteio da|elei[cç][aã]o|elei[cç][oõ]es|reelei[cç][aã]o|lula|bolsonaro|deputad|senador|ministro d|stf|tse|guerra|ucr[aâ]nia|israel|ir[aã] e|air force|rob[oô]s humanoides)';

\echo '--- serao apagados: ---'
SELECT count(*) AS artigos_a_apagar FROM intrusas;

-- Dependentes primeiro (as tabelas que não existirem são ignoradas pelo DO).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['analytics_events', 'social_publication_queue', 'article_views'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = t AND column_name = 'article_id') THEN
      EXECUTE format('DELETE FROM %I WHERE article_id IN (SELECT id FROM intrusas)', t);
    END IF;
  END LOOP;
END $$;

DELETE FROM articles WHERE id IN (SELECT id FROM intrusas);

COMMIT;

\echo ''
\echo '=== DEPOIS DA LIMPEZA ==='
SELECT category, count(*) AS artigos
FROM articles
GROUP BY category
ORDER BY artigos DESC;

SELECT count(*) AS total_restante FROM articles;

\echo ''
\echo '=== QUANTO SOBROU DE NOTICIA DE MERCADO EM "investimentos" ==='
\echo '(NAO apaga nada aqui — e so o numero para decidir a etapa seguinte.'
\echo ' "com_ticker" casa (BBAS3), (VALE3), (CURY3): balanco de empresa listada,'
\echo ' que e jornalismo de mercado, nao educacao financeira.)'
SELECT count(*) FILTER (WHERE title ~ '\([A-Z]{4}[0-9]{1,2}\)')                     AS com_ticker,
       count(*) FILTER (WHERE title || ' ' || coalesce(subtitle,'') ~* '(ibovespa|ifix|dividendos|balan[cç]o|lucro l[ií]quido|trimestre|day trade|bolsa de valores|mercado de a[cç][oõ]es|copom)') AS vocab_mercado,
       count(*)                                                                      AS total_investimentos
FROM articles WHERE category = 'investimentos';

\echo ''
\echo '--- amostra do que seria removido nessa etapa ---'
SELECT left(title, 74) AS titulo
FROM articles
WHERE category = 'investimentos'
  AND (title ~ '\([A-Z]{4}[0-9]{1,2}\)'
       OR title || ' ' || coalesce(subtitle,'') ~* '(ibovespa|ifix|dividendos|balan[cç]o|lucro l[ií]quido|trimestre|day trade|bolsa de valores|mercado de a[cç][oõ]es|copom)')
ORDER BY published_at DESC NULLS LAST
LIMIT 12;
