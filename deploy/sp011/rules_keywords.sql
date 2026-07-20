-- =============================================================================
-- SP011 (portal mãe) — categoria na hora, IA só no resíduo
-- GERADO por script a partir dos conjuntos auditados (workflow 2026-07-20;
-- substring sem fronteira de palavra — cada keyword foi auditada contra
-- falsos positivos). Roda no banco CENTRAL. RE-RODAVEL: o DELETE por
-- prefixo de nome apaga só as regras geradas aqui e reinsere atualizado.
-- O catch-all do sp011 (includes vazios, prio baixa) continua de fallback com IA; estas regras vencem por prioridade. MAP = categoria da fonte já diz a editoria; KW = só p/ fontes 'geral'.
-- =============================================================================
BEGIN;

-- Mapeamento direto categoria da fonte -> categoria do blog (sem IA)
DELETE FROM distribution_rules r
USING blogs b
WHERE b.id = r.blog_id AND (b.name ILIKE '%sp011%' OR b.domain ILIKE '%sp011%')
  AND r.name LIKE 'SP011 - MAP %';

INSERT INTO distribution_rules (id, blog_id, name, is_active, priority, categories_include, target_category)
SELECT gen_random_uuid()::text, b.id, v.rule_name, true, 20, v.cats::jsonb, v.target
FROM blogs b
CROSS JOIN (VALUES
  ('SP011 - MAP politica', '["politica"]', 'politica'),
  ('SP011 - MAP economia', '["economia"]', 'economia'),
  ('SP011 - MAP mundo', '["mundo"]', 'mundo'),
  ('SP011 - MAP cultura', '["cultura"]', 'cultura'),
  ('SP011 - MAP cidade', '["cidade"]', 'cidade'),
  ('SP011 - MAP saude', '["saude"]', 'saude'),
  ('SP011 - MAP tecnologia', '["tecnologia"]', 'tecnologia'),
  ('SP011 - MAP seguranca', '["seguranca"]', 'seguranca'),
  ('SP011 - MAP esportes', '["esportes"]', 'esportes')
) AS v(rule_name, cats, target)
WHERE (b.name ILIKE '%sp011%' OR b.domain ILIKE '%sp011%');

-- Conferência de alvo: 0 blogs = matcher não casou (blog sem go-live/renomeado)
SELECT count(*) AS blogs_alvo FROM blogs b WHERE (b.name ILIKE '%sp011%' OR b.domain ILIKE '%sp011%');

-- Regras por keyword (delete-reinsert: re-rodar o arquivo ATUALIZA as listas)
DELETE FROM distribution_rules r
USING blogs b
WHERE b.id = r.blog_id AND (b.name ILIKE '%sp011%' OR b.domain ILIKE '%sp011%')
  AND r.name LIKE 'SP011 - KW %';

