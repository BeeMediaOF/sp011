-- =============================================================================
-- PONTOFARMA — regras por keyword ENRIQUECIDAS (v2, substitui as ' - KW ')
-- GERADO por script a partir dos conjuntos auditados (workflow 2026-07-20;
-- substring sem fronteira de palavra — cada keyword foi auditada contra
-- falsos positivos). Roda no banco CENTRAL. RE-RODAVEL: o DELETE por
-- prefixo de nome apaga só as regras geradas aqui e reinsere atualizado.
-- Escopo ['farmacia']. A regra '(IA classifica)' (prio 10) segue de fallback — NÃO desativar.
-- =============================================================================
BEGIN;

-- Conferência de alvo: 0 blogs = matcher não casou (blog sem go-live/renomeado)
SELECT count(*) AS blogs_alvo FROM blogs b WHERE (b.name ILIKE '%pontofarma%' OR b.name ILIKE '%ponto farma%' OR b.domain ILIKE '%pontofarma%');

-- Regras por keyword (delete-reinsert: re-rodar o arquivo ATUALIZA as listas)
DELETE FROM distribution_rules r
USING blogs b
WHERE b.id = r.blog_id AND (b.name ILIKE '%pontofarma%' OR b.name ILIKE '%ponto farma%' OR b.domain ILIKE '%pontofarma%')
  AND r.name LIKE 'PontoFarma - KW %';

INSERT INTO distribution_rules (id, blog_id, name, is_active, priority, categories_include, keywords_include, keywords_exclude, target_category)
SELECT gen_random_uuid()::text, b.id, v.rule_name, true, v.priority, '["farmacia"]'::jsonb, v.kw::jsonb, v.kw_excl::jsonb, v.target
FROM blogs b
CROSS JOIN (VALUES
  ('PontoFarma - KW fiscal-tributario', 30,
   '["tributár","tributaç","tributa","tributos","imposto","icms","difal","issqn","cofins","pis/cofins","cbs","ibs","irpj","csll","nota fiscal","nf-e","nfc-e","sped fiscal","simples nacional","lucro presumido","lucro real","receita federal","fisco","malha fina"]',
   NULL,
   'fiscal-tributario'),
  ('PontoFarma - KW legislacao', 28,
   '["anvisa","legislaç","regulament","rdc","portaria","cff","crf","cfm","fda","cmed","lgpd","vigilância sanitária","farmacovigil","registro sanitário","sngpc","medicamentos controlados","receituário","prescriç","bula digital","consulta pública","projeto de lei","medida provisória","decreto","sancionad","compliance","rastreab"]',
   NULL,
   'legislacao'),
  ('PontoFarma - KW tecnologia', 26,
   '["tecnologia","digital","e-commerce","ecommerce","aplicativo","inteligência artificial","inteligencia artificial","chatgpt","automação","telefarmácia","telemedicina","telessaúde","receita digital","prontuário eletrônico","sistema de gestão","software","startup","healthtech","big data","análise de dados","ciberseg","hacker","pix","whatsapp","ifood","rappi","marketplace","loja virtual","omnichannel","omnicanal","autoatendimento","inovaç"]',
   NULL,
   'tecnologia'),
  ('PontoFarma - KW gestao', 24,
   '["gestão","estoque","precificaç","fluxo de caixa","indicadores","kpi","margem de lucro","lucrativ","rentabilid","capital de giro","ponto de equilíbrio","redução de custos","planejamento estratégico","plano de negóci","empreended","logístic","fornecedor","prevenção de perdas","curva abc","markup","inventário","sazonalidade"]',
   NULL,
   'gestao'),
  ('PontoFarma - KW vendas', 22,
   '["vendas","atendimento","fidelizaç","fidelidade","balcão","shopper","sell-out","sell out","sell-in","sell in","pdv","ponto de venda","ticket médio","desconto","promoções","trade marketing","merchandising","marketing","gôndola","vitrine","consumidor","experiência do cliente","jornada de compra","taxa de conversão","dia das mães"]',
   NULL,
   'vendas'),
  ('PontoFarma - KW equipe', 20,
   '["treinamento","contrataç","capacitaç","equipe","carreira","rh","recursos humanos","recrutament","processo seletivo","vagas","empreg","salári","salarial","clt","jornada de trabalho","sindicat","turnover","rotatividade","organizacional","lideranç","desenvolvimento profissional","qualificaç","burnout","balconista","atendente"]',
   NULL,
   'equipe'),
  ('PontoFarma - KW mercado', 18,
   '["mercado farmacêutico","varejo farmacêutico","faturamento","expansão","aquisiç","reajuste","abrafarma","sindusfarma","febrafar","interfarma","iqvia","farmácia popular","genéric","raia drogasil","rd saúde","drogasil","pague menos","drogaria são paulo","drogarias pacheco","dpsp","panvel","ultrafarma","eurofarma","ems","aché","hypera","profarma","market share","participação de mercado","lucro líquido","franqui","distribuidor"]',
   NULL,
   'mercado'),
  ('PontoFarma - KW saude-categorias', 16,
   '["medicamento","vacina","tratamento","doença","saúde","remédio","fármaco","antibiótic","suplement","vitamina","cosmétic","perfumaria","higiene","otc","mip","ozempic","wegovy","mounjaro","semaglutida","emagrecedor","dengue","gripe","covid","epidemi","surto","obesidade","diabetes","hipertensão","teste rápido","serviços farmacêuticos","autocuidado","bem-estar","prevenç"]',
   NULL,
   'saude-categorias')
) AS v(rule_name, priority, kw, kw_excl, target)
WHERE (b.name ILIKE '%pontofarma%' OR b.name ILIKE '%ponto farma%' OR b.domain ILIKE '%pontofarma%');

COMMIT;

\echo ''
\echo '=== REGRAS DO PONTOFARMA (ordem de precedencia) ==='
SELECT b.name AS blog, r.priority, r.name, r.target_category
FROM distribution_rules r JOIN blogs b ON b.id = r.blog_id
WHERE (b.name ILIKE '%pontofarma%' OR b.name ILIKE '%ponto farma%' OR b.domain ILIKE '%pontofarma%') AND r.is_active
ORDER BY b.name, r.priority DESC, r.name;
