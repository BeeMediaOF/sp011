-- =============================================================================
-- CRÉDITO.VC — Regras de distribuição por PALAVRA-CHAVE (categoria sem IA)
-- Roda no banco CENTRAL. Idempotente (NOT EXISTS por nome de regra).
--
-- Motivo (2026-07-20): a regra única "Finanças (IA classifica)" mandava 100%
-- das notícias para o classificador de IA (fila lenta do localizer) e tudo
-- caía em "outros" quando o classificador falhava. Estas regras casam por
-- keyword no título+descrição (substring, case-insensitive — raízes tipo
-- "endividad" cobrem endividado/endividamento) e FIXAM target_category:
-- a entrega nasce "pending" direto, sem passar pelo localizer.
--
-- Prioridades distintas = precedência determinística. A regra de IA original
-- (prioridade 10) vira o fallback do resíduo — NÃO desativar, senão notícia
-- sem keyword deixa de ser entregue ao blog.
-- =============================================================================
BEGIN;

INSERT INTO distribution_rules (id, blog_id, name, is_active, priority, categories_include, keywords_include, target_category)
SELECT gen_random_uuid()::text, b.id, v.rule_name, true, v.priority, '["financas"]'::jsonb, v.kw::jsonb, v.target
FROM blogs b
CROSS JOIN (VALUES
  ('Crédito.vc - KW Sair das Dívidas', 30,
   '["dívida", "endividad", "inadimpl", "renegocia", "limpa nome", "nome sujo", "negativad"]',
   'sair-das-dividas'),
  ('Crédito.vc - KW Score', 28,
   '["score", "serasa", "spc", "cadastro positivo"]',
   'score'),
  ('Crédito.vc - KW Crédito', 26,
   '["cartão de crédito", "empréstimo", "emprestimo", "consignado", "financiamento", "crediário", "cheque especial", "crédito pessoal"]',
   'credito'),
  ('Crédito.vc - KW Investimentos', 24,
   '["investiment", "investir", "cdb", "tesouro direto", "renda fixa", "poupança", "fundo imobiliário", "fundos imobiliários", "bolsa de valores", "dividendos"]',
   'investimentos'),
  ('Crédito.vc - KW Planejar o Futuro', 22,
   '["aposentadoria", "previdência", "reserva de emergência", "longo prazo"]',
   'planejar-o-futuro'),
  ('Crédito.vc - KW Renda Extra', 20,
   '["renda extra", "freelance", "microempreendedor", "vender online", "trabalho extra"]',
   'renda-extra'),
  ('Crédito.vc - KW Organizar Finanças', 18,
   '["orçamento familiar", "orçamento doméstico", "educação financeira", "controle de gastos", "economizar", "finanças pessoais", "planilha"]',
   'organizar-financas')
) AS v(rule_name, priority, kw, target)
WHERE (b.name ILIKE '%credito%' OR b.name ILIKE '%crédito%' OR b.domain ILIKE '%credito%')
  AND NOT EXISTS (
    SELECT 1 FROM distribution_rules r WHERE r.blog_id = b.id AND r.name = v.rule_name
  );

COMMIT;

-- Conferência: keywords acima (30-18), IA como fallback (10)
\echo ''
\echo '=== REGRAS DO CREDITO.VC (ordem de precedencia) ==='
SELECT r.priority, r.name, r.keywords_include, r.target_category
FROM distribution_rules r
JOIN blogs b ON b.id = r.blog_id
WHERE (b.name ILIKE '%credito%' OR b.name ILIKE '%crédito%' OR b.domain ILIKE '%credito%')
ORDER BY r.priority DESC;
