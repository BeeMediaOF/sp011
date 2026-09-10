-- =============================================================================
-- Faro de Jogo — 15 feeds da Gazeta Esportiva (clubes + campeonatos + basquete)
-- + editoria "Campeonato Brasileiro" na taxonomia da central
-- =============================================================================
-- Roda no banco CENTRAL. Idempotente — rodar 2x é seguro.
--
-- O que faz:
--   1. Cadastra 16 fontes em `central_sources` (as 15 pedidas + 1 substituta do
--      Internacional, cujo feed oficial está congelado — ver nota abaixo), com a
--      primeira coleta ESCALONADA.
--   2. Acrescenta 'campeonato-brasileiro' à taxonomia do Faro de Jogo (a lista
--      que a IA usa para classificar as fontes genéricas dentro do menu).
--   3. Cria 5 regras de distribuição — SÓ do Faro de Jogo.
--   4. Blinda o catch-all do sp011 contra as 5 categorias de fonte novas.
--   5. Imprime o estado final para conferência.
--
-- ─── POR QUE CATEGORIAS DE FONTE PRÓPRIAS ────────────────────────────────────
-- `central_sources` é COMPARTILHADA por toda a rede; quem separa é a REGRA.
-- Os OITO blogs de esporte pt-BR criam a mesma regra ["futebol"] -> 'futebol'
-- (esporteagora/sources_pt.sql:116 e as gêmeas em resenhavip, oleysports,
-- beeesportes, apostaganha, recebabet, cassinobet e no próprio farodejogo).
-- Cadastrar estes feeds como 'futebol' os entregaria aos 8 domínios de uma vez —
-- o cenário de conteúdo duplicado que o CLAUDE.md §19.12 aponta como suspeito
-- nº 1 do flag de Safe Browsing do Resenha Vip. 'outros' seria pior ainda: é o
-- balde de todos os irmãos.
-- Daí as 5 categorias novas com prefixo do blog — 'fj-clubes', 'fj-brasileirao',
-- 'fj-copa-do-brasil', 'fj-laliga', 'fj-basquete' — que HOJE só o Faro de Jogo
-- nomeia em regra. O prefixo segue o precedente do 'oc-*' do O Comandante: sem
-- ele, 'basquete' e 'laliga' seriam termos genéricos disputáveis por outro blog.
-- Para dar qualquer uma delas a outro blog depois, basta uma regra nova lá.
--
-- ─── DESTINO DE CADA GRUPO (editoria do blog) ────────────────────────────────
--   fj-clubes        (12 feeds)  → futebol
--   fj-brasileirao   ( 1 feed )  → campeonato-brasileiro   <- editoria nova
--   fj-copa-do-brasil( 1 feed )  → futebol
--   fj-laliga        ( 1 feed )  → futebol
--   fj-basquete      ( 1 feed )  → outros
-- Trocar um destino é um UPDATE em distribution_rules.target_category.
-- ⚠️ `target_category` NÃO é validado contra a taxonomia do blog em ponto nenhum
-- da central (localization.ts:58, deliberado por causa do sp011). Um slug com
-- erro de digitação atravessa tudo e vira página órfã indexável no sitemap — o
-- incidente 'otros' do credito.vc. O passo 5 imprime a taxonomia para conferir.
--
-- ─── CADÊNCIA E ESCALONAMENTO (medidos em 2026-09-10) ────────────────────────
-- `fetch_limit` = itens NOVOS por coleta; `schedule_hours` = intervalo.
-- Os feeds de clube publicam o dia inteiro: a 1h/1 item cada, sozinhos jogariam
-- ~264 notícias/dia na fila de reescrita — que é UMA lane serial da rede inteira
-- quando o provider é o Ollama (rewriter.ts: slots=1). Fonte nova do Faro de
-- Jogo atrasa a publicação dos outros 10 blogs na proporção do que trouxer.
-- Por isso: clubes em 6h (~44/dia), Brasileirão — a editoria nova — em 2h/2
-- itens (~24/dia), Copa do Brasil e La Liga em 6h, Basquete em 12h (o feed
-- publica ~1x/semana). Total ≈ 78/dia. Para acelerar depois:
--   UPDATE central_sources SET schedule_hours = 3 WHERE category = 'fj-clubes';
-- O `last_fetched_at` nasce ESCALONADO (coluna `atraso_min`) porque o collector
-- ordena as devidas por `last_fetched_at ASC` com `?? 0`: fonte nunca coletada
-- fura a fila de TODAS as outras. Sem o escalonamento, as 16 entrariam juntas no
-- primeiro ciclo e consumiriam o orçamento antes das 16 fontes compartilhadas
-- dos irmãos — 7 blogs de esporte passariam um ciclo sem material, sem erro
-- nenhum registrado. Com ele, 3 fontes vencem no primeiro ciclo e o resto se
-- distribui ao longo do intervalo.
--
-- ─── FEED CONGELADO DO INTERNACIONAL ─────────────────────────────────────────
-- Conferido em 2026-09-10: /times/internacional/feed/ responde 200 com 16 itens,
-- mas TODOS são de maio — o mais novo é de 26/05/2026, enquanto a página do time
-- seguia com notícia de 06/09. O feed é que parou, não o site. Ele entra
-- cadastrado e INATIVO (fica no painel para religar se a Gazeta consertar) e o
-- Inter é coberto por /tag/internacional/feed/, que tinha item de 08/09/2026.
-- Os outros 14 feeds tinham item de 09 ou 10/09/2026.
--
-- Uso (VPS, /opt/sp011):
--   DBURL=$(grep -m1 '^CENTRAL_DATABASE_URL=' .env.central | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
--   docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 < deploy/farodejogo/sources_gazeta.sql
--
-- Nenhum restart: collector e distributor releem fontes e regras a cada ciclo.
-- Depois de rodar, clicar "Fontes" no card do blog no painel central (§13) —
-- sem isso o painel de fontes do próprio blog não lista os feeds novos.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Aborta se o blog não estiver cadastrado no painel central. Sem as regras, as
-- fontes seriam coletadas E reescritas (custo de IA) e morreriam em
-- `news_items.status='distributed'` com ZERO entregas, sem um log de aviso.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM blogs WHERE name ILIKE '%faro%de%jogo%' OR domain ILIKE '%farodejogo%'
  ) THEN
    RAISE EXCEPTION 'Blog Faro de Jogo nao encontrado em blogs — cadastre-o no painel central (Blogs -> Novo) antes de rodar este script.';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1) Fontes (insere por URL — nunca duplica, nunca sobrescreve ajuste do painel)
