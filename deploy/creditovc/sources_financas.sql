-- =============================================================================
-- Crédito.vc — fontes de finanças pessoais/economia + taxonomia + regras
-- =============================================================================
-- O que faz (idempotente — rodar 2x é seguro):
--   1. Garante as 10 fontes PT de finanças da proposta em `central_sources`
--      (upsert por URL), todas com category='financas' — categoria de fonte
--      NOVA na rede, para NÃO casar com as regras "outros" dos blogs de
--      esporte nem misturar com os slugs deles.
--   2. Blog Crédito.vc: language='pt-BR' + taxonomia (categories) — só grava
--      as categorias se ainda estiverem vazias.
--   3. Cria 1 regra de distribuição: tudo que vier de fonte 'financas' vai
--      para o Crédito.vc SEM targetCategory → a IA classifica cada notícia
--      dentro do menu do blog (pt→pt nunca traduz; chamada barata).
--   4. Acrescenta 'financas' ao categories_exclude do catch-all do sp011 —
--      SEM isso o catch-all (include vazio casa tudo) despejaria as ~10
--      fontes de economia no sp011 e mudaria o mix dele. Se um dia o sp011
--      QUISER essas pautas, basta remover 'financas' do exclude no painel.
--   5. Imprime o estado final (blog, regras, fontes) para conferência.
--
-- Matcher do blog: name ILIKE '%credito%' OR name ILIKE '%crédito%' OR
-- domain ILIKE '%credito%' (cobre "Crédito.vc" com acento e credito.vc /
-- creditovc.midia.run; nenhum outro blog da rede tem "credito" no nome).
--
-- Uso (VPS, /opt/sp011):
--   DBURL=$(grep -m1 '^CENTRAL_DATABASE_URL=' .env.central | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
--   docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 < deploy/creditovc/sources_financas.sql
--
-- Nenhum restart é necessário: collector/distributor releem fontes e regras
-- a cada ciclo.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Aborta se o blog Crédito.vc não estiver cadastrado no painel central
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM blogs
    WHERE name ILIKE '%credito%' OR name ILIKE '%crédito%' OR domain ILIKE '%credito%'
  ) THEN
    RAISE EXCEPTION 'Blog Credito.vc nao encontrado em blogs — cadastre-o no painel central (Blogs -> Novo) antes de rodar este script.';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1) Fontes PT de finanças/economia (da proposta Bee Media; upsert por URL)
-- -----------------------------------------------------------------------------
WITH new_sources(name, url, category, schedule_hours) AS (
  VALUES
    ('G1 Economia',              'https://g1.globo.com/rss/g1/economia/',              'financas', 1),
    ('Agência Brasil - Economia','https://agenciabrasil.ebc.com.br/rss/economia/feed.xml', 'financas', 2),
    ('InfoMoney',                'https://www.infomoney.com.br/feed/',                 'financas', 2),
    ('Exame',                    'https://exame.com/feed/',                            'financas', 2),
    ('Money Times',              'https://www.moneytimes.com.br/feed/',                'financas', 2),
    ('Seu Dinheiro',             'https://www.seudinheiro.com/feed/',                  'financas', 2),
    ('E-Investidor (Estadão)',   'https://einvestidor.estadao.com.br/feed/',           'financas', 2),
    ('Suno Notícias',            'https://www.suno.com.br/noticias/feed/',             'financas', 2),
    ('CNN Brasil - Economia',    'https://www.cnnbrasil.com.br/economia/feed/',        'financas', 2),
    ('UOL Economia',             'https://rss.uol.com.br/feed/economia.xml',           'financas', 2)
),
ins AS (
  INSERT INTO central_sources
    (id, name, url, category, active, schedule_hours, fetch_limit, give_credit, custom_prompt, language)
  SELECT gen_random_uuid()::text, ns.name, ns.url, ns.category, true,
         ns.schedule_hours, 1, true, NULL, 'pt-BR'
  FROM new_sources ns
  WHERE NOT EXISTS (SELECT 1 FROM central_sources cs WHERE cs.url = ns.url)
  RETURNING 1
)
SELECT (SELECT count(*) FROM ins) AS fontes_novas_cadastradas;

