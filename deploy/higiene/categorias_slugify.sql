-- =============================================================================
-- REDE — higiene dos slugs de categoria corrompidos pelo bug do slugify.
-- Roda no banco DE CADA BLOG. Idempotente e seguro em qualquer um deles: onde
-- nao ha slug corrompido, e no-op e a saida do ANTES vem com 0 linhas.
--
--   cd /opt/sp011
--   docker compose exec -T -e PGCLIENTENCODING=UTF8 pg-blogs \
--     psql -U postgres -d <blog> -v ON_ERROR_STOP=1 < deploy/higiene/categorias_slugify.sql
--
-- (o loop com os 10 blogs esta no fim deste arquivo)
--
-- O DEFEITO: o slugify da taxonomia tinha uma barra dupla que apagava `u`, `f`
-- e digitos (corrigido em 90a0d47). O reparo da CENTRAL veio em
-- deploy/central/taxonomias_reparo.sql; o `articles.category` ja gravado no
-- banco de cada blog ficou como estava, e nada conserta isso sozinho.
--
-- POR QUE AGORA: ate a imagem v98 essas rotas eram shell SPA. Depois dela caem
-- na Classe 3 do `decideCategory` — "nao declarada mas COM conteudo -> 200
-- indexavel" — e editoria indexavel entra no sitemap. Ou seja, cada blog esta
-- publicando ao Google editorias que sao erro de digitacao e duplicam a
-- editoria real ao lado. O relatorio da v98 registrou a escolha por escrito:
-- "slug corrompido e servido como Classe 3 ATE A HIGIENE DE DADOS — nenhuma
-- tentativa de detectar corrupcao em codigo". Esta e a higiene.
--
-- MEDIDO EM 2026-08-24 (357 artigos em 20 editorias fantasma):
--   ksports       ootball 119 · world-cp 14 · nl 14 · ormla 4        = 151
--   recebabet     tebol 39 · otros 1                                 =  40
--   apostaganha   tebol 38 · otros 2                                 =  40
--   beeesportes   tebol 30 · copa-do-mndo 2 · otros 1                =  33
--   esporteagora  tebol 29 · copa-do-mndo 2 · otros 1                =  32
--   resenhavip    tebol 28 · copa-do-mndo 2 · otros 2                =  32
--   pontofarma    sade-categorias 20 · otros 8 · eqipe 1             =  29
--   oleysports    ja corrigido (deploy/oleysports/higiene_categorias.sql)
--   creditovc     limpo
--
-- O QUE ESTE SCRIPT **NAO** FAZ, de proposito:
--  - ksports tem 1 artigo em `copa-do-mundo`, slug PT num blog EN. NAO e
--    corrupcao, e categoria errada, e o destino certo e `world-cup`. Nao pode
--    entrar num mapa compartilhado: nos seis blogs PT `copa-do-mundo` e a
--    editoria CANONICA e um mapa global a destruiria. Vai em
--    deploy/higiene/ksports_copa_do_mundo.sql, com trava de banco.
--  - ocomandante tem 21 artigos fora da taxonomia (`o-comandante` 9,
--    `esportes` 6, `tecnologia` 6). Tambem nao e corrupcao: e pauta que a IA
--    classificou fora dos quatro eixos. O ocomandante e blog SEM balde, entao
--    nao existe destino neutro — exige decisao editorial, nao regra mecanica.
--
-- DEPOIS DISTO as rotas fantasma respondem 404 (Classe 4: nao declarada e sem
-- conteudo) e saem do sitemap no proximo ciclo. 404 e o destino certo, nao 301:
-- sao URLs sem link externo, que nunca deveriam ter existido.
--
-- `updated_at` dos artigos NAO e tocado (CLAUDE.md §17: o sitemap usa
-- `published_at` justamente porque `updated_at` sofre alteracao em massa).
-- =============================================================================
BEGIN;

\echo '======================================================================'
SELECT current_database() AS blog;

-- O mapa e o mesmo para a rede inteira porque nenhuma origem colide com slug
-- canonico de blog nenhum: `otros` e corrupcao tanto no esporte PT quanto no
-- pontofarma, e sempre vira `outros`. Origem nova so entra aqui depois de
-- MEDIDA — mapear o que ninguem viu e chutar em cima de dado de producao.
CREATE TEMP TABLE mapa(origem text PRIMARY KEY, destino text NOT NULL) ON COMMIT DROP;
INSERT INTO mapa(origem, destino) VALUES
  ('tebol',           'futebol'),            -- perdeu f e u
  ('tebol-americano', 'futebol-americano'),  -- idem (0 linhas hoje; completude)
  ('copa-do-mndo',    'copa-do-mundo'),      -- perdeu u
  ('otros',           'outros'),             -- perdeu u
  ('ootball',         'football'),           -- perdeu f
  ('world-cp',        'world-cup'),          -- perdeu u
  ('nl',              'nfl'),                -- perdeu f
  ('ormla',           'formula-1'),          -- perdeu f, u e o digito
  ('eqipe',           'equipe'),             -- perdeu u
  ('sade-categorias', 'saude-categorias');   -- perdeu u

