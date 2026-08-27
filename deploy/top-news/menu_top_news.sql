-- ============================================================================
-- Aba "TOP NEWS" no menu — blogs de ESPORTE da rede
-- ============================================================================
--
-- A PÁGINA (`/top-news`) vem na imagem compartilhada e já existe em todo blog
-- assim que a imagem sobe. O que este arquivo faz é só pendurar o LINK no menu
-- dos blogs de esporte — porque menu é DADO de cada blog (`settings.menu_items`),
-- não código. É por isso que o creditovc, o pontofarma, o ocomandante e o sp011
-- não recebem a aba: ninguém roda isto no banco deles.
--
-- Roda no banco DO BLOG (não no central). Idempotente: rodar de novo não
-- duplica o item nem mexe em mais nada da linha.
--
-- O item entra no FIM do menu, com `order` = maior ordem existente + 1. A api
-- relê `menu_items` a cada 15 s (`startSettingsSync`), então a aba aparece no
-- site sem restart e sem rebuild.
--
-- ⚠️ APLICAR TEMPLATE APAGA O MENU. A ação "Aplicar" do painel substitui o menu
--    inteiro pelo do snapshot (CLAUDE.md §8). Por isso a aba também foi
--    acrescentada aos `deploy/<blog>/template_final.sql` dos seis blogs de
--    esporte que têm kit e aos dois starters embutidos no código
--    (`STARTER_TEMPLATES` do HomeBlocksManager) — reaplicar um template atual
--    mantém a aba. Reaplicar um snapshot SALVO NO BANCO antes desta data, não:
--    aí é rodar este arquivo de novo.
--
-- Se a saída de conferência vier VAZIA para algum blog, é porque ele nunca
-- salvou o menu (a linha `menu_items` não existe e a api está servindo o menu
-- padrão do código). Nesse caso, NÃO force um INSERT aqui: uma linha só com
-- Top News apagaria a navegação inteira. Abra o painel → Menu → Salvar (isso
-- grava o menu atual) e rode este arquivo de novo.
--
-- Como rodar na VPS (os sete blogs de esporte, um comando):
--
--   cd /opt/sp011
--   for b in ksports esporteagora resenhavip oleysports beeesportes \
--            apostaganha recebabet; do
--     echo "=== $b ==="
--     docker compose exec -T pg-blogs psql -U postgres -d "$b" \
--       -v ON_ERROR_STOP=1 < deploy/top-news/menu_top_news.sql
--   done
--
-- ============================================================================

-- ── 1. Estado antes ─────────────────────────────────────────────────────────
SELECT current_database()                                        AS banco,
       (SELECT count(*) FROM settings WHERE key = 'menu_items')  AS tem_linha_menu;

-- ── 2. Acrescenta a aba, se ainda não existir ───────────────────────────────
--
-- A busca de duplicata olha o menu TODO (itens e submenus de 1 nível) e
-- normaliza a barra: `/top-news`, `top-news` e `/top-news/` contam como o
-- mesmo destino. Sem isso, rodar duas vezes penduraria duas abas iguais.
UPDATE settings s
SET value = (
      s.value::jsonb || jsonb_build_array(jsonb_build_object(
        'id',      'menu-top-news',
        'label',   'TOP NEWS',
        'path',    '/top-news',
        'order',   COALESCE((
                     SELECT max((e->>'order')::int)
                     FROM jsonb_array_elements(s.value::jsonb) e
                     WHERE e->>'order' ~ '^-?[0-9]+$'
                   ), -1) + 1,
        'visible', true
      ))
    )::text,
    updated_at = now()
WHERE s.key = 'menu_items'
  AND jsonb_typeof(s.value::jsonb) = 'array'
  AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(s.value::jsonb) e
        LEFT JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(e->'children') = 'array'
               THEN e->'children' ELSE '[]'::jsonb END
        ) c ON true
        WHERE lower(trim(both '/' from coalesce(e->>'path', ''))) = 'top-news'
           OR lower(trim(both '/' from coalesce(c->>'path', ''))) = 'top-news'
      );

-- ── 3. Conferência: o menu que ficou gravado ────────────────────────────────
SELECT current_database()   AS banco,
       t.idx                AS pos,
       t.e->>'order'        AS ordem,
       t.e->>'label'        AS rotulo,
       t.e->>'path'         AS caminho,
       t.e->>'visible'      AS visivel
FROM settings s,
     jsonb_array_elements(s.value::jsonb) WITH ORDINALITY AS t(e, idx)
WHERE s.key = 'menu_items'
ORDER BY t.idx;
