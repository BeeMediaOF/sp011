-- =============================================================================
-- CRÉDITO.VC — Etapa 7 do PRD-IMPL: o bloco HTML do ticker usa <h1>, e a home
-- fica com DOIS <h1> (o do app, sr-only com nome+tagline, e o "Indicadores").
-- Roda no banco DO BLOG.
--
--   cd /opt/sp011
--   docker compose exec -T -e PGCLIENTENCODING=UTF8 pg-blogs \
--     psql -U postgres -d creditovc -v ON_ERROR_STOP=1 < deploy/creditovc/ticker_h1_h2.sql
--
-- POR QUE ISTO VIROU SQL. O PRD dizia "nao fazer por SQL: 15 KB de HTML com
-- aspas, <style> e escapes; um jsonb_set mal formado corrompe o bloco". Isso
-- vale para jsonb_set com um LITERAL escrito a mao. Aqui o HTML novo nunca e
-- digitado: sai de replace() sobre o proprio valor e volta por to_jsonb(), que
-- escapa sozinho. Nao ha literal, nao ha escape manual, nao ha risco de aspa.
-- Editar 15 KB numa textarea do painel e que e o caminho arriscado.
--
-- O CSS casa por CLASSE (.ticker-heading-title), entao o visual nao muda.
--
-- Idempotente: rodar de novo nao acha bloco com <h1 e nao faz nada.
-- =============================================================================
BEGIN;

\echo '--- ANTES: blocos HTML que contem <h1 ---'
SELECT b->>'name' AS bloco,
       (length(b->>'html') - length(replace(b->>'html', '<h1', ''))) / 3   AS abre_h1,
       (length(b->>'html') - length(replace(b->>'html', '</h1>', ''))) / 5 AS fecha_h1,
       length(b->>'html') AS tamanho
FROM settings, jsonb_array_elements((value::jsonb)->'homeBlocks') b
WHERE key = 'site_settings' AND b->>'html' LIKE '%<h1%';

-- Guarda PREVIA: so mexe se houver exatamente UM bloco do ticker e ele tiver
-- exatamente um <h1 e um </h1>. Com 1 e 1, o replace global dentro daquele
-- bloco e provadamente o par certo — nao ha ambiguidade de qual </h1> fecha
-- qual <h1>.
DO $guard$
DECLARE
  alvos int; abre int; fecha int;
BEGIN
  SELECT count(*) INTO alvos
  FROM settings, jsonb_array_elements((value::jsonb)->'homeBlocks') b
  WHERE key = 'site_settings' AND b->>'html' LIKE '%ticker-heading-title%';
  IF alvos <> 1 THEN
    RAISE EXCEPTION 'esperado 1 bloco com ticker-heading-title; encontrado %', alvos;
  END IF;

  SELECT (length(b->>'html') - length(replace(b->>'html', '<h1', ''))) / 3,
         (length(b->>'html') - length(replace(b->>'html', '</h1>', ''))) / 5
    INTO abre, fecha
  FROM settings, jsonb_array_elements((value::jsonb)->'homeBlocks') b
  WHERE key = 'site_settings' AND b->>'html' LIKE '%ticker-heading-title%';
  IF abre <> 1 OR fecha <> 1 THEN
    RAISE EXCEPTION 'o bloco tem % <h1 e % </h1> (esperado 1 e 1) — trocar no painel, nao aqui', abre, fecha;
  END IF;
END
$guard$;

UPDATE settings
SET value = jsonb_set(
      value::jsonb,
      '{homeBlocks}',
      (SELECT jsonb_agg(
                CASE
                  WHEN b->>'html' LIKE '%ticker-heading-title%'
                    -- '<h1' nao casa dentro de '</h1>' (o char antes do h1 e '/'),
                    -- entao a ordem dos dois replace e indiferente.
                    THEN jsonb_set(b, '{html}',
                           to_jsonb(replace(replace(b->>'html', '<h1', '<h2'),
                                            '</h1>', '</h2>')))
                  ELSE b
                END ORDER BY ord)
       FROM jsonb_array_elements((value::jsonb)->'homeBlocks') WITH ORDINALITY AS t(b, ord))
    )::text,
    updated_at = now()
WHERE key = 'site_settings';

-- Guarda POSTERIOR: se a troca tivesse falhado pela metade (por exemplo, o h1
-- escrito de um jeito que o replace nao pegou), sobraria <h1 no bloco.
DO $guard$
DECLARE sobrou int;
BEGIN
  SELECT count(*) INTO sobrou
  FROM settings, jsonb_array_elements((value::jsonb)->'homeBlocks') b
  WHERE key = 'site_settings'
    AND (b->>'html' LIKE '%<h1%' OR b->>'html' LIKE '%</h1>%');
  IF sobrou > 0 THEN
    RAISE EXCEPTION 'ainda sobrou <h1> em % bloco(s) HTML', sobrou;
  END IF;
END
$guard$;

\echo '--- DEPOIS: h2 no lugar (tamanho tem que ser IGUAL ao de antes) ---'
SELECT b->>'name' AS bloco,
       (length(b->>'html') - length(replace(b->>'html', '<h2', ''))) / 3 AS abre_h2,
       length(b->>'html') AS tamanho
FROM settings, jsonb_array_elements((value::jsonb)->'homeBlocks') b
WHERE key = 'site_settings' AND b->>'html' LIKE '%ticker-heading-title%';

COMMIT;

\echo '--- OK. curl -s https://credito.vc/ | grep -o "<h1" | wc -l  ->  esperado 1 ---'
