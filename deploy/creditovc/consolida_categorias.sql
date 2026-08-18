-- =============================================================================
-- CRÉDITO.VC — consolida as 18 categorias do admin nas 7 da central.
--
-- RODA NO BANCO DO BLOG:
--   docker compose exec -T pg-blogs psql -U postgres -d creditovc -v ON_ERROR_STOP=1 < deploy/creditovc/consolida_categorias.sql
--   docker compose -f /opt/blogs/creditovc/compose.yml restart api
--
-- POR QUE: medido em 2026-08-18, depois da limpeza das intrusas (314 artigos).
-- O admin tinha 18 categorias; a taxonomia da central tem 7. As 11 extras não
-- estão na central, então a IA NUNCA classifica nelas — só recebem artigo pela
-- mão do editor. E o que elas têm hoje é isto:
--
--     educacao 0   imovel 0   cartoes 1   renegociacao 1   veiculos 2
--     clt 3   consignado-inss 3   fgts 3   home-equity 3
--     credito-pessoal 4   microcredito 4                     = 24 artigos
--
-- Onze seções com 0 a 4 artigos cada. Para o leitor e para o Google isso lê
-- como portal abandonado. As 11 são todas subdivisões de crédito — quando
-- `credito` sozinho passar de ~100 artigos, aí sim vale separar de novo, e o
-- caminho é o inverso deste arquivo (criar no admin E na taxonomia da central,
-- senão nascem vazias outra vez).
--
-- IDEMPOTENTE: rodar de novo é no-op (não sobra artigo nas categorias antigas
-- nem entrada no menu apontando para elas).
-- =============================================================================

\echo ''
\echo '=== ANTES ================================================================='
SELECT category, count(*) AS artigos FROM articles GROUP BY category ORDER BY artigos DESC;

BEGIN;

-- Mapa do remanejamento. `fgts` vai para `credito` de propósito: no rules_keywords
-- do blog, "fgts" e "saque-aniversário" são vocabulário de CRÉDITO (o saldo vira
-- garantia de empréstimo), não de organização financeira.
CREATE TEMP TABLE mapa (de text PRIMARY KEY, para text NOT NULL) ON COMMIT DROP;
INSERT INTO mapa (de, para) VALUES
  ('credito-pessoal',  'credito'),
  ('cartoes',          'credito'),
  ('consignado-inss',  'credito'),
  ('microcredito',     'credito'),
  ('home-equity',      'credito'),
  ('veiculos',         'credito'),
  ('imovel',           'credito'),
  ('fgts',             'credito'),
  ('renegociacao',     'sair-das-dividas'),
  ('clt',              'organizar-financas'),
  ('educacao',         'organizar-financas');

\echo ''
\echo '--- artigos que mudam de categoria ---'
SELECT m.de, m.para, count(a.id) AS artigos
FROM mapa m LEFT JOIN articles a ON a.category = m.de
GROUP BY m.de, m.para ORDER BY count(a.id) DESC, m.de;

-- 1. Artigos. O `tag` é o rótulo que aparece na capa e no topo do artigo; o
--    ingest o deriva da categoria (routes/ingest.ts), então ele acompanha aqui —
--    senão um artigo em `credito` continuaria estampando "MICROCRÉDITO".
UPDATE articles a
SET category = m.para,
    tag      = upper(replace(m.para, '-', ' ')),
    updated_at = now()
FROM mapa m
WHERE a.category = m.de;

-- 2. Lista de categorias do admin (settings.site_settings -> categories).
--    Mantém as entradas das 7 que sobrevivem, com id/nome/cor como estão.
UPDATE settings SET value = jsonb_set(
  value::jsonb,
  '{categories}',
  coalesce((
    SELECT jsonb_agg(c ORDER BY ord)
    FROM jsonb_array_elements(value::jsonb->'categories') WITH ORDINALITY AS t(c, ord)
    WHERE c->>'slug' NOT IN (SELECT de FROM mapa)
  ), '[]'::jsonb)
)::text
WHERE key = 'site_settings';

-- 3. Menu. Categoria sem item de menu não tem rota (DynamicCategory resolve
--    `/:slug` a partir do menu — CLAUDE.md §4), então o inverso também vale:
--    item de menu apontando para categoria que não existe mais vira link para
--    página vazia. Poda os dois níveis (topo e submenu).
UPDATE settings SET value = coalesce((
  SELECT jsonb_agg(
           CASE
             WHEN jsonb_typeof(item->'children') = 'array'
             THEN jsonb_set(item, '{children}', coalesce((
                    SELECT jsonb_agg(ch ORDER BY cord)
                    FROM jsonb_array_elements(item->'children') WITH ORDINALITY AS tc(ch, cord)
                    WHERE ch->>'path' NOT IN (SELECT '/' || de FROM mapa)
                  ), '[]'::jsonb))
             ELSE item
           END
           ORDER BY ord)
  FROM jsonb_array_elements(value::jsonb) WITH ORDINALITY AS t(item, ord)
  WHERE item->>'path' NOT IN (SELECT '/' || de FROM mapa)
), '[]'::jsonb)::text
WHERE key = 'menu_items';

COMMIT;

\echo ''
\echo '=== DEPOIS ================================================================'
SELECT category, count(*) AS artigos,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct
FROM articles GROUP BY category ORDER BY artigos DESC;

\echo ''
\echo '--- categorias no admin (tem que sobrar 7) ---'
SELECT jsonb_array_elements(value::jsonb->'categories')->>'slug' AS slug
FROM settings WHERE key = 'site_settings';

\echo ''
\echo '--- itens de menu apontando para categoria inexistente (tem que vir VAZIO) ---'
WITH validas AS (
  SELECT jsonb_array_elements(value::jsonb->'categories')->>'slug' AS slug
  FROM settings WHERE key = 'site_settings'
), itens AS (
  SELECT item->>'label' AS label, item->>'path' AS path
  FROM settings, jsonb_array_elements(value::jsonb) item
  WHERE key = 'menu_items'
  UNION ALL
  SELECT ch->>'label', ch->>'path'
  FROM settings, jsonb_array_elements(value::jsonb) item,
       jsonb_array_elements(item->'children') ch
  WHERE key = 'menu_items' AND jsonb_typeof(item->'children') = 'array'
)
SELECT label, path FROM itens
WHERE path LIKE '/%' AND path NOT LIKE '/%/%'
  AND substring(path from 2) NOT IN (SELECT slug FROM validas)
  AND substring(path from 2) NOT IN ('', 'sobre', 'contato', 'privacidade', 'termos', 'colunistas', 'newsletter', 'anuncie');
