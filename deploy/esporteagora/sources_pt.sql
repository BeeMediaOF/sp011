-- =============================================================================
-- Esporte Agora — fontes RSS brasileiras (pt-BR) + taxonomia + regras
-- =============================================================================
-- O que faz (idempotente — rodar 2x é seguro):
--   1. Cadastra 16 fontes PT de esporte em `central_sources` (upsert por URL),
--      com category = slug do menu do Esporte Agora, language='pt-BR' e
--      custom_prompt NULL (usa o prompt PADRÃO em português da central).
--      URLs validadas em 2026-07-10.
--   2. Blog Esporte Agora: garante language='pt-BR' + taxonomia (categories)
--      — categorias só são gravadas se ainda estiverem vazias.
--   3. Cria 8 regras de distribuição (7 por categoria com targetCategory
--      explícito, priority 10) + regra "Outros" (priority 5, sem
--      targetCategory → a IA SÓ CLASSIFICA no menu certo; como fonte e blog
--      são pt-BR, NUNCA passa por tradução).
--   4. Imprime o estado final (blog, regras, fontes) para conferência.
--
-- ⚠️ Slugs de categoria PROPOSITALMENTE diferentes dos do KSports
--    (f1≠formula-1, futebol-americano≠nfl, e-sports≠esports, outros≠others):
--    as regras do KSports casam por categoria e NÃO filtram idioma — slug
--    igual faria notícia PT cair no KSports e disparar tradução PT→EN
--    indesejada. Não "corrija" os slugs para os do KSports.
--
-- Uso (VPS, /opt/sp011):
--   DBURL=$(grep -m1 '^CENTRAL_DATABASE_URL=' .env.central | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
--   docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 < deploy/esporteagora/sources_pt.sql
--
-- Nenhum restart é necessário: collector/distributor releem fontes e regras
-- a cada ciclo.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Aborta se o blog Esporte Agora não estiver cadastrado no painel central
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM blogs WHERE name ILIKE '%esporte%agora%' OR domain ILIKE '%esporteagora%'
  ) THEN
    RAISE EXCEPTION 'Blog Esporte Agora nao encontrado em blogs — cadastre-o no painel central (Blogs -> Novo) antes de rodar este script.';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1) Fontes PT (URLs validadas em 2026-07-10; upsert por URL; prompt padrão)
--    Feeds do ge se sobrepõem (geral × editoria) de propósito: o dedup da
--    central é global (guid/URL/título) — a mesma matéria nunca entra 2x.
-- -----------------------------------------------------------------------------
WITH new_sources(name, url, category, schedule_hours) AS (
  VALUES
    -- Copa do Mundo (em andamento em 2026!)
    ('ge - Copa do Mundo',            'https://ge.globo.com/rss/ge/futebol/copa-do-mundo/',   'copa-do-mundo',     1),
    -- Futebol
    ('ge - Futebol',                  'https://ge.globo.com/rss/ge/futebol/',                 'futebol',           1),
    ('Trivela',                       'https://trivela.com.br/feed/',                         'futebol',           2),
    -- Vôlei
    ('ge - Vôlei',                    'https://ge.globo.com/rss/ge/volei/',                   'volei',             2),
    -- Tênis
    ('ge - Tênis',                    'https://ge.globo.com/rss/ge/tenis/',                   'tenis',             2),
    ('TenisNews',                     'https://tenisnews.com.br/feed/',                       'tenis',             2),
    -- Fórmula 1
    ('ge - Fórmula 1',                'https://ge.globo.com/rss/ge/motor/formula-1/',         'f1',                1),
    ('Motorsport.com Brasil - F1',    'https://motorsport.uol.com.br/rss/f1/news/',           'f1',                2),
    -- Futebol Americano (NFL)
    ('ge - Futebol Americano',        'https://ge.globo.com/rss/ge/futebol-americano/',       'futebol-americano', 2),
    -- e-Sports
    ('ge - e-Sports',                 'https://ge.globo.com/rss/ge/esports/',                 'e-sports',          2),
    -- Gerais/multi-esporte (regra Outros → IA classifica no menu certo)
    ('ge - Geral',                    'https://ge.globo.com/rss/ge/',                         'outros',            1),
    ('UOL Esporte',                   'https://rss.uol.com.br/feed/esporte.xml',              'outros',            2),
    ('Metrópoles - Esportes',         'https://www.metropoles.com/esportes/feed',             'outros',            2),
    ('ESPN Brasil',                   'https://www.espn.com.br/rss/',                         'outros',            2),
    ('Gazeta Esportiva',              'https://www.gazetaesportiva.com/feed/',                'outros',            2),
    ('The Playoffs (NFL/NBA/MLB)',    'https://theplayoffs.news/feed/',                       'outros',            2)
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
-- 2) Blog Esporte Agora: idioma pt-BR (nunca traduz) + taxonomia p/ a IA
--    classificar as fontes gerais dentro do menu do blog
-- -----------------------------------------------------------------------------
UPDATE blogs SET language = 'pt-BR', updated_at = now()
WHERE (name ILIKE '%esporte%agora%' OR domain ILIKE '%esporteagora%') AND language <> 'pt-BR';

