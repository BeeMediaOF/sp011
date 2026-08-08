-- =============================================================================
-- O Comandante News — fontes + taxonomia + regras de distribuição
-- Roda no banco CENTRAL. Idempotente (rodar 2x é seguro).
-- =============================================================================
-- O que faz:
--   1. Cadastra as fontes RSS em 4 categorias de fonte NOVAS na rede:
--      'oc-negocios', 'oc-economia', 'oc-aviacao', 'oc-turismo' (upsert por
--      URL). O prefixo 'oc-' é proposital: "economia" e "negocios" são termos
--      genéricos que já existem como categoria de ARTIGO na rede — sem o
--      prefixo, uma regra de outro blog poderia casar por acidente.
--   2. Blog O Comandante: language='pt-BR' + taxonomia das 4 editorias.
--   3. Cria 4 regras de distribuição (uma por editoria) com targetCategory
--      FIXO — a categoria sai da regra, sem chamada de IA de classificação.
--      O refino entre editorias vizinhas vive em rules_keywords.sql.
--   4. Define teto diário se ainda estiver vazio (blog ativo sem teto nunca
--      deixa o portão de economia da central fechar).
--   5. Acrescenta as 4 categorias ao categories_exclude do catch-all do sp011
--      — SEM isso a regra catch-all (include vazio casa tudo) despejaria
--      aviação e turismo no sp011 e mudaria o mix dele.
--
-- IDIOMA DAS FONTES EM INGLÊS (FlightGlobal, FLYING, Simple Flying):
--   ficam com language='pt-BR' DE PROPÓSITO. Esse campo é o idioma do texto
--   REESCRITO, não o da fonte: o prompt padrão da central ("Você escreve em
--   Português do Brasil" + "citações em língua estrangeira devem ser
--   traduzidas") já devolve a matéria em pt-BR. Marcar 'en' faria o localizer
--   gastar uma chamada de IA traduzindo um texto que já está em português —
--   e ainda faria o script do KSports (deploy/ksports/sources_en.sql, que dá
--   UPDATE em toda fonte com language='en') carimbar um prompt em inglês
--   nelas. Só marque 'en' se a fonte ganhar um custom_prompt em inglês.
--
-- FEEDS VERIFICADOS EM 2026-08-07 (curl): os três feeds de seção do InfoMoney
--   (/economia/, /business/, /onde-investir/) respondem 200 com XML válido
--   mas com ZERO <item> — o InfoMoney não popula os feeds por seção. Eles
--   entram aqui INATIVOS para registro; o InfoMoney só serve pelo feed geral
--   (https://www.infomoney.com.br/feed/), que já existe na central na
--   categoria 'financas' (Crédito.vc). Os substitutos ativos de negócios e
--   economia são NeoFeed, Brazil Journal e Gazeta do Povo — Economia.
--   As 3 fontes extras de turismo também nascem inativas: são sugestão, não
--   pedido (ative no painel ou pelo UPDATE comentado no fim deste arquivo).
--
-- Matcher do blog: name ILIKE '%comandante%' OR domain ILIKE '%comandante%'.
--
-- Uso (VPS, /opt/sp011):
--   DBURL=$(grep -m1 '^CENTRAL_DATABASE_URL=' .env.central | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
--   docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 < deploy/ocomandante/sources_ocomandante.sql
--
-- Nenhum restart é necessário: collector/distributor releem fontes e regras
-- a cada ciclo.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Aborta se o blog não estiver cadastrado no painel central
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM blogs
    WHERE name ILIKE '%comandante%' OR domain ILIKE '%comandante%'
  ) THEN
    RAISE EXCEPTION 'Blog O Comandante nao encontrado em blogs — cadastre-o no painel central (Blogs -> Novo) antes de rodar este script.';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1) Fontes RSS (upsert por URL — não toca em fonte que já exista)
-- -----------------------------------------------------------------------------
WITH new_sources(name, url, category, active, schedule_hours) AS (
  VALUES
    -- Aviação (as 6 fontes indicadas; as 3 últimas publicam em inglês e são
    -- reescritas direto em pt-BR pelo prompt padrão)
    ('Aero Magazine',              'https://aeromagazine.uol.com.br/feed/',                    'oc-aviacao',   true,  2),
    ('Airway',                     'https://www.airway.com.br/feed.xml',                       'oc-aviacao',   true,  2),
    ('Aeroflap',                   'https://www.aeroflap.com.br/feed/',                        'oc-aviacao',   true,  2),
    ('FlightGlobal',               'https://www.flightglobal.com/feed',                        'oc-aviacao',   true,  3),
    ('FLYING Magazine',            'https://www.flyingmag.com/feed',                           'oc-aviacao',   true,  3),
    ('Simple Flying',              'https://simpleflying.com/feed',                            'oc-aviacao',   true,  3),

    -- Turismo (a 1a foi indicada; as 3 seguintes são sugestão e nascem INATIVAS)
    ('Forbes Brasil - Turismo de Luxo', 'https://forbes.com.br/noticias-sobre/turismo-de-luxo/feed/', 'oc-turismo', true,  3),
    ('PANROTAS',                   'https://www.panrotas.com.br/feed',                         'oc-turismo',   false, 3),
    ('Mercado & Eventos',          'https://www.mercadoeeventos.com.br/feed/',                 'oc-turismo',   false, 3),
    ('Melhores Destinos',          'https://www.melhoresdestinos.com.br/feed',                 'oc-turismo',   false, 3),

    -- Negócios (substitutos ativos + o feed pedido, vazio na origem)
    ('NeoFeed',                    'https://neofeed.com.br/feed/',                             'oc-negocios',  true,  2),
    ('Brazil Journal',             'https://braziljournal.com/feed/',                          'oc-negocios',  true,  2),
    ('InfoMoney - Business',       'https://www.infomoney.com.br/business/feed/',              'oc-negocios',  false, 2),

    -- Economia (substituto ativo + os 2 feeds pedidos, vazios na origem)
    ('Gazeta do Povo - Economia',  'https://www.gazetadopovo.com.br/feed/rss/economia.xml',    'oc-economia',  true,  2),
    ('InfoMoney - Economia',       'https://www.infomoney.com.br/economia/feed/',              'oc-economia',  false, 2),
    ('InfoMoney - Onde Investir',  'https://www.infomoney.com.br/onde-investir/feed/',         'oc-economia',  false, 2)
),
ins AS (
  INSERT INTO central_sources
    (id, name, url, category, active, schedule_hours, fetch_limit, give_credit, custom_prompt, language)
  SELECT gen_random_uuid()::text, ns.name, ns.url, ns.category, ns.active,
         ns.schedule_hours, 1, true, NULL, 'pt-BR'
  FROM new_sources ns
  WHERE NOT EXISTS (SELECT 1 FROM central_sources cs WHERE cs.url = ns.url)
  RETURNING 1
)
SELECT (SELECT count(*) FROM ins) AS fontes_novas_cadastradas;

-- -----------------------------------------------------------------------------
-- 2) Blog: idioma pt-BR (nunca traduz) + taxonomia das 4 editorias
--    A taxonomia fica de reserva: com targetCategory na regra, a classificação
--    por IA não roda (localization.ts: needsClassification exige target vazio).
-- -----------------------------------------------------------------------------
UPDATE blogs SET language = 'pt-BR', updated_at = now()
WHERE (name ILIKE '%comandante%' OR domain ILIKE '%comandante%')
  AND language <> 'pt-BR';