-- -----------------------------------------------------------------------------
-- 2) Blog Crédito.vc: idioma pt-BR (nunca traduz) + taxonomia p/ a IA
--    classificar cada notícia dentro do menu do blog
-- -----------------------------------------------------------------------------
UPDATE blogs SET language = 'pt-BR', updated_at = now()
WHERE (name ILIKE '%credito%' OR name ILIKE '%crédito%' OR domain ILIKE '%credito%')
  AND language <> 'pt-BR';

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
WHERE (name ILIKE '%credito%' OR name ILIKE '%crédito%' OR domain ILIKE '%credito%')
  AND (categories IS NULL OR jsonb_array_length(categories) = 0);

-- -----------------------------------------------------------------------------
-- 3) Regra de distribuição: fonte 'financas' → Crédito.vc, IA classifica
-- -----------------------------------------------------------------------------
INSERT INTO distribution_rules (id, blog_id, name, is_active, priority, categories_include, target_category)
SELECT gen_random_uuid()::text, b.id, v.rule_name, true, v.priority, v.cats::jsonb, v.target
FROM blogs b
CROSS JOIN (VALUES
  ('Crédito.vc - Finanças (IA classifica)', 10, '["financas"]', NULL)
) AS v(rule_name, priority, cats, target)
WHERE (b.name ILIKE '%credito%' OR b.name ILIKE '%crédito%' OR b.domain ILIKE '%credito%')
  AND NOT EXISTS (
    SELECT 1 FROM distribution_rules r WHERE r.blog_id = b.id AND r.name = v.rule_name
  );

-- -----------------------------------------------------------------------------
-- 4) Blinda o catch-all do sp011: exclui a categoria de fonte 'financas'
--    (regra com categories_include vazio casa TUDO — sem isso o sp011
--    receberia as 10 fontes de economia)
-- -----------------------------------------------------------------------------
UPDATE distribution_rules r
SET categories_exclude = COALESCE(r.categories_exclude, '[]'::jsonb) || '["financas"]'::jsonb
FROM blogs b
WHERE b.id = r.blog_id
  AND (b.name ILIKE '%sp011%' OR b.domain ILIKE '%sp011%')
  AND (r.categories_include IS NULL OR jsonb_array_length(r.categories_include) = 0)
  AND NOT (COALESCE(r.categories_exclude, '[]'::jsonb) ? 'financas');

COMMIT;

-- -----------------------------------------------------------------------------
-- 5) Estado final para conferência
-- -----------------------------------------------------------------------------
\echo ''
\echo '=== BLOG CREDITO.VC ==='
SELECT id, name, domain, api_url, language, is_active, require_approval,
       delivery_mode, max_posts_per_day, min_minutes_between_posts, status,
       categories
FROM blogs
WHERE name ILIKE '%credito%' OR name ILIKE '%crédito%' OR domain ILIKE '%credito%';

\echo ''
\echo '=== REGRAS DE DISTRIBUICAO (todos os blogs) ==='
\echo 'Confira se algum OUTRO blog tem regra catch-all (includes vazios) SEM'
\echo '"financas" no categories_exclude — ela receberia essas noticias tambem.'
SELECT b.name AS blog, r.name AS regra, r.is_active, r.priority,
       r.categories_include, r.sources_include, r.keywords_include,
       r.categories_exclude, r.target_category, r.target_tag
FROM distribution_rules r
JOIN blogs b ON b.id = r.blog_id
ORDER BY b.name, r.priority DESC, r.name;

\echo ''
\echo '=== FONTES DE FINANCAS ==='
SELECT name, active, schedule_hours, url
FROM central_sources
WHERE category = 'financas'
ORDER BY name;
