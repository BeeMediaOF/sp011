-- =============================================================================
-- PontoFarma — fontes do setor farmacêutico + taxonomia + regras
-- =============================================================================
-- O que faz (idempotente — rodar 2x é seguro):
--   1. Garante as 10 fontes da tabela da proposta em `central_sources`
--      (upsert por URL): 8 do setor com category='farmacia' (categoria de
--      fonte NOVA na rede, para NÃO casar com as regras "outros" dos blogs
--      de esporte) + G1 Economia e Agência Brasil (Economia) com
--      category='financas' (compartilhadas com o Crédito.vc — upsert é
--      no-op se o sources_financas.sql já rodou). As notícias 'financas' só
--      chegam ao PontoFarma pela regra de palavra-chave (3b) — sem ela o
--      blog receberia o noticiário macro inteiro.
--      ICTQ e Portal Contábeis entram com active=false ("validar endpoint"
--      na proposta) — teste o feed no navegador e ative no painel central.
--   2. Blog PontoFarma: language='pt-BR' + taxonomia (categories) — só grava
--      as categorias se ainda estiverem vazias.
--   3. Regras de distribuição:
--      a) fonte 'farmacia' → PontoFarma sem targetCategory (IA classifica
--         cada notícia dentro do menu do blog; pt→pt nunca traduz);
--      b) fonte 'financas' (G1 Economia/Agência Brasil e, quando o
--         creditovc subir, os demais feeds de economia) filtrada por
--         palavra-chave (farmác/anvisa/medicament/reforma tributária/...) —
--         é como o PontoFarma pega as pautas de Reforma Tributária/CBS e
--         CMED do noticiário macro, o maior gancho da proposta, sem
--         receber o noticiário econômico inteiro.
--   4. Acrescenta 'farmacia' ao categories_exclude do catch-all do sp011 —
--      SEM isso o catch-all (include vazio casa tudo) despejaria notícia
--      B2B de farmácia no sp011.
--   5. Imprime o estado final (blog, regras, fontes) para conferência.
--
-- Matcher do blog: name ILIKE '%farma%' OR domain ILIKE '%pontofarma%'
-- (nenhum outro blog da rede tem "farma" no nome/domínio).
--
-- Uso (VPS, /opt/sp011):
--   DBURL=$(grep -m1 '^CENTRAL_DATABASE_URL=' .env.central | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
--   docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 < deploy/pontofarma/sources_farma.sql
--
-- Nenhum restart é necessário: collector/distributor releem fontes e regras
-- a cada ciclo.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Aborta se o blog PontoFarma não estiver cadastrado no painel central
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM blogs WHERE name ILIKE '%farma%' OR domain ILIKE '%pontofarma%'
  ) THEN
    RAISE EXCEPTION 'Blog PontoFarma nao encontrado em blogs — cadastre-o no painel central (Blogs -> Novo) antes de rodar este script.';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1) Fontes da tabela da proposta (upsert por URL)
--    ICTQ e Portal Contábeis nascem INATIVAS — a proposta pede validação do
--    endpoint; confira o feed e ative no painel central (Fontes).
--    G1 Economia e Agência Brasil (Economia) são as MESMAS do Crédito.vc
--    (category='financas') — manter nome/URL idênticos aos do
--    deploy/creditovc/sources_financas.sql para o upsert deduplicar.
-- -----------------------------------------------------------------------------
WITH new_sources(name, url, category, active, schedule_hours) AS (
  VALUES
    ('Guia da Farmácia',        'https://guiadafarmacia.com.br/feed/',                  'farmacia', true,  2),
    ('Panorama Farmacêutico',   'https://panoramafarmaceutico.com.br/feed/',            'farmacia', true,  2),
    ('Febrafar',                'https://febrafar.com.br/feed/',                        'farmacia', true,  2),
    ('Saúde Business',          'https://www.saudebusiness.com/feed/',                  'farmacia', true,  2),
    ('Medicina S/A',            'https://medicinasa.com.br/feed/',                      'farmacia', true,  2),
    ('Agência Brasil - Saúde',  'https://agenciabrasil.ebc.com.br/rss/saude/feed.xml',  'farmacia', true,  2),
    ('ICTQ (validar endpoint)', 'https://www.ictq.com.br/feed',                         'farmacia', false, 4),
    ('Portal Contábeis (validar endpoint)', 'https://www.contabeis.com.br/rss/',        'farmacia', false, 4),
    ('G1 Economia',             'https://g1.globo.com/rss/g1/economia/',                'financas', true,  1),
    ('Agência Brasil - Economia','https://agenciabrasil.ebc.com.br/rss/economia/feed.xml', 'financas', true, 2)
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
-- 2) Blog PontoFarma: idioma pt-BR (nunca traduz) + taxonomia p/ a IA
--    classificar cada notícia dentro do menu do blog
-- -----------------------------------------------------------------------------
UPDATE blogs SET language = 'pt-BR', updated_at = now()
WHERE (name ILIKE '%farma%' OR domain ILIKE '%pontofarma%') AND language <> 'pt-BR';

