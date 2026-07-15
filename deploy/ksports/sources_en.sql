-- =============================================================================
-- KSports — fontes RSS internacionais (EN) + regras de distribuição
-- =============================================================================
-- O que faz (idempotente — rodar 2x é seguro):
--   1. Cadastra 33 fontes EN em `central_sources` (upsert por URL), com
--      category = slug do menu do KSports, language='en', prompt EN por fonte,
--      coleta 1-2h, 1 artigo/ciclo. Fontes EN JÁ cadastradas têm o
--      custom_prompt atualizado para a versão deste arquivo (active/fetch_limit/
--      schedule_hours ajustados no painel são preservados).
--   2. Blog ksports: language='en' + taxonomia (categories) — categorias só
--      são gravadas se ainda estiverem vazias (não sobrescreve edição manual).
--   3. Cria 8 regras de distribuição (1 por categoria, targetCategory
--      explícito, priority 10) + regra "Others" (priority 5, sem
--      targetCategory → a IA classifica no menu certo, fallback others).
--   4. Imprime o estado final (blog, regras, fontes) para conferência.
--
-- Uso (VPS, /opt/sp011):
--   DBURL=$(grep -m1 '^CENTRAL_DATABASE_URL=' .env.central | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
--   docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 < deploy/ksports/sources_en.sql
--
-- Nenhum restart é necessário: collector/distributor releem fontes e regras
-- a cada ciclo.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Aborta se o blog ksports não estiver cadastrado no painel central
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM blogs WHERE name ILIKE '%ksports%' OR domain ILIKE '%ksports%'
  ) THEN
    RAISE EXCEPTION 'Blog ksports nao encontrado em blogs — cadastre-o no painel antes de rodar este script.';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1) Fontes EN (URLs validadas em 2026-07-07; upsert por URL)
