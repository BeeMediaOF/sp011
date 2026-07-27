# PRDs de precisão do sistema de analytics — rede sp011

> Instrução de trabalho para o Claude Code. Anexe este arquivo à sessão e siga
> as fases 0 → 1 → 2. **Não altere código de produção nesta etapa** — o
> entregável são os PRDs em `docs/prd/` e o roadmap consolidado. Implementação
> vem depois, PRD por PRD, com aprovação a cada etapa.

Antes de começar, releia o `CLAUDE.md` da raiz do repo (contexto do projeto),
o `docs/ANALYTICS.md` e o `docs/ANALYTICS-VALIDACAO.md`. Todo trabalho aqui
precisa respeitar as invariantes do CLAUDE.md §17 (analytics) e o padrão de
deploy do §5 e §6.

## Princípio geral

O sp011 é um blog novo, e todos os blogs replicados também (rede em rollout).
Volume absoluto baixo (poucas views, poucas sessões, poucos cliques) é
**esperado** e não deve ser tratado como bug. O objetivo deste trabalho não é
fazer os números subirem — é garantir que cada métrica do dashboard de
Analytics reflita a realidade com exatidão, por menor que seja o volume.
Trate como bug apenas o que for logicamente incorreto ou inconsistente,
independente do volume.

## Contexto arquitetural relevante

O sistema de analytics vive em três lugares do monorepo:

- **`artifacts/api-server`** — ingest de eventos, agregações, endpoints do
  dashboard. Detecção de bots, marcação `is_internal`, classificação de canal
  ("canal classificado no servidor" — CLAUDE.md §17), heartbeat, `/stats`.
- **`artifacts/brasilia-agora`** — script/SDK de tracking client-side no site
  público e os componentes do painel `/admin` (dashboard de analytics,
  cards de propagandas, fontes de tráfego, etc.).
- **`lib/db`** — schema Drizzle do blog. Colunas novas se autocriam no boot
  (`ensureSchema.ts`); qualquer nova coluna precisa ser adicionada no schema
  Drizzle **E** no `ensureSchema.ts` (CLAUDE.md §17).

**Ponto crítico multi-blog:** os oito blogs da rede (sp011, ksports,
esporteagora, resenhavip, oleysports, beeesportes, pontofarma, creditovc)
rodam a **mesma imagem** `blog-api:vN` / `blog-web:vN` (CLAUDE.md §6). Ou
seja, qualquer correção no `api-server` ou no `brasilia-agora` beneficia
todos os blogs automaticamente no próximo rollout descrito no §6 — o bug do
"tráfego pago aparecendo sem campanha" que aparece nos outros sites do grupo
é o mesmo código deste repo. Isso simplifica o rollout, mas exige cuidado
extra: uma mudança errada quebra a rede inteira de uma vez.

## Dois problemas críticos já identificados

Investigue a causa raiz de cada um no código antes de propor qualquer
correção. Não assuma a causa sem confirmar.

### Problema 1 — Impressões de anúncio provavelmente falsas

No mesmo período de 30 dias em que o dashboard do sp011 registrou apenas
**3 visualizações de página reais**, o painel de Propagandas mostra
**91 impressões de anúncio** (62 + 24 + 5, distribuídas em 3 anúncios) e
0 cliques. É logicamente inconsistente — não é possível ter 91 impressões
reais associadas a 3 pageviews no mesmo site e período.

Hipótese principal (validar no código): o CLAUDE.md §17 documenta que
"tráfego interno marcado `is_internal`, NUNCA dropado". Isso está correto
para pageview (os 104 de 106 eventos marcados como interno são acessos ao
próprio painel de admin e ficam de fora dos totais). A suspeita forte é que
o evento de **impressão de anúncio** não está aplicando o mesmo filtro
`is_internal` na hora de contar — ou seja, cada carregamento do admin/preview
está inflando as impressões enquanto os pageviews reais não sobem.

Outras hipóteses a considerar (não excludentes):

- evento de impressão disparado mais de uma vez por carregamento (remount de
  componente, re-render, scroll) sem deduplicação por sessão/pageview/slot
