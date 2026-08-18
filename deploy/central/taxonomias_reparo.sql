-- =============================================================================
-- CENTRAL — reparo das taxonomias corrompidas pelo bug do slugify
--
--   cd /opt/sp011
--   DBURL=$(grep -m1 '^CENTRAL_DATABASE_URL=' .env.central | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
--   docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 < deploy/central/taxonomias_reparo.sql
--
-- IDEMPOTENTE: reescreve a taxonomia de cada blog com a lista do KIT (este
-- arquivo e GERADO a partir dos deploy/<blog>/sources_*.sql). Rodar de novo nao
-- faz mal.
--
-- O BUG (2026-08-14): `normalizeCategories` (central-hub) removia acentos com
-- uma classe escrita com barra DUPLA. Isso deixa de ser o intervalo de marcas
-- combinantes e vira uma classe com os caracteres da propria sequencia de
-- escape, apagando `u`, `f` e todos os DIGITOS do slug. Como os kits gravam a
-- taxonomia por SQL, o estrago so aparecia depois de alguem SALVAR o blog no
-- painel -- e slug sem u/f/digito passava intacto, o que disfarcava metade da
-- lista.
--
-- MEDIDO NA REDE EM 2026-08-18 (os 10 blogs com taxonomia estavam atingidos):
--     copa-do-mundo     -> copa-do-mndo        futebol   -> tebol
--     futebol-americano -> tebol-americano     outros    -> otros
--     f1                -> ''  (SUMIU da lista: perdeu o `f` e o digito)
--     world-cup -> world-cp   football -> ootball   formula-1 -> ormla   nfl -> nl
--     fiscal-tributario -> iscal-tribtario   equipe  -> eqipe
--     saude-categorias  -> sade-categorias    turismo -> trismo
--
-- POR QUE A REDE NAO QUEBROU: `resolveDeliveryCategory` devolve o
-- `targetCategory` da regra SEM validar contra a taxonomia, e quase toda entrega
-- vem por regra com target fixo. Quem sofreu foi a entrega SEM target: a
-- classificacao da IA E validada contra esta lista, nao casava nada, e caia no
-- fallback -- o ultimo slug, que era o `otros` corrompido. Foi assim que 117
-- artigos do credito.vc foram parar numa rota inexistente.
--
-- Codigo corrigido em `central-hub/src/lib/taxonomy.ts` (com teste). SUBA O
-- central-api ANTES, senao o proximo Salvar no painel corrompe de novo.
-- =============================================================================

\echo ''
\echo '=== ANTES - taxonomia de TODOS os blogs ==================================='
SELECT b.name, string_agg(c->>'slug', ', ' ORDER BY ord) AS slugs
FROM blogs b
LEFT JOIN LATERAL jsonb_array_elements(coalesce(b.categories,'[]'::jsonb)) WITH ORDINALITY AS t(c, ord) ON true
GROUP BY b.name ORDER BY b.name;

\echo ''
\echo '=== CONFERENCIA DOS MATCHERS (cada linha tem que listar so o blog certo) =='
SELECT 'esporte pt-BR' AS grupo, string_agg(name, ', ' ORDER BY name) AS blogs
FROM blogs WHERE (name ILIKE '%esporte%agora%' OR domain ILIKE '%esporteagora%'
    OR name ILIKE '%resenha%'      OR domain ILIKE '%resenhavip%'
    OR name ILIKE '%oley%'         OR domain ILIKE '%oleysports%'
    OR name ILIKE '%bee%esporte%'  OR domain ILIKE '%beeesportes%'
    OR name ILIKE '%aposta%ganha%' OR domain ILIKE '%apostaganha%'
    OR name ILIKE '%receba%bet%'   OR domain ILIKE '%recebabet%')
UNION ALL SELECT 'ksports',     string_agg(name, ', ' ORDER BY name) FROM blogs WHERE name ILIKE '%ksports%'    OR domain ILIKE '%ksports%'
UNION ALL SELECT 'pontofarma',  string_agg(name, ', ' ORDER BY name) FROM blogs WHERE name ILIKE '%farma%'      OR domain ILIKE '%pontofarma%'
UNION ALL SELECT 'ocomandante', string_agg(name, ', ' ORDER BY name) FROM blogs WHERE name ILIKE '%comandante%' OR domain ILIKE '%comandante%'
UNION ALL SELECT 'creditovc',   string_agg(name, ', ' ORDER BY name) FROM blogs WHERE name ILIKE '%credito%' OR name ILIKE '%crédito%' OR domain ILIKE '%credito%';

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Credito.vc -- SEM `outros` (decisao de 2026-08-18).
--
-- O `outros` era o balde do classificador: tudo que a IA nao soubesse encaixar
-- caia nele. E o oposto de "blog focado" -- e, pior, a categoria nem existe em
-- Categorias no admin do blog, entao os 199 artigos que foram parar la viraram
-- pagina orfa (nenhum link do site chega neles).
--
-- SEM BALDE, QUEM BARRA PAUTA ALHEIA SAO AS REGRAS. As 7 do credito.vc tem
-- target fixo e o catch-all esta desligado (deploy/creditovc/rules_keywords.sql
-- v3). A conferencia "REGRA ATIVA SEM TARGET" no fim prova isso; se ela voltar
-- com linha, o balde precisa voltar ANTES.
-- -----------------------------------------------------------------------------
UPDATE blogs SET categories = '[
  {"slug":"credito","hint":"empréstimos, financiamentos, cartão de crédito, consignado, juros, CET, golpes financeiros, direitos do consumidor"},
  {"slug":"sair-das-dividas","hint":"dívidas, nome sujo, negociação/renegociação, mutirões, Serasa/SPC"},
  {"slug":"score","hint":"score de crédito, consulta de CPF, cadastro positivo"},
  {"slug":"organizar-financas","hint":"orçamento doméstico, economizar dinheiro, planilhas, contas de casa"},
  {"slug":"renda-extra","hint":"renda extra, MEI, freelas, bicos, pequenos negócios próprios"},
  {"slug":"planejar-o-futuro","hint":"reserva de emergência, previdência, aposentadoria, juntar dinheiro para objetivos"},
  {"slug":"investimentos","hint":"investimentos EDUCATIVOS: renda fixa, CDB, poupança, primeiro investimento. Nao e noticia de mercado/balanco"}
]'::jsonb, updated_at = now()
WHERE name ILIKE '%credito%' OR name ILIKE '%crédito%' OR domain ILIKE '%credito%';

