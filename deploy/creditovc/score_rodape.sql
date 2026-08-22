-- =============================================================================
-- CRÉDITO.VC — Etapa 6 do PRD-IMPL (a parte executavel): tira do rodape o link
-- para /score enquanto a editoria estiver vazia. Roda no banco DO BLOG.
--
--   cd /opt/sp011
--   docker compose exec -T -e PGCLIENTENCODING=UTF8 pg-blogs \
--     psql -U postgres -d creditovc -v ON_ERROR_STOP=1 < deploy/creditovc/score_rodape.sql
--
-- O defeito: /score esta declarada em settings.categories e tem ZERO artigo
-- (contagem de 22/08 — ela nao aparece na lista por categoria). Pelo
-- vocabulario do P0 (CLAUDE.md §17), editoria declarada e vazia responde
-- 200 + noindex, e esse comportamento esta CORRETO. O problema e que o rodape,
-- renderizado na home, publica um link para ela: e o criterio 6 do PRD
-- ("zero noindex entre as rotas linkadas pela home").
--
-- ESTA E A METADE BARATA, E E REVERSIVEL. A correcao de verdade e CONTEUDO:
-- 'score' e termo da tagline e do <title> novos, e as regras da central ja
-- classificam para ela (rules_keywords.sql, prioridade 28). Zero artigo depois
-- de semanas sugere que a regra nunca casou — conferir no banco CENTRAL antes
-- de aceitar a remocao como definitiva (comando no fim deste arquivo).
--
-- QUANDO /score PUBLICAR O PRIMEIRO ARTIGO, DEVOLVER O LINK. Nada faz isso
-- sozinho. O SQL de restauracao esta no fim, comentado.
-- =============================================================================
BEGIN;

\echo '--- ANTES: artigos publicados em /score (esperado 0) ---'
SELECT count(*) AS artigos_em_score FROM articles
WHERE status = 'published' AND category = 'score';

-- Guarda PREVIA: se /score ganhou conteudo entre a analise e agora, este script
-- NAO deve rodar — o link passa a ser legitimo e a rota, indexavel.
DO $guard$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM articles
  WHERE status = 'published' AND category = 'score';
  IF n > 0 THEN
    RAISE EXCEPTION '/score ja tem % artigo(s) publicado(s): o link do rodape esta certo, nao remover', n;
  END IF;
END
$guard$;

UPDATE settings
SET value = jsonb_set(
      value::jsonb,
      '{footerConfig,columns}',
      (SELECT jsonb_agg(
                jsonb_set(c, '{links}',
                  (SELECT coalesce(jsonb_agg(l ORDER BY lord), '[]'::jsonb)
                   FROM jsonb_array_elements(c->'links') WITH ORDINALITY AS u(l, lord)
                   WHERE l->>'href' IS DISTINCT FROM '/score')
                ) ORDER BY ord)
       FROM jsonb_array_elements((value::jsonb)->'footerConfig'->'columns') WITH ORDINALITY AS t(c, ord))
    )::text,
    updated_at = now()
WHERE key = 'site_settings';

DO $guard$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM settings,
       jsonb_array_elements((value::jsonb)->'footerConfig'->'columns') c,
       jsonb_array_elements(c->'links') l
  WHERE key = 'site_settings' AND l->>'href' = '/score';
  IF n > 0 THEN
    RAISE EXCEPTION 'ainda existem % link(s) para /score no rodape', n;
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

\echo '--- OK. /score continua 200 + noindex: agora sem link publicado. ---'

-- =============================================================================
-- POR QUE /score NUNCA RECEBEU NADA — conferir no banco CENTRAL:
--
--   cd /opt/sp011
--   DBURL=$(grep -m1 CENTRAL_DATABASE_URL .env.central | cut -d= -f2-)
--   docker compose exec -T pg-blogs psql "$DBURL" -c "SELECT r.name, r.priority, r.active, r.target_category FROM distribution_rules r JOIN blogs b ON b.id = r.blog_id WHERE b.domain ILIKE '%credito.vc%' ORDER BY r.priority DESC;"
--
-- Se a regra de 'score' estiver ativa e com target certo, o que falta e pauta:
-- nenhuma noticia coletada casou as palavras-chave dela.
-- =============================================================================
-- RESTAURACAO — rodar quando /score publicar o primeiro artigo. Devolve o link
-- ao fim da coluna "Editorias", de onde ele saiu.
--
-- UPDATE settings
-- SET value = jsonb_set(
--       value::jsonb, '{footerConfig,columns}',
--       (SELECT jsonb_agg(
--                 CASE WHEN c->>'title' = 'Editorias'
--                      THEN jsonb_set(c, '{links}', (c->'links') ||
--                             jsonb_build_array(jsonb_build_object(
--                               'id','cvc-f-score','label','Score de Crédito','href','/score')))
--                      ELSE c END ORDER BY ord)
--        FROM jsonb_array_elements((value::jsonb)->'footerConfig'->'columns') WITH ORDINALITY AS t(c, ord))
--     )::text, updated_at = now()
-- WHERE key = 'site_settings';
-- =============================================================================
