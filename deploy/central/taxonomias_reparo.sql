-- =============================================================================
-- CENTRAL — reparo das taxonomias corrompidas pelo bug do slugify (2026-08-14)
--
--   cd /opt/sp011
--   DBURL=$(grep -m1 '^CENTRAL_DATABASE_URL=' .env.central | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
--   docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 < deploy/central/taxonomias_reparo.sql
--
-- O BUG: `normalizeCategories` (central-hub/src/routes/blogs.ts) removia acentos
-- com `/[\u0300-\u036f]/` — barra DUPLA. Isso deixa de ser o intervalo de
-- marcas combinantes e vira uma classe com `\ u 0 3 6 f` mais o intervalo
-- `0`-`\`, apagando `u`, `f` e todos os DÍGITOS do slug. Como o kit grava a
-- taxonomia direto por SQL, o estrago só aparecia depois de alguém SALVAR o
-- blog no painel — e slug sem u/f/dígito passava intacto, o que disfarçava.
--
--     outros             -> otros            organizar-financas -> organizar-inancas
--     planejar-o-futuro  -> planejar-o-tro   football           -> ootball
--     futebol            -> tebol            formula-1          -> orma
--
-- POR QUE IMPORTA: `resolveDeliveryCategory` valida a classificação da IA contra
-- ESTA lista. Com `otros` gravado aqui, `otros` virou categoria legítima e 117
-- artigos do credito.vc foram para uma rota que não existe no blog.
--
-- O UPDATE do kit NÃO conserta: ele só age quando a taxonomia está vazia.
-- Aqui a escrita é forçada.
--
-- Código corrigido em `lib/taxonomy.ts` (com teste). Suba o central-api ANTES,
-- senão o próximo Salvar no painel corrompe de novo.
-- =============================================================================

\echo ''
\echo '=== ANTES — taxonomia de TODOS os blogs ==================================='
SELECT b.name, string_agg(c->>'slug', ', ' ORDER BY ord) AS slugs
FROM blogs b
LEFT JOIN LATERAL jsonb_array_elements(coalesce(b.categories,'[]'::jsonb)) WITH ORDINALITY AS t(c, ord) ON true
GROUP BY b.name ORDER BY b.name;

BEGIN;

-- Crédito.vc — lista do kit (deploy/creditovc/sources_financas.sql), com hints.
UPDATE blogs SET categories = '[
  {"slug":"sair-das-dividas","hint":"dívidas, nome sujo, negociação/renegociação, mutirões, Serasa/SPC"},
  {"slug":"credito","hint":"empréstimos, financiamentos, cartão de crédito, juros, CET, golpes financeiros, direitos do consumidor"},
  {"slug":"score","hint":"score de crédito, consulta de CPF, cadastro positivo"},
  {"slug":"organizar-financas","hint":"orçamento doméstico, economizar dinheiro, planilhas, contas de casa"},
  {"slug":"renda-extra","hint":"renda extra, MEI, freelas, bicos, pequenos negócios próprios"},
  {"slug":"planejar-o-futuro","hint":"reserva de emergência, previdência, aposentadoria, juntar dinheiro para objetivos"},
  {"slug":"investimentos","hint":"investimentos, renda fixa, CDB, poupança, bolsa, franquias e negócios para investir"},
  {"slug":"outros","hint":"o que não couber acima (ex.: macroeconomia, Selic, impostos, benefícios sociais, FGTS, 13º)"}
]'::jsonb, updated_at = now()
WHERE name ILIKE '%credito%' OR name ILIKE '%crédito%' OR domain ILIKE '%credito%';

COMMIT;

\echo ''
\echo '=== DEPOIS ================================================================'
SELECT b.name, string_agg(c->>'slug', ', ' ORDER BY ord) AS slugs
FROM blogs b
LEFT JOIN LATERAL jsonb_array_elements(coalesce(b.categories,'[]'::jsonb)) WITH ORDINALITY AS t(c, ord) ON true
WHERE b.name ILIKE '%credito%' OR b.name ILIKE '%crédito%' OR b.domain ILIKE '%credito%'
GROUP BY b.name;

\echo ''
\echo '=== REGRA APONTANDO PARA CATEGORIA INEXISTENTE (deve vir VAZIO agora) ====='
SELECT b.name AS blog, r.name, r.target_category
FROM distribution_rules r JOIN blogs b ON b.id = r.blog_id
WHERE r.target_category IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(b.categories,'[]'::jsonb)) c
    WHERE c->>'slug' = r.target_category
  )
ORDER BY b.name, r.name;