-- -----------------------------------------------------------------------------
-- 2. Os 6 blogs de esporte pt-BR -- taxonomia IDENTICA nos 6 kits (o gerador
--    deste arquivo aborta se algum divergir). Repara copa-do-mundo, futebol,
--    futebol-americano e outros, e traz de volta o `f1`, que o bug apagava por
--    inteiro. `outros` fica por ULTIMO de proposito: e o balde do fallback.
-- -----------------------------------------------------------------------------
UPDATE blogs SET categories = '[
  {"slug":"copa-do-mundo","hint":"Copa do Mundo FIFA"},
  {"slug":"futebol","hint":"futebol de clubes e seleções"},
  {"slug":"volei","hint":"vôlei de quadra e de praia"},
  {"slug":"tenis","hint":"tênis (ATP, WTA, Grand Slams)"},
  {"slug":"f1","hint":"Fórmula 1 / automobilismo"},
  {"slug":"futebol-americano","hint":"futebol americano (NFL, Super Bowl)"},
  {"slug":"e-sports","hint":"esportes eletrônicos / games competitivos"},
  {"slug":"outros","hint":"o que não couber acima (ex.: NBA, boxe, MMA, olimpíadas, surfe)"}
]'::jsonb, updated_at = now()
WHERE (name ILIKE '%esporte%agora%' OR domain ILIKE '%esporteagora%'
    OR name ILIKE '%resenha%'      OR domain ILIKE '%resenhavip%'
    OR name ILIKE '%oley%'         OR domain ILIKE '%oleysports%'
    OR name ILIKE '%bee%esporte%'  OR domain ILIKE '%beeesportes%'
    OR name ILIKE '%aposta%ganha%' OR domain ILIKE '%apostaganha%'
    OR name ILIKE '%receba%bet%'   OR domain ILIKE '%recebabet%');

-- -----------------------------------------------------------------------------
-- 3. KSports (EN) -- slugs em INGLES de proposito (CLAUDE.md sec.4): slug igual
--    ao dos irmaos pt-BR mandaria noticia em portugues para ca e dispararia
--    traducao a toa.
-- -----------------------------------------------------------------------------
UPDATE blogs SET categories = '[
  {"slug":"world-cup","hint":"FIFA World Cup"},
  {"slug":"football","hint":"club & international soccer"},
  {"slug":"volleyball","hint":"volleyball (indoor & beach)"},
  {"slug":"tennis","hint":"tennis (ATP, WTA, Grand Slams)"},
  {"slug":"formula-1","hint":"F1 / motorsport"},
  {"slug":"nfl","hint":"american football"},
  {"slug":"esports","hint":"competitive gaming / esports"},
  {"slug":"others","hint":"anything that does not fit the categories above (e.g. NBA, olympics, boxing)"}
]'::jsonb, updated_at = now()
WHERE name ILIKE '%ksports%' OR domain ILIKE '%ksports%';

