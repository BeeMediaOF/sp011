-- =============================================================================
-- CRÉDITO.VC — etapa 3 (OPCIONAL): remove jornalismo de MERCADO de
-- 'investimentos'. Roda no banco DO BLOG, depois da fase 2.
--
--   docker compose exec -T pg-blogs psql -U postgres -d creditovc -v ON_ERROR_STOP=1 < deploy/creditovc/limpeza_mercado.sql
--
-- Por que existe: a fase 2 tira o que está FORA do nicho (futebol, política,
-- loteria). Mas 'investimentos' é categoria válida e ficou com 235 artigos —
-- viraria ~77% do blog, o oposto de "mais crédito, menos investimentos". O que
-- está lá é cobertura de pregão e balanço (Ibovespa, BBAS3, VALE3, IFIX), não
-- conteúdo de educação financeira.
--
-- O critério do ticker — (BBAS3), (VALE3), (CURY3) — é o mais preciso: só
-- aparece em matéria sobre empresa listada. O vocabulário de mercado pega o
-- resto. Conteúdo educativo ("como investir", "CDB ou Tesouro?") NÃO casa
-- nenhum dos dois e permanece.
-- =============================================================================
BEGIN;

CREATE TEMP TABLE mercado ON COMMIT DROP AS
SELECT id FROM articles
WHERE category = 'investimentos'
  AND (title ~ '\([A-Z]{4}[0-9]{1,2}\)'
       OR title || ' ' || coalesce(subtitle,'') ~* '(ibovespa|ifix|dividendos|balan[cç]o|lucro l[ií]quido|trimestre|day trade|bolsa de valores|mercado de a[cç][oõ]es|copom)');

\echo '--- serao apagados: ---'
SELECT count(*) AS artigos_a_apagar FROM mercado;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['analytics_events', 'social_publication_queue', 'article_views'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = t AND column_name = 'article_id') THEN
      EXECUTE format('DELETE FROM %I WHERE article_id IN (SELECT id FROM mercado)', t);
    END IF;
  END LOOP;
END $$;

DELETE FROM articles WHERE id IN (SELECT id FROM mercado);

COMMIT;

\echo ''
\echo '=== DISTRIBUICAO FINAL ==='
SELECT category, count(*) AS artigos,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct
FROM articles GROUP BY category ORDER BY artigos DESC;
SELECT count(*) AS total_restante FROM articles;
