-- =============================================================================
-- OLEYSPORTS — higiene dos slugs de categoria corrompidos. Roda no banco DO BLOG.
--
--   cd /opt/sp011
--   docker compose exec -T -e PGCLIENTENCODING=UTF8 pg-blogs \
--     psql -U postgres -d oleysports -v ON_ERROR_STOP=1 < deploy/oleysports/higiene_categorias.sql
--
-- O DEFEITO: o slugify da taxonomia tinha uma barra dupla que apagava `u`, `f`
-- e digitos (corrigido no codigo em 90a0d47). O reparo da CENTRAL veio em
-- deploy/central/taxonomias_reparo.sql, mas os artigos ja entregues ficaram com
-- o `articles.category` corrompido no banco de CADA blog — e nada conserta isso
-- sozinho. Medido em 2026-08-24 no oleysports:
--
--     tebol         39 publicados   <- futebol            (perdeu f e u)
--     copa-do-mndo   2 publicados   <- copa-do-mundo      (perdeu u)
--     otros          1 publicado    <- outros             (perdeu u)
--
-- POR QUE AGORA: ate a imagem v98 essas rotas eram shell SPA. Depois dela caem
-- na Classe 3 do `decideCategory` — "nao declarada mas COM conteudo -> 200
-- indexavel" — e editoria indexavel entra no sitemap. Confirmado em producao:
-- /tebol, /copa-do-mndo e /otros aparecem como <loc> em /api/sitemap.xml. Ou
-- seja, a rede esta publicando ao Google tres editorias que sao erro de
-- digitacao e duplicam /futebol, /copa-do-mundo e /outros. O relatorio da v98
-- registrou a escolha por escrito: "slug corrompido e servido como Classe 3
-- ATE A HIGIENE DE DADOS — nenhuma tentativa de detectar corrupcao em codigo".
-- Esta e a higiene.
--
-- DEPOIS DISTO as tres rotas passam a responder 404 (Classe 4: nao declarada e
-- sem conteudo) e saem do sitemap no proximo cache (max-age=900). 404 e o
-- destino certo, nao 301: sao URLs de tres dias, sem link externo, que nunca
-- deveriam ter existido. Redirecionar exigiria regra por blog no Caddy da VPS,
-- fora do git, para consolidar historico que nao ha.
--
-- `updated_at` dos artigos NAO e tocado de proposito (CLAUDE.md §17: o sitemap
-- usa `published_at` justamente porque `updated_at` sofre alteracao em massa).
--
-- Idempotente: rodar de novo nao acha mais nada e passa nas guardas.
-- =============================================================================
BEGIN;

\echo '--- ANTES: categorias do acervo ---'
SELECT category,
       count(*) FILTER (WHERE status = 'published') AS publicados,
       count(*)                                     AS total
FROM articles GROUP BY category ORDER BY total DESC;

-- Guarda PREVIA: os tres destinos precisam ja existir no acervo. Sem isso o
-- UPDATE moveria artigos para uma editoria que nao existe — trocaria um slug
-- orfao por outro.
DO $guard$
DECLARE alvo text; n int;
BEGIN
  FOREACH alvo IN ARRAY ARRAY['futebol','copa-do-mundo','outros'] LOOP
    SELECT count(*) INTO n FROM articles
    WHERE status = 'published' AND category = alvo;
    IF n = 0 THEN
      RAISE EXCEPTION 'destino % nao tem artigo publicado: confira a taxonomia antes de mover', alvo;
    END IF;
  END LOOP;
END
$guard$;

-- `tebol-americano` (de futebol-americano) esta na lista por completude da
-- familia do bug: hoje tem zero linha e o UPDATE e no-op nele.
UPDATE articles
SET category = CASE category
      WHEN 'tebol'            THEN 'futebol'
      WHEN 'copa-do-mndo'     THEN 'copa-do-mundo'
      WHEN 'otros'            THEN 'outros'
      WHEN 'tebol-americano'  THEN 'futebol-americano'
    END
WHERE category IN ('tebol','copa-do-mndo','otros','tebol-americano');

DO $guard$
DECLARE n int; extras text;
BEGIN
  SELECT count(*) INTO n FROM articles
  WHERE category IN ('tebol','copa-do-mndo','otros','tebol-americano');
  IF n > 0 THEN
    RAISE EXCEPTION 'sobraram % artigo(s) em slug corrompido', n;
  END IF;

  -- Guarda larga: nenhuma editoria PUBLICADA pode ficar fora da taxonomia
  -- canonica do blog. Pega qualquer corrupcao que eu nao tenha previsto
  -- (inclusive `category` vazia, que era o que o bug fazia com `f1`).
  SELECT string_agg(DISTINCT category, ', ') INTO extras FROM articles
  WHERE status = 'published'
    AND category NOT IN ('copa-do-mundo','futebol','volei','tenis','f1',
                         'futebol-americano','e-sports','outros');
  IF extras IS NOT NULL THEN
    RAISE EXCEPTION 'editoria publicada fora da taxonomia do blog: %', extras;
  END IF;