-- -----------------------------------------------------------------------------
WITH new_sources(name, url, category, active, schedule_hours, fetch_limit, atraso_min) AS (
  VALUES
    ('Gazeta - Corinthians',           'https://www.gazetaesportiva.com/times/corinthians/feed/',             'fj-clubes',         true,   6, 1, 360),
    ('Gazeta - Flamengo',              'https://www.gazetaesportiva.com/times/flamengo/feed/',                'fj-clubes',         true,   6, 1, 330),
    ('Gazeta - São Paulo',             'https://www.gazetaesportiva.com/times/sao-paulo/feed/',               'fj-clubes',         true,   6, 1, 300),
    ('Gazeta - Palmeiras',             'https://www.gazetaesportiva.com/times/palmeiras/feed/',               'fj-clubes',         true,   6, 1, 270),
    ('Gazeta - Santos',                'https://www.gazetaesportiva.com/times/santos/feed/',                  'fj-clubes',         true,   6, 1, 240),
    ('Gazeta - Grêmio',                'https://www.gazetaesportiva.com/times/gremio/feed/',                  'fj-clubes',         true,   6, 1, 210),
    ('Gazeta - Vasco',                 'https://www.gazetaesportiva.com/times/vasco/feed/',                   'fj-clubes',         true,   6, 1, 180),
    ('Gazeta - Fluminense',            'https://www.gazetaesportiva.com/times/fluminense/feed/',              'fj-clubes',         true,   6, 1, 150),
    ('Gazeta - Atlético-MG',           'https://www.gazetaesportiva.com/times/atletico-mg/feed/',             'fj-clubes',         true,   6, 1, 120),
    ('Gazeta - Botafogo',              'https://www.gazetaesportiva.com/times/botafogo/feed/',                'fj-clubes',         true,   6, 1,  90),
    ('Gazeta - Internacional (tag)',   'https://www.gazetaesportiva.com/tag/internacional/feed/',             'fj-clubes',         true,   6, 1,  60),
    ('Gazeta - Internacional',         'https://www.gazetaesportiva.com/times/internacional/feed/',           'fj-clubes',         false,  6, 1,   0),
    ('Gazeta - Campeonato Brasileiro', 'https://www.gazetaesportiva.com/campeonatos/brasileiro-serie-a/feed/','fj-brasileirao',    true,   2, 2, 120),
    ('Gazeta - Copa do Brasil',        'https://www.gazetaesportiva.com/campeonatos/copa-do-brasil/feed/',    'fj-copa-do-brasil', true,   6, 1, 300),
    ('Gazeta - La Liga',               'https://www.gazetaesportiva.com/campeonatos/laliga/feed/',            'fj-laliga',         true,   6, 1, 240),
    ('Gazeta - Basquete',              'https://www.gazetaesportiva.com/mais-esportes/basquete/feed/',        'fj-basquete',       true,  12, 1, 720)
),
ins AS (
  INSERT INTO central_sources
    (id, name, url, category, active, schedule_hours, fetch_limit, give_credit,
     custom_prompt, language, last_fetched_at)
  SELECT gen_random_uuid()::text, ns.name, ns.url, ns.category, ns.active,
         ns.schedule_hours, ns.fetch_limit, true, NULL, 'pt-BR',
         now() - make_interval(mins => ns.atraso_min)
  FROM new_sources ns
  WHERE NOT EXISTS (SELECT 1 FROM central_sources cs WHERE cs.url = ns.url)
  RETURNING 1
)
SELECT (SELECT count(*) FROM ins) AS fontes_novas_cadastradas;