-- -----------------------------------------------------------------------------
WITH prompt AS (
  SELECT $ksprompt$## ROLE

You are a senior journalist specialized in producing news stories that rank on Google Discover and perform in SEO and AIO (optimization for AI answer engines such as ChatGPT, Gemini and Perplexity). You write in English (US) for sports fans around the world.

## TASK

From the story and source content below, write a 100% original, factual and easy-to-understand article. Do not copy sentences from the source: rewrite everything in your own editorial voice, preserving names, data and quotes with absolute accuracy.

Headline / Story: {{TITULO}}
Source: {{FONTE}}

Source content:
{{TEXTO}}

## INSTRUCTIONS

**TITLE (title):**
- Write a unique, direct and objective headline between 70 and 110 characters, with the strongest information right at the start. No filler, no rambling.
- Strategic, compelling style optimized for Google Discover, but no misleading clickbait: the headline must deliver exactly what the text contains. No ALL CAPS (except acronyms).
- NEVER use asterisks, markdown or any markup in the title, subtitle or body text: the *asterisk* highlight exists ONLY in the social_title field.
- Use only real English words: NEVER invent, merge or truncate words; when in doubt, use the exact word from the source.
- Acronyms always in their official uppercase form (NFL, FIFA, UEFA) and ALWAYS spelled the same way across all fields and articles.
- Include the target keyword and the most important entities of the story (people, clubs, leagues, places, brands, institutions).
- The headline must spark curiosity and speak to real interests of the sports audience.
- Under no circumstances repeat the title inside content_html.

**SUBTITLE (subtitle):**
- Write a subtitle of about 150 characters that complements the title with a NEW piece of information. Do not restate the title in other words.
- This same subtitle must open content_html inside an <h2> tag. The <h2> always goes inside content_html.

**IMAGE HEADLINE (social_title):** Analyze the FULL article and pick the strongest angle for the audience: the most surprising fact, number, deadline, consequence, conflict or quote — not necessarily the same angle as the blog title. Then write a punchy headline in the style of big Instagram news pages, active voice, present tense. This field is used ONLY on the social image.
- REQUIRED LENGTH: between 70 and 85 characters (10 to 13 words). NEVER under 70 — the artwork needs 3 full lines. NEVER over 90.
- Prioritize strong entities (names, clubs, leagues, cities) and complete the headline with the consequence of the fact (the "so what?").
- Compelling without misleading clickbait; everything promised must be in the article.
- NO ellipses, NEVER cut a word, do not end on a dangling preposition/article.
- Wrap with asterisks (*like this*) ONLY the strongest part of the headline (name, result, deadline, value or consequence). One short highlight only; never the whole headline or generic words.

**SOCIAL SUMMARY (social_summary):** 1–2 engaging sentences (max ~250 characters) to be used as the post caption. Spark curiosity, no hashtags, don't repeat the title verbatim.

**SOCIAL HASHTAGS (social_hashtags):** 4 to 8 relevant hashtags separated by spaces, each starting with # (no accents, no inner spaces). Mix trending terms with entities. Example: "#PremierLeague #Arsenal #football #EPL".

**CONTENT STRUCTURE (content_html):** follow exactly this order:
1. The subtitle inside <h2>.
2. Lead: 3 short introduction paragraphs presenting the main fact (who, what, when, where, why and how) and creating a hook for what the reader will find next. At the end of the lead, credit the source: "according to reporting by {{FONTE}}".
3. Body: at most 4 sections with <h3> subheadings, developing the story with context, data and quotes; each <h3> should contain a long-tail keyword related to the topic.
4. FAQ (required): final section titled <h2>Frequently Asked Questions</h2> with 3 to 5 Q&As as <h3>Question?</h3><p>Answer.</p>. Questions people would Google or ask an AI assistant; answers direct (1-3 sentences), rich in entities and keywords. This section increases the chance of appearing in Google AI Overview, People Also Ask and LLM answers.

Structural rules:
{{CREDITO}}
- Total length should stay close to the word count of the source content.
- Under no circumstances use <h1> inside content_html.
- Start directly with the content, no preambles, disclaimers or meta-comments.
- Prefer running text paragraphs. Use <ul><li> only when truly needed for clarity.

**READABILITY & STYLE:**
- Write short paragraphs, 150 to 250 characters each. Many paragraphs, all short.
- Clear, accessible, conversational English, the way sports fans actually talk. If a technical term is unavoidable, explain it in one simple sentence.
- Write so the reader stays engaged until the end: vary the rhythm, create hooks between sections and answer the questions the reader would naturally ask.
- Under no circumstances use em dashes (—) to separate sentences, mark speech or add emphasis. Always use commas, colons or parentheses.
- The text must not sound AI-generated: avoid canned phrases, artificial enthusiasm, mechanical lists and predictable structures.

**SEO, AIO & GOOGLE DISCOVER:**
- Use the target keyword in the title, in the subtitle and distributed naturally through the text. NEVER keyword-stuff: do not repeat the same keyword in consecutive sentences; vary with synonyms and semantic variations.
- Make heavy use of related keywords and semantically related (LSI) terms.
- Cite named entities precisely (full names, roles, places, dates, values), strengthening entity SEO.
- Prioritize usefulness and human interest (Google Discover criteria): make clear what changes for the fan, deadlines, numbers and next steps.
- Structure blocks that answer direct questions objectively in the first sentence of the paragraph: this makes it easier for LLMs to cite the content and for featured snippets.
- Bold the most important words, data and sentences using the HTML <b> tag. Under no circumstances use **, markdown or any non-HTML markup.

**QUOTES & DATA FROM THE SOURCE:**
- Extract direct quotes and statistics from the source, when available, and reproduce them with 100% fidelity to the original.
- Attribute the origin of the information correctly throughout the text. Under no circumstances write as if you were a reporter for the source outlet.
- Only use information present in the source content, never invent data.
- Quotes in other languages must be translated to English, keeping the exact meaning of the original statement.

**METADATA:**
- slug: kebab-case, MAXIMUM 5 significant words (ignore articles/prepositions), never more than 55 characters. Example: "arsenal-signs-star-striker-january".
- keywords: 8 relevant keywords separated by commas, including long-tail variations

## ABSOLUTE RULES
- Return EXCLUSIVELY valid JSON, no markdown, no ```json, no explanations before or after
- content_html must be publication-ready HTML (<h2>, <h3>, <p>, <b>, <em>, <ul>, <li>), no <html>, <body> or <script>
- The <h2> subtitle must be INSIDE content_html; the FAQ section too
- Start title and subtitle directly with the content, no prefixes

## RESPONSE (JSON only, direct, no code fences):
{
  "title": "...",
  "subtitle": "...",
  "social_title": "70-85 CHARACTER HEADLINE WITH *HIGHLIGHT* ON THE STRONGEST PART",
  "social_summary": "Short engaging summary for the post caption (1-2 sentences).",
  "social_hashtags": "#hashtag1 #hashtag2 #hashtag3 #hashtag4",
  "content_html": "<h2>...</h2><p>...</p>...<h2>Frequently Asked Questions</h2><h3>...?</h3><p>...</p>",
  "slug": "seo-title-kebab-case",
  "keywords": "kw1, kw2, kw3, kw4, kw5, kw6, kw7, kw8"
}$ksprompt$::text AS p
),
new_sources(name, url, category, schedule_hours) AS (
  VALUES
    -- World Cup (Copa 2026 em andamento)
    ('BBC Sport - World Cup',            'https://feeds.bbci.co.uk/sport/football/world-cup/rss.xml',  'world-cup',  1),
    ('The Guardian - World Cup 2026',    'https://www.theguardian.com/football/world-cup-2026/rss',    'world-cup',  1),
    -- Football (soccer)
    ('BBC Sport - Football',             'https://feeds.bbci.co.uk/sport/football/rss.xml',            'football',   1),
    ('The Guardian - Football',          'https://www.theguardian.com/football/rss',                   'football',   1),
    ('Sky Sports - Football',            'https://www.skysports.com/rss/11095',                        'football',   1),
    ('CBS Sports - Soccer',              'https://www.cbssports.com/rss/headlines/soccer/',            'football',   1),
    ('90min - Football',                 'https://www.90min.com/posts.rss',                            'football',   2),
    ('Mirror - Football',                'https://www.mirror.co.uk/sport/football/rss.xml',            'football',   2),
    ('Daily Mail - Football',            'https://www.dailymail.co.uk/sport/football/index.rss',       'football',   2),
    -- Volleyball
    ('Off the Block - NCAA Volleyball',  'https://offtheblockblog.com/feed/',                          'volleyball', 2),
    ('AVP Beach Volleyball',             'https://avp.com/feed/',                                      'volleyball', 2),
    -- Tennis (Wimbledon em andamento)
    ('BBC Sport - Tennis',               'https://feeds.bbci.co.uk/sport/tennis/rss.xml',              'tennis',     1),
    ('The Guardian - Tennis',            'https://www.theguardian.com/sport/tennis/rss',               'tennis',     1),
    ('Tennis365',                        'https://www.tennis365.com/feed',                             'tennis',     2),
    -- Formula 1
    ('Formula 1 (site oficial)',         'https://www.formula1.com/content/fom-website/en/latest/all.xml', 'formula-1', 1),
    ('BBC Sport - Formula 1',            'https://feeds.bbci.co.uk/sport/formula1/rss.xml',            'formula-1',  1),
    ('The Guardian - Formula 1',         'https://www.theguardian.com/sport/formulaone/rss',           'formula-1',  1),
    ('Sky Sports - Formula 1',           'https://www.skysports.com/rss/12433',                        'formula-1',  1),
    ('Motorsport.com - F1',              'https://www.motorsport.com/rss/f1/news/',                    'formula-1',  2),
    ('Autosport - F1',                   'https://www.autosport.com/rss/feed/f1',                      'formula-1',  2),
    -- NFL
    ('CBS Sports - NFL',                 'https://www.cbssports.com/rss/headlines/nfl/',               'nfl',        1),
    ('ProFootballTalk (NBC Sports)',     'https://profootballtalk.nbcsports.com/feed/',                'nfl',        1),
    ('Yahoo Sports - NFL',               'https://sports.yahoo.com/nfl/rss.xml',                       'nfl',        2),
    -- e-Sports
    ('Dexerto - Esports & Gaming',       'https://www.dexerto.com/feed/',                              'esports',    2),
    ('Esports Insider',                  'https://esportsinsider.com/feed',                            'esports',    2),
    -- Gerais/multi-esporte (regra Others → IA classifica no menu certo)
    ('BBC Sport - Top Stories',          'https://feeds.bbci.co.uk/sport/rss.xml',                     'others',     2),
    ('The Guardian - Sport',             'https://www.theguardian.com/uk/sport/rss',                   'others',     2),
    ('Sky Sports - News',                'https://www.skysports.com/rss/12040',                        'others',     2),
    ('Yahoo Sports - Top Stories',       'https://sports.yahoo.com/rss/',                              'others',     2),
    ('CBS Sports - Headlines',           'https://www.cbssports.com/rss/headlines/',                   'others',     2),
    ('The Independent - Sport',          'https://www.independent.co.uk/sport/rss',                    'others',     2),
    ('Daily Mail - Sport',               'https://www.dailymail.co.uk/sport/index.rss',                'others',     2),
    ('BBC Sport - Basketball',           'https://feeds.bbci.co.uk/sport/basketball/rss.xml',          'others',     2)
),
ins AS (
  INSERT INTO central_sources
    (id, name, url, category, active, schedule_hours, fetch_limit, give_credit, custom_prompt, language)
  SELECT gen_random_uuid()::text, ns.name, ns.url, ns.category, true,
         ns.schedule_hours, 1, true, prompt.p, 'en'
  FROM new_sources ns CROSS JOIN prompt
  WHERE NOT EXISTS (SELECT 1 FROM central_sources cs WHERE cs.url = ns.url)
  RETURNING 1
),
-- Fontes EN já cadastradas: re-rodar o script atualiza o prompt para a versão
-- acima (não mexe em active/fetch_limit/schedule_hours ajustados no painel).
upd AS (
  UPDATE central_sources cs
  SET custom_prompt = (SELECT p FROM prompt)
  WHERE cs.language = 'en'
    AND cs.custom_prompt IS DISTINCT FROM (SELECT p FROM prompt)
  RETURNING 1
)
SELECT (SELECT count(*) FROM ins) AS fontes_novas_cadastradas,
       (SELECT count(*) FROM upd) AS prompts_en_atualizados;

-- -----------------------------------------------------------------------------
-- 2) Blog ksports: idioma EN + taxonomia p/ classificação por IA
-- -----------------------------------------------------------------------------
UPDATE blogs SET language = 'en', updated_at = now()
WHERE (name ILIKE '%ksports%' OR domain ILIKE '%ksports%') AND language <> 'en';

UPDATE blogs SET categories = '[
  {"slug":"world-cup","hint":"FIFA World Cup"},
  {"slug":"football","hint":"club & international soccer"},
  {"slug":"volleyball","hint":"volleyball (indoor & beach)"},
  {"slug":"tennis","hint":"tennis (ATP, WTA, Grand Slams)"},
  {"slug":"formula-1","hint":"F1 / motorsport"},
  {"slug":"nfl","hint":"american football"},
  {"slug":"esports","hint":"competitive gaming / esports"},
  {"slug":"others","hint":"anything that does not fit the categories above (e.g. NBA, olympics, boxing)"}
]'::jsonb, updated_at = now()
WHERE (name ILIKE '%ksports%' OR domain ILIKE '%ksports%')
  AND (categories IS NULL OR jsonb_array_length(categories) = 0);

-- -----------------------------------------------------------------------------
-- 3) Regras de distribuição (categoria da fonte → seção do menu do KSports)
--    priority 10 garante que vencem qualquer regra antiga de priority 0.
-- -----------------------------------------------------------------------------
INSERT INTO distribution_rules (id, blog_id, name, is_active, priority, categories_include, target_category)
SELECT gen_random_uuid()::text, b.id, v.rule_name, true, v.priority, v.cats::jsonb, v.target
FROM blogs b
CROSS JOIN (VALUES
  ('KSports - World Cup',              10, '["world-cup"]',  'world-cup'),
  ('KSports - Football',               10, '["football"]',   'football'),
  ('KSports - Volleyball',             10, '["volleyball"]', 'volleyball'),
  ('KSports - Tennis',                 10, '["tennis"]',     'tennis'),
  ('KSports - Formula 1',              10, '["formula-1"]',  'formula-1'),
  ('KSports - NFL',                    10, '["nfl"]',        'nfl'),
  ('KSports - e-Sports',               10, '["esports"]',    'esports'),
  ('KSports - Others (IA classifica)',  5, '["others"]',     NULL)
) AS v(rule_name, priority, cats, target)
WHERE (b.name ILIKE '%ksports%' OR b.domain ILIKE '%ksports%')
  AND NOT EXISTS (
    SELECT 1 FROM distribution_rules r WHERE r.blog_id = b.id AND r.name = v.rule_name
  );

-- OPCIONAL (F6 — ativar depois de conferir o card "Tradução & Classificação"
-- nas Configurações): fontes PT de esportes → traduz + classifica p/ o ksports.
-- INSERT INTO distribution_rules (id, blog_id, name, is_active, priority, categories_include, target_category)
-- SELECT gen_random_uuid()::text, b.id, 'KSports - Esportes PT (traduz+classifica)', true, 5, '["esportes"]'::jsonb, NULL
-- FROM blogs b
-- WHERE (b.name ILIKE '%ksports%' OR b.domain ILIKE '%ksports%')
--   AND NOT EXISTS (SELECT 1 FROM distribution_rules r
--                   WHERE r.blog_id = b.id AND r.name = 'KSports - Esportes PT (traduz+classifica)');

COMMIT;

-- -----------------------------------------------------------------------------
-- 4) Estado final para conferência
-- -----------------------------------------------------------------------------
\echo ''
\echo '=== BLOG KSPORTS ==='
SELECT id, name, domain, api_url, language, is_active, require_approval,
       delivery_mode, max_posts_per_day, min_minutes_between_posts, status,
       categories
FROM blogs
WHERE name ILIKE '%ksports%' OR domain ILIKE '%ksports%';

\echo ''
\echo '=== REGRAS DE DISTRIBUICAO (todos os blogs) ==='
SELECT b.name AS blog, r.name AS regra, r.is_active, r.priority,
       r.categories_include, r.sources_include, r.keywords_include,
       r.categories_exclude, r.target_category, r.target_tag
FROM distribution_rules r
JOIN blogs b ON b.id = r.blog_id
ORDER BY b.name, r.priority DESC, r.name;

\echo ''
\echo '=== FONTES EN POR CATEGORIA ==='
SELECT category, count(*) AS fontes,
       bool_and(active) AS todas_ativas,
       bool_and(custom_prompt IS NOT NULL) AS com_prompt_en,
       bool_and(schedule_hours >= 1) AS coleta_automatica
FROM central_sources
WHERE language = 'en'
GROUP BY category
ORDER BY category;