END
$guard$;

-- -----------------------------------------------------------------------------
-- settings.categories — se o painel DECLARA um slug corrompido, esvaziar o
-- acervo dele nao basta: a rota vira Classe 2 (declarada e vazia -> 200 +
-- noindex) em vez de 404, e continua listada no painel.
--
-- As tres condicoes do WHERE sao guarda, nao enfeite:
--  - `? 'categories'` impede que o jsonb_set CRIE a chave onde ela nao existe
--    (create_missing e true por padrao). Escrever `categories: []` num blog que
--    nao declara nada e o pior estrago possivel: `blogCategorySurface` cairia
--    na tabela FIXED_CATEGORIES e o Oley herdaria as 13 editorias do sp011.
--  - o EXISTS evita reescrever a linha quando nao ha nada a tirar.
-- -----------------------------------------------------------------------------
UPDATE settings
SET value = jsonb_set(
      value::jsonb, '{categories}',
      (SELECT coalesce(jsonb_agg(c ORDER BY ord), '[]'::jsonb)
       FROM jsonb_array_elements((value::jsonb)->'categories') WITH ORDINALITY AS t(c, ord)
       WHERE c->>'slug' NOT IN ('tebol','copa-do-mndo','otros','tebol-americano'))
    )::text,
    updated_at = now()
WHERE key = 'site_settings'
  AND (value::jsonb) ? 'categories'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements((value::jsonb)->'categories') c
    WHERE c->>'slug' IN ('tebol','copa-do-mndo','otros','tebol-americano'));

DO $guard$
DECLARE n int;
BEGIN
  -- Se a chave existe, ela nao pode ter ficado vazia (ver comentario acima).
  SELECT jsonb_array_length((value::jsonb)->'categories') INTO n
  FROM settings WHERE key = 'site_settings' AND (value::jsonb) ? 'categories';
  IF n IS NOT NULL AND n = 0 THEN
    RAISE EXCEPTION 'settings.categories ficou vazio — o blog passaria a herdar as editorias fixas do sp011';
  END IF;
END
$guard$;

\echo '--- DEPOIS: categorias do acervo ---'
SELECT category,
       count(*) FILTER (WHERE status = 'published') AS publicados,
       count(*)                                     AS total
FROM articles GROUP BY category ORDER BY total DESC;

\echo '--- DEPOIS: editorias declaradas no painel ---'
SELECT c->>'slug' AS slug, c->>'name' AS nome, c->>'visible' AS visivel
FROM settings, jsonb_array_elements((value::jsonb)->'categories') c
WHERE key = 'site_settings';

COMMIT;

-- =============================================================================
-- RELATORIO (fora da transacao, so leitura). As duas consultas abaixo procuram
-- o slug corrompido nos OUTROS lugares onde ele pode ter sido gravado a mao.
-- Esperado: zero linha nas duas. Se alguma devolver algo, me mande a saida —
-- bloco de home com categoria morta rende secao vazia, e item de menu apontando
-- para /tebol vira link publicado para 404 (que e o criterio que o credito.vc
-- fechou nas Etapas 1 e 2).
-- =============================================================================
\echo '--- Blocos da home apontando para slug corrompido (esperado 0 linhas) ---'
SELECT b->>'name' AS bloco, b->>'category' AS categoria
FROM settings, jsonb_array_elements((value::jsonb)->'homeBlocks') b
WHERE key = 'site_settings'
  AND b->>'category' IN ('tebol','copa-do-mndo','otros','tebol-americano');

\echo '--- Menu apontando para slug corrompido (esperado 0 linhas) ---'
-- LIKE com as aspas em volta do path: `%tebol%` casaria `/futebol`. Como o
-- menu tem filhos aninhados, a busca e no texto cru em vez de por elemento.
SELECT key, left(value, 400) AS trecho
FROM settings
WHERE key = 'menu_items'
  AND (value LIKE '%"/tebol"%' OR value LIKE '%"/copa-do-mndo"%'
       OR value LIKE '%"/otros"%' OR value LIKE '%"/tebol-americano"%');

\echo '--- OK. As tres rotas passam a responder 404 e saem do sitemap em <= 15 min. ---'