-- -----------------------------------------------------------------------------
-- 4. PontoFarma
-- -----------------------------------------------------------------------------
UPDATE blogs SET categories = '[
  {"slug":"gestao","hint":"gestão da farmácia: financeiro, precificação, CMV, margem, DRE, indicadores"},
  {"slug":"fiscal-tributario","hint":"impostos, Reforma Tributária, CBS/IBS, Simples Nacional, obrigações fiscais"},
  {"slug":"legislacao","hint":"ANVISA, SNGPC, RDCs, medicamentos controlados, boas práticas, compliance sanitário"},
  {"slug":"mercado","hint":"dados do setor, indústria farmacêutica, distribuidoras, laboratórios, redes, tendências"},
  {"slug":"vendas","hint":"vendas no balcão, ticket médio, mix de produtos, atendimento ao cliente"},
  {"slug":"equipe","hint":"liderança, treinamento, contratação, retenção e remuneração de equipe"},
  {"slug":"tecnologia","hint":"sistemas de gestão, ERP, automação, PDV, farmácia digital"},
  {"slug":"saude-categorias","hint":"categorias de produtos (dermocosméticos, MIPs, fitoterápicos, nutrição) e saúde pública que afeta a farmácia"},
  {"slug":"outros","hint":"o que não couber acima"}
]'::jsonb, updated_at = now()
WHERE name ILIKE '%farma%' OR domain ILIKE '%pontofarma%';

-- -----------------------------------------------------------------------------
-- 5. O Comandante News -- 4 editorias, SEM balde. Como o credito.vc, depende de
--    todas as regras ativas terem target (a conferencia no fim cobre a rede).
-- -----------------------------------------------------------------------------
UPDATE blogs SET categories = '[
  {"slug":"negocios","hint":"empresas, fusões e aquisições, startups, balanços e resultados, varejo, gestão, carreira executiva"},
  {"slug":"economia","hint":"macroeconomia, Selic e juros, inflação, câmbio, PIB, impostos e reforma tributária, emprego, contas públicas"},
  {"slug":"aviacao","hint":"companhias aéreas, aeroportos, aeronaves, ANAC, malha aérea, fabricantes (Embraer, Boeing, Airbus), aviação executiva"},
  {"slug":"turismo","hint":"destinos, hotelaria, agências e operadoras, cruzeiros, pacotes e passagens, eventos do trade de viagens"}
]'::jsonb, updated_at = now()
WHERE name ILIKE '%comandante%' OR domain ILIKE '%comandante%';

-- O SP011 fica DE FORA: taxonomia vazia e o estado correto dele (catch-all da
-- rede). Com `categories` vazia, `needsClassification` e falso e o ingest usa a
-- categoria que a propria noticia trouxe -- e as 18 regras dele tem target fixo.

COMMIT;

\echo ''
\echo '=== DEPOIS - taxonomia de TODOS os blogs =================================='
SELECT b.name, string_agg(c->>'slug', ', ' ORDER BY ord) AS slugs
FROM blogs b
LEFT JOIN LATERAL jsonb_array_elements(coalesce(b.categories,'[]'::jsonb)) WITH ORDINALITY AS t(c, ord) ON true
GROUP BY b.name ORDER BY b.name;

\echo ''
\echo '=== REGRA ATIVA SEM TARGET, POR BLOG ======================================'
\echo '(entrega sem target vai para a IA; o que ela nao classificar cai no balde'
\echo ' outros/others, ou no ULTIMO slug da lista se o blog nao tiver balde.'
\echo ' credito.vc e O Comandante NAO tem balde -> aqui tem que vir vazio.)'
SELECT b.name AS blog, count(*) AS regras_sem_target,
       string_agg(r.name, ', ' ORDER BY r.priority DESC) AS quais
FROM distribution_rules r JOIN blogs b ON b.id = r.blog_id
WHERE r.is_active AND r.target_category IS NULL
GROUP BY b.name ORDER BY b.name;

\echo ''
\echo '=== REGRA APONTANDO PARA CATEGORIA INEXISTENTE ============================'
\echo '(so o SP011 deve sobrar: taxonomia vazia de proposito)'
SELECT b.name AS blog, count(*) AS regras, string_agg(DISTINCT r.target_category, ', ') AS categorias
FROM distribution_rules r JOIN blogs b ON b.id = r.blog_id
WHERE r.target_category IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(b.categories,'[]'::jsonb)) c
    WHERE c->>'slug' = r.target_category
  )
GROUP BY b.name ORDER BY b.name;