UPDATE blogs SET categories = '[
  {"slug":"negocios","hint":"empresas, fusões e aquisições, startups, balanços e resultados, varejo, gestão, carreira executiva"},
  {"slug":"economia","hint":"macroeconomia, Selic e juros, inflação, câmbio, PIB, impostos e reforma tributária, emprego, contas públicas"},
  {"slug":"aviacao","hint":"companhias aéreas, aeroportos, aeronaves, ANAC, malha aérea, fabricantes (Embraer, Boeing, Airbus), aviação executiva"},
  {"slug":"turismo","hint":"destinos, hotelaria, agências e operadoras, cruzeiros, pacotes e passagens, eventos do trade de viagens"}
]'::jsonb, updated_at = now()
WHERE (name ILIKE '%comandante%' OR domain ILIKE '%comandante%')
  AND (categories IS NULL OR jsonb_array_length(categories) = 0);

-- Teto diário e espaçamento — só preenche se estiverem vazios
UPDATE blogs SET max_posts_per_day = 24, updated_at = now()
WHERE (name ILIKE '%comandante%' OR domain ILIKE '%comandante%')
  AND max_posts_per_day IS NULL;

UPDATE blogs SET min_minutes_between_posts = 30, updated_at = now()
WHERE (name ILIKE '%comandante%' OR domain ILIKE '%comandante%')
  AND min_minutes_between_posts IS NULL;

