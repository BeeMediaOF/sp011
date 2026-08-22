-- =============================================================================
-- CRÉDITO.VC — reclassifica o que o catch-all velho carimbou como
-- 'investimentos' + remove os itens de menu mortos.
--
-- RODA NO BANCO DO BLOG:
--   docker compose exec -T pg-blogs psql -U postgres -d creditovc -v ON_ERROR_STOP=1 < deploy/creditovc/reclassifica_investimentos.sql
--   docker compose -f /opt/blogs/creditovc/compose.yml restart api
--
-- POR QUE RECLASSIFICAR EM VEZ DE APAGAR: medido em 2026-08-18, depois da
-- limpeza de mercado, 'investimentos' era 138 de 221 artigos (62,4%). Apagar
-- mais deixaria o blog minúsculo. Os 138 já passaram pelo filtro de ticker e de
-- vocabulário de pregão, então o que sobrou não é jornalismo de mercado — é
-- pauta que a regra catch-all (sem keyword nenhuma, desligada em rules_keywords
-- v3) empurrou para 'investimentos' por ser o rótulo mais provável. Matéria de
-- empréstimo, FGTS ou consignado carimbada de investimento sobe `credito` e
-- desce `investimentos` de uma vez só, sem perder conteúdo.
--
-- O CRITÉRIO É O MESMO VOCABULÁRIO DAS REGRAS (deploy/creditovc/
-- rules_keywords.sql v3), na MESMA ordem de precedência:
--     sair-das-dividas 30 > score 28 > credito 26 > planejar-o-futuro 22 >
--     renda-extra 20 > organizar-financas 18
-- A regra de 'investimentos' NÃO é reaplicada: quem não casar nada FICA onde
-- está (é o comportamento certo — "como investir", "CDB ou Tesouro?" é
-- investimento educativo de verdade e é editoria legítima do portal).
--
-- NÃO QUEBRA LINK: a URL do artigo é /artigo/<slug>, não depende da categoria.
--
-- IDEMPOTENTE: rodar de novo só move o que ainda casar (na prática, nada).
-- =============================================================================

\echo ''
\echo '=== ANTES ================================================================='
SELECT category, count(*) AS artigos,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct
FROM articles GROUP BY category ORDER BY artigos DESC;

BEGIN;

-- O destino de cada artigo de 'investimentos', pela primeira regra que casar na
-- ordem de prioridade. `texto` junta título e subtítulo, como as regras da
-- central fazem.
CREATE TEMP TABLE destino ON COMMIT DROP AS
WITH base AS (
  SELECT id, lower(title || ' ' || coalesce(subtitle, '')) AS texto
  FROM articles WHERE category = 'investimentos'
)
SELECT id,
  CASE
    -- 30 — sair das dívidas (o exclude tira dívida PÚBLICA/externa, que é macro)
    WHEN texto ~ '(d[ií]vida|endividad|inadimpl|renegocia|limpa nome|nome sujo|negativa[dç]|calote|credor|devedor|juros abusivos|cobran[cç]a indevida|desenrola brasil|sair do vermelho)'
     AND texto !~ '(d[ií]vida p[uú]blica|d[ií]vida externa|d[ií]vida bruta|d[ií]vida l[ií]quida do setor)'
      THEN 'sair-das-dividas'
    -- 28 — score
    WHEN texto ~ '(score|serasa|scpc|cadastro positivo|pontua[cç][aã]o de cr[eé]dito|bir[oô] de cr[eé]dito|hist[oó]rico de cr[eé]dito|nome limpo|restri[cç][aã]o no cpf|limpar o cpf)'
      THEN 'score'
    -- 26 — crédito (o coração do portal). O exclude tira balanço de banco, que
    -- é notícia de mercado com nome de banco no título.
    WHEN texto ~ '(cart[aã]o de cr[eé]dito|empr[eé]stimo|consignado|financiament|financiar|credi[aá]rio|cheque especial|cr[eé]dito pessoal|cr[eé]dito imobili[aá]rio|cr[eé]dito rural|cr[eé]dito estudantil|fies|rotativo|juros do cart[aã]o|limite do cart[aã]o|limite de cr[eé]dito|an[aá]lise de cr[eé]dito|aprova[cç][aã]o de cr[eé]dito|open finance|open banking|portabilidade|fgts|saque[- ]anivers[aá]rio|casa pr[oó]pria|minha casa,? minha vida|microcr[eé]dito|custo efetivo total|refinancia|antecipa[cç][aã]o de|parcelament|carn[eê]|cons[oó]rcio|home equity|cr[eé]dito com garantia|im[oó]vel em garantia|ve[ií]culo em garantia|aliena[cç][aã]o fiduci[aá]ria|agiot|golpe do empr[eé]stimo)'
     AND texto !~ '(lucro l[ií]quido|balan[cç]o do|resultado do trimestre)'
      THEN 'credito'
    -- 22 — planejar o futuro
    WHEN texto ~ '(aposentad|previd[eê]ncia|\minss\M|pgbl|vgbl|\mbpc\M|reserva de emerg[eê]ncia|seguro de vida|heran[cç]a|testamento|invent[aá]rio|patrim[oô]ni|independ[eê]ncia financeira|liberdade financeira|tempo de contribui[cç][aã]o|regra de transi[cç][aã]o)'
      THEN 'planejar-o-futuro'
    -- 20 — renda extra
    WHEN texto ~ '(renda extra|freelance|microempreendedor|\mmei\M|vender online|fonte de renda|complementar a renda|motorista de aplicativo|entregador|dropshipping|loja virtual|brech[oó]|afiliad|monetiz|empreendedorismo|home office|trabalho remoto)'
      THEN 'renda-extra'
    -- 18 — organizar as finanças
    WHEN texto ~ '(or[cç]amento (familiar|dom[eé]stico|pessoal)|educa[cç][aã]o financeira|controle de gastos|economizar|poupar|guardar dinheiro|juntar dinheiro|finan[cç]as pessoais|planilha|custo de vida|infla[cç][aã]o|cesta b[aá]sica|sal[aá]rio m[ií]nimo|13[oº] sal[aá]rio|d[eé]cimo terceiro|imposto de renda|irpf|restitui[cç][aã]o|\mpix\M|vale[- ](refei[cç][aã]o|alimenta[cç][aã]o)|conta de luz|mesada|consumo consciente|bolsa fam[ií]lia)'
      THEN 'organizar-financas'
    ELSE NULL   -- investimento educativo de verdade: fica onde está
  END AS para
