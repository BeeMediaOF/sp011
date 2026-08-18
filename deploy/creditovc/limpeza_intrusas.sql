-- =============================================================================
-- CRÉDITO.VC — remoção das notícias fora do nicho (2026-08-14)
--
-- RODA NO BANCO DO BLOG (não no central):
--   docker compose exec -T pg-blogs psql -U postgres -d creditovc -v ON_ERROR_STOP=1 < deploy/creditovc/limpeza_intrusas.sql
--
-- O QUE ACONTECEU: o catch-all da central ('Finanças (IA classifica)') entregava
-- tudo que vinha de fonte com categoria 'financas'. Essas fontes publicam
-- política, futebol, loteria e balanço de empresa no mesmo feed — e como a regra
-- não tinha keyword nenhuma, tudo passou. Medição de 2026-08-14 (602 artigos):
--     investimentos 37,0% | outros 32,9% | otros 16,6% | credito 3,5%
--
-- SOBRE O "otros": não é typo do código. `resolveDeliveryCategory`
-- (central-hub/src/lib/localization.ts) valida a classificação da IA contra a
-- taxonomia e, se nada casar, cai em `others` ou no ÚLTIMO slug da lista. O
-- `targetCategory` de uma REGRA, porém, é devolvido SEM validação (linha 42) —
-- é por ali que um slug inventado entra. Seja qual for a origem, `otros` e
-- `outros` não estão cadastrados em Categorias no admin do credito.vc: são
-- páginas órfãs, e é isso que o critério abaixo usa.
--
-- ESTE ARQUIVO APAGA ARTIGOS. Rode a FASE 1 primeiro e leia os números.
-- =============================================================================

\echo ''
\echo '=== FASE 1 — DIAGNOSTICO (nao altera nada) ==============================='
\echo ''
\echo '--- categorias cadastradas no admin (a taxonomia valida) ---'
SELECT jsonb_array_elements(value::jsonb->'categories')->>'slug' AS slug_valido
FROM settings WHERE key = 'site_settings';

\echo ''
\echo '--- artigos por categoria, marcando o que esta FORA da taxonomia ---'
WITH validas AS (
  SELECT jsonb_array_elements(value::jsonb->'categories')->>'slug' AS slug
  FROM settings WHERE key = 'site_settings'
)
SELECT a.category,
       count(*) AS artigos,
       CASE WHEN a.category IN (SELECT slug FROM validas) THEN 'ok' ELSE 'ORFA' END AS situacao
FROM articles a
GROUP BY a.category
ORDER BY situacao DESC, artigos DESC;

\echo ''
\echo '--- amostra do que sera apagado por CATEGORIA ORFA ---'
WITH validas AS (
  SELECT jsonb_array_elements(value::jsonb->'categories')->>'slug' AS slug
  FROM settings WHERE key = 'site_settings'
)
SELECT a.category, left(a.title, 70) AS titulo
FROM articles a
WHERE a.category NOT IN (SELECT slug FROM validas)
ORDER BY a.published_at DESC NULLS LAST
LIMIT 15;

\echo ''
\echo '--- amostra do que sera apagado por PAUTA FORA DO NICHO (em categoria valida) ---'
SELECT a.category, left(a.title, 70) AS titulo
FROM articles a
WHERE a.title || ' ' || coalesce(a.subtitle, '') ~* '(futebol|vasco|flamengo|corinthians|palmeiras|s[aã]o paulo x|santos x|neymar|libertadores|brasileir[aã]o|campeonato|copa do mundo|est[aá]dio|t[eé]cnico do|mega-sena|lotof[aá]cil|loteria|sorteio da|elei[cç][aã]o|elei[cç][oõ]es|reelei[cç][aã]o|lula|bolsonaro|deputad|senador|ministro d|stf|tse|guerra|ucr[aâ]nia|israel|ir[aã] e|air force|rob[oô]s humanoides)'
ORDER BY a.published_at DESC NULLS LAST
LIMIT 15;

\echo ''
\echo '--- TOTAIS que a FASE 2 vai apagar ---'
WITH validas AS (
  SELECT jsonb_array_elements(value::jsonb->'categories')->>'slug' AS slug
  FROM settings WHERE key = 'site_settings'
)
SELECT
  (SELECT count(*) FROM articles WHERE category NOT IN (SELECT slug FROM validas)) AS por_categoria_orfa,
  (SELECT count(*) FROM articles
    WHERE title || ' ' || coalesce(subtitle, '') ~* '(futebol|vasco|flamengo|corinthians|palmeiras|s[aã]o paulo x|santos x|neymar|libertadores|brasileir[aã]o|campeonato|copa do mundo|est[aá]dio|t[eé]cnico do|mega-sena|lotof[aá]cil|loteria|sorteio da|elei[cç][aã]o|elei[cç][oõ]es|reelei[cç][aã]o|lula|bolsonaro|deputad|senador|ministro d|stf|tse|guerra|ucr[aâ]nia|israel|ir[aã] e|air force|rob[oô]s humanoides)'
      AND category IN (SELECT slug FROM validas)) AS por_pauta_fora_do_nicho,
  (SELECT count(*) FROM articles) AS total_hoje;