INSERT INTO distribution_rules (id, blog_id, name, is_active, priority, categories_include, keywords_include, keywords_exclude, target_category)
SELECT gen_random_uuid()::text, b.id, v.rule_name, true, v.priority, '["geral"]'::jsonb, v.kw::jsonb, v.kw_excl::jsonb, v.target
FROM blogs b
CROSS JOIN (VALUES
  ('SP011 - KW politica', 40,
   '["câmara dos deputados","senado","stf","planalto","governo federal","presidente lula","governo lula","bolsonaro","tarcísio","tarcisio","alexandre de moraes","gilmar mendes","flávio dino","hugo motta","alcolumbre","alckmin","romeu zema","eleiç","eleitoral","tse","deputad","impeachment","cpi","psol","candidatur","fernando haddad","congresso nacional"]',
   NULL,
   'politica'),
  ('SP011 - KW economia', 38,
   '["inflação","ipca","selic","juros","pib","dólar","banco central","copom","galípolo","imposto","tributár","tarifaço","ibovespa","bolsa de valores","petrobras","itaú","bradesco","banco do brasil","caixa econômica","nubank","fgts","inss","aposentadoria","salário mínimo","mercado financeiro","agronegócio","varejo","gasolina","bitcoin"]',
   NULL,
   'economia'),
  ('SP011 - KW mundo', 36,
   '["estados unidos","eua","trump","casa branca","putin","rússia","kremlin","ucrânia","zelensk","china","xi jinping","taiwan","israel","netanyahu","gaza","cisjordânia","hezbollah","teerã","iraniano","nações unidas","união europeia","venezuela","nicolás maduro","argentina","milei","macron","alemanha","coreia do norte","vaticano","guerra na ucrânia","guerra comercial"]',
   NULL,
   'mundo'),
  ('SP011 - KW saude', 34,
   '["sistema único de saúde","saúde pública","saúde mental","ministério da saúde","vacina","anvisa","fiocruz","butantan","dengue","zika","gripe","covid","sarampo","tuberculose","febre amarela","epidemia","pandemia","surto de","câncer","diabetes","obesidade","internaç","leitos de uti","transplante","medicamento","remédio","plano de saúde","cirurgia","vírus"]',
   NULL,
   'saude'),
  ('SP011 - KW seguranca', 32,
   '["polícia","policia","delegacia","delegad","homicídio","assassin","tráfico","facç","pcc","comando vermelho","apreendid","presídio","penitenciár","prisão","flagrante","assalto","roubo","furto","sequestro","feminicídio","estupro","milícia","arma de fogo","tiroteio","balead","violência","criminos","crime organizado","segurança pública","foragido"]',
   NULL,
   'seguranca'),
  ('SP011 - KW tecnologia', 30,
   '["inteligência artificial","chatgpt","openai","google","microsoft","apple","zuckerberg","iphone","android","samsung","xiaomi","smartphone","ciberataque","hacker","vazamento de dados","elon musk","tesla","nvidia","starlink","spacex","videogame"]',
   NULL,
   'tecnologia'),
  ('SP011 - KW cultura', 28,
   '["cinema","filme","netflix","hollywood","grammy","bilheteria","novela","tv globo","rede globo","bbb","reality","celebridade","famosos","música","cantor","álbum","turnê","festival","lollapalooza","rock in rio","carnaval","escola de samba","sertanejo","funk","anitta","teatro","livros","escritor","oscar 2026","prêmio oscar","indicado ao oscar"]',
   NULL,
   'cultura'),
  ('SP011 - KW esportes', 26,
   '["campeonato","torneio","atleta","jogador","seleção brasileira","futebol","torcedor","torcida","estádio","olimpíada","olímpic","copa do mundo","libertadores","brasileirão","champions league","flamengo","corinthians","palmeiras","grêmio","neymar","cbf","fifa","treinador","medalh","vôlei","volei","basquete","nba","artilheiro","goleiro"]',
   NULL,
   'esportes'),
  ('SP011 - KW cidade', 24,
   '["prefeit","câmara municipal","veread","iptu","guarda municipal","trânsito","metrô","cptm","sptrans","ônibus","transporte público","rodízio","pedágio","tietê","zona leste","zona sul","defesa civil","chuva","temporal","alagamento","enchente","ricardo nunes","ibaneis","gdf","distrito federal","ceilândia","brasília","capital paulista","grande são paulo","interditad"]',
   NULL,
   'cidade')
) AS v(rule_name, priority, kw, kw_excl, target)
WHERE (b.name ILIKE '%sp011%' OR b.domain ILIKE '%sp011%');

COMMIT;

\echo ''
\echo '=== REGRAS DO SP011 (ordem de precedencia) ==='
SELECT b.name AS blog, r.priority, r.name, r.target_category
FROM distribution_rules r JOIN blogs b ON b.id = r.blog_id
WHERE (b.name ILIKE '%sp011%' OR b.domain ILIKE '%sp011%') AND r.is_active
ORDER BY b.name, r.priority DESC, r.name;
\echo ''
\echo 'ATENCAO: confira acima que o catch-all do sp011 (regra de includes'
\echo 'vazios) tem priority MENOR que 20 — se tiver 20+, ele continua vencendo'
\echo 'e estas regras viram no-op (me avise que eu ajusto as prioridades).'
