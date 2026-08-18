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

-- Crédito.vc — SEM `outros` (decisão de 2026-08-18).
--
-- O `outros` era o balde do classificador: tudo que a IA não soubesse encaixar
-- caía nele. Isso e o oposto de "blog focado" — e, pior, `outros` nem existe em
-- Categorias no admin do blog, entao os 199 artigos que foram parar la viraram
-- pagina orfa (o leitor nao chega neles por link nenhum).
--
-- COM A LISTA SEM BALDE, O QUE IMPEDE PAUTA ALHEIA DE CHEGAR SAO AS REGRAS, NAO
-- ESTA LISTA. A conta e a seguinte (`resolveDeliveryCategory`, central-hub/src/
-- lib/localization.ts):
--   * entrega COM target_category  -> usa o target, nem chama a IA;
--   * entrega SEM target_category  -> IA classifica; se nada casar, cai no
--     ULTIMO slug da lista (aqui: `investimentos`) — exatamente o que nao se
--     quer.
-- Por isso as 7 regras do credito.vc tem target FIXO e o catch-all esta
-- DESLIGADO (deploy/creditovc/rules_keywords.sql, v3). As duas conferencias no
-- fim deste arquivo provam isso; se a de "regras ativas SEM target" voltar com
-- linha, o balde volta a ser necessario ANTES de tirar o `outros`.
UPDATE blogs SET categories = '[
  {"slug":"credito","hint":"empréstimos, financiamentos, cartão de crédito, consignado, juros, CET, golpes financeiros, direitos do consumidor"},
  {"slug":"sair-das-dividas","hint":"dívidas, nome sujo, negociação/renegociação, mutirões, Serasa/SPC"},
  {"slug":"score","hint":"score de crédito, consulta de CPF, cadastro positivo"},
  {"slug":"organizar-financas","hint":"orçamento doméstico, economizar dinheiro, planilhas, contas de casa"},
  {"slug":"renda-extra","hint":"renda extra, MEI, freelas, bicos, pequenos negócios próprios"},
  {"slug":"planejar-o-futuro","hint":"reserva de emergência, previdência, aposentadoria, juntar dinheiro para objetivos"},
  {"slug":"investimentos","hint":"investimentos EDUCATIVOS: renda fixa, CDB, poupança, primeiro investimento. NAO e noticia de mercado/balanco"}
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
\echo '=== CREDITO.VC: REGRA ATIVA SEM TARGET (deve vir VAZIO) ==================='
\echo '(regra sem target manda a entrega para a IA classificar; sem `outros` na'
\echo ' lista, o que ela nao souber classificar cai em investimentos)'
SELECT r.priority, r.name, r.is_active
FROM distribution_rules r JOIN blogs b ON b.id = r.blog_id
WHERE (b.name ILIKE '%credito%' OR b.name ILIKE '%crédito%' OR b.domain ILIKE '%credito%')
  AND r.is_active AND r.target_category IS NULL
ORDER BY r.priority DESC;

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
