# PRD 11 — Validação cross-metric e consistência contínua (por blog)

> **O que é este documento.** PRD de implementação, escrito para ser consumido pelo
> Claude Code numa sessão futura SEM o contexto da auditoria — autocontido: dá para
> executar lendo só este arquivo. Fontes: `analytics-audit/00-auditoria-estado-atual.md`
> (Fase 0.2, achados com evidência), `analytics-audit/00-inventario.md` (mapa; §8 tem
> correções de linha), `analytics-audit/STATUS.md` (FRONTEIRAS entre PRDs),
> `PRD_ANALYTICS_PLANEJAMENTO_v2.md` (template e descrição do módulo 11), `docs/ANALYTICS.md`
> e CLAUDE.md §§5, 6, 12, 14, 17. As evidências `arquivo:linha` foram REABERTAS nos
> arquivos reais na sessão de escrita (2026-07-23), exceto onde marcado "(cf. auditoria)"
> ou "(cf. PRD NN)".
>
> **Passe de revisão (2026-07-23)** — evidências reconferidas nos arquivos reais e
> corrigidas: (1) `startScheduler()` é montado em `artifacts/api-server/src/index.ts:193`,
> **não** em `routes/index.ts`; (2) o sink durável é `logSecurity` →
> `security_logs` (`api/lib/audit.ts:45-64`), **não** o `securityAlert.ts` (que é
> webhook opt-in e vira no-op sem `SECURITY_ALERT_WEBHOOK_URL`); (3) `AD_SANITY_MARGIN`
> é declarada pelo PRD 08, não pelo 04; (4) `uniqueSessions` da janela é
> `analytics.ts:506` (`:426` é a janela anterior); (5) decisão delegada pelo PRD 04
> RF6 (`CLICK_TOLERANCE`) tomada no RF1; (6) mapa de ids PRD 08 ↔ PRD 11 no §14.
>
> **Princípio obrigatório:** volume baixo NÃO é bug — os blogs são novos. Bug é o que
> for logicamente incorreto ou inconsistente, independente do volume. Corolário para
> este PRD: nenhuma regra pode disparar por número pequeno; toda regra exige uma
> IDENTIDADE LÓGICA QUEBRADA ou um DADO IMPOSSÍVEL (cliques > impressões, soma das
> fontes ≠ 100%, % exibido > 100%, sessões < visitantes), nunca volume absoluto. Em
> blog novo com zero tráfego, o estado esperado é "nenhuma violação" — e isso é
> sucesso, não falta de dado.
>
> **Multi-blog:** os 8 blogs (sp011, ksports, esporteagora, resenhavip, oleysports,
> beeesportes, pontofarma, creditovc) rodam a MESMA imagem `blog-api:vN`/`blog-web:vN`
> (CLAUDE.md §6). O motor de validação roda DENTRO de cada api-server, contra o banco
> DO PRÓPRIO blog — é POR BLOG por construção. Nenhuma lógica pode ser condicionada a
> BLOG_ID (CLAUDE.md §13/§17).
>
> **Encurtamentos:** `api = artifacts/api-server/src`, `web = artifacts/brasilia-agora/src`,
> `db = lib/db/src`.

---

## 1. Objetivo

Criar um **motor de sanidade cross-metric que roda continuamente em cada blog** (não
só quando alguém abre o painel, não só em CI), avaliando um catálogo fechado de
regras de consistência lógica entre métricas do dashboard. Quando uma regra é
violada, o motor **registra e sinaliza — nunca corrige o dado silenciosamente**.

