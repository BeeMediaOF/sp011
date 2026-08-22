-- =============================================================================
-- CRÉDITO.VC — Etapa 2 do PRD-IMPL (Variante A): menu editorial plano.
-- Roda no banco DO BLOG.
--
--   cd /opt/sp011
--   docker compose exec -T -e PGCLIENTENCODING=UTF8 pg-blogs \
--     psql -U postgres -d creditovc -v ON_ERROR_STOP=1 < deploy/creditovc/menu_final.sql
--
-- ATENCAO: este script SUBSTITUI o menu inteiro. Rodar o backup da §1.1 do PRD
-- na MESMA sessao — qualquer item criado no painel depois do backup se perde.
--
-- O defeito (medido em 22/08): dos 6 itens do menu, tres levam para a home
-- (path "/") e dois nao levam a lugar nenhum (path ""). Só um resolve. As seis
-- editorias com acervo so eram alcancaveis pelo rodape.
--
-- 'menu_items' e chave PROPRIA da tabela settings — nao vive dentro de
-- 'site_settings'. O valor e o array JSON puro.
--
-- EFEITO COLATERAL CONHECIDO E DESEJADO (PRD §3.4): a superficie de editorias e
-- settings.categories UNIAO menu. 'cartoes-de-credito' e 'consignado-publico'
-- existiam SO como item de menu; ao sairem daqui as duas rotas passam a 404.
-- Seguro: zero artigos, respondiam noindex e nao estao em sitemap nenhum. Se um
-- dia tiverem conteudo, o caminho certo e declara-las em settings.categories
-- (painel -> Categorias), nao devolve-las ao menu como rota fantasma.
-- =============================================================================
BEGIN;

\echo '--- ANTES: menu atual ---'
SELECT i->>'label' AS rotulo, i->>'path' AS path,
       coalesce(jsonb_array_length(i->'children'), 0) AS filhos
FROM settings, jsonb_array_elements(value::jsonb) i
WHERE key = 'menu_items'
ORDER BY (i->>'order')::int;

UPDATE settings
SET value = '[
  {"id":"cvc-menu-dividas","label":"Sair das Dívidas","path":"/sair-das-dividas","order":0,"visible":true},
  {"id":"cvc-menu-credito","label":"Crédito","path":"/credito","order":1,"visible":true},
  {"id":"cvc-menu-organizar","label":"Organizar Finanças","path":"/organizar-financas","order":2,"visible":true},
  {"id":"cvc-menu-renda","label":"Renda Extra","path":"/renda-extra","order":3,"visible":true},
  {"id":"cvc-menu-futuro","label":"Planejar o Futuro","path":"/planejar-o-futuro","order":4,"visible":true},
  {"id":"cvc-menu-invest","label":"Investimentos","path":"/investimentos","order":5,"visible":true}
]',
    updated_at = now()
WHERE key = 'menu_items';

-- Guarda: a regra que o menu passa a respeitar e "todo item ou tem path que
-- resolve, ou tem filhos e serve de cabecalho de submenu".
DO $guard$
DECLARE
  itens int;
  mortos int;
BEGIN
  SELECT jsonb_array_length(value::jsonb) INTO itens
  FROM settings WHERE key = 'menu_items';
  IF itens IS DISTINCT FROM 6 THEN
    RAISE EXCEPTION 'esperado 6 itens de menu; encontrado %', itens;
  END IF;

  SELECT count(*) INTO mortos
  FROM settings, jsonb_array_elements(value::jsonb) i
  WHERE key = 'menu_items'
    AND coalesce(i->>'path', '') IN ('', '/')
    AND coalesce(jsonb_array_length(i->'children'), 0) = 0;
  IF mortos > 0 THEN
    RAISE EXCEPTION '% item(ns) de menu sem destino (path "/" ou "" e sem filhos)', mortos;
  END IF;
END
$guard$;

\echo '--- DEPOIS: menu novo ---'
SELECT i->>'label' AS rotulo, i->>'path' AS path
FROM settings, jsonb_array_elements(value::jsonb) i
WHERE key = 'menu_items'
ORDER BY (i->>'order')::int;

COMMIT;

\echo '--- OK. Conferir por HTTP so depois de 6 min (identidade cacheia 5 min) ---'
