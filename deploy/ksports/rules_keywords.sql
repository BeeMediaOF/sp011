-- =============================================================================
-- KSPORTS (EN) — keywords em inglês
-- GERADO por script a partir dos conjuntos auditados (workflow 2026-07-20;
-- substring sem fronteira de palavra — cada keyword foi auditada contra
-- falsos positivos). Roda no banco CENTRAL. RE-RODAVEL: o DELETE por
-- prefixo de nome apaga só as regras geradas aqui e reinsere atualizado.
-- Escopo ['others']: fluxo das fontes EN gerais. 'Others (IA classifica)' (prio 5) segue de fallback.
-- =============================================================================
BEGIN;

-- Conferência de alvo: 0 blogs = matcher não casou (blog sem go-live/renomeado)
SELECT count(*) AS blogs_alvo FROM blogs b WHERE (b.name ILIKE '%ksports%' OR b.domain ILIKE '%ksports%');

-- Regras por keyword (delete-reinsert: re-rodar o arquivo ATUALIZA as listas)
DELETE FROM distribution_rules r
USING blogs b
WHERE b.id = r.blog_id AND (b.name ILIKE '%ksports%' OR b.domain ILIKE '%ksports%')
  AND r.name LIKE 'KSports - KW %';

INSERT INTO distribution_rules (id, blog_id, name, is_active, priority, categories_include, keywords_include, keywords_exclude, target_category)
SELECT gen_random_uuid()::text, b.id, v.rule_name, true, v.priority, '["others"]'::jsonb, v.kw::jsonb, v.kw_excl::jsonb, v.target
FROM blogs b
CROSS JOIN (VALUES
  ('KSports - KW nfl', 40,
   '["super bowl","nfl draft","nfl season","nfl playoffs","nfl star","touchdown","quarterback","gridiron","kansas city chiefs","philadelphia eagles","dallas cowboys","green bay packers","49ers","buffalo bills","baltimore ravens","detroit lions","miami dolphins","pittsburgh steelers","new york jets","new england patriots","minnesota vikings","seattle seahawks","patrick mahomes","lamar jackson","josh allen","joe burrow","aaron rodgers","travis kelce","afc championship","nfc championship"]',
   NULL,
   'nfl'),
  ('KSports - KW formula-1', 38,
   '["formula 1","formula one","f1","grand prix","motogp","pole position","safety car","constructors","verstappen","lewis hamilton","leclerc","lando norris","piastri","george russell","fernando alonso","sainz","sergio perez","bottas","antonelli","tsunoda","hulkenberg","gasly","albon","esteban ocon","ferrari","mclaren","mercedes","aston martin","red bull racing","cadillac"]',
   '["athletics","judo","badminton"]',
   'formula-1'),
  ('KSports - KW tennis', 36,
   '["tennis","wimbledon","roland garros","french open","australian open","atp","wta","davis cup","billie jean king cup","indian wells","masters 1000","djokovic","alcaraz","sinner","medvedev","zverev","tsitsipas","holger rune","swiatek","sabalenka","gauff","rybakina","naomi osaka","raducanu","taylor fritz","ben shelton","jack draper","federer","nadal"]',
   '["table tennis"]',
   'tennis'),
  ('KSports - KW volleyball', 34,
   '["volleyball","beach volley","fivb","vnl","cev champions league","libero","outside hitter","middle blocker","opposite hitter","plusliga","superlega","vakifbank","conegliano","egonu","boskovic","wilfredo leon","zhu ting","nvbf"]',
   NULL,
   'volleyball'),
  ('KSports - KW esports', 32,
   '["esport","e-sport","league of legends","counter-strike","counter strike","cs2","valorant","dota 2","fortnite","call of duty","overwatch","rocket league","apex legends","pubg","tekken","mobile legends","efootball","ea sports fc","competitive gaming","gaming tournament","faze clan","fnatic","team liquid","faker"]',
   NULL,
   'esports'),
  ('KSports - KW world-cup', 30,
   '["fifa world cup","world cup 2026","2026 world cup","world cup qualifier","world cup qualifying","world cup qualification","world cup draw","world cup squad","world cup group","world cup finals","world cup host","wcq","world cup final"]',
   '["cricket","t20","rugby","fiba","club world cup"]',
   'world-cup'),
  ('KSports - KW football', 28,
   '["football","soccer","premier league","champions league","la liga","laliga","serie a","bundesliga","uefa","afcon","super eagles","super falcons","npfl","osimhen","lookman","iwobi","transfer window","man utd","manchester united","man city","manchester city","arsenal","chelsea","liverpool","real madrid","barcelona","mbappe","mbappé","haaland","ronaldo"]',
   NULL,
   'football'),
  ('KSports - KW others', 26,
   '["nba","basketball","wnba","lebron","lakers","stephen curry","wembanyama","boxer","anthony joshua","tyson fury","usyk","canelo","heavyweight title","ufc","mixed martial arts","octagon","adesanya","kamaru usman","conor mcgregor","olympic","paralympic","athletics","diamond league","tobi amusan","cricket","test match","wicket","t20","rugby","golf"]',
   NULL,
   'others')
) AS v(rule_name, priority, kw, kw_excl, target)
WHERE (b.name ILIKE '%ksports%' OR b.domain ILIKE '%ksports%');

COMMIT;

\echo ''
\echo '=== REGRAS DO KSPORTS (ordem de precedencia) ==='
SELECT b.name AS blog, r.priority, r.name, r.target_category
FROM distribution_rules r JOIN blogs b ON b.id = r.blog_id
WHERE (b.name ILIKE '%ksports%' OR b.domain ILIKE '%ksports%') AND r.is_active
ORDER BY b.name, r.priority DESC, r.name;