FROM base;

\echo ''
\echo '--- para onde vao (NULL = fica em investimentos) ---'
SELECT coalesce(para, '(fica em investimentos)') AS destino, count(*) AS artigos
FROM destino GROUP BY para ORDER BY count(*) DESC;

\echo ''
\echo '--- amostra do que MUDA de categoria ---'
SELECT d.para, left(a.title, 68) AS titulo
FROM destino d JOIN articles a ON a.id = d.id
WHERE d.para IS NOT NULL
ORDER BY d.para, a.published_at DESC NULLS LAST
LIMIT 20;

\echo ''
\echo '--- amostra do que FICA em investimentos ---'
SELECT left(a.title, 74) AS titulo
FROM destino d JOIN articles a ON a.id = d.id
WHERE d.para IS NULL
ORDER BY a.published_at DESC NULLS LAST
LIMIT 15;

-- O `tag` acompanha a categoria (o ingest o deriva dela, routes/ingest.ts):
-- sem isso o artigo mudaria de seção mas continuaria estampando "INVESTIMENTOS".
UPDATE articles a
SET category = d.para,
    tag      = upper(replace(d.para, '-', ' ')),
    updated_at = now()
FROM destino d
WHERE a.id = d.id AND d.para IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Itens de menu mortos. Estes três sobreviveram à poda do consolida_categorias
-- porque o caminho do menu NÃO é o slug da categoria: `/cartoes-de-credito`
-- (a categoria era `cartoes`), `/consignado-publico` (nunca existiu como
-- categoria) e `/outros` (categoria removida da taxonomia em 2026-08-18).
-- Item de menu apontando para categoria inexistente vira link para página
-- vazia — e, no caso do `/outros`, era ele que dava rota aos 199 artigos órfãos.
-- Poda os dois níveis (topo e submenu).
-- -----------------------------------------------------------------------------
UPDATE settings SET value = coalesce((
  SELECT jsonb_agg(
           CASE
             WHEN jsonb_typeof(item->'children') = 'array'
             THEN jsonb_set(item, '{children}', coalesce((
                    SELECT jsonb_agg(ch ORDER BY cord)
                    FROM jsonb_array_elements(item->'children') WITH ORDINALITY AS tc(ch, cord)
                    WHERE ch->>'path' NOT IN ('/cartoes-de-credito', '/consignado-publico', '/outros')
                  ), '[]'::jsonb))
             ELSE item
           END
           ORDER BY ord)
  FROM jsonb_array_elements(value::jsonb) WITH ORDINALITY AS t(item, ord)
  WHERE item->>'path' NOT IN ('/cartoes-de-credito', '/consignado-publico', '/outros')
), '[]'::jsonb)::text
WHERE key = 'menu_items';

COMMIT;

\echo ''
\echo '=== DEPOIS ================================================================'
SELECT category, count(*) AS artigos,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct
FROM articles GROUP BY category ORDER BY artigos DESC;
SELECT count(*) AS total FROM articles;

\echo ''
\echo '--- menu que sobrou (topo e submenu) ---'
SELECT item->>'label' AS label, item->>'path' AS path, '' AS nivel
FROM settings, jsonb_array_elements(value::jsonb) item
WHERE key = 'menu_items'
UNION ALL
SELECT ch->>'label', ch->>'path', '  (submenu)'
FROM settings, jsonb_array_elements(value::jsonb) item,
     jsonb_array_elements(item->'children') ch
WHERE key = 'menu_items' AND jsonb_typeof(item->'children') = 'array';
