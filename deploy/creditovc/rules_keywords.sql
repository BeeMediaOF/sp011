-- =============================================================================
-- CRÉDITO.VC — regras por keyword ENRIQUECIDAS (v2, substitui as ' - KW ')
-- GERADO por script a partir dos conjuntos auditados (workflow 2026-07-20;
-- substring sem fronteira de palavra — cada keyword foi auditada contra
-- falsos positivos). Roda no banco CENTRAL. RE-RODAVEL: o DELETE por
-- prefixo de nome apaga só as regras geradas aqui e reinsere atualizado.
-- Escopo ['financas']. A regra 'Finanças (IA classifica)' (prio 10) segue de fallback — NÃO desativar.
-- =============================================================================
BEGIN;

-- Conferência de alvo: 0 blogs = matcher não casou (blog sem go-live/renomeado)
SELECT count(*) AS blogs_alvo FROM blogs b WHERE (b.name ILIKE '%credito%' OR b.name ILIKE '%crédito%' OR b.domain ILIKE '%credito%');

-- Regras por keyword (delete-reinsert: re-rodar o arquivo ATUALIZA as listas)
DELETE FROM distribution_rules r
USING blogs b
WHERE b.id = r.blog_id AND (b.name ILIKE '%credito%' OR b.name ILIKE '%crédito%' OR b.domain ILIKE '%credito%')
  AND r.name LIKE 'Crédito.vc - KW %';

INSERT INTO distribution_rules (id, blog_id, name, is_active, priority, categories_include, keywords_include, keywords_exclude, target_category)
SELECT gen_random_uuid()::text, b.id, v.rule_name, true, v.priority, '["financas"]'::jsonb, v.kw::jsonb, v.kw_excl::jsonb, v.target
FROM blogs b
CROSS JOIN (VALUES
  ('Crédito.vc - KW sair-das-dividas', 30,
   '["dívida","endividad","inadimpl","renegocia","limpa nome","nome sujo","negativad","negativaç","quitar","quitaç","calote","credor","devedor","juros abusivos","cobrança indevida","atrasad","desenrola brasil"]',
   '["dívida pública","dívida externa"]',
   'sair-das-dividas'),
  ('Crédito.vc - KW score', 28,
   '["score","serasa","spc","scpc","quod","cadastro positivo","pontuação de crédito","birô de crédito","bureau de crédito","histórico de crédito","nome limpo","restrição no cpf","restrição no nome"]',
   NULL,
   'score'),
  ('Crédito.vc - KW credito', 26,
   '["cartão de crédito","empréstimo","emprestimo","consignado","financiamento","crediário","crediario","cheque especial","crédito pessoal","rotativo","juros do cartão","limite do cartão","cashback","open finance","open banking","portabilidade","fgts","saque-aniversário","saque aniversário","casa própria","minha casa, minha vida","minha casa minha vida","microcrédito","nubank","c6 bank","banco inter","picpay","mercado pago","pagbank","banco digital","bancos digitais","agiot"]',
   NULL,
   'credito'),
  ('Crédito.vc - KW investimentos', 24,
   '["investiment","investir","cdb","cdi","tesouro direto","tesouro selic","tesouro ipca","selic","ipca","copom","taxa de juros","renda fixa","renda variável","renda passiva","poupança","fundo imobiliário","fundos imobiliários","fii","fiis","bolsa de valores","ibovespa","b3","mercado de ações","dividendos","juros compostos","day trade","corretora","criptomoed","criptoativo","bitcoin","etfs","dólar"]',
   NULL,
   'investimentos'),
  ('Crédito.vc - KW planejar-o-futuro', 22,
   '["aposentadoria","aposentad","previdência","previdencia","inss","pgbl","vgbl","bpc","reserva de emergência","longo prazo","seguro de vida","herança","testamento","inventário","patrimôni","independência financeira","liberdade financeira","tempo de contribuição","idade mínima","regra de transição","expectativa de vida","meta financeira","metas financeiras"]',
   NULL,
   'planejar-o-futuro'),
  ('Crédito.vc - KW renda-extra', 20,
   '["renda extra","freelance","microempreendedor","vender online","trabalho extra","fonte de renda","complementar a renda","motorista de aplicativo","entregador","revend","dropshipping","marketplace","loja virtual","artesanato","brechó","afiliad","monetiz","empreendedorismo","home office","trabalho remoto","entregador do ifood","vender no mercado livre","vender na shopee"]',
   NULL,
   'renda-extra'),
  ('Crédito.vc - KW organizar-financas', 18,
   '["orçamento familiar","orçamento doméstico","orçamento pessoal","educação financeira","controle de gastos","economizar","poupar","guardar dinheiro","juntar dinheiro","finanças pessoais","planilha","custo de vida","inflação","cesta básica","salário mínimo","13º salário","décimo terceiro","imposto de renda","irpf","restituição","pix","cartão de débito","vale-refeição","vale-alimentação","conta de luz","conta corrente","mesada","cofrinho","consumo consciente","por impulso","bolsa família"]',
   NULL,
   'organizar-financas')
) AS v(rule_name, priority, kw, kw_excl, target)
WHERE (b.name ILIKE '%credito%' OR b.name ILIKE '%crédito%' OR b.domain ILIKE '%credito%');

COMMIT;

\echo ''
\echo '=== REGRAS DO CREDITO.VC (ordem de precedencia) ==='
SELECT b.name AS blog, r.priority, r.name, r.target_category
FROM distribution_rules r JOIN blogs b ON b.id = r.blog_id
WHERE (b.name ILIKE '%credito%' OR b.name ILIKE '%crédito%' OR b.domain ILIKE '%credito%') AND r.is_active
ORDER BY b.name, r.priority DESC, r.name;