UPDATE blogs SET categories = '[
  {"slug":"copa-do-mundo","hint":"Copa do Mundo FIFA"},
  {"slug":"futebol","hint":"futebol de clubes e seleções"},
  {"slug":"volei","hint":"vôlei de quadra e de praia"},
  {"slug":"tenis","hint":"tênis (ATP, WTA, Grand Slams)"},
  {"slug":"f1","hint":"Fórmula 1 / automobilismo"},
  {"slug":"futebol-americano","hint":"futebol americano (NFL, Super Bowl)"},
  {"slug":"e-sports","hint":"esportes eletrônicos / games competitivos"},
  {"slug":"outros","hint":"o que não couber acima (ex.: NBA, boxe, MMA, olimpíadas, surfe)"}
]'::jsonb, updated_at = now()
WHERE (name ILIKE '%esporte%agora%' OR domain ILIKE '%esporteagora%')
  AND (categories IS NULL OR jsonb_array_length(categories) = 0);

-- -----------------------------------------------------------------------------
-- 3) Regras de distribuição (categoria da fonte → seção do menu do blog)
-- -----------------------------------------------------------------------------
INSERT INTO distribution_rules (id, blog_id, name, is_active, priority, categories_include, target_category)
SELECT gen_random_uuid()::text, b.id, v.rule_name, true, v.priority, v.cats::jsonb, v.target
FROM blogs b
CROSS JOIN (VALUES
  ('Esporte Agora - Copa do Mundo',        10, '["copa-do-mundo"]',     'copa-do-mundo'),
  ('Esporte Agora - Futebol',              10, '["futebol"]',           'futebol'),
  ('Esporte Agora - Vôlei',                10, '["volei"]',             'volei'),
  ('Esporte Agora - Tênis',                10, '["tenis"]',             'tenis'),
  ('Esporte Agora - Fórmula 1',            10, '["f1"]',                'f1'),
  ('Esporte Agora - Futebol Americano',    10, '["futebol-americano"]', 'futebol-americano'),
  ('Esporte Agora - e-Sports',             10, '["e-sports"]',          'e-sports'),
  ('Esporte Agora - Outros (IA classifica)',5, '["outros"]',            NULL)
) AS v(rule_name, priority, cats, target)
WHERE (b.name ILIKE '%esporte%agora%' OR b.domain ILIKE '%esporteagora%')
  AND NOT EXISTS (
    SELECT 1 FROM distribution_rules r WHERE r.blog_id = b.id AND r.name = v.rule_name
  );

COMMIT;

-- -----------------------------------------------------------------------------
-- 4) Estado final para conferência
-- -----------------------------------------------------------------------------
\echo ''
\echo '=== BLOG ESPORTE AGORA ==='
SELECT id, name, domain, api_url, language, is_active, require_approval,
       delivery_mode, max_posts_per_day, min_minutes_between_posts, status,
       categories
FROM blogs
WHERE name ILIKE '%esporte%agora%' OR domain ILIKE '%esporteagora%';

\echo ''
\echo '=== REGRAS DE DISTRIBUICAO (todos os blogs) ==='
\echo 'Confira se algum OUTRO blog tem regra catch-all (todas as colunas de'
\echo 'include vazias) — ela receberia as noticias de esporte tambem.'
SELECT b.name AS blog, r.name AS regra, r.is_active, r.priority,
       r.categories_include, r.sources_include, r.keywords_include,
       r.categories_exclude, r.target_category, r.target_tag
FROM distribution_rules r
JOIN blogs b ON b.id = r.blog_id
ORDER BY b.name, r.priority DESC, r.name;

\echo ''
\echo '=== FONTES PT DE ESPORTE POR CATEGORIA ==='
SELECT category, count(*) AS fontes,
       bool_and(active) AS todas_ativas,
       bool_and(custom_prompt IS NULL) AS prompt_padrao_pt,
       bool_and(schedule_hours >= 1) AS coleta_automatica
FROM central_sources
WHERE category IN ('copa-do-mundo','futebol','volei','tenis','f1','futebol-americano','e-sports','outros')
GROUP BY category
ORDER BY category;