-- -----------------------------------------------------------------------------
-- 3) Regras base: uma por editoria, com categoria FIXA (sem IA)
-- -----------------------------------------------------------------------------
INSERT INTO distribution_rules (id, blog_id, name, is_active, priority, categories_include, target_category)
SELECT gen_random_uuid()::text, b.id, v.rule_name, true, v.priority, v.cats::jsonb, v.target
FROM blogs b
CROSS JOIN (VALUES
  ('O Comandante - Aviação',  10, '["oc-aviacao"]',  'aviacao'),
  ('O Comandante - Turismo',  10, '["oc-turismo"]',  'turismo'),
  ('O Comandante - Negócios', 10, '["oc-negocios"]', 'negocios'),
  ('O Comandante - Economia', 10, '["oc-economia"]', 'economia')
) AS v(rule_name, priority, cats, target)
WHERE (b.name ILIKE '%comandante%' OR b.domain ILIKE '%comandante%')
  AND NOT EXISTS (
    SELECT 1 FROM distribution_rules r WHERE r.blog_id = b.id AND r.name = v.rule_name
  );

-- -----------------------------------------------------------------------------
-- 4) Blinda o catch-all do sp011 contra as 4 categorias de fonte novas
--    (regra com categories_include vazio casa TUDO)
-- -----------------------------------------------------------------------------
UPDATE distribution_rules r
SET categories_exclude = COALESCE(r.categories_exclude, '[]'::jsonb)
      || '["oc-aviacao","oc-turismo","oc-negocios","oc-economia"]'::jsonb
FROM blogs b
WHERE b.id = r.blog_id
  AND (b.name ILIKE '%sp011%' OR b.domain ILIKE '%sp011%')
  AND (r.categories_include IS NULL OR jsonb_array_length(r.categories_include) = 0)
  AND NOT (COALESCE(r.categories_exclude, '[]'::jsonb) ? 'oc-aviacao');

COMMIT;

-- -----------------------------------------------------------------------------
-- 5) Estado final para conferência
-- -----------------------------------------------------------------------------
\echo ''
\echo '=== BLOG O COMANDANTE ==='
SELECT id, name, domain, api_url, language, is_active, require_approval,
       delivery_mode, max_posts_per_day, min_minutes_between_posts, status,
       categories
FROM blogs
WHERE name ILIKE '%comandante%' OR domain ILIKE '%comandante%';

\echo ''
\echo '=== FONTES DO O COMANDANTE (ativas primeiro) ==='
SELECT category, name, active, schedule_hours, url
FROM central_sources
WHERE category LIKE 'oc-%'
ORDER BY active DESC, category, name;

\echo ''
\echo '=== REGRAS DE DISTRIBUICAO (todos os blogs) ==='
\echo 'Confira se algum OUTRO blog tem regra catch-all (includes vazios) SEM as'
\echo 'categorias oc-* no categories_exclude — ela receberia essas noticias tambem.'
SELECT b.name AS blog, r.name AS regra, r.is_active, r.priority,
       r.categories_include, r.keywords_include, r.categories_exclude,
       r.target_category
FROM distribution_rules r
JOIN blogs b ON b.id = r.blog_id
ORDER BY b.name, r.priority DESC, r.name;

-- -----------------------------------------------------------------------------
-- Para ativar as 3 fontes de turismo sugeridas (PANROTAS, M&E, Melhores
-- Destinos), rode a linha abaixo — ou ligue no painel, em Fontes:
--
--   UPDATE central_sources SET active = true WHERE category = 'oc-turismo';
--
-- Os 3 feeds de seção do InfoMoney seguem vazios na origem: só ative depois
-- de conferir que voltaram a publicar itens, com
--   curl -s https://www.infomoney.com.br/economia/feed/ | grep -c '<item'
-- -----------------------------------------------------------------------------
