-- =============================================================================
-- CRÉDITO.VC — Etapa 8 do PRD-IMPL (a metade que é dado): assinatura do portal.
-- Roda no banco DO BLOG.
--
--   cd /opt/sp011
--   docker compose exec -T -e PGCLIENTENCODING=UTF8 pg-blogs \
--     psql -U postgres -d creditovc -v ON_ERROR_STOP=1 < deploy/creditovc/autoria_redacao.sql
--
-- O defeito: o JSON-LD do artigo declara
--   "author": {"@type":"Person","name":"Crédito.vc"}
-- ou seja, a ORGANIZACAO no lugar de uma pessoa. Acontece porque a cadeia de
-- assinatura (Artigo.tsx:540 para o JSON-LD e :700 para o que o leitor ve — a
-- MESMA de proposito, para o indexado e o lido nao divergirem) e
--   columnist?.name || explicitAuthor || settings.bylineName || siteName
-- e o blog nunca teve `bylineName`, entao caiu no siteName.
--
-- Esta e a opcao "Redacao" do PRD §9.2. A outra e cadastrar PESSOA REAL
-- (settings.columnists + articles.columnist_id + perfil columnist), que e
-- trabalho de painel e nao cabe em SQL.
--
-- LIMITE EXPLICITO: nao inventar jornalista. Nome ficticio com pagina de perfil
-- e fabricacao de sinal de E-E-A-T — o padrao que alimenta classificacao de
-- conteudo enganoso, risco concreto numa rede que ja teve um dominio marcado
-- como "Paginas enganosas" (CLAUDE.md §19.3). "Redacao <Portal>" nao afirma
-- nada falso: e o que o portal de fato e.
--
-- O QUE ISTO **NAO** RESOLVE: o `@type` continua "Person". Corrigir para
-- Organization (mais author.url, publisher.url e publisher.logo real) e CODIGO
-- na imagem compartilhada — sai no P1 do OleySports, para os 11 blogs de uma
-- vez. O ganho aqui e a assinatura deixar de ser o nome nu da marca.
--
-- Idempotente.
-- =============================================================================
BEGIN;

\echo '--- ANTES ---'
SELECT (value::jsonb)->>'siteName'   AS site_name,
       (value::jsonb)->>'bylineName' AS byline_name
FROM settings WHERE key = 'site_settings';

UPDATE settings
SET value = jsonb_set(value::jsonb, '{bylineName}',
                      to_jsonb('Redação Crédito.vc'::text))::text,
    updated_at = now()
WHERE key = 'site_settings';

DO $guard$
DECLARE atual text;
BEGIN
  SELECT (value::jsonb)->>'bylineName' INTO atual
  FROM settings WHERE key = 'site_settings';
  IF atual IS DISTINCT FROM 'Redação Crédito.vc' THEN
    RAISE EXCEPTION 'bylineName ficou como % (esperado a assinatura da redacao)',
                    coalesce(atual, '<null>');
  END IF;
END
$guard$;

\echo '--- DEPOIS ---'
SELECT (value::jsonb)->>'siteName'   AS site_name,
       (value::jsonb)->>'bylineName' AS byline_name
FROM settings WHERE key = 'site_settings';

COMMIT;

\echo '--- OK. Vale para artigo SEM autor explicito e SEM colunista.  ---'
\echo '--- Artigo com author proprio ("Por ...") mantem a assinatura. ---'
