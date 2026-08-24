-- =============================================================================
-- O COMANDANTE — os 21 artigos publicados fora dos quatro eixos. Roda no banco
-- DO BLOG, e so no dele.
--
--   cd /opt/sp011
--   docker compose exec -T -e PGCLIENTENCODING=UTF8 pg-blogs \
--     psql -U postgres -d ocomandante -v ON_ERROR_STOP=1 < deploy/ocomandante/editorias_higiene.sql
--
-- CONTEXTO: a varredura de 2026-08-24 achou 3 categorias fora da taxonomia
-- (`negocios, economia, aviacao, turismo`). Nao e a corrupcao do slugify —
-- essa foi tratada em deploy/higiene/categorias_slugify.sql e o ocomandante
-- nao tinha nenhuma. Aqui e pauta que a IA classificou fora dos eixos, e desde
-- a imagem v98 as tres respondem 200 INDEXAVEL (Classe 3 do `decideCategory`:
-- nao declarada mas com conteudo) e entram no sitemap.
--
-- DECISOES (tomadas pelo dono do blog em 2026-08-24, lidos os 21 titulos):
--
--   `o-comandante` (9)  -> VIRA A 5a EDITORIA, declarada.
--       Os nove sao relatos de aviacao em primeira pessoa ("como e pilotar…",
--       "primeiro pouso de aviao proprio"). Nao e erro de classificacao: e
--       coluna assinada. Vira editoria de verdade em vez de sumir dentro dos
--       122 de /aviacao.
--
--   `tecnologia` (6)    -> `negocios`.
--       Data center, modelo de negocio da OpenAI, corrida de IA entre ByteDance
--       e DeepSeek: pauta corporativa, cabe no eixo sem forcar.
--
--   `esportes` (6)      -> DESPUBLICADOS (status 'draft').
--       Copa Feminina, sucessao na Fifa, Vini Jr., US Open, LIV Golf. E pauta
--       alheia num blog de negocios/economia/aviacao/turismo, e o ocomandante
--       nao tem balde `outros` — nao existe destino neutro. Blog focado nao
--       ganha nada guardando 6 materias fora do eixo.
--
-- O ARTIGO NAO E APAGADO: vira rascunho e continua no painel. Fica um fio
-- solto proposital — se alguem publicar esses 6 de novo, /esportes volta a ser
-- Classe 3. O certo, se um dia virar pauta, e declarar a editoria antes.
--
-- PRE-CONDICAO (checada antes de qualquer escrita, e a transacao inteira aborta
-- se falhar): `settings.categories` precisa ja listar as 4 editorias e
-- `menu_items` precisa existir como array nao-vazio. Se o blog ainda nao passou
-- pelo template, rode antes deploy/ocomandante/template_final.sql — declarar
-- uma 5a editoria num blog que nao declarou as 4 primeiras deixaria o painel
-- mostrando so ela.
--
-- ATENCAO: aplicar um template no admin SUBSTITUI menu e cores (CLAUDE.md §8).
-- Se voce aplicar "O Comandante - Portal" ou "- Revista" depois disto, o item
-- de menu criado aqui some — rode este arquivo de novo (e idempotente).
--
-- Idempotente.
-- =============================================================================
BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'ocomandante' THEN
    RAISE EXCEPTION 'este script e SO do ocomandante (banco atual: %)', current_database();
  END IF;
END
$guard$;

\echo '--- ANTES: os tres grupos fora da taxonomia ---'
SELECT category, count(*) FILTER (WHERE status = 'published') AS publicados, count(*) AS total
FROM articles WHERE category IN ('o-comandante','tecnologia','esportes')
GROUP BY category ORDER BY category;

-- Pre-condicao 1: as 4 editorias precisam estar declaradas.
DO $guard$
DECLARE faltando text;
BEGIN
  SELECT string_agg(s.slug, ', ') INTO faltando
  FROM unnest(ARRAY['negocios','economia','aviacao','turismo']) AS s(slug)
  WHERE NOT EXISTS (
    SELECT 1 FROM settings, jsonb_array_elements((value::jsonb)->'categories') c
    WHERE key = 'site_settings' AND c->>'slug' = s.slug);
  IF faltando IS NOT NULL THEN
    RAISE EXCEPTION
      'settings.categories nao lista %: rode deploy/ocomandante/template_final.sql antes',
      faltando;
  END IF;
END
$guard$;

-- Pre-condicao 2: o menu precisa existir. Sem ele nao ha onde pendurar a 5a
-- editoria, e criar a chave do zero aqui escreveria um menu de um item so.
DO $guard$
DECLARE n int;
BEGIN
  SELECT jsonb_array_length(value::jsonb) INTO n FROM settings WHERE key = 'menu_items';
  IF n IS NULL OR n = 0 THEN
    RAISE EXCEPTION 'settings.menu_items ausente ou vazio: configure o menu no painel antes';
  END IF;
END
$guard$;

