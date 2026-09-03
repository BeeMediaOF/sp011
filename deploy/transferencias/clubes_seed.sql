-- ============================================================================
-- Catálogo de clubes do módulo "Transferências" — 96 clubes
-- ============================================================================
--
-- Roda no banco DO BLOG (não no central). Idempotente: mescla por `id`, então
-- rodar de novo NÃO duplica clube e NÃO sobrescreve escudo já enviado pelo
-- operador, nem nome/país que ele tenha corrigido no painel.
--
-- POR QUE ISTO É SQL E NÃO CÓDIGO: a imagem é UMA para os 11 blogs e não sabe
-- qual deles está rodando (CLAUDE.md §13). Um catálogo embutido colocaria times
-- de futebol no credito.vc, no pontofarma e no ocomandante — é a mesma lição
-- das 25 fontes RSS do sp011, que a imagem instalava em todo blog.
--
-- SEM ESCUDO, DE PROPÓSITO: escudo de clube é marca de terceiro, e 96
-- imagens commitadas engordariam o repo por um recurso que a maioria dos blogs
-- não usa. O site desenha um monograma com as iniciais até o operador subir o
-- escudo em Painel → Transferências → Clubes (só os que realmente aparecerem).
--
-- O `id` é o SLUG do nome, e é o que torna a mescla idempotente. Ele foi GERADO
-- pelo mesmo algoritmo do `clubSlug` (api-server/src/lib/transfers.ts) — nunca
-- digite um id à mão aqui: um id fora do padrão vira um clube duplicado na
-- próxima vez que alguém cadastrar o mesmo nome pelo painel.
--
-- A api relê `settings` a cada 15 s (`startSettingsSync`) — os clubes aparecem
-- no painel sem restart e sem rebuild.
--
-- Como rodar na VPS (os sete blogs de esporte, um comando):
--
--   cd /opt/sp011
--   for b in ksports esporteagora resenhavip oleysports beeesportes \
--            apostaganha recebabet farodejogo cassinobet; do
--     ok=$(docker compose exec -T pg-blogs psql -U postgres -tAc \
--            "SELECT 1 FROM pg_database WHERE datname='$b'" 2>&1)
--     case "$ok" in
--       1) ;;
--       *recovery*|*FATAL*|*failed*)
--         echo "!!! pg-blogs indisponivel ($b) -- ABORTANDO"; break ;;
--       *) echo "=== $b: banco nao existe, pulado ==="; continue ;;
--     esac
--     echo "=== $b ==="
--     docker compose exec -T pg-blogs psql -U postgres -d "$b" \
--       -v ON_ERROR_STOP=1 < deploy/transferencias/clubes_seed.sql
--   done
--
-- A guarda distingue TRES casos de proposito (a mesma do menu_top_news.sql):
-- servidor fora do ar ABORTA (nao adianta tentar os proximos); banco realmente
-- ausente PULA. A versao ingenua anunciava "banco nao existe" com o pg-blogs em
-- recovery -- foi exatamente o que aconteceu em 2026-08-31.
--
-- ============================================================================

-- ── 1. Estado antes ─────────────────────────────────────────────────────────
SELECT current_database() AS banco,
       COALESCE(jsonb_array_length(
         (SELECT value::jsonb FROM settings WHERE key = 'transfer_clubs')), 0) AS clubes_antes;

