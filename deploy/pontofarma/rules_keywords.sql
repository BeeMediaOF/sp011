-- =============================================================================
-- PONTOFARMA — Regras de distribuição por PALAVRA-CHAVE (categoria sem IA)
-- Roda no banco CENTRAL. Idempotente (NOT EXISTS por nome de regra).
--
-- Mesmo desenho do deploy/creditovc/rules_keywords.sql: keywords casam por
-- substring no título+descrição e FIXAM target_category (entrega nasce
-- "pending", sem localizer). A regra original "(IA classifica)" (prioridade
-- 10) fica como fallback do resíduo — NÃO desativar.
-- Raízes de palavra ("tributár", "legislaç") cobrem as flexões (o casamento
-- é substring com trim — espaços nas pontas da keyword não sobrevivem).
-- =============================================================================
BEGIN;

INSERT INTO distribution_rules (id, blog_id, name, is_active, priority, categories_include, keywords_include, target_category)
SELECT gen_random_uuid()::text, b.id, v.rule_name, true, v.priority, '["farmacia"]'::jsonb, v.kw::jsonb, v.target
FROM blogs b
CROSS JOIN (VALUES
  ('PontoFarma - KW Fiscal/Tributário', 30,
   '["tributár", "imposto", "icms", "nota fiscal"]',
   'fiscal-tributario'),
  ('PontoFarma - KW Legislação', 28,
   '["anvisa", "legislaç", "regulament", "rdc", "portaria", "cff", "crf"]',
   'legislacao'),
  ('PontoFarma - KW Tecnologia', 26,
   '["tecnologia", "digital", "e-commerce", "aplicativo", "inteligência artificial", "automação", "telefarmácia"]',
   'tecnologia'),
  ('PontoFarma - KW Gestão', 24,
   '["gestão", "estoque", "precificaç", "fluxo de caixa", "indicadores"]',
   'gestao'),
  ('PontoFarma - KW Vendas', 22,
   '["vendas", "atendimento", "fidelizaç", "balcão", "shopper"]',
   'vendas'),
  ('PontoFarma - KW Equipe', 20,
   '["treinamento", "contrataç", "capacitaç", "equipe", "carreira"]',
   'equipe'),
  ('PontoFarma - KW Mercado', 18,
   '["mercado farmacêutico", "varejo farmacêutico", "faturamento", "expansão", "aquisiç", "rede de farmácias"]',
   'mercado'),
  ('PontoFarma - KW Saúde', 16,
   '["medicamento", "vacina", "tratamento", "doença", "saúde"]',
   'saude-categorias')
) AS v(rule_name, priority, kw, target)
WHERE (b.name ILIKE '%pontofarma%' OR b.name ILIKE '%ponto farma%' OR b.domain ILIKE '%pontofarma%')
  AND NOT EXISTS (
    SELECT 1 FROM distribution_rules r WHERE r.blog_id = b.id AND r.name = v.rule_name
  );

COMMIT;

-- Conferência: keywords acima (30-16), IA como fallback (10)
\echo ''
\echo '=== REGRAS DO PONTOFARMA (ordem de precedencia) ==='
SELECT r.priority, r.name, r.keywords_include, r.target_category
FROM distribution_rules r
JOIN blogs b ON b.id = r.blog_id
WHERE (b.name ILIKE '%pontofarma%' OR b.name ILIKE '%ponto farma%' OR b.domain ILIKE '%pontofarma%')
ORDER BY r.priority DESC;
