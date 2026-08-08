-- =============================================================================
-- O COMANDANTE NEWS — regras por keyword (refino entre as editorias)
-- Roda no banco CENTRAL. RE-RODÁVEL: o DELETE por prefixo de nome apaga só as
-- regras geradas aqui e reinsere a versão atualizada.
-- =============================================================================
-- Por quê: as 4 regras base de sources_ocomandante.sql decidem a editoria pela
-- FONTE (fonte de aviação → /aviacao, e assim por diante). Isso erra nos dois
-- eixos vizinhos: NeoFeed e Brazil Journal (negócios) publicam macroeconomia,
-- e a Gazeta - Economia publica resultado de empresa. As regras aqui têm
-- prioridade MAIOR e corrigem o destino sem tirar a notícia do ar
-- (rules.ts: vence a regra de maior priority; desempate = a primeira).
--
-- Ordem de precedência (maior vence):
--   34  Aviação  — pauta de aviação vinda de negócios/economia/turismo
--   32  Turismo  — pauta de viagem/hotelaria vinda de negócios/economia
--   30  Economia — macro vinda das fontes de negócios
--   30  Negócios — empresa/resultado vindo das fontes de economia
--   10  regras base por fonte (sources_ocomandante.sql — NÃO desativar)
--
-- Keywords são SUBSTRING sem fronteira de palavra e sem acento-insensibilidade
-- (rules.ts só faz trim+lowercase) — por isso cada termo aqui é longo o
-- bastante para não casar por acidente. Exemplos do que foi evitado de
-- propósito: "ipo" (casaria "antecipou"), "gol" e "azul" sozinhos (futebol e
-- cor — viraram "gol linhas" e "azul linhas"), "cruzeiro" sozinho (time de
-- futebol — virou "cruzeiro marítimo").
--
-- Uso (VPS, /opt/sp011):
--   DBURL=$(grep -m1 '^CENTRAL_DATABASE_URL=' .env.central | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
--   docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 < deploy/ocomandante/rules_keywords.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Conferência de alvo: 0 blogs = matcher não casou (blog não cadastrado)
SELECT count(*) AS blogs_alvo FROM blogs b
WHERE b.name ILIKE '%comandante%' OR b.domain ILIKE '%comandante%';

-- Delete-reinsert: re-rodar o arquivo ATUALIZA as listas de keyword
DELETE FROM distribution_rules r
USING blogs b
WHERE b.id = r.blog_id
  AND (b.name ILIKE '%comandante%' OR b.domain ILIKE '%comandante%')
  AND r.name LIKE 'O Comandante - KW %';

INSERT INTO distribution_rules (id, blog_id, name, is_active, priority, categories_include, keywords_include, keywords_exclude, target_category)
SELECT gen_random_uuid()::text, b.id, v.rule_name, true, v.priority, v.cats::jsonb, v.kw::jsonb, v.kw_excl::jsonb, v.target
FROM blogs b
CROSS JOIN (VALUES
  ('O Comandante - KW aviacao', 34,
   '["oc-negocios","oc-economia","oc-turismo"]',
   '["aviação","companhia aérea","companhias aéreas","linhas aéreas","aeroporto","aeronave","anac","embraer","boeing","airbus","latam","gol linhas","azul linhas","malha aérea","tráfego aéreo","infraero","voo direto","voos diretos","piloto de avião","aviação executiva","jato executivo"]',
   NULL,
   'aviacao'),

  ('O Comandante - KW turismo', 32,
   '["oc-negocios","oc-economia"]',
   '["turismo","turístic","hotelaria","hotéis","resort","cruzeiro marítimo","navio de cruzeiro","agência de viagens","agências de viagens","embratur","pacote de viagem","pacotes de viagem","airbnb","alta temporada","temporada de férias","rede hoteleira"]',
   NULL,
   'turismo'),

  ('O Comandante - KW economia', 30,
   '["oc-negocios"]',
   '["selic","copom","ipca","inflação","banco central","reforma tributária","imposto de renda","arcabouço fiscal","déficit","superávit","desemprego","caged","salário mínimo","orçamento da união","tesouro nacional","balança comercial","taxa de juros","câmbio","dólar","política monetária","contas públicas","pib"]',
   NULL,
   'economia'),

  ('O Comandante - KW negocios', 30,
   '["oc-economia"]',
   '["fusão","aquisição","startup","abertura de capital","oferta pública inicial","faturamento","lucro líquido","prejuízo líquido","balanço trimestral","resultado trimestral","rodada de investimento","private equity","venture capital","franquia","unicórnio","varejo","e-commerce","conselho de administração","fatia de mercado","aporte","ceo da","ceo do"]',
   NULL,
   'negocios')
) AS v(rule_name, priority, cats, kw, kw_excl, target)
WHERE (b.name ILIKE '%comandante%' OR b.domain ILIKE '%comandante%');

COMMIT;

\echo ''
\echo '=== REGRAS DO O COMANDANTE (ordem de precedencia) ==='
SELECT r.priority, r.name, r.categories_include, r.target_category, r.is_active
FROM distribution_rules r JOIN blogs b ON b.id = r.blog_id
WHERE (b.name ILIKE '%comandante%' OR b.domain ILIKE '%comandante%')
ORDER BY r.priority DESC, r.name;