-- -----------------------------------------------------------------------------
-- 2) Taxonomia: acrescenta 'campeonato-brasileiro' à lista do Faro de Jogo
--    (só se ainda não estiver lá — preserva a ordem e o resto da lista)
-- -----------------------------------------------------------------------------
-- O `jsonb_typeof(...) = 'array'` não é decoração: em coluna que não seja array,
-- o `||` faria uma fusão de objetos em silêncio e o jsonb_array_elements do
-- NOT EXISTS abortaria o script.
UPDATE blogs
SET categories = (CASE WHEN jsonb_typeof(categories) = 'array' THEN categories ELSE '[]'::jsonb END)
      || '[{"slug":"campeonato-brasileiro","hint":"Campeonato Brasileiro Serie A (Brasileirao) — rodadas, tabela e clubes da Serie A"}]'::jsonb,
    updated_at = now()
WHERE (name ILIKE '%faro%de%jogo%' OR domain ILIKE '%farodejogo%')
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(categories) = 'array' THEN categories ELSE '[]'::jsonb END) c
    WHERE c->>'slug' = 'campeonato-brasileiro'
  );

-- -----------------------------------------------------------------------------
-- 3) Regras de distribuição — SÓ do Faro de Jogo
-- -----------------------------------------------------------------------------
INSERT INTO distribution_rules (id, blog_id, name, is_active, priority, categories_include, target_category)
SELECT gen_random_uuid()::text, b.id, v.rule_name, true, v.priority, v.cats::jsonb, v.target
FROM blogs b
CROSS JOIN (VALUES
  ('Faro de Jogo - Clubes brasileiros',    10, '["fj-clubes"]',         'futebol'),
  ('Faro de Jogo - Campeonato Brasileiro', 10, '["fj-brasileirao"]',    'campeonato-brasileiro'),
  ('Faro de Jogo - Copa do Brasil',        10, '["fj-copa-do-brasil"]', 'futebol'),
  ('Faro de Jogo - La Liga',               10, '["fj-laliga"]',         'futebol'),
  ('Faro de Jogo - Basquete',              10, '["fj-basquete"]',       'outros')
) AS v(rule_name, priority, cats, target)
WHERE (b.name ILIKE '%faro%de%jogo%' OR b.domain ILIKE '%farodejogo%')
  AND NOT EXISTS (
    SELECT 1 FROM distribution_rules r WHERE r.blog_id = b.id AND r.name = v.rule_name
  );

