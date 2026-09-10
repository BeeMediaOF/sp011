-- ============================================================================
-- Faro de Jogo — editoria "Campeonato Brasileiro" (slug campeonato-brasileiro)
-- ============================================================================
-- Roda no banco DO BLOG (não no central). Idempotente — rodar 2x é seguro.
--
-- Uso (VPS, /opt/sp011):
--   docker compose exec -T pg-blogs psql -U postgres -d farodejogo \
--     -v ON_ERROR_STOP=1 < deploy/farodejogo/editoria_brasileirao.sql
--
-- O QUE ESTE ARQUIVO FAZ, E POR QUE PRECISA DAS DUAS PARTES
-- --------------------------------------------------------
-- Uma editoria de blog vive em DOIS lugares, e faltar um deles quebra de um
-- jeito diferente:
--   * `settings.site_settings -> categories` — é a lista do painel → Categorias
--     e o que o seletor de categoria do editor de artigo mostra.
--   * `settings.menu_items` — é o que faz a ROTA existir. Rota de categoria
--     custom só resolve se houver item de menu com o caminho (CLAUDE.md §8):
--     `App.tsx` tem rota fixa só para as editorias clássicas, e o resto cai no
--     `DynamicCategory`, que monta a superfície a partir do menu ∪ categories.
--
-- A central entrega as notícias com `category = 'campeonato-brasileiro'` (regra
-- "Faro de Jogo - Campeonato Brasileiro", em deploy/farodejogo/sources_gazeta.sql).
-- Esse slug NÃO é validado em ponto nenhum do caminho: se o que está gravado
-- aqui divergir do target da regra, os artigos chegam, são publicados e viram
-- uma página órfã 200 indexável que ainda entra no sitemap — o incidente
-- 'otros' do credito.vc. Rode os dois arquivos com o MESMO slug.
--
-- ⚠️ APLICAR TEMPLATE APAGA O MENU (CLAUDE.md §8). Por isso a aba também foi
--    acrescentada ao `deploy/farodejogo/template_final.sql`, junto de um bloco
--    de home da editoria. Reaplicar o template atual mantém tudo; reaplicar um
--    snapshot salvo no banco ANTES desta data, não — aí é rodar este arquivo
--    de novo.
--
-- Se a conferência final não devolver linha de menu, é porque o blog nunca
-- salvou o menu (a linha `menu_items` não existe e a api serve o menu do
-- código). NÃO force um INSERT: uma linha só com esta aba apagaria a navegação
-- inteira. Abra o painel → Menu → Salvar e rode este arquivo de novo.
-- ============================================================================

\set ON_ERROR_STOP on

\echo ''
\echo '=== ESTADO ANTES ==='
SELECT current_database() AS banco,
       (SELECT count(*) FROM settings WHERE key = 'menu_items')    AS tem_linha_menu,
       (SELECT count(*) FROM settings WHERE key = 'site_settings') AS tem_site_settings;

BEGIN;

-- ── 1. A editoria na lista do painel ────────────────────────────────────────
-- Anexa só se o slug ainda não estiver lá. Não toca no resto da lista: se o
-- operador já criou a editoria pelo painel, este passo é no-op.
UPDATE settings s
SET value = jsonb_set(
      s.value::jsonb, '{categories}',
      COALESCE(
        CASE WHEN jsonb_typeof(s.value::jsonb->'categories') = 'array'
             THEN s.value::jsonb->'categories' ELSE '[]'::jsonb END,
        '[]'::jsonb)
      || '[{"id":"fj-campeonato-brasileiro","name":"Campeonato Brasileiro","slug":"campeonato-brasileiro","color":"#1c66bd","visible":true}]'::jsonb,
      true)::text,
    updated_at = now()
WHERE s.key = 'site_settings'
  AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
               CASE WHEN jsonb_typeof(s.value::jsonb->'categories') = 'array'
                    THEN s.value::jsonb->'categories' ELSE '[]'::jsonb END) c
        WHERE c->>'slug' = 'campeonato-brasileiro'
      );

-- ── 2. A aba no menu, logo depois de FUTEBOL ────────────────────────────────
-- Em PL/pgSQL e não numa CTE: a inserção tem de acertar DUAS coisas ao mesmo
-- tempo — a posição no array e o campo `order` — porque `getMenuItems` ordena
-- por `order`, mas há menu na rede sem esse campo, em que só a ordem do array
-- vale. Imperativo, isso se lê; em CTE, não.
DO $$
DECLARE
  menu       jsonb;
  item       jsonb;
  novo       jsonb;
  saida      jsonb := '[]'::jsonb;
  pos_ancora int := NULL;
  ord_ancora int := NULL;
  ord_max    int := -1;
  i          int;
  n          int;