-- -----------------------------------------------------------------------------
-- A) `o-comandante` vira editoria declarada.
--
-- Cor: as quatro editorias ja gastaram #14265e, #1657d0, #0a1740 e #2f6fe0 do
-- brandbook. Sobrou o vermelho #d81f26, que e o unico slot restante com
-- contraste garantido para tinta branca — mas ele e a cor de CTA ("o bloco
-- NEWS"), entao um chip de editoria em vermelho pode ser lido como botao. Se
-- incomodar, e um campo no painel (Categorias -> cor), sem SQL.
--
-- Nome: "O Comandante", literal do slug — nao invento marca editorial. O nome
-- e so exibicao; a URL sai do slug e nao muda se voce renomear.
-- -----------------------------------------------------------------------------
UPDATE settings
SET value = jsonb_set(
      value::jsonb, '{categories}',
      (value::jsonb->'categories') || jsonb_build_array(jsonb_build_object(
        'id',      'oc-o-comandante',
        'name',    'O Comandante',
        'slug',    'o-comandante',
        'color',   '#d81f26',
        'visible', true))
    )::text,
    updated_at = now()
WHERE key = 'site_settings'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements((value::jsonb)->'categories') c
    WHERE c->>'slug' = 'o-comandante');

-- Item de menu. Duas derivacoes do menu existente, para o novo item nao
-- destoar: o `order` sai do maior ja usado (ou do tamanho do array, quando
-- nenhum item tem `order` — ver o relatorio no fim), e o CAIXA do rotulo copia
-- o dos irmaos (o template do portal usa "AVIACAO", o da revista usa "Aviacao").
UPDATE settings
SET value = (
      (value::jsonb) || jsonb_build_array(jsonb_build_object(
        'id',    'oc-m-o-comandante',
        'label', (SELECT CASE WHEN bool_and(m->>'label' = upper(m->>'label'))
                              THEN 'O COMANDANTE' ELSE 'O Comandante' END
                  FROM jsonb_array_elements(value::jsonb) m
                  WHERE m->>'label' IS NOT NULL),
        'path',  '/o-comandante',
        'order', (SELECT coalesce(max((m->>'order')::int), jsonb_array_length(value::jsonb) - 1) + 1
                  FROM jsonb_array_elements(value::jsonb) m),
        'visible', true))
    )::text,
    updated_at = now()
WHERE key = 'menu_items'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(value::jsonb) m WHERE m->>'path' = '/o-comandante');

-- B) tecnologia -> negocios
UPDATE articles SET category = 'negocios' WHERE category = 'tecnologia';

-- C) esportes -> rascunho. `published_at` fica intacto de proposito: e
-- historico, e o sitemap filtra por `status`, nao por ele.
UPDATE articles SET status = 'draft'
WHERE status = 'published' AND category = 'esportes';

DO $guard$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM articles WHERE category = 'tecnologia';
  IF n > 0 THEN RAISE EXCEPTION 'sobraram % artigo(s) em tecnologia', n; END IF;

  SELECT count(*) INTO n FROM articles WHERE status = 'published' AND category = 'esportes';
  IF n > 0 THEN RAISE EXCEPTION 'sobraram % artigo(s) publicado(s) em esportes', n; END IF;

  SELECT count(*) INTO n FROM settings, jsonb_array_elements((value::jsonb)->'categories') c
  WHERE key = 'site_settings' AND c->>'slug' = 'o-comandante';
  IF n <> 1 THEN RAISE EXCEPTION 'o-comandante aparece % vez(es) em settings.categories (esperado 1)', n; END IF;

  SELECT count(*) INTO n FROM settings, jsonb_array_elements(value::jsonb) m
  WHERE key = 'menu_items' AND m->>'path' = '/o-comandante';
  IF n <> 1 THEN RAISE EXCEPTION '/o-comandante aparece % vez(es) no menu (esperado 1)', n; END IF;

  -- O acervo publicado tem de caber nos cinco eixos, agora que sao cinco.
  SELECT count(*) INTO n FROM articles
  WHERE status = 'published'
    AND category NOT IN ('negocios','economia','aviacao','turismo','o-comandante');
  IF n > 0 THEN RAISE EXCEPTION '% artigo(s) publicado(s) ainda fora da taxonomia', n; END IF;
END
$guard$;

\echo '--- DEPOIS: acervo publicado ---'
SELECT category, count(*) AS publicados FROM articles
WHERE status = 'published' GROUP BY category ORDER BY publicados DESC;

\echo '--- DEPOIS: menu ---'
SELECT m->>'order' AS ordem, m->>'label' AS rotulo, m->>'path' AS path, m->>'visible' AS visivel
FROM settings, jsonb_array_elements(value::jsonb) m
WHERE key = 'menu_items';

\echo '--- Itens de menu SEM `order` (getMenuItems ordena por ele; esperado 0) ---'
SELECT count(*) AS sem_order
FROM settings, jsonb_array_elements(value::jsonb) m
WHERE key = 'menu_items' AND m->>'order' IS NULL;

\echo '--- Blocos da home apontando para editoria que esvaziou (esperado 0 linhas) ---'
SELECT b->>'name' AS bloco, b->>'category' AS categoria
FROM settings, jsonb_array_elements((value::jsonb)->'homeBlocks') b
WHERE key = 'site_settings' AND b->>'category' IN ('tecnologia','esportes');

COMMIT;

\echo '--- OK. /tecnologia e /esportes passam a 404; /o-comandante vira editoria declarada. ---'
