-- =============================================================================
-- CRÉDITO.VC — regras por keyword (v3, substitui as ' - KW ')
-- Roda no banco CENTRAL. RE-RODAVEL: o DELETE por prefixo de nome apaga só as
-- regras geradas aqui e reinsere atualizado.
-- Escopo ['financas']. A regra 'Finanças (IA classifica)' (prio 10) segue de
-- fallback — NÃO desativar (mas esta v3 passa a dar keywords_exclude a ela).
--
-- v3 (2026-08-14) — REBALANCEAMENTO: mais crédito, menos investimentos.
-- Medido no ar antes da mudança (602 artigos publicados):
--     investimentos 37,0% | outros 32,9% | otros 16,6% | credito 3,5%
--     e as manchetes de "investimentos" eram Ibovespa, BBAS3, VALE3, HAPV3,
--     IFIX — noticia de MERCADO/balanço, não educação financeira.
-- Três mudanças, nesta ordem de efeito:
--   1. o catch-all ganha keywords_exclude: e ele que estava entregando pauta de
--      mercado e pauta fora do nicho (Mega-Sena, TSE, Air Force One vinham de
--      fonte 'financas' que publica geral). Sem isso, tirar termo da regra de
--      investimentos só muda o RÓTULO — o item continua chegando.
--   2. 'KW investimentos' encolhe para investimento EDUCATIVO (como investir),
--      largando macro e mercado (selic, copom, ibovespa, b3, dividendos, cripto).
--   3. 'KW credito' cresce com o vocabulário de crédito ao consumidor.
-- Precedência não muda: sair-das-dividas 30 > score 28 > credito 26 >
-- investimentos 24 — item que fala dos dois já ia para crédito.
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
   '["dívida","endividad","inadimpl","renegocia","limpa nome","nome sujo","negativad","negativaç","quitar","quitaç","calote","credor","devedor","juros abusivos","cobrança indevida","atrasad","desenrola brasil","feirão de negociação","mutirão de renegociação","acordo de dívida","dívida no cartão","sair do vermelho"]',
   '["dívida pública","dívida externa","dívida bruta","dívida líquida do setor"]',
   'sair-das-dividas'),
  ('Crédito.vc - KW score', 28,
   '["score","serasa","spc","scpc","quod","cadastro positivo","pontuação de crédito","birô de crédito","bureau de crédito","histórico de crédito","nome limpo","restrição no cpf","restrição no nome","consulta de cpf","limpar o cpf"]',
   NULL,
   'score'),
  -- CRESCEU (v3): vocabulário de crédito ao consumidor. Nomes de banco ficam de
  -- fora de propósito — arrastariam balanço e resultado trimestral.
  ('Crédito.vc - KW credito', 26,
   '["cartão de crédito","empréstimo","emprestimo","consignado","financiamento","financiar","crediário","crediario","cheque especial","crédito pessoal","crédito consignado","crédito imobiliário","crédito rural","crédito estudantil","fies","rotativo","juros do cartão","limite do cartão","limite de crédito","análise de crédito","aprovação de crédito","cashback","open finance","open banking","portabilidade","portabilidade de crédito","fgts","saque-aniversário","saque aniversário","casa própria","minha casa, minha vida","minha casa minha vida","microcrédito","cet","custo efetivo total","refinancia","refinanciamento","antecipação de","parcelamento","parcelad","carnê","consórcio","home equity","crédito com garantia","imóvel em garantia","veículo em garantia","alienação fiduciária","nubank","c6 bank","banco inter","picpay","mercado pago","pagbank","banco digital","bancos digitais","agiot","golpe do empréstimo","juros do consignado"]',
   '["lucro líquido","balanço do","resultado do trimestre"]',
   'credito'),
  -- ENCOLHEU (v3): só investimento EDUCATIVO. Macro (selic/ipca/copom/taxa de
  -- juros/dólar) e mercado (ibovespa/b3/dividendos/cripto/FII) SAÍRAM — eram a
  -- fonte dos 37%, e o que as fontes de finanças publicam o dia inteiro.
  ('Crédito.vc - KW investimentos', 24,
   '["como investir","onde investir","investimento para iniciantes","primeiro investimento","cdb","cdi","tesouro direto","tesouro selic","tesouro ipca","renda fixa","renda variável","renda passiva","poupança","lci","lca","juros compostos","carteira de investimentos","diversificar investimentos","perfil de investidor"]',
   '["lucro líquido","balanço","trimestre","ibovespa","ifix","dividendos","day trade","prejuízo"]',
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

-- -----------------------------------------------------------------------------
-- O CATCH-ALL (prio 10, 'Finanças (IA classifica)') é DESLIGADO aqui.
--
-- Ele é a causa real do desvio: sem keywords_include, entrega TUDO que vier de
-- fonte 'financas' — e as fontes de finanças publicam política, futebol,
-- loteria e balanço de empresa no mesmo feed. Foi assim que o blog ficou com
-- Lula, Vasco x Santos, Mega-Sena, TSE e Air Force One. Nenhum ajuste de
-- keyword nas OUTRAS regras corrige isso: elas mudam o rótulo do item, não
-- impedem a entrega. Só o catch-all impede.
--
-- Com ele desligado, o blog recebe exclusivamente o que casar uma das 7 regras
-- por keyword acima — que é o que "focado totalmente em crédito" significa. O
-- volume cai; a alternativa é ter volume com pauta alheia.
--
-- As exclusões ficam gravadas junto para o caso de você reativar a regra:
--   UPDATE distribution_rules SET is_active = true WHERE name ILIKE '%IA classifica%';
-- -----------------------------------------------------------------------------
UPDATE distribution_rules r
SET is_active = false,
    keywords_exclude = '["ibovespa","ifix","day trade","criptomoed","criptoativo","bitcoin","ethereum","lucro líquido","prejuízo líquido","balanço do","resultado trimestral","segundo trimestre","terceiro trimestre","quarto trimestre","primeiro trimestre","dividendos","juros sobre capital","oferta pública","mega-sena","lotofácil","quina","loteria","sorteio","eleição","eleições","reeleição","tse","stf","supremo","deputado","senador","ministro","campeonato","futebol","vasco","flamengo","corinthians","palmeiras","neymar","libertadores","brasileirão","guerra","ucrânia","israel","irã"]'::jsonb
FROM blogs b
WHERE b.id = r.blog_id
  AND (b.name ILIKE '%credito%' OR b.name ILIKE '%crédito%' OR b.domain ILIKE '%credito%')
  AND r.target_category IS NULL
  AND (r.keywords_include IS NULL OR jsonb_array_length(r.keywords_include) = 0);

COMMIT;

\echo ''
\echo '=== REGRAS DO CREDITO.VC (ordem de precedencia) ==='
SELECT b.name AS blog, r.priority, r.name, r.target_category,
       coalesce(jsonb_array_length(r.keywords_include), 0) AS kw_in,
       coalesce(jsonb_array_length(r.keywords_exclude), 0) AS kw_out
FROM distribution_rules r JOIN blogs b ON b.id = r.blog_id
WHERE (b.name ILIKE '%credito%' OR b.name ILIKE '%crédito%' OR b.domain ILIKE '%credito%') AND r.is_active
ORDER BY b.name, r.priority DESC, r.name;

\echo ''
\echo '=== REGRA APONTANDO PARA CATEGORIA QUE NAO EXISTE NA TAXONOMIA ==='
\echo '(o targetCategory de uma regra NAO e validado pelo localizer — e por aqui'
\echo ' que um slug inventado, tipo "otros", vira pagina orfa no blog)'
SELECT r.name, r.target_category
FROM distribution_rules r
JOIN blogs b ON b.id = r.blog_id
WHERE (b.name ILIKE '%credito%' OR b.name ILIKE '%crédito%' OR b.domain ILIKE '%credito%')
  AND r.target_category IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM blog_categories c
    WHERE c.blog_id = b.id AND c.slug = r.target_category
  );

\echo ''
\echo '=== TAXONOMIA CADASTRADA (o que o blog aceita como categoria) ==='
SELECT c.slug FROM blog_categories c JOIN blogs b ON b.id = c.blog_id
WHERE (b.name ILIKE '%credito%' OR b.name ILIKE '%crédito%' OR b.domain ILIKE '%credito%')
ORDER BY c.slug;