- bots/crawlers passando no evento de impressão sem passar pelo mesmo filtro
  de bots aplicado a pageview (o painel de saúde da coleta mostra "0 bots
  filtrados" no período, o que é suspeito)
- múltiplos slots do mesmo anúncio na página contados separadamente sem
  necessidade

Só depois de garantir que a contagem de impressão é confiável, tratar
cliques. Cliques sempre em 0 pode ser real (dado o baixo tráfego) ou pode
estar quebrado — verifique se o handler de clique client-side existe e está
instrumentado antes de presumir. CTR calculado sobre base de impressões
corrompida não tem valor, então a ordem importa: impressões primeiro,
cliques/CTR depois.

### Problema 2 — "Tráfego pago" aparecendo sem campanha paga existir

O card de Fontes de Tráfego mostra 33,3% de "Tráfego pago" no sp011 mesmo
sem existir qualquer campanha paga ativa configurada hoje. E o mesmo aparece
nos outros blogs da rede. Como todos rodam a mesma imagem, a causa está
justamente na classificação de canal do `api-server` — o CLAUDE.md §17 diz
"canal classificado no servidor", então é lá que a regra vive.

Ao investigar, identifique:

- onde exatamente vive a árvore de decisão de classificação de canal
  (Direto / Pago / Orgânico / Social / Referência)
- qual regra específica está atribuindo "Pago" incorretamente (fallback/
  default errado? leitura de UTM sem validar se existe campanha ativa?
  referrer de rede de anúncio classificando visita orgânica como paga?)
- se a correção precisa considerar um mecanismo de "campanhas ativas
  cadastradas" para que "Pago" só apareça quando faz sentido

A correção nasce multi-blog por construção (mesma imagem), mas o plano de
validação precisa incluir os outros blogs onde o mesmo sintoma aparece.

## Invariantes técnicas do analytics (CLAUDE.md §17) — não quebrar

Nenhum PRD pode propor solução que viole estas regras:

- heartbeat cumulativo agregado por **MAX** (não SUM)
- tráfego interno marcado `is_internal`, **nunca dropado**
- `totals.*` do `/stats` fixos ao agora
- canal classificado **no servidor**
- migrações de coluna nova via Drizzle schema **E** `ensureSchema.ts`
- SSR só da home; `HTML` com `no-cache` (nunca `no-store` — mata bfcache)
- `sanitizeArticleHtml` isomórfico (nunca retornar `""` no servidor)

Se algum PRD precisar mexer em algo que roça uma invariante, ele precisa
declarar isso explicitamente e propor como preservar o comportamento
documentado.

## Checklist completa de métricas do dashboard de Analytics

Use como checklist de cobertura. Nenhum item pode ficar sem um PRD
responsável claro. Volume baixo em qualquer item é aceitável; dado
logicamente incorreto não é.

1. Views hoje (comparado a ontem)
2. Views · 7 dias (comparado aos 7 dias anteriores, com variação %)
3. Top categorias — lista simples por acessos
4. Propagandas (resumo): Ativas, Impressões, Cliques, CTR
5. Visualizações de página (vs período anterior)
6. Visitantes únicos (novos vs recorrentes, "desde [data]")
7. Sessões únicas
8. Tempo médio por página
9. Taxa de rejeição
10. Gráfico "Tráfego ao longo do tempo" (últimos 30 dias)
11. Fontes de tráfego (Direto, Pago, Orgânico, Social, Referência — o que
    existir de fato)
12. Dispositivos: donut Mobile/Desktop/Tablet + Navegadores + Sistemas
13. Artigos com melhor desempenho (tabela: artigo, visualizações, tempo médio)
14. Top categorias detalhado (tabela: categoria, views, cliques, nº artigos, %)
15. Localização (toggle Cidades/Estados: nome, views, %)
16. Pico por hora (gráfico de barras)
17. Pico por dia da semana (gráfico de barras)
18. Profundidade de leitura / scroll depth
19. Propagandas detalhado (30 dias): impressões, cliques, CTR médio, melhor
    anúncio
20. Desempenho por anúncio (tabela: anúncio, impressões, cliques, CTR, status)
21. Gráfico "Impressões — top 3" (série temporal por anúncio)
22. Termos mais buscados
23. Links externos clicados (por domínio de destino)
24. Resumo de interações (eventos, buscas, cliques externos, newsletter,
    compartilhamentos, leitura 100%)
25. Saúde da coleta (aceitos, gravados, bots filtrados, duplicados, rate
    limit, internos marcados, timestamps, buffer, "dados confiáveis desde")

Sobre o item 25: os 104 de 106 eventos hoje marcados como interno são
acessos ao painel de admin — comportamento **correto**, alinhado com a
invariante "tráfego interno marcado `is_internal`, nunca dropado". Trate
como algo a validar quanto à precisão (garantir que visitante real nunca é
classificado como interno por engano), não como bug a corrigir por padrão.

## Fase 0 — Auditoria

Explore o código relevante nos três lugares:

- `artifacts/api-server` (ingest, filtros de bot/interno, dedup, agregações,
  `/stats`, classificação de canal, endpoints do painel)
- `artifacts/brasilia-agora` (SDK de tracking client-side no site, componentes
  do painel `/admin` de Analytics e Propagandas)
- `lib/db` (schema Drizzle e `ensureSchema.ts`)

Consulte também `docs/ANALYTICS.md` e `docs/ANALYTICS-VALIDACAO.md` antes de
tirar conclusões — parte das perguntas provavelmente já está respondida ali.

Priorize os dois problemas críticos antes de seguir para o resto da
checklist. Para cada um dos 25 itens, determine a cadeia completa:
**evento client-side → endpoint de ingest → tabela → agregação → endpoint
do dashboard → componente de UI**. Registre se cada etapa existe, está
parcial, ausente, ou tem bug identificado.

Se algo depender de acesso ao banco do sp011 sem passar pela VPS, use o MCP
do Supabase (projeto "SP011", ref `yfmyufqfepzwjtzblths`) — CLAUDE.md §3.

Produza `docs/prd/00-auditoria-estado-atual.md` com:

- tabela cobrindo os 25 itens da checklist, com colunas: item, status (OK /
  Parcial / Ausente / Bug confirmado), evidência (arquivo:linha), etapa da
  cadeia que quebra
- seção específica sobre o Problema 1 com a análise do evento de impressão
  de anúncio (aplica `is_internal` ou não? deduplicação existe? filtro de
  bots idêntico ao do pageview?)
- seção específica sobre o Problema 2 com a árvore de decisão de
  classificação de canal e o ponto exato onde "Pago" é atribuído incorretamente
- lista de invariantes do §17 que qualquer correção proposta precisará
  respeitar

## Fase 1 — PRDs modulares

Crie um arquivo por módulo em `docs/prd/`, seguindo rigorosamente este
template:

```
## Objetivo
## Contexto / estado atual (referenciar achados da auditoria e docs/ANALYTICS.md)
## Problema a resolver
## Requisitos funcionais
## Requisitos não-funcionais (performance, LGPD, confiabilidade, multi-blog)
## Modelo de dados (colunas novas via schema Drizzle + ensureSchema.ts)
## Contrato de API (endpoints, payloads)
## Critérios de aceite (mapeados a itens da checklist E às regras do módulo 11)
## Invariantes do §17 preservadas por este PRD
## Casos de borda
## Plano de testes (node --test no pacote, dados sintéticos, validação em
   staging via MCP Supabase quando aplicável)
## Riscos e dependências de outros PRDs
## Estimativa de esforço (P/M/G)
```

Módulos, na ordem de prioridade:

**`04-propagandas-impressoes-e-cliques.md` — CRÍTICO**
Corrigir a contagem de impressões na causa raiz (aplicar filtro
`is_internal` no evento de impressão se essa for a causa confirmada;
deduplicação por sessão/pageview/slot; filtro de bots idêntico ao do
pageview). Só depois revisar a instrumentação de cliques e recalcular CTR
sobre base confiável. Definir invariante de sanidade automatizada:
impressões de um anúncio não podem exceder (pageviews não-internos da página
onde ele aparece × ocorrências do slot na página), com alerta se
violado. Este PRD é o que destrava a métrica de maior impacto comercial
(CTR reportado a anunciantes) na rede inteira.

**`05-fontes-de-trafego-e-classificacao.md` — CRÍTICO**
Mapear a árvore de decisão de classificação de canal no `api-server`
(CLAUDE.md §17: "canal classificado no servidor"), identificar onde "Pago"
está sendo atribuído incorretamente e propor a correção. Definir uma regra
que impede `paid` > 0% se não houver campanha/UTM ativa cadastrada.
Considerar se faz sentido introduzir um cadastro leve de campanhas ativas
por blog (settings) para amarrar a decisão. Teste de regressão obrigatório:
tráfego sintético sem UTM/referrer de campanha nunca deve ser classificado
como pago. Validação pós-rollout precisa incluir os outros blogs da rede
onde o mesmo sintoma aparece hoje.

**`01-modelo-de-dados-e-taxonomia-de-eventos.md`**
Consolidar todos os tipos de evento (pageview, impression_ad, click_ad,
search, click_external, scroll_depth, newsletter_signup, share,
article_read_complete, session_start, heartbeat), payload padrão de cada
um, e como cada evento se relaciona com artigo/categoria/anúncio/sessão/
visitante. Colunas novas via schema Drizzle + `ensureSchema.ts`.

**`02-tracking-client-side.md`**
SDK client-side no `brasilia-agora`, cobrindo os eventos hoje ausentes ou
incompletos: busca no site, clique em link externo, scroll depth,
inscrição em newsletter, compartilhamento, leitura 100% do artigo, e
revisão do evento de impressão de anúncio (Problema 1) e clique de
anúncio. Definir critérios de disparo (debounce de scroll, detecção de
domínio externo, dedup no cliente antes de mandar para o servidor).

**`03-ingestao-filtros-bots-deduplicacao.md`**
Endpoint de ingest no `api-server`, filtro de bots (aplicado
uniformemente a todos os tipos de evento — não só pageview),
deduplicação, rate limiting, buffer, e validação da precisão da marcação
de tráfego interno (item 25).

**`06-agregacoes-e-rollups.md`**
Jobs/queries: views/cliques por categoria, ranking de artigos por
desempenho, dispositivos/navegadores/sistemas, geografia, pico por hora e
por dia da semana, comparativos de período (hoje vs ontem, 7 dias vs 7
dias anteriores, 30 dias vs período anterior). Respeitar `totals.*` do
`/stats` fixos ao agora.

**`07-comportamento-no-site.md`**
Termos mais buscados, links externos clicados por domínio, resumo de
interações (eventos totais, buscas, cliques externos, newsletter,
compartilhamentos, leitura 100%).

**`08-painel-saude-da-coleta.md`**
Formalizar os contadores do painel de saúde como métricas de
observabilidade com alertas automáticos (ex.: alertar se a proporção de
eventos marcados como interno mudar de forma anômala, ou se impressões de
anúncio excederem o limite de sanidade do PRD 04, ou se `paid` > 0%
aparecer sem campanha cadastrada).

**`09-apis-do-dashboard.md`**
Um endpoint por card/gráfico (ou agrupado por seção), contrato de
request/response, paginação onde fizer sentido, cache/TTL apropriado.

**`10-frontend-do-dashboard.md`**
Componentes do painel `/admin` no `brasilia-agora`. Não redesenhar;
garantir estados vazios corretos para itens que genuinamente ainda não
têm eventos (ex.: "Sem dados ainda" continua valendo em blog novo),
loading states, comparativos de período e toggles.

**`11-validacao-cross-metric-e-consistencia.md`**
Regras de sanidade automatizadas aplicadas continuamente (não só em CI),
por exemplo:

- cliques ≤ impressões, sempre, para qualquer anúncio
- `paid` > 0% exige campanha/UTM ativa cadastrada
- soma das fontes de tráfego = 100%
- soma de views por categoria ≤ total de pageviews não-internos do período
- sessões ≥ visitantes únicos
- impressões de anúncio ≤ pageviews não-internos × slots × margem definida

Regras violadas geram alerta automático. Como o `api-server` é
compartilhado entre todos os blogs, as regras precisam rodar por blog
(não só no sp011).

**`12-plano-de-testes-e-validacao.md`**
Estratégia de teste dentro das limitações do repo (CLAUDE.md §14): `node
--test` no `api-server`, imports com extensão `.ts` explícita, sem `vite
build` no Windows. Script de tráfego sintético cobrindo os 25 itens e as
regras do módulo 11, com marcação de teste correta (nunca poluir dados
reais).

## Fase 2 — Roadmap consolidado

Crie `docs/prd/ROADMAP.md` com:

- sequência de PRDs por dependência (04 e 05 primeiro; 01/02/03 em
  seguida; 06/07 quando a base estiver limpa; 08/09/10 depois; 11 rodando
  contínuo desde o início da implementação; 12 antes de cada rollout)
- Definition of Done geral: nenhuma métrica do dashboard viola uma regra
  de consistência do PRD 11, em nenhum blog da rede, independentemente do
  volume de tráfego
- plano de rollout multi-blog seguindo o padrão do CLAUDE.md §6:
  bump `BLOG_IMAGE_VERSION`, build de `api web` no sp011, canário em
  `resenhavip` (ou outro combinado), validação por
  `curl https://<dominio>/api/site` e checagem manual dos cards afetados,
  depois demais blogs. Cada PRD implementado precisa listar quais cards
  do dashboard revalidar depois do rollout, em quais blogs
- lista final confirmando que cada um dos 25 itens da checklist e cada
  regra do PRD 11 tem um PRD responsável claro

## Regras gerais

- Volume baixo não é bug (blogs novos). Dado logicamente impossível ou
  inconsistente é bug, independente do volume.
- Confirme a causa raiz no código antes de propor correção — não assuma.
- Nenhum PRD pode quebrar as invariantes do CLAUDE.md §17.
- Novas colunas: sempre no schema Drizzle **e** no `ensureSchema.ts`
  (deploy não roda `drizzle-kit push`).
- Toda correção neste código é multi-blog por construção. Cada PRD precisa
  descrever explicitamente o impacto e o plano de validação nos outros
  blogs da rede.
- Considere LGPD ao lidar com geolocalização/IP e dados comportamentais —
  parte da rede opera com conteúdo político-adjacente.
- Responder ao usuário sempre em pt-BR (CLAUDE.md §18).
- Após qualquer commit relacionado a este trabalho (quando a fase de
  implementação começar), terminar a resposta com o bloco de comandos VPS
  pronto para colar, seguindo o padrão dos §5 e §6 do CLAUDE.md.
- Não implemente nada nesta etapa. Entregue somente os PRDs e o roadmap
  em `docs/prd/`. Implementação vem depois, PRD por PRD, com aprovação a
  cada etapa.