Este PRD é o DONO das regras contínuas; o PRD 08 é a superfície de exposição/alerta
delas no painel (fronteira literal do STATUS.md: "regras de sanidade contínuas =
PRD 11; PRD 08 é a superfície de exposição/alerta"). Para evitar duas verdades, as
regras viram **funções puras canônicas em `api/lib/analyticsSanity.ts`**, que tanto
o scheduler contínuo deste PRD quanto o `evaluateHealthAlerts` on-demand do PRD 08
consomem — uma definição, dois chamadores.

Regras cobertas (mandato do doc v2, módulo 11):

1. `clicks ≤ impressions`, sempre, para qualquer anúncio.
2. `paid > 0%` exige campanha/UTM ativa cadastrada.
3. Soma das fontes de tráfego = 100%.
4. Soma de views por categoria ≤ total de pageviews não-internos do período.
5. `sessões ≥ visitantes únicos`.
6. `impressões de anúncio ≤ pageviews não-internos × slots × margem`.
7. Percentuais exibidos nunca > 100% (itens 3/14 da checklist).

Itens da checklist do doc v2 protegidos por este PRD: **4, 19, 20, 21** (sanidade de
anúncios), **11** (pago sem campanha; soma das fontes), **3, 14** (percentuais > 100%),
e a consistência estrutural de **5, 6, 7** (pageviews/sessões/visitantes). Não é um
card novo: é uma malha de invariantes sobre os cards existentes.

---

## 2. Contexto / estado atual (achados da auditoria, com evidência)

### 2.1 Por que uma malha contínua, e não só testes

A auditoria (Fase 0.2) provou que várias métricas do dashboard podem exibir dados
logicamente impossíveis **sem nenhum sinal** — só percebidos quando o operador
olhou o número certo (o "91 impressões vs 3 pageviews" foi notado a olho).
⚠️ Esses números de produção são **relatados pelo operador** e a auditoria os rotula
**Hipótese**: nenhum foi conferido no banco (MCP Supabase não conectado). O que está
Confirmado no código é o MECANISMO, não a composição — e é o mecanismo que este PRD
vigia. Com 8 blogs na mesma imagem, a inspeção manual não escala e um `node --test`
só cobre código, não o DADO acumulado em produção de cada blog. As inconsistências
vigiadas (todas Confirmado no código pela auditoria):

- **Impressões desproporcionais (itens 4/19/20/21, Bug)** — upsert de
  `ad_daily_stats` sem UNIQUE (auditoria §2.2 claim (i); corrigido pelo PRD 04, mas a
  regra contínua garante que não volte, e que os DADOS de cada blog estejam sãos
  após o reparo).
- **"Tráfego pago" sem campanha (item 11, Bug)** — `classifyChannel` atribui pago
  pela presença de fbclid/gclid (auditoria §3.2 claims (c1)/(c2); corrigido pelo
  PRD 05).
- **Percentuais estourando 100% (itens 3/14, Bug)** — normalização pela 1ª linha do
  ranking quando o líder vem do fallback por nº de artigos
  (`Analytics.tsx:350,793-795`; `Dashboard.tsx:343-344`; sort
  `analytics.ts:589` — auditoria §4.1; corrigidos por PRD 06/10, vigiados aqui).
- **Recorrentes/visitantes vs sessões (item 6, Parcial)** — `EXISTS` de recorrentes
  sem `is_internal`/`type` (`analytics.ts:479-481` — auditoria §4.2; corrigido por
  PRD 06). A invariante `sessões ≥ visitantes únicos` é uma checagem estrutural
  independente dessa correção.

**Evidência reproduzida** (trechos verbatim, arquivos reabertos em 2026-07-23 — para
o PRD ser executável sem abrir a auditoria):

```ts
// artifacts/api-server/src/routes/analytics.ts:589 — sort "por acessos" com fallback
// por nº de artigos: categoria com ZERO acesso e muitos artigos pode LIDERAR.
})).sort((a, b) => (b.clicks + b.views || b.articles) - (a.clicks + a.views || a.articles)).slice(0, 10);

// artifacts/brasilia-agora/src/pages/admin/Analytics.tsx:350 — base do % (item 14)
const maxCatViews = topCats[0] ? ((topCats[0].clicks || 0) + (topCats[0].views || 0)) || 1 : 1;

// artifacts/brasilia-agora/src/pages/admin/Analytics.tsx:793-795 — chip de %
const totalActivity = (cat.clicks || 0) + (cat.views || 0);
const maxActivity = topCats[0] ? ((topCats[0].clicks || 0) + (topCats[0].views || 0)) || 1 : 1;
const pct = ((totalActivity / maxActivity) * 100).toFixed(1);
// líder por fallback (atividade 0) => maxActivity = 1 => pct pode dar "300.0" (>100%)

// artifacts/brasilia-agora/src/pages/admin/Dashboard.tsx:343-344 — mesma classe de erro
const maxViews = stats.topCategories[0].views || 1;
const pct = Math.round((cat.views / maxViews) * 100);
```

```sql
-- artifacts/api-server/src/routes/analytics.ts:477-481 — EXISTS de recorrentes SEM
-- is_internal e SEM filtro de type (visitante 100% interno pré-janela vira "recorrente")
SELECT
  (SELECT count(*) FROM win_visitors)::int AS uniq,
  (SELECT count(*) FROM win_visitors w WHERE EXISTS (
    SELECT 1 FROM analytics_events e WHERE e.visitor_id = w.vid AND e.ts < ${winFrom}
  ))::int AS returning
```

### 2.2 Precedentes de infraestrutura no código que este PRD reusa

- **Scheduler de background já existe**: `startScheduler()` (definição
  `api/lib/scheduler.ts:347`) é chamado no boot em **`artifacts/api-server/src/index.ts:193`**
  — NÃO em `routes/index.ts` (`app.ts:202` registra por que: *"startScheduler() saiu
  do import: roda no index.ts, após o banco inicializar"*). Ali ao lado ficam
  `startSocialCron()` (`:196`) e `startSocialAutomation()` (`:199`) — é exatamente
  esse o ponto de montagem do monitor deste PRD (depois do banco pronto, o que o
  coletor exige). Padrão de worker periódico `setInterval` com guarda de execução
  única. Este PRD adiciona um monitor análogo, NÃO acopla ao scheduler de RSS (que
  está dormente — CLAUDE.md §11).
- **Sink durável de alerta já existe — e NÃO é o `securityAlert`** (correção de
  evidência, arquivos reabertos): quem PERSISTE é `logSecurity(params)`
  (`api/lib/audit.ts:45-64`), que faz `db.insert(securityLogsTable)` (tabela
  `security_logs`, `lib/db/src/schema/logs.ts:18`) e, em seguida, chama
  `dispatchAlert` fire-and-forget (`audit.ts:60`; o comentário `:58-59` diz literalmente
  *"o insert acima é a fonte da verdade"*). Já `api/lib/securityAlert.ts:18-57` é só um
  **webhook opt-in**: sem `SECURITY_ALERT_WEBHOOK_URL` ele é no-op com `logger.warn`
  (`:32-38`). Consequência para o RF4: a emissão durável é `logSecurity`; o webhook é
  bônus. `securityAlertCore.ts` (lógica pura separada da emissão) é o mesmo padrão
  arquitetural que este PRD segue.
  - Contrato de `logSecurity` (`audit.ts:33-43`): `severity` é enum estrito
    `"low" | "medium" | "high" | "critical"` — **`warning` NÃO é valor válido**; o
    mapeamento obrigatório é `critical → "critical"` e (se algum dia um `warning` for
    persistido) `warning → "medium"`. Campos usados: `eventType`, `severity`,
    `description`, `route`; `ipAddress`/`userId`/`userEmail` ficam vazios (não há
    usuário nem IP numa violação de sanidade — e não introduzir PII é RNF, §5).
  - Throttle: `dispatchAlert` já debouncia, mas por `(eventType, ipAddress)` com
    `ALERT_DEBOUNCE_MS = 300_000` (5 min) fixo (`securityAlertCore.ts:12,:22`;
    `securityAlert.ts:29`). Como a chave deste PRD é `(rule, scope)` e a janela é 6h,
    o throttle do RF4 é um `Map` próprio do monitor — não dá para obtê-lo de graça
    do `dispatchAlert`. (`resolveDispatch` aceita `debounceMs` por parâmetro
    — `securityAlertCore.ts:45` — mas `dispatchAlert` passa a constante fixa.)
- **Contrato "zero imports" para lógica pura**: `api/lib/analyticsShared.ts:1-7` —
  docstring literal *"lógica pura do pipeline de analytics (zero imports) … é o alvo
  direto dos testes `node --test`"*. `api/lib/analyticsSanity.ts` segue o mesmo
  contrato.
- **Helpers de sanidade de anúncio já definidos pelo PRD 04**:
  `checkAdSanity(impressions, pageviews, slots, margin)` e
  `checkClicksVsImpressions(clicks, impressions)` em `analyticsShared.ts`, ambos com
  retorno **`{ ok, ratio, limit }`** (PRD 04 §4/RF6, entregável (a)) — este PRD os
  CONSOME (não redefine) para as regras R1 e R6, e preenche `SanityViolation.limit`
  com o `limit` devolvido pelo helper.
  ⚠️ A constante `AD_SANITY_MARGIN = 3` NÃO é declarada pelo PRD 04 (que define só a
  fórmula `M` e os helpers): hoje ela nasce no PRD 08, em `healthAlerts.ts` (PRD 08
  RF3/§7.2). Este PRD **importa** de onde ela existir e nunca cria uma segunda cópia;
  na reconciliação do §14 ela migra para `analyticsSanity.ts` e `healthAlerts.ts`
  passa a reexportá-la.
- **Motor on-demand de alerta do PRD 08** (artefato FUTURO — `healthAlerts.ts` ainda
  não existe no repo em 2026-07-23; `ls artifacts/api-server/src/lib` não o retorna):
  `evaluateHealthAlerts` em `api/lib/healthAlerts.ts` (PRD 08 §4/RF3) implementa
  `ad_sanity`, `ad_clicks_gt_impressions`, `paid_without_campaign` como avaliação
  quando o admin abre o `/health`. Este PRD é o chamador CONTÍNUO das MESMAS regras +
  as regras que o PRD 08 não surface (R3 soma=100%, R4 views×pageviews, R5
  sessões×visitantes, R7 %>100%). Os ids diferem entre os dois PRDs — o mapa
  obrigatório está no §14. Ver reconciliação em §14.
- **Acesso a settings memoizado sem restart**: `internalIpSet()`
  (`analytics.ts:140-149`) / `activePaidCampaigns()` (PRD 05 RF3) — a regra R2 lê o
  cadastro por esse caminho.
- **Constante de corte**: `PAID_RULE_SINCE` (PRD 05 RF5, em `analyticsShared.ts`) —
  a regra R2 só conta linhas `pago` a partir do corte.

### 2.3 Fronteiras do STATUS.md que governam este PRD

- Regras de sanidade contínuas = ESTE PRD; superfície de exposição/alerta = **PRD
  08**. Portanto o motor deste PRD NÃO desenha UI; ele produz um relatório que o
  PRD 08 lê e mostra, e emite ao log/canal durável.
- Contadores por endpoint (bots/rate/internos) = incremento no **PRD 03**,
  exposição no **PRD 08** — NÃO são regras cross-metric; ficam fora deste PRD.
- Definição das fórmulas de anúncio (`checkAdSanity`, margem M, slots S) = **PRD
  04**; este PRD as consome. O `adDailyChart` (`analytics.ts:651-670`, com a
  **sobrescrita** da `:658-661` — `adDailyByDate[date][adId] = {…}` em vez de soma)
  também é do PRD 04: o coletor RF2 **nunca** lê o chart, lê as linhas cruas de
  `ad_daily_stats` como a query `analytics.ts:487-490` — usar o chart importaria o
  defeito para dentro da malha.
- Dedup do evento `category` no ingest (escapa do 15s do pageview) = **PRD 03**;
  cobertura do `link_click` = **PRD 02**. A regra R4 usa apenas `views` (não
  `clicks`), justamente para não depender dessa fronteira.
- Definição de "pago exige campanha" e do cadastro `paidCampaigns` = **PRD 05**;
  este PRD verifica a consequência ("pago sem campanha ativa").

---

## 3. Problema a resolver

1. **Não existe malha de consistência**: cada card é calculado isoladamente; nada
   verifica que os números são MUTUAMENTE coerentes (cliques ≤ impressões, soma das
   fontes = 100%, sessões ≥ visitantes). Uma regressão futura em qualquer PRD pode
   reintroduzir dado impossível sem sinal.
2. **Verificação só on-demand não basta**: o PRD 08 avalia alertas quando o admin
   abre o painel; um blog cujo operador nunca abre o painel (comum na rede)
   acumularia inconsistência invisível.
3. **Risco de "correção silenciosa"**: a tentação de "consertar" um número
   inconsistente no cálculo mascara a causa. A regra deste PRD é o oposto: DETECTAR
   e SINALIZAR, deixar o dado como está, apontar para o PRD dono da causa.
4. **Multi-blog**: a mesma regressão de código afeta os 8 blogs; a malha precisa
   rodar por blog, contra o banco de cada um, sem passo manual.

---

## 4. Requisitos funcionais

Ordem recomendada: RF1 (catálogo puro) → RF2 (coletor de insumos) → RF3 (monitor
contínuo) → RF4 (relatório/emissão) → RF5 (endpoint de leitura para o PRD 08/09) →
RF6 (docs). Tudo cabe numa única imagem/rollout.

### RF1 — Catálogo de regras como funções puras (`api/lib/analyticsSanity.ts`)

Novo módulo com contrato "zero imports" (padrão `analyticsShared.ts:1-7`; alvo de
`node --test`). Cada regra é uma função pura que recebe números já agregados e
devolve um veredito. **Nenhuma regra acessa banco, rede ou relógio** (o instante é
injetado).

```ts
export type Severity = "critical" | "warning";

export interface SanityViolation {
  rule: string;                 // id estável (ver catálogo)
  severity: Severity;
  scope: string;                // "" (blog) | "ad:<id>" | "day:<YYYY-MM-DD>" | "cat:<slug>"
  observed: number;             // valor medido que viola
  limit: number;                // limite/esperado
  detail: string;               // frase curta, determinística (sem locale)
}

export interface SanityInput {
  // R1/R6 — por (anúncio, dia BRT), já filtrado por adsReliableSince (PRD 04)
  adDays: { adId: string; date: string; impressions: number; clicks: number;
            pageviews: number; slots: number }[];
  adMargin: number;             // valor de M (3 até o PRD 02; 1.5 depois — PRD 04 RF6).
                                // Constante AD_SANITY_MARGIN: importar de onde existir
                                // (hoje healthAlerts.ts, PRD 08) — NUNCA redeclarar.

  // R2 — canal pago × cadastro (PRD 05)
  paid: { activeCampaigns: number; paidLinesSinceRule: number } | null;

  // R3 — fontes de tráfego da janela (valores absolutos do referrerChart)
  channelCounts: Record<string, number>;   // { direto, busca, social, pago, ... }

  // R4 — views por categoria × pageviews não-internos da janela
  categoryViews: { slug: string; views: number }[];
  windowPageviewsNonInternal: number;

  // R5 — sessões × visitantes únicos da janela
  windowSessions: number;
  windowUniqueVisitors: number;

  // R7 — percentuais já calculados como o front os exibe (itens 3/14)
  displayedPercents: { scope: string; pct: number }[];
}

export const CATEGORY_TOLERANCE = 1;   // 1 pageview de folga (skew de buffer ~30s — auditoria §4.2)
export const PERCENT_CEILING = 100.0;  // + epsilon de arredondamento
export const CLICK_TOLERANCE = 1;      // folga do clique antes do dwell de 1s — ver decisão abaixo

export function evaluateSanity(input: SanityInput): SanityViolation[];
```

**Decisão delegada pelo PRD 04 (RF6, literal: "o PRD 11 decide se aperta para `≤`
estrito quando o PRD 02 disparar impressão no clique")** — DECIDIDO AQUI:
`CLICK_TOLERANCE = 1` enquanto o PRD 02 não disparar impressão junto do clique;
quando disparar, vira `0` (regra `clicks > impressions` estrita). É mudança de
CONSTANTE, não de lógica: 1 linha + o teste de fronteira do §12 passa a esperar
`clicks = impressions + 1` → **viola**. Registrar a virada no `docs/ANALYTICS.md`
(RF6) junto com a queda de `AD_SANITY_MARGIN` de 3 para 1.5 — as duas acompanham o
mesmo marco (PRD 02 alinhar a admissão).

**Catálogo fechado (regras EXATAS, nada subjetivo):**

| id | Severidade | Regra (viola quando…) | Fonte | Item protegido |
|---|---|---|---|---|
| `clicks_gt_impressions` | critical | por linha de `adDays`: `checkClicksVsImpressions(clicks, impressions).ok === false`, i.e. `clicks > impressions + CLICK_TOLERANCE` (hoje `+1`: cobre o clique legítimo antes do dwell de 1s — PRD 04 RF6) | PRD 04 RF6 | 4, 20 |
| `impressions_gt_pageviews` | warning (→ critical quando `adMargin` cai a 1.5, pós-PRD 02) | por linha de `adDays`: `checkAdSanity(impressions, pageviews, slots, adMargin).ok === false`, i.e. `impressions > max(pageviews,1) × slots × adMargin` | PRD 04 RF6 | 4, 19, 20, 21 |
| `paid_without_campaign` | critical | `paid !== null` E `paid.activeCampaigns === 0` E `paid.paidLinesSinceRule > 0` | PRD 05 | 11 |
| `sources_not_100` | warning | `sum(channelCounts) > 0` E o percentual reconstruído `round(100 × v / total)` dos canais com `v>0` não soma 100 ±1 (arredondamento) — sinaliza inconsistência de agregação do card Fontes | doc v2 (regra 3) | 11 |
| `category_gt_pageviews` | warning | `sum(categoryViews.views) > windowPageviewsNonInternal + CATEGORY_TOLERANCE` | doc v2 (regra 4) | 3, 14 |
| `sessions_lt_visitors` | critical | `windowUniqueVisitors > windowSessions` (um visitante único sem nenhuma sessão é impossível: toda métrica de visitante deriva de pageview, que carrega `sessionId` obrigatório — auditoria §4.2; itens 6/7 da checklist) | doc v2 (regra 5) | 6, 7 |
| `percent_over_100` | warning | qualquer `displayedPercents[].pct > PERCENT_CEILING + 0.5` | doc v2 (regra 7) | 3, 14 |

Regras com insumo `null` (dependência não implantada, ex.: `paid === null` sem
PRD 05) **não são avaliadas** — o coletor (RF2) as reporta como `skipped`, nunca
como violação nem como OK falso.

### RF2 — Coletor de insumos por blog (`api/lib/sanityCollect.ts`)

Módulo que monta o `SanityInput` a partir do banco DO BLOG. Reusa ao máximo as
queries já existentes do `/stats` (não reimplementar agregação):

- **Janela padrão do monitor**: 30 dias BRT (mesma default do dashboard —
  `analyticsShared.ts:181-184`, cf. inventário). Reutilizar `resolvePeriod`
  (`analyticsShared.ts`) e as mesmas cláusulas `is_internal=false` das queries do
  `/stats` (`analytics.ts:405-490`) — garante que a malha valida EXATAMENTE o que o
  card mostra.
- `adDays`: linhas de `ad_daily_stats` da janela COM `date >= settings.ads_reliable_since`
  (PRD 04 §6.2; se a key não existir → `adDays: []` + skip `prd04_reparo_pendente`),
  colunas PÚBLICAS `impressions`/`clicks`, juntadas aos pageviews não-internos do
  mesmo dia BRT; `slots = 1` (S(A) do PRD 04 RF6 pós-dedup).
- `paid`: `activePaidCampaigns().length` (PRD 05 RF3) + `count(*)` de
  `analytics_events WHERE referrer='pago' AND ts >= brtDayStart(PAID_RULE_SINCE)`.
  Sem export `PAID_RULE_SINCE` (PRD 05 fora) → `paid: null` + skip `prd05_pendente`.
- `channelCounts`: reusar `referrerChart` da agregação da janela
  (`analyticsShared.ts:298-301`, `analytics.ts:739`).
- `categoryViews`/`windowPageviewsNonInternal`: `topCategories`
  (`analytics.ts:584-589`) e `totals.window` de pageviews não-internos
  (`analytics.ts:426`).
- `windowSessions`/`windowUniqueVisitors`: `uniqueSessions` da janela ATUAL é
  `analytics.ts:506` (`Object.keys(agg.sessionPageviews).length` — SQL **+ buffer**
  não persistido, `:499-503`); `analytics.ts:426` é a janela ANTERIOR (base das
  tendências), **não usar**. `visitors.unique` = `analytics.ts:470-482` (SQL puro,
  **sem** buffer), exposto em `:719-724`. A assimetria buffer-sim/buffer-não é
  favorável à regra R5 (ver §11, caso 3).
- `displayedPercents`: reconstruir os % do card do jeito EXATO do front (item 3:
  `views / topCats[0].views`; item 14: `(clicks+views) / maxCatViews` —
  `Analytics.tsx:350,793-795`) para pegar estouro > 100% na origem (o front os
  corrige no PRD 10; a malha vigia que não voltem).
- Cada segmento tem try/catch próprio → falha vira `skipped` com razão `db_error`,
  nunca derruba o monitor.

Os helpers (`checkAdSanity`/`checkClicksVsImpressions`) vêm de `analyticsShared.ts`
(PRD 04); a constante `AD_SANITY_MARGIN` vem de onde ela existir (hoje
`healthAlerts.ts`, PRD 08 — ver §2.2). Se NENHUMA das duas fontes existir ainda,
`adDays: []` + skip `prd04_reparo_pendente` — nunca inventar a margem localmente. O
coletor devolve `{ input: SanityInput | partial, skipped: {rule, reason}[] }`.

### RF3 — Monitor contínuo (`api/lib/sanityMonitor.ts`)

- `startSanityMonitor()` chamado no boot do api-server em
  **`artifacts/api-server/src/index.ts`**, na mesma sequência de `startScheduler()`
  (`:193`), `startSocialCron()` (`:196`) e `startSocialAutomation()` (`:199`) — isto
  é, DEPOIS do banco inicializar (`app.ts:202` documenta essa razão), que é
  pré-requisito do coletor. **Não** montar em `routes/index.ts`. Guarda de execução
  única (não sobrepor ciclos) no padrão do scheduler existente
  (`api/lib/scheduler.ts:347`).
- **Intervalo**: `setInterval` de **15 minutos** (config por env
  `SANITY_MONITOR_MS`, default 900000; `0` ou negativo DESLIGA o monitor — permite
  desabilitar sem rebuild). Primeira execução ~2 min após o boot (deixa o banco
  assentar).
- Cada ciclo: coleta (RF2) → `evaluateSanity` (RF1) → atualiza o relatório em
  memória (RF4) → emite as violações NOVAS/persistentes (RF4).
- **Custo**: uma coleta a cada 15 min, queries agregadas pequenas (blog novo),
  reaproveitando as do `/stats`. Zero impacto no caminho quente de ingest/leitura.
- **Nunca escreve em tabela de métrica**: o monitor é 100% leitura das tabelas de
  analytics (grep de `UPDATE`/`DELETE`/`insert(` sobre tabelas de métrica no módulo
  = vazio — §8.1). A ÚNICA escrita permitida é a chamada a `logSecurity`
  (`api/lib/audit.ts:45`), cujo INSERT vai para `security_logs` — tabela de log de
  segurança, não de métrica. Nenhum `insert`/`update`/`delete` direto sai dos 3
  módulos deste PRD.

### RF4 — Relatório e emissão (sem correção silenciosa)

- **Relatório em memória** (`getSanityReport()`): último resultado por blog —
  `{ evaluatedAt, window, violations: SanityViolation[], skipped: {rule,reason}[],
  ruleStatus: Record<rule, "ok"|"violated"|"skipped"> }`. Zera no restart (como os
  contadores de saúde — decisão análoga à do PRD 08 RF2; a durabilidade vem do
  banco/sink, não da memória).
- **Emissão**:
  - `critical` (cliques>impressões, pago sem campanha, sessões<visitantes) →
    `logSecurity({ eventType: "analytics_sanity_violation", severity: "critical",
    description: "<rule> <scope> observed=<n> limit=<n>", route: "/api/analytics/sanity" })`
    (`api/lib/audit.ts:45` — INSERT em `security_logs`, que é a fonte da verdade; o
    webhook do `dispatchAlert` sai de graça e é opt-in) **+** `logger.warn`
    estruturado. Sem `userId`/`userEmail`/`ipAddress` (não há — e não introduzir PII
    é RNF, §5).
  - **Throttle obrigatório** (senão são 4 INSERTs/hora por violação persistente, e a
    tabela cresce sem valor): `Map<string, number>` no monitor com chave
    `` `${rule}|${scope}` `` e janela `SANITY_ALERT_THROTTLE_MS` (default 6h =
    21_600_000). O debounce do `dispatchAlert` NÃO serve — ele é por
    `(eventType, ipAddress)` e fixo em 5 min (`securityAlertCore.ts:12,:22`), de modo
    que TODAS as violações deste PRD colidiriam na mesma chave
    `analytics_sanity_violation:-`. O Map zera no restart (aceito: no máximo 1 alerta
    repetido por restart).
  - `warning` → `logger.warn` estruturado apenas (nunca `logSecurity`: `warning` nem
    é severidade válida do enum — `audit.ts:37`).
  - Todas → disponíveis no relatório para o PRD 08 exibir.
- **Proibição explícita (requisito, não implementação)**: o monitor NUNCA altera,
  recalcula ou "conserta" um valor de métrica. Detecta, registra, sinaliza e aponta
  o PRD dono. Qualquer PR que faça o monitor mutar `analytics_events`/
  `ad_daily_stats`/`behavior_events`/agregação viola este RF.

### RF5 — Endpoint de leitura para o PRD 08/09

- `GET /api/analytics/sanity` (autenticado, mesmo `authMiddleware` do `/health` —
  `analytics.ts:351`): devolve `getSanityReport()`. É a fonte que o PRD 08 lê para
  mostrar as violações contínuas no card Saúde (as regras que o `evaluateHealthAlerts`
  on-demand não recomputa — R3/R4/R5/R7). Shape estável, documentado no §7.
- Alternativa de menor superfície (decisão de implementação, aceitável): anexar
  `sanity: getSanityReport()` ao payload do `/health` em vez de endpoint novo — o
  PRD 09 decide a forma final; ESTE PRD garante que o relatório é acessível ao PRD 08
  por um dos dois caminhos. Default recomendado: campo no `/health` (evita segundo
  fetch no auto-refresh do painel).

### RF6 — Documentação

Nova seção em `docs/ANALYTICS.md`, "Validação cross-metric contínua": o catálogo de
7 regras com as fórmulas exatas, o intervalo do monitor, a semântica "detecta, nunca
corrige", as razões de skip, as constantes com seus valores atuais e o marco que as
vira (`CATEGORY_TOLERANCE=1`, `PERCENT_CEILING=100.0`, `CLICK_TOLERANCE=1→0` e
`AD_SANITY_MARGIN=3→1.5` no PRD 02), o mapa de ids PRD 08 ↔ PRD 11 (§14) e a relação
com o PRD 08 (superfície). Registrar também que a emissão durável é
`logSecurity`/`security_logs` e que essa tabela não tem expurgo automático. Não
alterar as seções de dicionário de métricas (donos PRD 06/07) nem a de alertas
(PRD 08) além de um link cruzado.

---

## 5. Requisitos não-funcionais

- **Performance**: 1 coleta / 15 min / blog, reaproveitando queries agregadas do
  `/stats` (janela de blog novo é pequena); `evaluateSanity` é O(nº adDays + nº
  categorias + nº canais). Zero query nova no caminho de ingest e zero no `/stats`
  público. O endpoint RF5 serve o relatório de memória (O(1)).
- **LGPD**: nenhum dado pessoal novo — o monitor lê agregados (contagens), nunca
  IP/UA/e-mail individual; emissões contêm só `rule/scope/observed/limit`. Parte da
  rede opera conteúdo político-adjacente: não introduzir rastreio é requisito.
- **Confiabilidade**: coletor com try/catch por segmento (`db_error` → skip); monitor
  com guarda de execução única e captura de exceção por ciclo (um ciclo que falha não
  mata o `setInterval` nem o processo); emissão com throttle para não inundar alerta.
- **Multi-blog**: mesma imagem, monitor por container contra o banco do próprio blog
  (sp011/Supabase; replicados no pg-blogs via `db-config.enc`); nada condicionado a
  BLOG_ID (CA/§10.7). Dois envs permitem ajustar/desligar POR BLOG sem rebuild —
  `SANITY_MONITOR_MS` (intervalo; `<=0` desliga) e `SANITY_ALERT_THROTTLE_MS`
  (janela do throttle de emissão, default 21600000) — via `.env` do blog +
  `up -d --force-recreate api` (restart não relê env_file — CLAUDE.md §5). O
  `deploy/blog-template/compose.yml` já usa `env_file: .env` no serviço `api`: não
  há mudança de compose. Rollout do CLAUDE.md §6 obrigatório (§8.3) e revalidação de
  cards por blog (§8.4).
- **Windows/dev (CLAUDE.md §14)**: typecheck por pacote; `node --test` com imports
  relativos com extensão `.ts` explícita; NUNCA unicode literal em regex; sem `vite
  build` local (build real na VPS). O catálogo (RF1) é 100% testável sem banco.

---

## 6. Modelo de dados

**Este PRD NÃO cria coluna nem tabela de métrica.** As regras leem o que os PRDs
01/04/05 já entregam (`analytics_events` com `is_internal`; `ad_daily_stats` com
UNIQUE `(ad_id,date)` + `internal_*` + `ads_reliable_since`; `paidCampaigns` em
settings + `PAID_RULE_SINCE`; `gclid`/`fbclid`). Regra do doc v2 ("colunas novas
SEMPRE via Drizzle E ensureSchema") respeitada por vacuidade — `git diff --stat
lib/db` deste PRD é vazio (§8.1).

Persistência de violações: reutiliza a tabela **`security_logs`** já existente
(`lib/db/src/schema/logs.ts:18`, escrita por `logSecurity` —
`api/lib/audit.ts:45-57`); este PRD NÃO cria schema nem coluna para isso — só grava
linhas numa tabela que já existe, com os campos que ela já tem (`eventType`,
`severity`, `description`, `route`). Estado em memória (relatório do RF4) zera no
restart — coberto pela emissão durável das críticas.

**Fronteira (STATUS.md)**: o padrão de migração e a taxonomia são do PRD 01; como
este PRD não cria schema, adere trivialmente.

---

## 7. Contrato de API

### 7.1 `GET /api/analytics/sanity` (autenticado) — OU campo `sanity` no `/health`

```jsonc
{
  "evaluatedAt": "2026-07-23T14:32:00.000Z",  // null se ainda não rodou (boot < 2min)
  "window": { "key": "30d", "days": 30 },
  "violations": [
    { "rule": "clicks_gt_impressions", "severity": "critical", "scope": "ad:abc",
      "observed": 5, "limit": 3, "detail": "clicks=5 > impressions+1=3 em 2026-07-22" }
  ],
  "skipped": [ { "rule": "paid_without_campaign", "reason": "prd05_pendente" } ],
  "ruleStatus": {
    "clicks_gt_impressions": "violated", "impressions_gt_pageviews": "ok",
    "paid_without_campaign": "skipped", "sources_not_100": "ok",
    "category_gt_pageviews": "ok", "sessions_lt_visitors": "ok",
    "percent_over_100": "ok"
  }
}
```

- `violations` é SEMPRE array (vazio = tudo são); ordenação `critical` antes de
  `warning`, depois por `rule`+`scope`.
- `ruleStatus` cobre as 7 regras: `ok` | `violated` | `skipped` (nunca ausente —
  transparência: o PRD 08 mostra "N regras não avaliadas" a partir dos `skipped`).
- Endpoint autenticado (`authMiddleware`, sem `requirePermission` — igual ao
  `/health`, `analytics.ts:351`). Nenhuma mudança no `/stats` nem nas rotas públicas.

### 7.2 Assinaturas internas novas (não-HTTP)

```ts
// api/lib/analyticsSanity.ts (novo, zero imports — RF1)
export function evaluateSanity(input: SanityInput): SanityViolation[];
export const CATEGORY_TOLERANCE: number;
export const PERCENT_CEILING: number;
export const CLICK_TOLERANCE: number;
// api/lib/sanityCollect.ts — collectSanityInput(target): Promise<{input, skipped}>
// api/lib/sanityMonitor.ts — startSanityMonitor(): void; getSanityReport(): SanityReport
//   montagem: artifacts/api-server/src/index.ts (ao lado de startScheduler(), :193)
//   envs: SANITY_MONITOR_MS (default 900000; <=0 desliga),
//         SANITY_ALERT_THROTTLE_MS (default 21600000)
```

---

## 8. Comandos de verificação (rodar exatamente estes, com resultado esperado)

### 8.1 Local (Windows, antes do commit)

```powershell
cd "c:\Users\Usuario(a) Master\sp011\artifacts\api-server"
pnpm run typecheck
# esperado: sem erros
node --test "test/**/*.test.ts"
# esperado: TODOS passam, incluindo a suite nova analyticsSanity.test.ts (§12)
```

```powershell
cd "c:\Users\Usuario(a) Master\sp011"
git grep -n "evaluateSanity" -- artifacts/api-server/src
# esperado: definicao em lib/analyticsSanity.ts + uso em lib/sanityMonitor.ts (e no PRD 08, se ja integrado)
git grep -n "startSanityMonitor" -- artifacts/api-server/src
# esperado: definicao em lib/sanityMonitor.ts + chamada em src/index.ts (NAO em routes/index.ts)
git grep -nE "update\(|delete\(|insert\(" -- artifacts/api-server/src/lib/sanityMonitor.ts artifacts/api-server/src/lib/sanityCollect.ts artifacts/api-server/src/lib/analyticsSanity.ts
# esperado: NENHUM resultado (monitor 100% leitura; RF3/RF4). A unica escrita e via
# logSecurity, que e chamada de funcao — nao um insert direto destes modulos.
git grep -n "logSecurity" -- artifacts/api-server/src/lib/sanityMonitor.ts
# esperado: >=1 (emissao durable das criticas — RF4)
git grep -n "export const AD_SANITY_MARGIN" -- artifacts/api-server/src
# esperado: EXATAMENTE 1 declaracao no repo inteiro (uma verdade — §2.2/§14)
git grep -nE "clicks > .*impressions|impressions > .*pageviews" -- artifacts/api-server/src/lib
# esperado: as formulas aparecem SO em analyticsShared.ts (helpers do PRD 04);
# nenhuma reimplementacao em analyticsSanity.ts/healthAlerts.ts (CA3)
git diff --stat HEAD~1 -- lib/db
# esperado: VAZIO (nenhum schema novo)
```

### 8.2 VPS — verificação com dados reais — **PENDENTE DE EXECUÇÃO**

(MCP Supabase não conectado na escrita; blocos completos para colar, padrão CLAUDE.md
§12. Nenhum comando altera dados — só SELECT e leitura do endpoint autenticado.)

**V1 — endpoint de sanidade protegido e com shape** (observação objetiva):

```bash
DOM='https://resenhavip.midia.run'
curl -s -o /dev/null -w '%{http_code}\n' "$DOM/api/analytics/sanity"
# esperado: 401 (autenticado). Com admin logado no navegador, abrir a URL: JSON com
# violations (array), skipped, ruleStatus (7 chaves). Em blog saudavel: violations=[].
```

**V2 — espelho SQL da regra R1/R6 (cliques ≤ impressões; impressões ≤ pv×slots×M)**
— o resultado do SQL tem de bater com `ruleStatus.clicks_gt_impressions` /
`impressions_gt_pageviews` do endpoint:

```bash
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d resenhavip -v ON_ERROR_STOP=1 -c "WITH pv AS (SELECT (ts AT TIME ZONE 'America/Sao_Paulo')::date AS dia, count(*) AS pageviews FROM analytics_events WHERE type='pageview' AND is_internal=false AND (ts AT TIME ZONE 'America/Sao_Paulo')::date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - 29 GROUP BY 1) SELECT s.ad_id, s.date, s.impressions, s.clicks, COALESCE(pv.pageviews,0) AS pageviews, (s.clicks > s.impressions + 1) AS viola_cliques, (s.impressions > GREATEST(COALESCE(pv.pageviews,0),1) * 1 * 3) AS viola_impressoes FROM ad_daily_stats s LEFT JOIN pv ON pv.dia = s.date::date WHERE s.date::date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - 29 ORDER BY s.date DESC;"
# esperado (blog saudavel pos-PRD 04): viola_cliques=f e viola_impressoes=f em todas as linhas
# -> endpoint reporta clicks_gt_impressions=ok e impressions_gt_pageviews=ok
# ATENCAO ao comparar: o motor SO avalia linhas com date >= settings.ads_reliable_since
# (PRD 04). Rodar antes, no MESMO banco, e descartar do SQL as datas anteriores:
#   SELECT value FROM settings WHERE key='ads_reliable_since';
# Se a key nao existir, o endpoint reporta skip prd04_reparo_pendente (nao "ok").
```

**V3 — espelho SQL da regra R5 (sessões ≥ visitantes)**. Janela idêntica à do motor:
30 dias BRT contados do INÍCIO do dia (não `now() - 30 days`), senão a comparação
endpoint×banco diverge na borda. Rodar no MESMO blog do V2 (canário) e, depois, no
sp011:

```bash
# blog replicado (canário — mesmo banco do V2)
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d resenhavip -v ON_ERROR_STOP=1 -c "SELECT count(DISTINCT session_id) AS sessoes, count(DISTINCT visitor_id) FILTER (WHERE visitor_id IS NOT NULL) AS visitantes, (count(DISTINCT visitor_id) FILTER (WHERE visitor_id IS NOT NULL) > count(DISTINCT session_id)) AS viola FROM analytics_events WHERE type='pageview' AND is_internal=false AND (ts AT TIME ZONE 'America/Sao_Paulo')::date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - 29;"
# esperado: viola=f (visitantes <= sessoes) -> endpoint reporta sessions_lt_visitors=ok
```

```bash
# sp011 (banco mãe no Supabase — CLAUDE.md §12)
cd /opt/sp011
DBURL=$(grep -m1 '^SUPABASE_DATABASE_URL=' /opt/sp011/.env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "SELECT count(DISTINCT session_id) AS sessoes, count(DISTINCT visitor_id) FILTER (WHERE visitor_id IS NOT NULL) AS visitantes, (count(DISTINCT visitor_id) FILTER (WHERE visitor_id IS NOT NULL) > count(DISTINCT session_id)) AS viola FROM analytics_events WHERE type='pageview' AND is_internal=false AND (ts AT TIME ZONE 'America/Sao_Paulo')::date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - 29;"
# esperado: viola=f
# Nota de borda: o endpoint conta sessoes com buffer em memoria (analytics.ts:499-506)
# e visitantes so do SQL (:470-482) — o desvio so pode ELEVAR sessoes, entao "viola=f"
# no SQL implica "viola=f" no endpoint (nunca o contrario). Ver §11 caso 3.
```

**V4 — espelho SQL da regra R4 (views/categoria ≤ pageviews não-internos)** e R2
(pago sem campanha) já cobertos pelos Anexos A2/A4 da auditoria e pelos comandos do
PRD 05 (§8) — rodar aqueles e conferir que `ruleStatus.category_gt_pageviews` e
`paid_without_campaign` do endpoint são coerentes.

**V5 — monitor realmente ligado no boot e no intervalo configurado** (evidência
objetiva de CA4; sem isso o `violations: []` do V1 pode ser só "nunca rodou"):

```bash
cd /opt/blogs/resenhavip
docker compose logs --since 30m api | grep -i "sanity"
# esperado: 1 linha de boot do monitor (ex.: "sanity monitor iniciado intervalo=900000ms")
# e, apos ~2 min, 1 linha por ciclo. Com SANITY_MONITOR_MS=0: linha de "desligado" e
# NENHUM ciclo -> V1 deve devolver evaluatedAt: null (nunca "tudo sao").
```

```bash
# conferencia cruzada: evaluatedAt do endpoint avanca entre duas leituras separadas
# por mais de um intervalo (admin logado no navegador, ou via token do painel)
cd /opt/blogs/resenhavip
docker compose exec -T api sh -c 'echo "SANITY_MONITOR_MS=$SANITY_MONITOR_MS"'
# esperado: vazio (default 900000) ou o valor setado no .env do blog
```

### 8.3 Rollout multi-blog (CLAUDE.md §6 — obrigatório)

Arquivos tocados → serviço (§5): só `artifacts/api-server` → `api` (sem mudança no
`web`; a UI das violações é do PRD 08). Portanto rebuild direcionado a `api`.

⚠️ **Antes de rodar o bloco abaixo**, executar o **Passo 0 do §8.4** (baseline do
`/stats`) em cada blog que será validado — sem baseline não dá para provar o CA12
("nenhum número mudou").

```bash
cd /opt/sp011
git pull
V=$(grep -m1 '^BLOG_IMAGE_VERSION=' .env | cut -d= -f2); N="v$((${V#v}+1))"
sed -i "s|^BLOG_IMAGE_VERSION=.*|BLOG_IMAGE_VERSION=$N|" .env
grep '^BLOG_IMAGE_VERSION=' .env
docker compose build api web
docker compose up -d api web
```

(Nota: o build da imagem do blog é o do sp011 e gera api E web juntos — CLAUDE.md
§6; por isso `build api web` mesmo com mudança só de api. O bloco acima já deixa o
**sp011** na imagem nova — validar o sp011 pelo §8.4 também.)

```bash
# canário (resenhavip): subir a tag nova e rodar V1–V5 + §8.4 Passos 1-2 ANTES de seguir
N=$(grep -m1 '^BLOG_IMAGE_VERSION=' /opt/sp011/.env | cut -d= -f2)
cd /opt/blogs/resenhavip
sed -i "s|^BLOG_IMAGE_TAG=.*|BLOG_IMAGE_TAG=$N|" .env
docker compose up -d
curl -s https://resenhavip.midia.run/api/site | grep -o '"siteName":"[^"]*"'
```

```bash
# demais blogs (pula os que ainda não existem)
N=$(grep -m1 '^BLOG_IMAGE_VERSION=' /opt/sp011/.env | cut -d= -f2)
for b in ksports esporteagora oleysports beeesportes pontofarma creditovc; do
  [ -d "/opt/blogs/$b" ] || continue
  cd "/opt/blogs/$b"
  sed -i "s|^BLOG_IMAGE_TAG=.*|BLOG_IMAGE_TAG=$N|" .env
  docker compose up -d
done
cd /opt/sp011
```

### 8.4 Observação pós-rollout POR BLOG — cards a revalidar

Ordem: canário **resenhavip** → **sp011** → ksports, esporteagora, oleysports,
beeesportes, pontofarma, creditovc (os que existirem). Como este PRD é 100% leitura,
o critério dos cards é **valor IDÊNTICO ao pré-rollout na mesma janela** — por isso
a captura de baseline é obrigatória ANTES do bump.

**Passo 0 — baseline ANTES do rollout** (rodar para cada blog que será validado;
`ADMIN_TOKEN` = token do admin daquele blog):

```bash
DOM='https://resenhavip.midia.run'
ADMIN_TOKEN='COLE_AQUI'
mkdir -p /tmp/prd11 && curl -s "$DOM/api/analytics/stats?period=30d" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /tmp/prd11/stats-antes.json
wc -c /tmp/prd11/stats-antes.json
# esperado: arquivo nao-vazio (baseline gravada)
```

**Passo 1 — endpoint de sanidade** (o entregável novo): abrir
`GET /api/analytics/sanity` (admin logado) — `ruleStatus` com as 7 regras; blog
saudável = `violations: []`; regras cujos PRDs-fonte não estão no ar aparecem em
`skipped` (não em `violated`); `evaluatedAt` não-nulo (V5 comprova que o ciclo
rodou). Onde houver violação, ela DEVE bater com o espelho SQL correspondente
(V2–V4) — coerência endpoint×banco é o critério.

**Passo 2 — cards do dashboard que precisam ficar INALTERADOS** (este PRD não muda
nenhum número; qualquer diferença é regressão):

| Card (item da checklist) | Onde | Esperado |
|---|---|---|
| 5 KPIs: Views, Visitantes únicos, Sessões, Tempo médio, Rejeição (5, 6, 7, 8, 9) | Analytics | idênticos à baseline |
| Fontes de tráfego (11) | Analytics | idêntico — inclusive o % de "Tráfego pago" |
| Top categorias, Dashboard e detalhado (3, 14) | Dashboard + Analytics | idênticos, incluindo os chips de % |
| Propagandas: KPIs, tabela por anúncio, gráfico top-3 (4, 19, 20, 21) | Analytics | idênticos |
| Tráfego ao longo do tempo (10) | Analytics | idêntico |
| Saúde da coleta (25) | Analytics | idêntico (contadores em memória; comparar só na mesma sessão de processo) |

```bash
# comparacao objetiva pos-rollout (mesma janela, mesmo blog)
DOM='https://resenhavip.midia.run'
ADMIN_TOKEN='COLE_AQUI'
curl -s "$DOM/api/analytics/stats?period=30d" -H "Authorization: Bearer $ADMIN_TOKEN" \
  > /tmp/prd11/stats-depois.json
diff <(grep -o '"totals":{[^}]*}' /tmp/prd11/stats-antes.json) \
     <(grep -o '"totals":{[^}]*}' /tmp/prd11/stats-depois.json) && echo "TOTAIS IGUAIS"
diff <(grep -o '"referrerChart":\[[^]]*\]' /tmp/prd11/stats-antes.json) \
     <(grep -o '"referrerChart":\[[^]]*\]' /tmp/prd11/stats-depois.json) && echo "FONTES IGUAIS"
# esperado: "TOTAIS IGUAIS" e "FONTES IGUAIS". Nota: totals.today/window sobem
# naturalmente se houve trafego real entre as duas leituras — repetir com period=7d
# num dia sem trafego, ou comparar apenas os dias FECHADOS do dailyChart.
```

**Passo 3 — blog novo sem tráfego**: `violations: []`, `ruleStatus` com as 7 chaves
em `ok`/`skipped`, `evaluatedAt` preenchido. Isso é SUCESSO, não falta de dado
(volume baixo não é bug).

---

## 9. Critérios de aceite

Mapeamento: regras 1–7 do módulo 11 do doc v2; itens **3, 4, 5, 6, 7, 11, 14, 19,
20, 21** da checklist (o item 5 entra como denominador da R4:
`windowPageviewsNonInternal`). Nenhum critério subjetivo; os que exigem
banco/produção estão **PENDENTE DE EXECUÇÃO** (MCP Supabase não conectado na escrita
— nunca marcar como atendido sem rodar na VPS). Onde o status diz "parcial", a
metade de dev é executável já; a metade de VPS é **PENDENTE DE EXECUÇÃO** pelo mesmo
motivo.

| # | Critério | Verificação | Status |
|---|---|---|---|
| CA1 | Typecheck do api-server e `node --test` passam, incluindo `analyticsSanity.test.ts` | §8.1 → exit 0 / todos ok | a executar no dev |
| CA2 | Catálogo das 7 regras implementado com as fórmulas EXATAS do RF1 (cada regra tem caso que dispara e caso que não dispara, incl. as fronteiras: `clicks=impressions+1` ok, `+2` viola; `%=100` ok, `100.6` viola; `visitantes=sessões` ok, `+1` viola) | suite do §12 | a executar no dev |
| CA3 | Regras R1/R6 reutilizam `checkClicksVsImpressions`/`checkAdSanity` do PRD 04 (nenhuma reimplementação da fórmula de anúncio) | `git grep -n "checkAdSanity\|checkClicksVsImpressions" artifacts/api-server/src/lib/analyticsSanity.ts` → ≥1 | a executar no dev |
| CA4 | Monitor roda no boot e reavalia a cada `SANITY_MONITOR_MS` (default 900000); `SANITY_MONITOR_MS<=0` desliga | teste do §12 (agendador com relógio/flag injetados) + §8.2 **V5** (`docker compose logs api \| grep -i sanity` → linha de boot + 1 linha por ciclo) | parcial (VPS **PENDENTE DE EXECUÇÃO**) |
| CA5 | Motor é 100% leitura: nenhum `insert(`/`update(`/`delete(` nos 3 módulos; a única escrita é `logSecurity` (tabela `security_logs`, não de métrica) | greps do §8.1 → o 1º vazio, o de `logSecurity` ≥1 | a executar no dev |
| CA6 | Nenhum schema novo (decisão de modelo de dados): `git diff --stat lib/db` vazio | §8.1 | a executar no dev |
| CA7 | Endpoint `GET /api/analytics/sanity` (ou campo `sanity` no `/health`) autenticado, com `violations`/`skipped`/`ruleStatus` (7 chaves) | §8.2 V1 | **PENDENTE DE EXECUÇÃO** |
| CA8 | Degradação honesta: PRD 04/05 ausente ⇒ regra correspondente em `skipped` com a razão certa (`prd04_reparo_pendente`/`prd05_pendente`), nunca `violated` falso | teste do §12 (insumo null) + §8.2 V1 | parcial (VPS **PENDENTE DE EXECUÇÃO**) |
| CA9 | Coerência endpoint×banco: para cada regra, o `ruleStatus` bate com o espelho SQL (V2–V4) em ≥1 blog, respeitando o corte `ads_reliable_since` | §8.2 V2–V4 | **PENDENTE DE EXECUÇÃO** |
| CA10 | Emissão sem correção silenciosa: violação `critical` chama `logSecurity` uma única vez por `(rule,scope)` na janela de throttle e emite `logger.warn`; `warning` NÃO chama `logSecurity` | teste do §12 item 5 (sink fake conta chamadas; 2ª ocorrência na janela → 0 chamadas novas) | a executar no dev |
| CA11 | Volume baixo não dispara nada: input de blog novo (poucas linhas, tudo coerente) → `violations: []` | teste do §12 (caso "blog novo") | a executar no dev |
| CA12 | Não-regressão: nenhum número do dashboard muda (o monitor não toca leitura/ingest) | (a) `git diff HEAD~1 -- artifacts/api-server/src/routes/analytics.ts` → só a rota nova do RF5, zero alteração no handler do `/stats`; (b) §8.4 Passo 2 → `TOTAIS IGUAIS` + `FONTES IGUAIS` no `diff` da baseline | parcial (VPS **PENDENTE DE EXECUÇÃO**) |
| CA13 | Uma verdade só: `AD_SANITY_MARGIN` declarada exatamente 1× no repo e fórmulas de anúncio só em `analyticsShared.ts` | greps do §8.1 (`export const AD_SANITY_MARGIN` → 1; `clicks > .*impressions` fora de `analyticsShared.ts` → vazio) | a executar no dev |

---

## 10. Invariantes do §17 preservadas por este PRD

Cada linha traz a EVIDÊNCIA de não-violação (comando do §8 ou fato do código), não
só a afirmação.

1. **"Tráfego interno marcado `is_internal`, nunca dropado"** — não tocada: o monitor
   só LÊ `is_internal`, e o coletor RF2 reusa as MESMAS cláusulas `is_internal=false`
   das queries do `/stats` (`analytics.ts:408,420,429,438-439,448,458,465,474-475`),
   nunca um filtro próprio. *Evidência:* grep de escrita do §8.1 → vazio; a malha
   valida exatamente a série que o card mostra.
2. **"Heartbeat cumulativo agregado por MAX"** — não tocada: nenhuma regra usa
   `read`/duração, e o reducer não é alterado. *Evidência:*
   `git diff HEAD~1 -- artifacts/api-server/src/lib/analyticsShared.ts` não toca
   `:319-327` (readMax) nem `analytics.ts:433-442` (MAX em SQL).
3. **"`totals.*` do /stats fixos ao agora"** — não tocada: o handler do `/stats` não
   recebe diff. *Evidência:* CA12(a) — `git diff` em `routes/analytics.ts` mostra só
   a rota nova do RF5.
4. **"Canal classificado no servidor"** — não tocada: a regra R2 só CONTA linhas com
   `referrer='pago'` já gravadas; nenhuma reclassificação. *Evidência:*
   `git grep -n "classifyChannel" -- artifacts/api-server/src/lib/sanity*.ts
   artifacts/api-server/src/lib/analyticsSanity.ts` → vazio.
5. **"Migrações via Drizzle E ensureSchema" / "colunas se autocriam no boot"** —
   respeitadas por vacuidade (zero schema novo). *Evidência:* CA6 —
   `git diff --stat HEAD~1 -- lib/db` vazio. Gravar em `security_logs` não é schema
   novo: a tabela já existe (`lib/db/src/schema/logs.ts:18`).
6. **"Linhas históricas nunca são reescritas"** (comentário literal em
   `analyticsShared.ts:143`) — reforçada: o RF4 PROÍBE explicitamente qualquer
   mutação de dado de métrica; o motor é detector, não corretor. *Evidência:* grep
   de `update(`/`delete(`/`insert(` do §8.1 → vazio (CA5).
7. **Isolamento entre blogs / nada hardcodado por blog na imagem** (§13) — o monitor
   é 100% genérico, roda contra o banco do próprio blog. *Evidência:*
   `git grep -n "BLOG_ID\|sp011\|ksports\|resenhavip" -- artifacts/api-server/src/lib/sanity*.ts
   artifacts/api-server/src/lib/analyticsSanity.ts` → vazio.
8. **SSR/perf (`no-cache` nunca `no-store`, sanitize isomórfico)** — não tocadas:
   nenhuma rota pública, header de cache ou caminho de SSR é alterado; o RF5 é
   autenticado (`authMiddleware`, padrão do `/health` em `analytics.ts:351`).
   *Evidência:* CA7 (401 sem sessão) + CA12(a).

---

## 11. Casos de borda

1. **Blog novo, zero tráfego** — todos os insumos vazios/zero; `evaluateSanity`
   devolve `[]`. Estado saudável (volume baixo não é bug).
2. **`adMargin` em transição (3 → 1.5 pós-PRD 02)** — o VALOR e a semântica de `M`
   vêm do PRD 04 RF6; a constante `AD_SANITY_MARGIN` é declarada uma única vez no
   repo (hoje no PRD 08, `healthAlerts.ts` — §2.2/CA13) e este PRD só a lê. A
   severidade de `impressions_gt_pageviews` acompanha (warning → critical) sem
   mudança de lógica aqui.
3. **Skew de buffer (~30s)** — `uniqueSessions` inclui o buffer não persistido
   (`analytics.ts:499-503,:506`) e `visitors.unique` NÃO inclui (SQL puro,
   `:470-482`) — a defasagem que a auditoria §4.2 registra entre KPIs vizinhos. Para
   a R5 o skew é **favorável por construção**: ele só pode ELEVAR `sessions` e
   REBAIXAR `visitors`, nunca o contrário — logo não gera falso-positivo de
   `visitors > sessions`. A regra usa comparação estrita, sem tolerância, e isso é
   deliberado. (Estruturalmente: todo visitante da janela tem ≥1 pageview, que
   carrega um `sessionId` — `visitors ⊆ sessions` é identidade lógica, não
   estatística.) Para a R4, a folga de 1 (`CATEGORY_TOLERANCE`) cobre o skew
   equivalente. Se ainda assim aparecer falso-positivo em produção, aumentar a
   tolerância é ajuste de CONSTANTE (não de lógica) — registrar no `docs/ANALYTICS.md`.
4. **`sources_not_100` com arredondamento** — a reconstrução usa `round(100×v/total)`;
   a soma pode dar 99 ou 101 por arredondamento legítimo (vários canais) — a regra
   tolera ±1; só dispara em desvio real de agregação.
5. **Dependência não implantada (PRD 04/05 fora)** — `adDays: []`/`paid: null` →
   `skipped`, nunca violação. A malha nasce útil (R3/R4/R5/R7 já rodam) e ganha R1/R6/R2
   conforme os PRDs entram.
6. **Restart do api** — relatório em memória zera (e o Map de throttle junto); o
   próximo ciclo (≤15 min) reconstrói; as críticas já gravadas em `security_logs`
   pelo `logSecurity` continuam duráveis. Efeito colateral aceito: um restart pode
   fazer a mesma violação ser gravada de novo antes das 6h.
7. **Monitor desligado (`SANITY_MONITOR_MS<=0`)** — endpoint RF5 devolve
   `evaluatedAt: null`; o PRD 08 mostra "validação contínua desligada" (não confundir
   com "tudo são"). Útil para blog em manutenção.
8. **Ciclo demora mais que o intervalo** — guarda de execução única pula o tick
   sobreposto (padrão do scheduler existente) — nunca acumula ciclos.
9. **Divergência endpoint×banco por janela de tempo** — o monitor roda a cada 15 min;
   um SQL manual rodado no meio pode divergir por até 15 min. Comparar sempre com
   `evaluatedAt` em mãos (borda de leitura, não bug).
10. **Violação persistente vs crescimento de `security_logs`** — uma violação real
    que ninguém corrige seria reavaliada a cada 15 min. O throttle de 6h por
    `(rule, scope)` (RF4) limita a ~4 linhas/dia/violação. ⚠️ `dataRetention.ts`
    **não** expurga `security_logs` (grep por `securityLogs`/`security_logs` no
    arquivo = vazio): as linhas ficam até serem apagadas à mão. É aceitável no
    volume esperado, mas é o motivo de o throttle ser requisito e não otimização.
11. **Sem `SECURITY_ALERT_WEBHOOK_URL` configurado** — `dispatchAlert` vira no-op
    com `logger.warn` (`securityAlert.ts:32-38`). A violação continua **durável**
    (o INSERT em `security_logs` já aconteceu dentro do `logSecurity`) e continua
    visível no relatório do RF5 — o webhook é bônus, não o caminho garantido.
12. **Categoria com views mas sem pageview atribuído** (evento `category` conta em
    `category_views` sem pageview de artigo — auditoria §4.1) — R4 usa a mesma base
    do card (`topCategories` × pageviews não-internos); se o card do PRD 06 mudar a
    semântica de "cliques"/"views", o coletor RF2 deve acompanhar (dependência do
    PRD 06 — §14).

---

## 12. Plano de testes (`node --test`, CLAUDE.md §14)

Arquivo novo `artifacts/api-server/test/analyticsSanity.test.ts` (imports relativos
com extensão `.ts` explícita; sem unicode literal em regex; padrão de
`test/analyticsShared.*.test.ts`). Tudo função pura — sem banco, sem Express, sem
relógio real.

1. **Catálogo (RF1), uma dupla dispara/não-dispara por regra**, com as fronteiras:
   - `clicks_gt_impressions`: `clicks=impressions+1` → ok; `+2` → viola (usa
     `checkClicksVsImpressions` do PRD 04); `0/0` → ok. Um caso a mais travando a
     decisão do RF1: com `CLICK_TOLERANCE=0` (cenário pós-PRD 02), `+1` passa a
     violar — garante que a virada é de constante, não de lógica.
   - `impressions_gt_pageviews`: no limite `max(pv,1)×1×3` → ok; `+1` → viola;
     `pageviews=0` com `impressions ≤ 3` → ok (piso `max(pv,1)`); margem 1.5 testada.
   - `paid_without_campaign`: `activeCampaigns=0 & paidLines>0` → viola;
     `activeCampaigns≥1` → ok; `paidLines=0` → ok; `paid=null` → não avaliada.
   - `sources_not_100`: distribuição que soma 100 → ok; soma reconstruída 97 (buraco
     de agregação sintético) → viola; total 0 → não avaliada.
   - `category_gt_pageviews`: `sum(views)=pageviews` → ok; `=pageviews+1` → ok
     (tolerância); `=pageviews+2` → viola.
   - `sessions_lt_visitors`: `visitors=sessions` → ok; `visitors=sessions+1` → viola.
   - `percent_over_100`: `pct=100.0` → ok; `100.6` → viola; `300` (item 14 real) →
     viola com `scope`.
2. **Blog novo** (todos os insumos em 0/vazio) → `violations: []` (CA11).
3. **Ordenação e status**: `critical` antes de `warning`; `ruleStatus` cobre as 7
   chaves com `ok`/`violated`/`skipped` conforme os insumos.
4. **Monitor (RF3) com relógio/flag injetados**: agenda no intervalo; `<=0` não
   agenda; guarda de execução única pula tick sobreposto; um ciclo que lança não
   derruba o agendador (sink fake registra a exceção).
5. **Emissão (RF4) com sink fake** (injetar o `logSecurity` — o teste NÃO importa
   `audit.ts`, que puxaria Drizzle e quebraria o `node --test`): `critical` chama o
   sink 1× com `severity: "critical"`; a 2ª ocorrência da mesma `(rule,scope)` dentro
   da janela de throttle NÃO rechama; passada a janela (relógio injetado), rechama;
   `(rule,scope)` diferente chama mesmo dentro da janela; `warning` NUNCA chama o
   sink. NENHUM caminho chama função de escrita de métrica (sink adicional que falha
   o teste se tocado).
6. **Suites existentes continuam passando**: `node --test "test/**/*.test.ts"`.

Dados sintéticos apenas — nenhum teste toca banco real. Validação com dados reais é
exclusivamente via §8.2/§8.4 na VPS (pendente de execução) — nunca poluir produção.

---

## 13. Plano de rollback

1. **Desligar sem reverter código** (primeira linha de defesa, resolve quase todo
   cenário): `SANITY_MONITOR_MS=0` no `.env` do blog afetado. O
   `deploy/blog-template/compose.yml` usa `env_file: .env` no serviço `api` — não
   precisa editar compose. `restart` NÃO relê env_file: tem de ser `up -d
   --force-recreate` (CLAUDE.md §5). O monitor para, o RF5 responde
   `evaluatedAt: null`, nada mais muda (motor 100% leitura).

```bash
# blog replicado (ex.: resenhavip)
cd /opt/blogs/resenhavip
grep -q '^SANITY_MONITOR_MS=' .env && sed -i 's|^SANITY_MONITOR_MS=.*|SANITY_MONITOR_MS=0|' .env || echo 'SANITY_MONITOR_MS=0' >> .env
grep '^SANITY_MONITOR_MS=' .env
docker compose up -d --force-recreate api
docker compose logs --since 2m api | grep -i "sanity"
# esperado: SANITY_MONITOR_MS=0 e log de monitor desligado (nenhum ciclo novo)
```

```bash
# sp011 (compose raiz)
cd /opt/sp011
grep -q '^SANITY_MONITOR_MS=' .env && sed -i 's|^SANITY_MONITOR_MS=.*|SANITY_MONITOR_MS=0|' .env || echo 'SANITY_MONITOR_MS=0' >> .env
grep '^SANITY_MONITOR_MS=' .env
docker compose up -d --force-recreate api
```

2. **Reverter código**: `git revert` do(s) commit(s) na `main` (dev solo, commit
   direto — CLAUDE.md §5/§18) + novo bump do §8.3 (build `api web`, canário, demais).
3. **Blog isolado com problema**: voltar `BLOG_IMAGE_TAG` do blog para a tag anterior
   (como no rollback do PRD 04/08):

```bash
cd /opt/blogs/resenhavip
ANTERIOR='v22'   # tag que estava no ar antes do bump
sed -i "s|^BLOG_IMAGE_TAG=.*|BLOG_IMAGE_TAG=$ANTERIOR|" .env
grep '^BLOG_IMAGE_TAG=' .env
docker compose up -d
curl -s https://resenhavip.midia.run/api/site | grep -o '"siteName":"[^"]*"'
# esperado: BLOG_IMAGE_TAG=$ANTERIOR e o siteName do PRÓPRIO blog
```

4. **Dados**: nada a desfazer em métrica — o monitor nunca escreveu em tabela de
   métrica e não criou coluna (CA5/CA6). As linhas gravadas em `security_logs` são
   registros de log inertes; ⚠️ `dataRetention.ts` NÃO as expurga (§11, caso 10), então
   se incomodarem é DELETE manual e explícito — nunca automático:

```bash
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d resenhavip -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM security_logs WHERE event_type='analytics_sanity_violation';"
# só depois, se realmente quiser limpar (opcional, irreversível):
# docker compose exec -T pg-blogs psql -U postgres -d resenhavip -v ON_ERROR_STOP=1 -c "DELETE FROM security_logs WHERE event_type='analytics_sanity_violation';"
```
5. **Critério de acionamento**: monitor consumindo CPU/latência perceptível no
   canário; falso-positivo recorrente que não seja ajustável por constante; erro 5xx
   no endpoint RF5; qualquer suspeita de mutação de métrica (não deveria existir —
   grep do §8.1).

---

## 14. Riscos e dependências de outros PRDs (FRONTEIRAS do STATUS.md)

| PRD | Fronteira/dependência |
|---|---|
| **PRD 01** | Padrão de migração/taxonomia — trivial aqui (zero schema novo). O monitor lê os tipos de evento que o 01 consolida. Fronteira do STATUS.md: coluna `is_internal` em `behavior_events` é do 01; este PRD não usa `behavior_events`. |
| **PRD 02** | Quando o 02 alinhar a admissão (gate de consentimento na impressão e impressão disparada no clique), duas constantes viram: `AD_SANITY_MARGIN` 3→1.5 (severidade de `impressions_gt_pageviews` warning→critical) e `CLICK_TOLERANCE` 1→0 (decisão delegada pelo PRD 04 RF6 e tomada no RF1 deste PRD). Follow-up de 1 linha + testes de fronteira do §12. |
| **PRD 03** | **Fronteira literal do STATUS.md**: contadores por endpoint (bots/rate/internos de `/behavior` e `/ads/*`) = incremento no 03, exposição no 08 — NÃO são regras cross-metric e ficam FORA deste PRD (nenhuma das 7 regras usa contador de saúde). Também do 03: dedup do evento `category` no ingest — por isso a R4 usa só `views`, nunca `clicks`. |
| **PRD 04** | Fonte das fórmulas de anúncio: `checkAdSanity`, `checkClicksVsImpressions` (retorno `{ok, ratio, limit}`), `S(A)=1`, `ads_reliable_since`. Este PRD as CONSOME (CA3) — não redefine. ⚠️ `AD_SANITY_MARGIN` NÃO nasce no 04 (ele define só a fórmula `M`): a constante é declarada hoje pelo PRD 08 em `healthAlerts.ts` — importar de onde existir, NUNCA duplicar (CA13). Também do 04: `adDailyChart` e sua sobrescrita (`analytics.ts:658-661`) — o coletor lê `ad_daily_stats` cru, nunca o chart. Sem PRD 04, R1/R6 entram em `skipped`. |
| **PRD 05** | Fonte de `paidCampaigns`, `activePaidCampaigns()`, `PAID_RULE_SINCE`. R2 depende deles; sem PRD 05, `skipped`. |
| **PRD 06** | Dono das agregações que o coletor RF2 reusa (`referrerChart`, `topCategories`, `visitors`, `uniqueSessions`). Se o PRD 06 mudar a semântica de um card (ex.: "cliques" do item 14), o coletor deve acompanhar — implementar 11 DEPOIS de 06 estabilizar as agregações, ou casar as duas mudanças. |
| **PRD 08** | **Superfície de exposição/alerta** das regras deste PRD. RECONCILIAÇÃO EXPLÍCITA: o PRD 08 já implementa `ad_sanity`/`ad_clicks_gt_impressions`/`paid_without_campaign` on-demand em `healthAlerts.ts`. Para uma verdade só, `evaluateHealthAlerts` (PRD 08) deve chamar as funções puras deste PRD (`analyticsSanity.ts`) para essas 3 regras, e este PRD passa a ser o dono canônico do catálogo; as regras que o 08 não surface (R3/R4/R5/R7) o PRD 08 lê do relatório RF5. Se os dois forem implementados fora de ordem, o de trás refatora o de frente para consumir `analyticsSanity.ts` (nunca duas cópias da fórmula). |
| **PRD 09** | Decide a forma final do RF5 (endpoint próprio vs campo `sanity` no `/health`). Default recomendado: campo no `/health`. |
| **PRD 10** | Corrige os %>100% na origem (itens 3/14); a regra `percent_over_100` deste PRD é a rede de segurança que garante que não voltem. Sem sobreposição de código (10 é front, 11 é backend). |
| **PRD 12** | O script de tráfego sintético do 12 deve exercitar cada regra (gerar e depois limpar dados marcados que disparem cada violação), sempre com marcação de teste — nunca em produção. |

**Mapa de ids PRD 08 ↔ PRD 11** (os dois PRDs batizaram as mesmas regras de formas
diferentes; sem este mapa a reconciliação cria duas famílias de id no painel):

| Regra | id no PRD 08 (`healthAlerts.ts`) | id canônico deste PRD (`analyticsSanity.ts`) |
|---|---|---|
| impressões ≤ pageviews × slots × M | `ad_sanity` | `impressions_gt_pageviews` |
| cliques ≤ impressões | `ad_clicks_gt_impressions` | `clicks_gt_impressions` |
| pago exige campanha ativa | `paid_without_campaign` | `paid_without_campaign` (igual) |

Decisão: os ids **deste PRD** são os canônicos no relatório do RF5; quem integrar por
último traduz (ou renomeia no 08, se o 08 ainda não estiver no ar). O que NÃO pode
acontecer é a mesma violação aparecer no painel com dois nomes.

**Riscos principais**: (1) sobreposição com o PRD 08 se implementados sem a
reconciliação acima → mitigado tornando `analyticsSanity.ts` a única fonte das
fórmulas + CA13 (`AD_SANITY_MARGIN` declarada 1× no repo); (2) falso-positivo por
skew de buffer (R4) → mitigado por tolerância ajustável por constante (a R5 é imune,
§11 caso 3); (3) custo do monitor em blog com muito histórico → mitigado por janela
de 30d e intervalo de 15 min (ajustável/desligável por env); (4) rede inteira na
mesma imagem → canário resenhavip obrigatório antes dos demais; (5) crescimento de
`security_logs` sem retenção automática → mitigado pelo throttle de 6h (§11 caso 10).

---

## 15. Estimativa de esforço

**M** (médio). O catálogo puro (RF1) e os testes são diretos (padrão dos helpers
existentes). O coletor (RF2) é o maior custo real: reusar corretamente as queries do
`/stats` sem duplicar agregação exige ler `analytics.ts` com cuidado. O monitor
(RF3) segue o padrão de `scheduler.ts` (montado em `src/index.ts:193`) e a emissão
(RF4) é uma chamada a `logSecurity` (`audit.ts:45`) + um `Map` de throttle. A
reconciliação com o PRD 08 (§14), incluindo o mapa de ids, adiciona coordenação, não
código. Sem migração de dados, sem schema novo, sem UI (a UI é do PRD 08).