-- -----------------------------------------------------------------------------
-- 4) Blinda o catch-all do sp011 (regra com categories_include vazio casa TUDO)
--    Este é o ÚNICO catch-all verdadeiro da rede, e ele não existe em .sql
--    nenhum — foi criado pelo painel. O passo 5 imprime o estado real dele.
-- -----------------------------------------------------------------------------
UPDATE distribution_rules r
SET categories_exclude = COALESCE(r.categories_exclude, '[]'::jsonb)
      || '["fj-clubes","fj-brasileirao","fj-copa-do-brasil","fj-laliga","fj-basquete"]'::jsonb,
    updated_at = now()
FROM blogs b
WHERE b.id = r.blog_id
  AND (b.name ILIKE '%sp011%' OR b.domain ILIKE '%sp011%')
  AND (r.categories_include IS NULL OR jsonb_array_length(r.categories_include) = 0)
  AND NOT (COALESCE(r.categories_exclude, '[]'::jsonb) ? 'fj-clubes');

COMMIT;

-- -----------------------------------------------------------------------------
-- 5) Estado final para conferência
-- -----------------------------------------------------------------------------
\echo ''
\echo '=== FONTES NOVAS (ativas primeiro; proxima_coleta negativa = ja vencida) ==='
SELECT category, name, active, schedule_hours AS h, fetch_limit AS lim,
       round(extract(epoch FROM (last_fetched_at + make_interval(hours => schedule_hours) - now())) / 60)::int
         AS proxima_coleta_min,
       url
FROM central_sources
WHERE category LIKE 'fj-%'
ORDER BY category, active DESC, name;

\echo ''
\echo '=== TAXONOMIA DO FARO DE JOGO ==='
\echo 'PRECISA conter campeonato-brasileiro, e com o slug IDENTICO ao que a'
\echo 'regra usa como target — a central nao valida isso em lugar nenhum.'
SELECT name, domain, language, is_active, max_posts_per_day, min_minutes_between_posts,
       jsonb_pretty(categories) AS categorias
FROM blogs
WHERE name ILIKE '%faro%de%jogo%' OR domain ILIKE '%farodejogo%';

\echo ''
\echo '=== CATCH-ALL DO sp011: O QUE ELE JA EXCLUI ==='
\echo 'As 5 categorias fj-* tem de aparecer aqui. Se esta consulta nao devolver'
\echo 'LINHA NENHUMA, o sp011 nao tem catch-all e nao ha nada a blindar.'
SELECT b.name AS blog, r.name AS regra, r.is_active,
       jsonb_pretty(r.categories_exclude) AS exclui
FROM distribution_rules r
JOIN blogs b ON b.id = r.blog_id
WHERE (b.name ILIKE '%sp011%' OR b.domain ILIKE '%sp011%')
  AND (r.categories_include IS NULL OR jsonb_array_length(r.categories_include) = 0);

\echo ''
\echo '=== QUEM RECEBE AS 5 CATEGORIAS NOVAS ==='
\echo 'So o Faro de Jogo pode aparecer aqui. Outro blog na lista = a regra dele'
\echo 'nomeia a categoria (ou e catch-all sem o exclude) e vai receber tambem.'
SELECT b.name AS blog, r.name AS regra, r.is_active, r.priority,
       r.categories_include, r.categories_exclude, r.target_category
FROM distribution_rules r
JOIN blogs b ON b.id = r.blog_id
WHERE r.is_active
  AND (
    r.categories_include ?| ARRAY['fj-clubes','fj-brasileirao','fj-copa-do-brasil','fj-laliga','fj-basquete']
    OR (
      (r.categories_include IS NULL OR jsonb_array_length(r.categories_include) = 0)
      AND NOT (COALESCE(r.categories_exclude, '[]'::jsonb) ? 'fj-clubes')
    )
  )
ORDER BY b.name, r.priority DESC, r.name;

\echo ''
\echo '=== CADENCIA: TETO DE ITENS NOVOS POR DIA DESTES FEEDS ==='
SELECT category,
       count(*) FILTER (WHERE active) AS fontes_ativas,
       sum(CASE WHEN active AND schedule_hours > 0
                THEN (24.0 / schedule_hours) * COALESCE(fetch_limit, 1)
                ELSE 0 END)::int      AS itens_dia_max
FROM central_sources
WHERE category LIKE 'fj-%'
GROUP BY ROLLUP (category)
ORDER BY category NULLS LAST;
