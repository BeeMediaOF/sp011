-- =============================================================================
-- CRÉDITO.VC — Etapa 3 do PRD-IMPL: tira o link 404 e os rotulos duplicados do
-- rodape. Roda no banco DO BLOG.
--
--   cd /opt/sp011
--   docker compose exec -T -e PGCLIENTENCODING=UTF8 pg-blogs \
--     psql -U postgres -d creditovc -v ON_ERROR_STOP=1 < deploy/creditovc/rodape_limpeza.sql
--
-- O defeito (medido em 22/08):
--   1. coluna "Mais Temas" tem {"href":"/outros","label":"Outros"} — GET /outros
--      responde 404. E a UNICA URL 404 que o site publica, residuo da remocao da
--      categoria 'outros' em 18/08 (CLAUDE.md §4). Viola a invariante "nenhuma
--      pagina publica linka rota que nao existe".
--   2. coluna "Institucional" tem TRES rotulos distintos para a MESMA URL:
--      "Sobre o Crédito.vc", "Anuncie Conosco" e "Fale Conosco" -> /contato.
--
-- Decisao embutida: "Sobre" e "Anuncie" saem porque prometem paginas que nao
-- existem. Quando /sobre for criada, o link volta apontando para /sobre — nunca
-- para /contato.
--
-- Casa por id E por href/label: o id e o que o kit gravou, o resto e a rede de
-- seguranca caso alguem tenha recriado o link pelo painel (id novo).
-- O resto do rodape (colunas, ordem, titulos, demais links) e preservado.
--
-- Idempotente.
-- =============================================================================
BEGIN;

\echo '--- ANTES: links do rodape ---'
SELECT c->>'title' AS coluna, l->>'label' AS link, l->>'href' AS href
FROM settings,
     jsonb_array_elements((value::jsonb)->'footerConfig'->'columns') c,
     jsonb_array_elements(c->'links') l
WHERE key = 'site_settings';

UPDATE settings
SET value = jsonb_set(
      value::jsonb,
      '{footerConfig,columns}',
      (SELECT jsonb_agg(
                jsonb_set(c, '{links}',
                  (SELECT coalesce(jsonb_agg(l ORDER BY lord), '[]'::jsonb)
                   FROM jsonb_array_elements(c->'links') WITH ORDINALITY AS u(l, lord)
                   WHERE l->>'href' IS DISTINCT FROM '/outros'
                     AND coalesce(l->>'id', '') NOT IN
                         ('cvc-f-outros', 'cvc-f-anuncie', 'cvc-f-sobre')
                     AND coalesce(l->>'label', '') NOT IN
                         ('Outros', 'Anuncie Conosco', 'Sobre o Crédito.vc'))
                ) ORDER BY ord)
       FROM jsonb_array_elements((value::jsonb)->'footerConfig'->'columns') WITH ORDINALITY AS t(c, ord))
    )::text,
    updated_at = now()
WHERE key = 'site_settings';

DO $guard$
DECLARE
  mortos int;
  contato int;
BEGIN
  SELECT count(*) INTO mortos
  FROM settings,
       jsonb_array_elements((value::jsonb)->'footerConfig'->'columns') c,
       jsonb_array_elements(c->'links') l
  WHERE key = 'site_settings' AND l->>'href' = '/outros';
  IF mortos > 0 THEN
    RAISE EXCEPTION 'ainda existem % link(s) para /outros no rodape', mortos;
  END IF;

  SELECT count(*) INTO contato
  FROM settings,
       jsonb_array_elements((value::jsonb)->'footerConfig'->'columns') c,
       jsonb_array_elements(c->'links') l
  WHERE key = 'site_settings' AND l->>'href' = '/contato';
  IF contato > 1 THEN
    RAISE EXCEPTION '% rotulos ainda apontam para /contato (esperado no maximo 1)', contato;
  END IF;
END
$guard$;

\echo '--- DEPOIS: links do rodape ---'
SELECT c->>'title' AS coluna, l->>'label' AS link, l->>'href' AS href
FROM settings,
     jsonb_array_elements((value::jsonb)->'footerConfig'->'columns') c,
     jsonb_array_elements(c->'links') l
WHERE key = 'site_settings';

COMMIT;

\echo '--- OK ---'