BEGIN
  SELECT s.value::jsonb INTO menu FROM settings s WHERE s.key = 'menu_items';

  IF menu IS NULL OR jsonb_typeof(menu) <> 'array' THEN
    RAISE NOTICE 'menu_items ausente ou nao e array — nada feito. Abra o painel -> Menu -> Salvar e rode de novo.';
    RETURN;
  END IF;

  n := jsonb_array_length(menu);

  IF n = 0 THEN
    -- Menu vazio: gravar só esta aba apagaria a navegação (o site cairia no
    -- menu padrão do código e o operador veria um menu de uma aba só).
    RAISE NOTICE 'menu_items esta vazio — nada feito. Abra o painel -> Menu -> Salvar e rode de novo.';
    RETURN;
  END IF;

  -- Já existe? (olha itens e submenus de 1 nivel; normaliza a barra)
  FOR i IN 0 .. n - 1 LOOP
    item := menu -> i;
    IF lower(trim(both '/' from COALESCE(item->>'path',''))) = 'campeonato-brasileiro' THEN
      RAISE NOTICE 'aba ja existe no menu — nada feito.';
      RETURN;
    END IF;
    IF jsonb_typeof(item->'children') = 'array' THEN
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(item->'children') c
                 WHERE lower(trim(both '/' from COALESCE(c->>'path',''))) = 'campeonato-brasileiro') THEN
        RAISE NOTICE 'aba ja existe como submenu — nada feito.';
        RETURN;
      END IF;
    END IF;
  END LOOP;

  -- Âncora: o item de FUTEBOL. E o maior `order` numérico do menu, para o caso
  -- de não haver âncora (aí a aba vai para o fim).
  FOR i IN 0 .. n - 1 LOOP
    item := menu -> i;
    IF item->>'order' ~ '^-?[0-9]+$' AND (item->>'order')::int > ord_max THEN
      ord_max := (item->>'order')::int;
    END IF;
    IF pos_ancora IS NULL
       AND lower(trim(both '/' from COALESCE(item->>'path',''))) = 'futebol' THEN
      pos_ancora := i;
      IF item->>'order' ~ '^-?[0-9]+$' THEN ord_ancora := (item->>'order')::int; END IF;
    END IF;
  END LOOP;

  -- FUTEBOL sem `order` numérico significa menu que se apoia só na ordem do
  -- array. Nesse caso o item novo também nasce sem `order`: inventar um número
  -- para ele num menu que não usa o campo o jogaria para uma posição aleatória.
  IF pos_ancora IS NULL THEN
    pos_ancora := n - 1;              -- sem âncora: vai para o fim
    ord_ancora := ord_max;
  END IF;

  novo := jsonb_build_object(
    'id',      'fj-menu-brasileirao',
    'label',   'BRASILEIRÃO',
    'path',    '/campeonato-brasileiro',
    'visible', true);
  IF ord_ancora IS NOT NULL THEN
    novo := novo || jsonb_build_object('order', ord_ancora + 1);
  END IF;

  -- Monta a lista nova: cada item na ordem original, com o item novo logo após
  -- a âncora; quem tinha `order` maior que o da âncora é empurrado em 1.
  FOR i IN 0 .. n - 1 LOOP
    item := menu -> i;
    IF ord_ancora IS NOT NULL
       AND item->>'order' ~ '^-?[0-9]+$'
       AND (item->>'order')::int > ord_ancora THEN
      item := jsonb_set(item, '{order}', to_jsonb((item->>'order')::int + 1));
    END IF;
    saida := saida || jsonb_build_array(item);
    IF i = pos_ancora THEN
      saida := saida || jsonb_build_array(novo);
    END IF;
  END LOOP;

  UPDATE settings SET value = saida::text, updated_at = now() WHERE key = 'menu_items';
  RAISE NOTICE 'aba BRASILEIRAO inserida na posicao % de %', pos_ancora + 2, n + 1;
END $$;

COMMIT;

-- ── 3. Conferência ──────────────────────────────────────────────────────────
\echo ''
\echo '=== EDITORIAS DO PAINEL (precisa ter campeonato-brasileiro) ==='
-- O filtro por `key` vai numa SUBCONSULTA, e não num WHERE ao lado da função:
-- `jsonb_array_elements` sobre a linha errada (site_settings é objeto, menu_items
-- é array) aborta a consulta, e depender do planejador empurrar o filtro é sorte.
SELECT c->>'slug' AS slug, c->>'name' AS nome, c->>'visible' AS visivel
FROM (SELECT value::jsonb AS v FROM settings WHERE key = 'site_settings') s,
     jsonb_array_elements(COALESCE(
       CASE WHEN jsonb_typeof(s.v->'categories') = 'array'
            THEN s.v->'categories' ELSE '[]'::jsonb END, '[]'::jsonb)) AS c
ORDER BY c->>'name';

\echo ''
\echo '=== MENU GRAVADO (BRASILEIRAO tem de vir logo depois de FUTEBOL) ==='
SELECT t.idx AS pos, t.e->>'order' AS ordem, t.e->>'label' AS rotulo,
       t.e->>'path' AS caminho, t.e->>'visible' AS visivel
FROM (SELECT value::jsonb AS menu FROM settings WHERE key = 'menu_items') s,
     jsonb_array_elements(s.menu) WITH ORDINALITY AS t(e, idx)
ORDER BY t.idx;

\echo ''
\echo '=== ARTIGOS JA GRAVADOS NESTA EDITORIA ==='
\echo 'Zero e o esperado antes da primeira entrega da central.'
SELECT category, count(*) AS artigos,
       count(*) FILTER (WHERE status = 'published') AS publicados
FROM articles
WHERE category ILIKE '%brasileir%' OR category = 'campeonato-brasileiro'
GROUP BY category
ORDER BY artigos DESC;
