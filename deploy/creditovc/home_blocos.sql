-- =============================================================================
-- CRÉDITO.VC — Etapa 1 do PRD-IMPL: reaponta os blocos quebrados da home.
-- Roda no banco DO BLOG.
--
--   cd /opt/sp011
--   docker compose exec -T -e PGCLIENTENCODING=UTF8 pg-blogs \
--     psql -U postgres -d creditovc -v ON_ERROR_STOP=1 < deploy/creditovc/home_blocos.sql
--
-- O defeito (medido em 22/08): três dos sete blocos de conteúdo da home estão
-- configurados errado —
--   "HOME EQUITY"     -> category 'home-equity'     (NAO existe) -> secao vazia
--   "CRÉDITO PESSOAL" -> category 'credito-pessoal' (NAO existe) -> secao vazia
--   "MICROCRÉDITO"    -> category 'renda-extra'     (a MESMA do bloco acima)
--                                                   -> repete os 5 artigos
-- e cinco editorias reais nao tem bloco nenhum (credito, score,
-- organizar-financas, planejar-o-futuro, investimentos).
-- Resultado: 22 links para 11 destinos, de 223 artigos publicados.
--
-- A correcao reaponta os tres para editorias que existem e tem acervo. Casa por
-- CATEGORY nos dois inexistentes (mais robusto que o nome, que o painel deixa
-- editar) e por NAME no terceiro, cuja categoria e legitima no bloco vizinho.
--
-- Nao mexe em ordem, layout, visibilidade nem em nenhum outro campo: reescreve
-- o array inteiro preservando a ordem original (WITH ORDINALITY).
--
-- Idempotente: rodar de novo e no-op (nenhum bloco casa mais) e a guarda
-- continua passando.
-- =============================================================================
BEGIN;

\echo '--- ANTES: blocos de conteudo da home ---'
SELECT b->>'name' AS bloco, b->>'category' AS categoria, b->>'source' AS source
FROM settings, jsonb_array_elements((value::jsonb)->'homeBlocks') b
WHERE key = 'site_settings' AND b ? 'category'
ORDER BY (b->>'order')::int;

UPDATE settings
SET value = jsonb_set(
      value::jsonb,
      '{homeBlocks}',
      (SELECT jsonb_agg(
                CASE
                  WHEN b->>'category' = 'home-equity'
                    THEN jsonb_set(jsonb_set(b, '{category}', '"credito"'),
                                   '{name}', '"CRÉDITO"')
                  WHEN b->>'category' = 'credito-pessoal'
                    THEN jsonb_set(jsonb_set(b, '{category}', '"investimentos"'),
                                   '{name}', '"INVESTIMENTOS"')
                  WHEN b->>'name' = 'MICROCRÉDITO'
                    THEN jsonb_set(jsonb_set(b, '{category}', '"organizar-financas"'),
                                   '{name}', '"ORGANIZAR FINANÇAS"')
                  ELSE b
                END ORDER BY ord)
       FROM jsonb_array_elements((value::jsonb)->'homeBlocks') WITH ORDINALITY AS t(b, ord))
    )::text,
    updated_at = now()
WHERE key = 'site_settings';

-- Guarda: UPDATE 1 NAO prova que a condicao casou. Se algum bloco quebrado
-- sobreviveu, ou se a correcao nao produziu exatamente um bloco por editoria,
-- a transacao inteira e desfeita.
DO $guard$
DECLARE
  quebrados int;
  faltando  text;
BEGIN
  SELECT count(*) INTO quebrados
  FROM settings, jsonb_array_elements((value::jsonb)->'homeBlocks') b
  WHERE key = 'site_settings'
    AND b->>'category' IN ('home-equity', 'credito-pessoal');
  IF quebrados > 0 THEN
    RAISE EXCEPTION 'ainda existem % bloco(s) apontando para categoria inexistente', quebrados;
  END IF;

  SELECT string_agg(c || '=' || n, ', ') INTO faltando
  FROM (
    SELECT c, (SELECT count(*) FROM settings, jsonb_array_elements((value::jsonb)->'homeBlocks') b
               WHERE key = 'site_settings' AND b->>'category' = c) AS n
    FROM unnest(ARRAY['credito','organizar-financas','investimentos']) AS u(c)
  ) q
  WHERE n <> 1;
  IF faltando IS NOT NULL THEN
    RAISE EXCEPTION 'esperado exatamente 1 bloco por editoria; encontrado: %', faltando;
  END IF;
END
$guard$;

\echo '--- DEPOIS: blocos de conteudo da home ---'
SELECT b->>'name' AS bloco, b->>'category' AS categoria, b->>'source' AS source
FROM settings, jsonb_array_elements((value::jsonb)->'homeBlocks') b
WHERE key = 'site_settings' AND b ? 'category'
ORDER BY (b->>'order')::int;

COMMIT;

\echo '--- OK. O api rele site_settings em ate 15s; o HTML do SSR cacheia 30s ---'