\echo '--- ANTES: o que muda NESTE blog (0 linhas = nada a fazer) ---'
SELECT m.origem, m.destino,
       count(*) FILTER (WHERE a.status = 'published') AS publicados,
       count(*)                                       AS total
FROM mapa m JOIN articles a ON a.category = m.origem
GROUP BY m.origem, m.destino ORDER BY total DESC;

-- Guarda PREVIA, por par e so quando a origem TEM linha neste blog: mover
-- artigo para uma editoria que nao existe no acervo trocaria um slug orfao por
-- outro. Assim o mesmo arquivo passa em blog que nao tem aquela editoria.
DO $guard$
DECLARE r record; n int;
BEGIN
  FOR r IN SELECT m.origem, m.destino FROM mapa m
           WHERE EXISTS (SELECT 1 FROM articles a WHERE a.category = m.origem)
  LOOP
    SELECT count(*) INTO n FROM articles
    WHERE status = 'published' AND category = r.destino;
    IF n = 0 THEN
      RAISE EXCEPTION 'em %: a origem % tem artigo, mas o destino % nao existe no acervo',
                      current_database(), r.origem, r.destino;
    END IF;
  END LOOP;
END
$guard$;

UPDATE articles a SET category = m.destino FROM mapa m WHERE a.category = m.origem;

DO $guard$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM articles a JOIN mapa m ON a.category = m.origem;
  IF n > 0 THEN
    RAISE EXCEPTION 'em %: sobraram % artigo(s) em slug corrompido', current_database(), n;
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
--    (create_missing e true por padrao). Gravar `categories: []` num blog que
--    nao declara nada e o pior estrago possivel: `blogCategorySurface` cairia
--    na tabela FIXED_CATEGORIES e o blog herdaria as 13 editorias do sp011.
--  - o EXISTS evita reescrever a linha quando nao ha nada a tirar.
-- -----------------------------------------------------------------------------
UPDATE settings
SET value = jsonb_set(
      value::jsonb, '{categories}',
      (SELECT coalesce(jsonb_agg(c ORDER BY ord), '[]'::jsonb)
       FROM jsonb_array_elements((value::jsonb)->'categories') WITH ORDINALITY AS t(c, ord)
       WHERE c->>'slug' NOT IN (SELECT origem FROM mapa))
    )::text,
    updated_at = now()
WHERE key = 'site_settings'
  AND (value::jsonb) ? 'categories'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements((value::jsonb)->'categories') c
    WHERE c->>'slug' IN (SELECT origem FROM mapa));

DO $guard$
DECLARE n int;
BEGIN
  SELECT jsonb_array_length((value::jsonb)->'categories') INTO n
  FROM settings WHERE key = 'site_settings' AND (value::jsonb) ? 'categories';
  IF n IS NOT NULL AND n = 0 THEN
    RAISE EXCEPTION 'em %: settings.categories ficou vazio — o blog herdaria as editorias fixas do sp011',
                    current_database();
  END IF;
END
$guard$;

-- Relatorio DENTRO da transacao: o temp table cai no COMMIT. Sao consultas de
-- leitura — o slug morto em bloco de home rende secao vazia, e em item de menu
-- vira link publicado para 404 (o criterio que o credito.vc fechou nas Etapas
-- 1 e 2). Esperado: 0 linhas nas duas.
\echo '--- Blocos da home apontando para slug corrompido (esperado 0 linhas) ---'
SELECT b->>'name' AS bloco, b->>'category' AS categoria
FROM settings, jsonb_array_elements((value::jsonb)->'homeBlocks') b
WHERE key = 'site_settings' AND b->>'category' IN (SELECT origem FROM mapa);

\echo '--- Menu apontando para slug corrompido (esperado 0 linhas) ---'
-- O path entra entre aspas na comparacao: `%tebol%` casaria `/futebol`. Como o
-- menu tem filhos aninhados, a busca e no texto cru em vez de por elemento.
SELECT m.origem
FROM settings s, mapa m
WHERE s.key = 'menu_items' AND s.value LIKE '%"/' || m.origem || '"%';

\echo '--- DEPOIS: acervo publicado deste blog ---'
SELECT category, count(*) AS publicados
FROM articles WHERE status = 'published'
GROUP BY category ORDER BY publicados DESC;

COMMIT;

\echo '--- OK ---'

-- =============================================================================
-- LOOP DA REDE (os 10 blogs do pg-blogs; o sp011 mora no Supabase e vai a
-- parte). Rodar de novo e seguro: nos que ja passaram, o ANTES vem vazio.
--
--   cd /opt/sp011
--   for b in ksports esporteagora resenhavip oleysports beeesportes \
--            apostaganha recebabet pontofarma creditovc ocomandante; do
--     docker compose exec -T -e PGCLIENTENCODING=UTF8 pg-blogs \
--       psql -U postgres -d "$b" -v ON_ERROR_STOP=1 < deploy/higiene/categorias_slugify.sql
--   done
-- =============================================================================