UPDATE blogs SET categories = '[
  {"slug":"gestao","hint":"gestão da farmácia: financeiro, precificação, CMV, margem, DRE, indicadores"},
  {"slug":"fiscal-tributario","hint":"impostos, Reforma Tributária, CBS/IBS, Simples Nacional, obrigações fiscais"},
  {"slug":"legislacao","hint":"ANVISA, SNGPC, RDCs, medicamentos controlados, boas práticas, compliance sanitário"},
  {"slug":"mercado","hint":"dados do setor, indústria farmacêutica, distribuidoras, laboratórios, redes, tendências"},
  {"slug":"vendas","hint":"vendas no balcão, ticket médio, mix de produtos, atendimento ao cliente"},
  {"slug":"equipe","hint":"liderança, treinamento, contratação, retenção e remuneração de equipe"},
  {"slug":"tecnologia","hint":"sistemas de gestão, ERP, automação, PDV, farmácia digital"},
  {"slug":"saude-categorias","hint":"categorias de produtos (dermocosméticos, MIPs, fitoterápicos, nutrição) e saúde pública que afeta a farmácia"},
  {"slug":"outros","hint":"o que não couber acima"}
]'::jsonb, updated_at = now()
WHERE (name ILIKE '%farma%' OR domain ILIKE '%pontofarma%')
  AND (categories IS NULL OR jsonb_array_length(categories) = 0);

-- -----------------------------------------------------------------------------
-- 3) Regras de distribuição
--    a) fonte do setor → PontoFarma (IA classifica no menu)
--    b) feeds de economia ('financas') filtrados por palavra-chave do setor
--       (substring no título+resumo, caixa ignorada) — Reforma Tributária,
--       ANVISA, CMED etc. vindos do noticiário macro
-- -----------------------------------------------------------------------------
INSERT INTO distribution_rules
  (id, blog_id, name, is_active, priority, categories_include, keywords_include, target_category)
SELECT gen_random_uuid()::text, b.id, v.rule_name, true, v.priority,
       v.cats::jsonb, v.keywords::jsonb, v.target
FROM blogs b
CROSS JOIN (VALUES
  ('PontoFarma - Setor farmacêutico (IA classifica)', 10, '["farmacia"]', NULL, NULL),
  ('PontoFarma - Tributário/economia (palavra-chave)', 8, '["financas"]',
   '["farmác","farmacêutic","medicament","anvisa","reforma tributária","simples nacional","cbs"]', NULL)
) AS v(rule_name, priority, cats, keywords, target)
WHERE (b.name ILIKE '%farma%' OR b.domain ILIKE '%pontofarma%')
  AND NOT EXISTS (
    SELECT 1 FROM distribution_rules r WHERE r.blog_id = b.id AND r.name = v.rule_name
  );

-- -----------------------------------------------------------------------------
-- 4) Blinda o catch-all do sp011: exclui as categorias de fonte 'farmacia' E
--    'financas' (regra com categories_include vazio casa TUDO — e este script
--    agora também cria fontes 'financas', mesmo sem o creditovc no ar)
-- -----------------------------------------------------------------------------
UPDATE distribution_rules r
SET categories_exclude = COALESCE(r.categories_exclude, '[]'::jsonb) || '["farmacia"]'::jsonb
FROM blogs b
WHERE b.id = r.blog_id
  AND (b.name ILIKE '%sp011%' OR b.domain ILIKE '%sp011%')
  AND (r.categories_include IS NULL OR jsonb_array_length(r.categories_include) = 0)
  AND NOT (COALESCE(r.categories_exclude, '[]'::jsonb) ? 'farmacia');

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
\echo '=== BLOG PONTOFARMA ==='
SELECT id, name, domain, api_url, language, is_active, require_approval,
       delivery_mode, max_posts_per_day, min_minutes_between_posts, status,
       categories
FROM blogs
WHERE name ILIKE '%farma%' OR domain ILIKE '%pontofarma%';

\echo ''
\echo '=== REGRAS DE DISTRIBUICAO (todos os blogs) ==='
\echo 'Confira se algum OUTRO blog tem regra catch-all (includes vazios) SEM'
\echo '"farmacia" no categories_exclude — ela receberia essas noticias tambem.'
SELECT b.name AS blog, r.name AS regra, r.is_active, r.priority,
       r.categories_include, r.sources_include, r.keywords_include,
       r.categories_exclude, r.target_category, r.target_tag
FROM distribution_rules r
JOIN blogs b ON b.id = r.blog_id
ORDER BY b.name, r.priority DESC, r.name;

\echo ''
\echo '=== FONTES DO PONTOFARMA (setor + economia compartilhada) ==='
SELECT category, name, active, schedule_hours, url
FROM central_sources
WHERE category IN ('farmacia', 'financas')
ORDER BY category, name;
