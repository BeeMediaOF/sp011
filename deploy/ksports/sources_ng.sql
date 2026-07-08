-- =============================================================================
-- KSports — Fontes RSS da Nigéria + poda das fontes EN (ficam só as famosas)
--
-- O que faz (idempotente — pode rodar quantas vezes quiser):
--   1) Cadastra as fontes nigerianas abaixo (language='en', 1 notícia/1h,
--      crédito ligado). O prompt EN é copiado de uma fonte EN já cadastrada —
--      na primeira vez rode o sources_en.sql ANTES (ele também corrige depois:
--      o UPDATE dele cobre todas as fontes language='en').
--   2) Garante todas as fontes desta lista ATIVAS.
--   3) Desliga as demais fontes EN, preservando só as mais famosas
--      (BBC, The Guardian, Sky Sports, F1 oficial e BBC World Cup — Copa em
--      andamento).
--
-- Uso (na VPS, em /opt/sp011):
--   DBURL=$(grep -m1 '^CENTRAL_DATABASE_URL=' .env.central | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
--   docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 < deploy/ksports/sources_ng.sql
-- =============================================================================

WITH enprompt AS (
  SELECT cs.custom_prompt AS p
  FROM central_sources cs
  WHERE cs.language = 'en' AND cs.custom_prompt IS NOT NULL
  ORDER BY cs.name
  LIMIT 1
),
ng_sources(name, url, category) AS (
  VALUES
    -- Nigéria (a maioria é multi-esporte → 'others': a regra Others entrega e
    -- a IA classifica na seção certa do menu; futebol dedicado vai direto).
    ('Daily Post Nigeria',                 'https://dailypost.ng/feed/',                                          'others'),
    ('BBC Sport - Nigeria (Super Eagles)', 'https://feeds.bbci.co.uk/sport/football/teams/nigeria/rss.xml',       'football'),
    ('BBC Sport - Top Stories',            'https://feeds.bbci.co.uk/sport/rss.xml',                              'others'),
    ('Nigerian Embassy Korea - Sports',    'http://www.nigerianembassy.or.kr/sports/feed/',                       'others'),
    ('Punch Nigeria - Sports',             'https://punchng.com/topics/sports/feed/',                             'others'),
    ('Vanguard Nigeria - Sports',          'https://www.vanguardngr.com/category/sports/feed/',                   'others'),
    ('The Guardian Nigeria - Sport',       'https://guardian.ng/category/sport/feed/',                            'others'),
    ('The Nation Nigeria - Sports',        'https://thenationonlineng.net/sports/feed/',                          'others'),
    ('Sports247 Nigeria',                  'https://www.sports247.ng/category/nigeria-sports-news-nigeria/feed/', 'others')
),
ins AS (
  INSERT INTO central_sources
    (id, name, url, category, active, schedule_hours, fetch_limit, give_credit, custom_prompt, language)
  SELECT gen_random_uuid()::text, ns.name, ns.url, ns.category, true,
         1, 1, true, (SELECT p FROM enprompt), 'en'
  FROM ng_sources ns
  WHERE NOT EXISTS (SELECT 1 FROM central_sources cs WHERE cs.url = ns.url)
  RETURNING 1
),
-- Fontes da lista que já existiam (ex.: BBC Top Stories): garante ativas.
-- (CTEs não enxergam as linhas do ins — que já nascem ativas.)
on_ng AS (
  UPDATE central_sources cs
  SET active = true
  WHERE cs.url IN (SELECT url FROM ng_sources)
    AND cs.active IS DISTINCT FROM true
  RETURNING 1
),
-- Poda: desliga as demais EN, preservando as mais famosas.
off_en AS (
  UPDATE central_sources cs
  SET active = false
  WHERE cs.language = 'en'
    AND cs.active = true
    AND cs.url NOT IN (SELECT url FROM ng_sources)
    AND cs.name NOT IN (
      'BBC Sport - World Cup',
      'BBC Sport - Football',
      'The Guardian - Sport',
      'Sky Sports - News',
      'Formula 1 (site oficial)'
    )
  RETURNING 1
)
SELECT (SELECT count(*) FROM ins)    AS fontes_ng_cadastradas,
       (SELECT count(*) FROM on_ng)  AS fontes_religadas,
       (SELECT count(*) FROM off_en) AS fontes_en_desligadas;

-- Conferência: fontes EN ativas após o script
SELECT name, category, fetch_limit, schedule_hours
FROM central_sources
WHERE language = 'en' AND active = true
ORDER BY category, name;
