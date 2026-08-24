-- =============================================================================
-- KSPORTS — 1 artigo em `copa-do-mundo`, slug PT num blog EN. Roda no banco DO
-- BLOG, e SO no do ksports.
--
--   cd /opt/sp011
--   docker compose exec -T -e PGCLIENTENCODING=UTF8 pg-blogs \
--     psql -U postgres -d ksports -v ON_ERROR_STOP=1 < deploy/higiene/ksports_copa_do_mundo.sql
--
-- POR QUE E UM ARQUIVO SEPARADO, com trava de banco: isto NAO e a corrupcao do
-- slugify (essa esta em deploy/higiene/categorias_slugify.sql, com mapa unico
-- para a rede toda). Aqui a categoria simplesmente veio errada — em portugues,
-- num blog cujos slugs sao todos EN. O destino equivalente e `world-cup`.
--
-- `copa-do-mundo` e a editoria CANONICA dos seis blogs de esporte pt-BR
-- (CLAUDE.md §4). Um mapa compartilhado que traduzisse `copa-do-mundo` para
-- `world-cup` esvaziaria a editoria real deles — 92 artigos so no oleysports.
-- Por isso a primeira coisa que este arquivo faz e recusar rodar em qualquer
-- outro banco.
--
-- Idempotente.
-- =============================================================================
BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'ksports' THEN
    RAISE EXCEPTION
      'este script e SO do ksports (banco atual: %) — em blog pt-BR copa-do-mundo e a editoria canonica',
      current_database();
  END IF;
END
$guard$;

\echo '--- ANTES ---'
SELECT category, count(*) FILTER (WHERE status = 'published') AS publicados, count(*) AS total
FROM articles WHERE category IN ('copa-do-mundo','world-cup')
GROUP BY category ORDER BY category;

-- Guarda: o destino precisa existir no acervo (world-cup tinha 205 em 24/08).
DO $guard$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM articles WHERE status = 'published' AND category = 'world-cup';
  IF n = 0 THEN
    RAISE EXCEPTION 'world-cup nao tem artigo publicado: confira a taxonomia EN antes de mover';
  END IF;
END
$guard$;

UPDATE articles SET category = 'world-cup' WHERE category = 'copa-do-mundo';

DO $guard$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM articles WHERE category = 'copa-do-mundo';
  IF n > 0 THEN
    RAISE EXCEPTION 'sobraram % artigo(s) em copa-do-mundo', n;
  END IF;
END
$guard$;

-- Se o painel declarou a editoria PT, tirar tambem: senao /copa-do-mundo fica
-- Classe 2 (declarada e vazia -> 200 + noindex) em vez de 404. As guardas do
-- `? 'categories'` e do array nao-vazio sao as mesmas do script da rede.
UPDATE settings
SET value = jsonb_set(
      value::jsonb, '{categories}',
      (SELECT coalesce(jsonb_agg(c ORDER BY ord), '[]'::jsonb)
       FROM jsonb_array_elements((value::jsonb)->'categories') WITH ORDINALITY AS t(c, ord)
       WHERE c->>'slug' <> 'copa-do-mundo')
    )::text,
    updated_at = now()
WHERE key = 'site_settings'
  AND (value::jsonb) ? 'categories'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements((value::jsonb)->'categories') c
    WHERE c->>'slug' = 'copa-do-mundo');

DO $guard$
DECLARE n int;
BEGIN
  SELECT jsonb_array_length((value::jsonb)->'categories') INTO n
  FROM settings WHERE key = 'site_settings' AND (value::jsonb) ? 'categories';
  IF n IS NOT NULL AND n = 0 THEN
    RAISE EXCEPTION 'settings.categories ficou vazio — o ksports herdaria as editorias fixas do sp011';
  END IF;
END
$guard$;

\echo '--- Menu apontando para /copa-do-mundo (esperado 0 linhas) ---'
SELECT key, left(value, 400) AS trecho
FROM settings WHERE key = 'menu_items' AND value LIKE '%"/copa-do-mundo"%';

\echo '--- DEPOIS ---'
SELECT category, count(*) FILTER (WHERE status = 'published') AS publicados, count(*) AS total
FROM articles WHERE category IN ('copa-do-mundo','world-cup')
GROUP BY category ORDER BY category;

COMMIT;

\echo '--- OK. /copa-do-mundo do ksports passa a responder 404. ---'
