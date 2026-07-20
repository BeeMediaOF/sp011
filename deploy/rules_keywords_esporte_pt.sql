-- =============================================================================
-- FAMÍLIA ESPORTE PT (Esporte Agora, Resenha Vip, OleySports, BeeEsportes)
-- GERADO por script a partir dos conjuntos auditados (workflow 2026-07-20;
-- substring sem fronteira de palavra — cada keyword foi auditada contra
-- falsos positivos). Roda no banco CENTRAL. RE-RODAVEL: o DELETE por
-- prefixo de nome apaga só as regras geradas aqui e reinsere atualizado.
-- Escopo ['outros']: só o fluxo das fontes esportivas GERAIS (ge Geral etc.); as 7 regras fixas por categoria de fonte continuam intactas. A regra 'Outros (IA classifica)' (prio 5) segue como fallback do resíduo — NÃO desativar.
-- =============================================================================
BEGIN;

-- Conferência de alvo: 0 blogs = matcher não casou (blog sem go-live/renomeado)
SELECT count(*) AS blogs_alvo FROM blogs b WHERE (b.name ILIKE '%resenha%' OR b.domain ILIKE '%resenhavip%' OR b.name ILIKE '%oley%' OR b.domain ILIKE '%oleysports%' OR b.name ILIKE '%bee%esporte%' OR b.domain ILIKE '%beeesportes%' OR b.name ILIKE '%esporte%agora%' OR b.domain ILIKE '%esporteagora%');

-- Regras por keyword (delete-reinsert: re-rodar o arquivo ATUALIZA as listas)
DELETE FROM distribution_rules r
USING blogs b
WHERE b.id = r.blog_id AND (b.name ILIKE '%resenha%' OR b.domain ILIKE '%resenhavip%' OR b.name ILIKE '%oley%' OR b.domain ILIKE '%oleysports%' OR b.name ILIKE '%bee%esporte%' OR b.domain ILIKE '%beeesportes%' OR b.name ILIKE '%esporte%agora%' OR b.domain ILIKE '%esporteagora%')
  AND r.name LIKE 'Esporte - KW %';

INSERT INTO distribution_rules (id, blog_id, name, is_active, priority, categories_include, keywords_include, keywords_exclude, target_category)
SELECT gen_random_uuid()::text, b.id, v.rule_name, true, v.priority, '["outros"]'::jsonb, v.kw::jsonb, v.kw_excl::jsonb, v.target
FROM blogs b
CROSS JOIN (VALUES
  ('Esporte - KW futebol-americano', 40,
   '["futebol americano","super bowl","touchdown","quarterback","field goal","flag football","mahomes","chiefs","eagles","cowboys","packers","ravens","steelers","patriots","49ers","detroit lions","buffalo bills","josh allen","lamar jackson","joe burrow","jalen hurts","travis kelce","jardas","running back","wide receiver","tight end","da nfl","na nfl","nfl draft"]',
   NULL,
   'futebol-americano'),
  ('Esporte - KW f1', 38,
   '["fórmula 1","formula 1","f1","grande prêmio","gp de","gp do","gp da","verstappen","leclerc","norris","piastri","fernando alonso","george russell","sainz","antonelli","hulkenberg","bortoleto","red bull racing","ferrari","mclaren","mercedes","aston martin","cadillac","pole position","pit stop","interlagos","autódromo","stock car","senna","lewis hamilton"]',
   NULL,
   'f1'),
  ('Esporte - KW tenis', 36,
   '["tênis","tenis","wimbledon","roland garros","us open","australian open","aberto da austrália","grand slam","atp","wta","djokovic","alcaraz","sinner","medvedev","zverev","swiatek","sabalenka","gauff","bia haddad","haddad maia","joão fonseca","thiago wild","nadal","federer","saibro","tiebreak","tie-break","masters 1000","raquete"]',
   '["tênis de mesa","mesatenista"]',
   'tenis'),
  ('Esporte - KW volei', 34,
   '["vôlei","volei","vnl","cbv","fivb","sada cruzeiro","praia clube","osasco","darlan souza","lucarelli","gabi guimarães","bernardinho","líbero","levantador","superliga de vôlei","superliga masculina","superliga feminina"]',
   NULL,
   'volei'),
  ('Esporte - KW e-sports', 32,
   '["e-sports","esports","esporte eletrônico","esportes eletrônicos","counter-strike","counter strike","cs2","valorant","league of legends","dota 2","free fire","fortnite","rainbow six","loud","furia","pain gaming","mibr","cblol","fallen","gaules","vct","red canids"]',
   NULL,
   'e-sports'),
  ('Esporte - KW copa-do-mundo', 30,
   '["copa do mundo","copa de 2026","copa 2026","mundial de 2026","mundial da fifa","eliminatórias da copa","eliminatórias sul-americanas","canarinho","amarelinha","ancelotti"]',
   '["mundial de clubes","copa do mundo de clubes"]',
   'copa-do-mundo'),
  ('Esporte - KW futebol', 28,
   '["futebol","brasileirão","libertadores","copa do brasil","champions","liga dos campeões","premier league","la liga","bundesliga","sul-americana","flamengo","palmeiras","corinthians","cruzeiro","vasco","botafogo","fluminense","grêmio","bragantino","real madrid","barcelona","neymar","vini jr","mbappé","golaço","artilheiro","escalação","cbf","santos fc","são paulo fc","tricolor paulista","seleção brasileira","convocação da seleção"]',
   NULL,
   'futebol'),
  ('Esporte - KW outros', 26,
   '["basquete","nba","nbb","lebron","stephen curry","wembanyama","doncic","ufc","mma","boxe","cinturão","nocaute","octógono","poatan","charles do bronx","olimpíada","jogos olímpicos","olímpico","surfe","medina","filipe toledo","wsl","skate","rayssa leal","natação","atletismo","maratona","ginástica","rebeca andrade","simone biles"]',
   NULL,
   'outros')
) AS v(rule_name, priority, kw, kw_excl, target)
WHERE (b.name ILIKE '%resenha%' OR b.domain ILIKE '%resenhavip%' OR b.name ILIKE '%oley%' OR b.domain ILIKE '%oleysports%' OR b.name ILIKE '%bee%esporte%' OR b.domain ILIKE '%beeesportes%' OR b.name ILIKE '%esporte%agora%' OR b.domain ILIKE '%esporteagora%');

COMMIT;

\echo ''
\echo '=== REGRAS DA FAMILIA ESPORTE PT (ordem de precedencia) ==='
SELECT b.name AS blog, r.priority, r.name, r.target_category
FROM distribution_rules r JOIN blogs b ON b.id = r.blog_id
WHERE (b.name ILIKE '%resenha%' OR b.domain ILIKE '%resenhavip%' OR b.name ILIKE '%oley%' OR b.domain ILIKE '%oleysports%' OR b.name ILIKE '%bee%esporte%' OR b.domain ILIKE '%beeesportes%' OR b.name ILIKE '%esporte%agora%' OR b.domain ILIKE '%esporteagora%') AND r.is_active
ORDER BY b.name, r.priority DESC, r.name;