-- ── 2. Mescla o catálogo (mantém o que já existe, acrescenta o que falta) ───
WITH seed(id, name, country) AS (
  VALUES
  -- Brasil — Série A e grandes da Série B (26)
  ('flamengo'::text, 'Flamengo'::text, 'Brasil'::text),  -- os casts fixam o tipo da lista
  ('palmeiras', 'Palmeiras', 'Brasil'),
  ('corinthians', 'Corinthians', 'Brasil'),
  ('sao-paulo', 'São Paulo', 'Brasil'),
  ('santos', 'Santos', 'Brasil'),
  ('vasco-da-gama', 'Vasco da Gama', 'Brasil'),
  ('botafogo', 'Botafogo', 'Brasil'),
  ('fluminense', 'Fluminense', 'Brasil'),
  ('gremio', 'Grêmio', 'Brasil'),
  ('internacional', 'Internacional', 'Brasil'),
  ('atletico-mg', 'Atlético-MG', 'Brasil'),
  ('cruzeiro', 'Cruzeiro', 'Brasil'),
  ('athletico-pr', 'Athletico-PR', 'Brasil'),
  ('bahia', 'Bahia', 'Brasil'),
  ('vitoria', 'Vitória', 'Brasil'),
  ('sport-recife', 'Sport Recife', 'Brasil'),
  ('fortaleza', 'Fortaleza', 'Brasil'),
  ('ceara', 'Ceará', 'Brasil'),
  ('red-bull-bragantino', 'Red Bull Bragantino', 'Brasil'),
  ('cuiaba', 'Cuiabá', 'Brasil'),
  ('goias', 'Goiás', 'Brasil'),
  ('juventude', 'Juventude', 'Brasil'),
  ('criciuma', 'Criciúma', 'Brasil'),
  ('atletico-go', 'Atlético-GO', 'Brasil'),
  ('coritiba', 'Coritiba', 'Brasil'),
  ('nautico', 'Náutico', 'Brasil'),
  -- Inglaterra — Premier League (20)
  ('arsenal', 'Arsenal', 'Inglaterra'),
  ('aston-villa', 'Aston Villa', 'Inglaterra'),
  ('bournemouth', 'Bournemouth', 'Inglaterra'),
  ('brentford', 'Brentford', 'Inglaterra'),
  ('brighton', 'Brighton', 'Inglaterra'),
  ('chelsea', 'Chelsea', 'Inglaterra'),
  ('crystal-palace', 'Crystal Palace', 'Inglaterra'),
  ('everton', 'Everton', 'Inglaterra'),
  ('fulham', 'Fulham', 'Inglaterra'),
  ('ipswich-town', 'Ipswich Town', 'Inglaterra'),
  ('leicester-city', 'Leicester City', 'Inglaterra'),
  ('liverpool', 'Liverpool', 'Inglaterra'),
  ('manchester-city', 'Manchester City', 'Inglaterra'),
  ('manchester-united', 'Manchester United', 'Inglaterra'),
  ('newcastle-united', 'Newcastle United', 'Inglaterra'),
  ('nottingham-forest', 'Nottingham Forest', 'Inglaterra'),
  ('southampton', 'Southampton', 'Inglaterra'),
  ('tottenham-hotspur', 'Tottenham Hotspur', 'Inglaterra'),
  ('west-ham-united', 'West Ham United', 'Inglaterra'),
  ('wolverhampton-wanderers', 'Wolverhampton Wanderers', 'Inglaterra'),
  -- Espanha — La Liga (10)
  ('real-madrid', 'Real Madrid', 'Espanha'),
  ('barcelona', 'Barcelona', 'Espanha'),
  ('atletico-de-madrid', 'Atlético de Madrid', 'Espanha'),
  ('sevilla', 'Sevilla', 'Espanha'),
  ('real-betis', 'Real Betis', 'Espanha'),
  ('valencia', 'Valencia', 'Espanha'),
  ('villarreal', 'Villarreal', 'Espanha'),
  ('athletic-bilbao', 'Athletic Bilbao', 'Espanha'),
  ('real-sociedad', 'Real Sociedad', 'Espanha'),
  ('girona', 'Girona', 'Espanha'),
  -- Itália — Serie A (10)
  ('juventus', 'Juventus', 'Itália'),
  ('inter-de-milao', 'Inter de Milão', 'Itália'),
  ('milan', 'Milan', 'Itália'),
  ('napoli', 'Napoli', 'Itália'),
  ('roma', 'Roma', 'Itália'),
  ('lazio', 'Lazio', 'Itália'),
  ('atalanta', 'Atalanta', 'Itália'),
  ('fiorentina', 'Fiorentina', 'Itália'),
  ('bologna', 'Bologna', 'Itália'),
  ('torino', 'Torino', 'Itália'),
  -- Alemanha — Bundesliga (8)
  ('bayern-de-munique', 'Bayern de Munique', 'Alemanha'),
  ('borussia-dortmund', 'Borussia Dortmund', 'Alemanha'),
  ('rb-leipzig', 'RB Leipzig', 'Alemanha'),
  ('bayer-leverkusen', 'Bayer Leverkusen', 'Alemanha'),
  ('eintracht-frankfurt', 'Eintracht Frankfurt', 'Alemanha'),
  ('wolfsburg', 'Wolfsburg', 'Alemanha'),
  ('stuttgart', 'Stuttgart', 'Alemanha'),
  ('borussia-monchengladbach', 'Borussia Mönchengladbach', 'Alemanha'),
  -- França — Ligue 1 (6)
  ('paris-saint-germain', 'Paris Saint-Germain', 'França'),
  ('monaco', 'Monaco', 'França'),
  ('marseille', 'Marseille', 'França'),
  ('lyon', 'Lyon', 'França'),
  ('lille', 'Lille', 'França'),
  ('nice', 'Nice', 'França'),
  -- Portugal e Países Baixos (6)
  ('benfica', 'Benfica', 'Portugal'),
  ('porto', 'Porto', 'Portugal'),
  ('sporting-cp', 'Sporting CP', 'Portugal'),
  ('braga', 'Braga', 'Portugal'),
  ('ajax', 'Ajax', 'Países Baixos'),
  ('psv-eindhoven', 'PSV Eindhoven', 'Países Baixos'),
  -- Argentina (4)
  ('boca-juniors', 'Boca Juniors', 'Argentina'),
  ('river-plate', 'River Plate', 'Argentina'),
  ('racing', 'Racing', 'Argentina'),
  ('independiente', 'Independiente', 'Argentina'),
  -- Arábia Saudita, MLS e México (6)
  ('al-hilal', 'Al-Hilal', 'Arábia Saudita'),
  ('al-nassr', 'Al-Nassr', 'Arábia Saudita'),
  ('al-ittihad', 'Al-Ittihad', 'Arábia Saudita'),
  ('inter-miami', 'Inter Miami', 'Estados Unidos'),
  ('la-galaxy', 'LA Galaxy', 'Estados Unidos'),
  ('club-america', 'Club América', 'México')
),
novos AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', s.id, 'name', s.name, 'country', s.country,
           'createdAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
         ) ORDER BY s.name), '[]'::jsonb) AS j
  FROM seed s
  WHERE NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
           COALESCE((SELECT value::jsonb FROM settings WHERE key = 'transfer_clubs'), '[]'::jsonb)
         ) x
    WHERE x->>'id' = s.id
  )
)
INSERT INTO settings (key, value, updated_at)
SELECT 'transfer_clubs',
       (COALESCE((SELECT value::jsonb FROM settings WHERE key = 'transfer_clubs'), '[]'::jsonb)
        || novos.j)::text,
       now()
FROM novos
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- ── 3. Conferência ──────────────────────────────────────────────────────────
-- `clubes_depois` >= 96; `com_escudo` começa em 0 e só cresce pelo
-- painel; `ids_duplicados` TEM que ser 0 (se não for, alguém digitou um id).
SELECT current_database() AS banco,
       jsonb_array_length(value::jsonb) AS clubes_depois,
       (SELECT count(*) FROM jsonb_array_elements(value::jsonb) e
         WHERE COALESCE(e->>'crestUrl', '') <> '') AS com_escudo,
       (SELECT count(*) FROM (
          SELECT e->>'id' AS id FROM jsonb_array_elements(value::jsonb) e
          GROUP BY 1 HAVING count(*) > 1) d) AS ids_duplicados
FROM settings WHERE key = 'transfer_clubs';
