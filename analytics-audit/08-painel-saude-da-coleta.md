# PRD 08 — Painel de saúde da coleta: observabilidade e alertas automáticos

> **O que é este documento.** PRD de implementação, escrito para ser consumido pelo
> Claude Code numa sessão futura SEM o contexto da auditoria — autocontido: dá para
> executar lendo só este arquivo. Fontes: `analytics-audit/00-auditoria-estado-atual.md`
> (Fase 0.2, achados com evidência), `analytics-audit/00-inventario.md` (mapa; §8 tem
> correções de linha), `analytics-audit/STATUS.md` (FRONTEIRAS entre PRDs),
> `PRD_ANALYTICS_PLANEJAMENTO_v2.md` (template e descrição do módulo 08),
> `docs/ANALYTICS.md` e CLAUDE.md §§5, 6, 14, 17. Todas as evidências `arquivo:linha`
> abaixo foram REABERTAS nos arquivos reais na sessão de escrita deste PRD
> (2026-07-23), exceto onde marcado "(cf. auditoria)" ou "(cf. PRD NN)".
>
> **Princípio obrigatório:** volume baixo NÃO é bug — os blogs são novos. Bug é o que
> for logicamente incorreto ou inconsistente, independente do volume. Corolário para
> ALERTAS: nenhum alerta deste PRD pode disparar por "número pequeno" — todo alerta
> exige uma INCONSISTÊNCIA lógica (identidade quebrada, invariante violada, dado
> impossível) ou uma MUDANÇA estrutural, nunca volume absoluto. Em blog novo com zero
> tráfego, o estado esperado do painel é "nenhum alerta" — e isso é sucesso, não
> ausência de dado.
>
> **Multi-blog:** os 8 blogs (sp011, ksports, esporteagora, resenhavip, oleysports,
> beeesportes, pontofarma, creditovc) rodam a MESMA imagem `blog-api:vN`/`blog-web:vN`
> (CLAUDE.md §6). Tudo aqui vale para a rede inteira no próximo rollout do §6 — e um
> erro quebra a rede inteira de uma vez. Nenhuma lógica pode ser condicionada a
> BLOG_ID (CLAUDE.md §13/§17). Contadores e alertas são POR CONTAINER/POR BANCO —
> cada blog enxerga só os seus, que é o comportamento correto para diagnóstico por
> blog.
>
> **Encurtamentos:** `api = artifacts/api-server/src`, `web = artifacts/brasilia-agora/src`,
> `db = lib/db/src`.

---

## 1. Objetivo

Transformar o card "Saúde da coleta" (item 25 da checklist do doc v2) de um mostrador
parcial de contadores em uma **superfície de observabilidade com alertas
automáticos**, sem redesenhar o dashboard:

1. **Expor os contadores por endpoint criados pelo PRD 03** (`byEndpoint` — bots/
   rate/inválidos/duplicados/internos de `/event`, `/behavior`, impressão e clique
   de anúncio — e `internalByReason`), hoje invisíveis: o card atual descreve só o
   `/event` e induz a conclusão errada ("0 bots filtrados" — auditoria, claim d).
2. **Alertas automáticos** avaliados no servidor e exibidos no card, cobrindo as
   quatro famílias exigidas pelo módulo 08 do doc v2 + as regras herdadas dos PRDs
   01/03/04/05: proporção de eventos internos anômala; violação da invariante de
   sanidade de anúncios do PRD 04 (impressões vs pageviews × slots × margem);
   `pago > 0` sem campanha cadastrada (PRD 05); `flushFailed > 0`; mais identidade
   de reconciliação do buffer (PRD 03 RF6.3), dominância de `privateIp` (PRD 03
   RF4) e tipo reservado observado (PRD 01 RF6).
3. **Decisão explícita sobre contadores em memória** (zeram no restart): **ACEITAR
   e rotular "desde o boot"** — não persistir (racional no §4/RF2). Alertas que
   precisam de durabilidade derivam do BANCO, nunca dos contadores.
4. **Manter `reliableSince` e a lista `filters[]`** no payload do `/health` — e
   passar a EXIBIR `filters[]` no card (hoje o client busca o array e nunca o
   renderiza — §2.3) — além de expor `adsReliableSince` (campo entregue pelo
   PRD 04 §7.3).

Itens da checklist do doc v2 cobertos: **25** (Saúde da coleta — núcleo). Superfície
de alerta para os itens **4/19/20/21** (sanidade de anúncios) e **11** (pago sem
campanha). Regras do PRD 11 expostas aqui: `cliques ≤ impressões`,
`paid > 0% exige campanha/UTM ativa cadastrada`, `impressões ≤ pageviews não-internos
× slots × margem` — o motor CONTÍNUO delas é PRD 11; este PRD é a superfície de
exposição/alerta (fronteira literal do STATUS.md).

---

## 2. Contexto / estado atual (achados da auditoria, com evidência)

### 2.1 O que o card Saúde mostra hoje — Confirmado no código (reaberto nesta sessão)

**Servidor.** Contadores em `api/lib/analyticsHealth.ts` (arquivo inteiro relido):
`HealthCounters` com `received`, `droppedBot`, `droppedRate`, `droppedInvalid`,
`droppedDuplicate`, `flaggedInternal`, `flushedOk`, `flushFailed` (`:9-18`), estado
de módulo zerado no boot (`:20-27` — docstring `:1-7` declara "reiniciar o container
zera — documentado"); `bumpHealth` (`:29-31`), `noteEvent` (`:33-35`), `noteFlush`
(`:37-41`), `healthSnapshot` (`:43-52`) que devolve os contadores + `buffered`,
`lastEventAt`, `lastFlushAt`, `bootAt`, `uptimeSeconds`.

**Endpoint.** `GET /api/analytics/health` (`api/routes/analytics.ts:351-363`,
handler SÍNCRONO, só `authMiddleware` — sem `requirePermission`, diferente do
`/stats` `:366`): devolve `healthSnapshot({buffered: _buffer.length})` +
`reliableSince: ANALYTICS_V2_SINCE` (constante `"2026-07-08"` em
`api/lib/analyticsShared.ts:21`) + `filters[]` hardcoded (`:355-361`) que descreve
APENAS os filtros do `/event` ("rate limit 120 eventos/min por IP", "pageview
duplicado…").

**UI.** Card em `web/pages/admin/Analytics.tsx:1336-1369`: 6 tiles (`received`,
`flushedOk`, `droppedBot`, `droppedDuplicate`, `droppedRate`, `flaggedInternal` —
`:1346-1351`; nota: `droppedInvalid` NÃO é exibido) + rodapé com `lastEventAt`,
`lastFlushAt`, `buffered`, `flushFailed` (só quando >0, em vermelho — `:1363-1365`)
e `reliableSince` (`:1366`). O fetch é feito junto do `/stats` com auto-refresh de
30s (`:212-232`). A interface `Health` do client (`:74-80`) inclui `filters:
string[]`, mas **nenhuma linha do arquivo renderiza `filters`** (grep no arquivo:
única ocorrência é a interface `:79`) — o array é buscado e descartado. O rótulo
"desde o boot" JÁ existe: sub-label `an.collectionHealthSub` = "(contadores desde o
último reinício do servidor)" (`web/lib/adminI18n.ts:297`; bloco EN `:1124-1142`).

### 2.2 O que a auditoria apontou (item 25 = Parcial)

- **Cobertura restrita ao `/event`** (auditoria §4.7 e claim d): descartes de
  bot/rate do `/behavior` (`analytics.ts:316,:318`) e das rotas `/ads/:id/*`
  (`ads.ts:145-148,:187-190` — cf. auditoria) não incrementam nada; `analyticsHealth`
  nem é importado em `ads.ts`. O card pode mostrar "0 bots filtrados" enquanto as
  rotas de anúncio descartam (ou deixam passar) volume invisível. O **PRD 03 RF1**
  corrige o INCREMENTO (contadores `byEndpoint` por rota + `internalByReason` por
  razão de marcação interna) e declara: "Exposição na UI e alertas: **PRD 08**".
- **Reconciliação furada no flush degradado** (auditoria §4.7): com banco fora e
  re-enfileiramento excedendo `BUFFER_MAX` (500 — `analytics.ts:52`), o excedente é
  descartado sem `noteFlush` (`analytics.ts:109-111`, relido nesta sessão), quebrando
  a identidade "Aceitos = Gravados + Falhas + buffer". O **PRD 03 RF6** conserta a
  contabilização e formaliza a identidade `received = flushedOk + flushFailed +
  buffered` "oferecida ao PRD 08/11 como regra" — este PRD a transforma em alerta.
- **Tudo em memória** — "limitação divulgada na própria UI" (auditoria §4.7). O
  escopo deste PRD exige DECISÃO explícita: aceitar e rotular, ou persistir (§4/RF2).
- **91 impressões vs 3 pageviews** (auditoria §2, Problema 1): quatro mecanismos
  confirmados no código, o central sendo o upsert defeituoso de `ad_daily_stats`
  (`ads.ts:36-50`, sem UNIQUE — claim i). O **PRD 04 RF6** define a invariante de
  sanidade `impressions_publicas(A,D) ≤ max(pageviews_nao_internos(D),1) × S(A) × M`
  (M=3 até o PRD 02 alinhar consentimento; 1.5 depois; S=1 pós-dedup do PRD 04) e os
  helpers puros `checkAdSanity`/`checkClicksVsImpressions` em `analyticsShared.ts`,
  declarando: "o motor contínuo que roda a regra por blog e o alerta são **PRD 11**
  e **PRD 08**". O PRD 04 §7.3 também entrega o campo `adsReliableSince` no
  `/health` ("Exibição no card Saúde da coleta: **PRD 08**").
- **"Tráfego pago" sem campanha** (auditoria §3, Problema 2): o **PRD 05** troca a
  regra (pago ⇔ campanha ativa casa os sinais; cadastro `paidCampaigns` em settings;
  corte `PAID_RULE_SINCE`; colunas `gclid`/`fbclid` persistidas no first-touch) e
  declara: "exposição/alerta 'paid > 0% sem campanha cadastrada' é do 08 […]; este
  PRD entrega os dados que tornam o alerta computável".
- **Tipos reservados** (PRD 01 RF6): `video_play`/`download` ficam na whitelist do
  `/behavior` SEM emissor no client — o PRD 01 entrega ao PRD 08 a regra "tipo
  reservado > 0 ⇒ anomalia" para alerta automático.
- **Proporção de internos**: os 104/106 eventos internos observados no sp011 são
  comportamento CORRETO (acessos ao admin — doc v2, item 25). Proporção ALTA não é
  anomalia; anômala é a MUDANÇA estrutural (proxy quebrado marcando 100% por
  `privateIp` — PRD 03 RF4: "alerta automático: PRD 08" — ou um salto brusco na
  série). `docs/ANALYTICS.md` não trata alertas em nenhuma das 8 limitações
  admitidas (`docs/ANALYTICS.md:114-135`, cf. auditoria §3.3) — seção nova de doc
  faz parte deste PRD (RF7).

### 2.3 Fronteiras do STATUS.md que governam este PRD (reproduzidas)

- "Contadores `droppedBot` para ads/behavior: incremento nas rotas → **PRD 03**;
  exposição/alerta → **PRD 08**."
- Regras de sanidade CONTÍNUAS (rodando por blog, o tempo todo) = **PRD 11**; este
  PRD é a superfície de exposição/alerta delas (avaliação on-demand quando o admin
  abre/atualiza o painel).
- Frontend geral do dashboard = **PRD 10** ("não redesenhar; estados vazios
  corretos") — este PRD toca SOMENTE o card Saúde da coleta e as chaves i18n dele.
- Contratos por card = **PRD 09** — o `/health` permanece endpoint próprio, fora do
  `/stats` (nenhuma fusão aqui).

---

## 3. Problema a resolver

1. **Descartes invisíveis**: os contadores por endpoint que o PRD 03 cria
   (`byEndpoint`, `internalByReason`) chegam ao JSON do `/health` mas NÃO têm
   superfície — o operador continua sem ver bots/descartes de ads e behavior, e o
   `filters[]` (já corrigido pelo PRD 03 §7.4 para descrever a cobertura real)
   continua sem render no card.
2. **Nenhum alerta automático**: as violações que a auditoria provou possíveis
   (impressões logicamente impossíveis, "pago" fantasma, perda de eventos no flush,
   identidade do buffer quebrada, marcação interna estruturalmente errada) só são
   descobertas se o operador olhar o número certo no dia certo. Com 8 blogs, a
   inspeção manual não escala.
3. **Semântica do "desde quando" indefinida**: contadores zeram no restart e o
   painel mistura contadores desde-o-boot com dados de banco (`reliableSince`)
   sem datar o zero de forma visível (o `bootAt` existe no JSON — `analyticsHealth.
   ts:49` — mas não é exibido).
4. **`filters[]` e `adsReliableSince` sem exibição**: o primeiro é buscado e
   descartado pelo client (§2.1); o segundo é entregue pelo PRD 04 e "a exibição é
   PRD 08" (§7.3 de lá).

---

## 4. Requisitos funcionais

Ordem recomendada: RF2 (decisão/rotulagem) → RF1 (exposição byEndpoint) → RF3
(motor de alertas puro) → RF4 (gatherer no `/health`) → RF5 (UI dos alertas) →
RF6 (filters[]/reliableSince/adsReliableSince) → RF7 (i18n + docs). Tudo cabe numa
única imagem/rollout.

### RF1 — Expor `byEndpoint` e `internalByReason` no card Saúde

- A interface `Health` do client (`Analytics.tsx:74-80`) ganha os campos OPCIONAIS
  (tolerantes a ausência — ver borda "PRD 03 ainda não no ar", §11):

  ```ts
  byEndpoint?: Record<"event" | "behavior" | "adImpression" | "adClick", {
    received: number; droppedBot: number; droppedRate: number;
    droppedInvalid: number; droppedDuplicate: number; flaggedInternal: number;
  }>;
  internalByReason?: { flag: number; configuredIp: number; privateIp: number };
  alerts?: HealthAlertDto[];        // RF4
  alertsSkipped?: { id: string; reason: string }[];  // RF4
  adsReliableSince?: string | null; // PRD 04 §7.3
  bootAt?: string;                  // já existe no JSON; passa a ser tipado/exibido
  ```

- Abaixo dos 6 tiles atuais (`:1344-1358`, intocados), nova tabela compacta
  "Por endpoint": 4 linhas (Pageviews/eventos, Comportamento, Impressão de anúncio,
  Clique de anúncio) × 6 colunas (Aceitos, Bots, Rate, Inválidos, Duplicados,
  Internos), com scroll horizontal próprio (`overflow-x-auto`) em telas estreitas.
  Renderizada SOMENTE se `health.byEndpoint` existir (optional chaining — sem
  quebrar com API antiga durante rollout parcial da rede).
- Linha adicional sob a tabela: "Internos por razão: flag X · IP cadastrado Y ·
  IP privado Z" quando `internalByReason` existir.
- NENHUM tile atual muda de posição/semântica (não-redesign; a fronteira de
  reestilização geral é PRD 10).

### RF2 — Decisão: contadores em memória são ACEITOS e rotulados "desde o boot"

**Decisão deste PRD (exigida pelo escopo): NÃO persistir os contadores.** Racional
registrado:

1. Persistir exigiria coluna/tabela nova (Drizzle + ensureSchema) e escrita
   adicional por evento ou flush periódico — custo permanente em TODOS os blogs
   para ganhar apenas continuidade de um número de diagnóstico.
2. Os contadores respondem "o que o processo atual está fazendo AGORA" — é
   exatamente a semântica desde-o-boot; o docstring do módulo já a declara
   (`analyticsHealth.ts:1-7`) e a UI já rotula ("(contadores desde o último
   reinício do servidor)" — `adminI18n.ts:297`).
3. **Todo alerta que precisa de durabilidade deriva do BANCO** (RF4: sanidade de
   ads via `ad_daily_stats`+`analytics_events`; pago via `analytics_events`;
   tipos reservados via `behavior_events`) — restart não os cega.
4. O zero é DATÁVEL: `bootAt`/`uptimeSeconds` já saem no JSON
   (`analyticsHealth.ts:49-50`).

**Obrigação de rotulagem (o que muda):** o rodapé do card passa a exibir
`bootAt` formatado ("Desde o boot: dd/mm hh:mm") ao lado de `lastEventAt`/
`lastFlushAt` — o "desde" deixa de ser implícito. O sub-label existente
(`an.collectionHealthSub`) permanece.

### RF3 — Motor de alertas: função pura `evaluateHealthAlerts`

Novo módulo **`api/lib/healthAlerts.ts`** com contrato "zero imports" (mesmo padrão
de `analyticsShared.ts:1-7` — alvo direto de `node --test`):

```ts
export interface HealthAlertDto {
  id: string;
  severity: "critical" | "warning";
  params: Record<string, number | string>;
}
export interface SkippedRule { id: string; reason: string; }

export interface HealthAlertInput {
  counters: { received: number; flushedOk: number; flushFailed: number; buffered: number };
  bufferIdentityTolerance: number; // 2×BUFFER_MAX = 1000 (lote em voo + teto do PRD 03 RF6)
  internalByReason?: { flag: number; configuredIp: number; privateIp: number } | null;
  internalShare?: {                // pageviews; janelas 7d recente vs 28d anteriores
    recentTotal: number; recentInternal: number;
    priorTotal: number; priorInternal: number;
  } | null;
  adDays?: {                       // linhas (anúncio, dia) já filtradas por adsReliableSince
    adId: string; date: string; impressions: number; clicks: number;
    pageviews: number;             // não-internos do MESMO dia BRT
  }[] | null;
  adMargin: number;                // AD_SANITY_MARGIN (3 até o PRD 02; 1.5 depois)
  paid?: { activeCampaigns: number; paidLinesSinceRule: number } | null;
  reservedBehaviorCount?: number | null; // event_type video_play/download, 30d
}

export const AD_SANITY_MARGIN = 3; // reduzir para 1.5 quando o PRD 02 alinhar consentimento (PRD 04 RF6)
export const HEALTH_ALERT_THRESHOLDS = {
  privateIpDominanceMinReceived: 30,   // amostra mínima
  privateIpDominanceShare: 0.9,        // privateIp ≥ 90% dos aceitos
  internalShiftMinSample: 50,          // por janela
  internalShiftPoints: 40,             // pontos percentuais
} as const;

export function evaluateHealthAlerts(input: HealthAlertInput):
  { alerts: HealthAlertDto[]; skipped: SkippedRule[] };
```

**Catálogo de alertas (regras EXATAS — nada subjetivo):**

| id | Severidade | Fonte | Regra exata (dispara quando…) | Origem da regra |
|---|---|---|---|---|
| `flush_failed` | critical | contadores | `flushFailed > 0` (desde o boot) | escopo do módulo 08 (doc v2) |
| `buffer_identity` | warning | contadores | `abs(received − (flushedOk + flushFailed + buffered)) > bufferIdentityTolerance` (1000 = 2×BUFFER_MAX — tolera lote em voo e o teto do PRD 03 RF6.2) | PRD 03 RF6.3 (identidade formal) |
| `internal_privateip_dominant` | critical | contadores (PRD 03) | `received ≥ 30` E `internalByReason.privateIp ≥ 0.9 × received` — assinatura de proxy quebrado (todo visitante chegando com IP privado) | PRD 03 RF4 ("alerta automático: PRD 08") |
| `internal_share_shift` | warning | banco | `recentTotal ≥ 50` E `priorTotal ≥ 50` E `abs(pctRecente − pctAnterior) ≥ 40` pontos, onde pct = internos/total de pageviews (7d recentes vs 28d anteriores) | módulo 08 do doc v2 ("proporção de internos mudar de forma anômala") |
| `ad_sanity` | warning (vira critical junto com a redução de M para 1.5, pós-PRD 02 — PRD 04 RF6) | banco | para cada linha de `adDays`: `impressions > max(pageviews, 1) × 1 × adMargin` (S=1 pós-dedup PRD 04; avaliar via `checkAdSanity` do PRD 04 se disponível, senão a fórmula inline idêntica) | PRD 04 RF6 (invariante de sanidade) |
| `ad_clicks_gt_impressions` | critical | banco | para cada linha de `adDays`: `clicks > impressions + 1` (o `+1` cobre o clique legítimo antes do dwell de 1s — PRD 04 RF6, regra irmã) | PRD 04 RF6 / regra PRD 11 "cliques ≤ impressões" |
| `paid_without_campaign` | critical | banco + settings | `paid.activeCampaigns === 0` E `paid.paidLinesSinceRule > 0` (linhas `referrer='pago'` com `ts ≥` início do dia BRT de `PAID_RULE_SINCE`) | PRD 05 / regra PRD 11 "`paid` > 0% exige campanha" |
| `reserved_behavior_type` | warning | banco | `reservedBehaviorCount > 0` (`behavior_events.event_type IN ('video_play','download')`, últimos 30 dias, internas INCLUÍDAS — anomalia de contrato, não métrica pública) | PRD 01 RF6 ("tipo reservado > 0 ⇒ anomalia") |

**Regras de skip (honestidade da superfície):** quando um segmento do input é
`null`/`undefined`, a regra correspondente NÃO é avaliada e entra em `skipped` com
a razão passada pelo gatherer (RF4): `"prd03_pendente"` (sem `internalByReason`),
`"prd04_reparo_pendente"` (sem `adsReliableSince` — dados legados inflados
disparariam falso alarme permanente), `"prd05_pendente"` (sem `PAID_RULE_SINCE`/
cadastro), `"db_error"` (query falhou — nunca derrubar o `/health`). Amostra
insuficiente (`received < 30`, janelas < 50) NÃO é skip — é silêncio legítimo
(volume baixo não é bug).

**Proporção alta de internos NÃO dispara nada por si**: 104/106 internos é correto
(doc v2, item 25). Só a DOMINÂNCIA de `privateIp` (assinatura técnica de proxy
quebrado) e o SALTO entre janelas (≥40 pontos) alertam.

### RF4 — Gatherer no `GET /health` (handler vira async, com cache TTL)

`api/routes/analytics.ts:351-363` — o handler passa a `async` e monta o
`HealthAlertInput`:

- **Contadores**: de `healthSnapshot`/`byEndpoint`/`internalByReason` (PRD 03) —
  sempre frescos, custo zero.
- **Consultas de banco (bounded, com try/catch por consulta → `db_error` no
  `skipped`)**, memoizadas com **TTL de 60s** em módulo (auto-refresh do painel é
  30s — `Analytics.tsx:230` — e pode haver várias abas; o TTL corta o custo pela
  metade sem tornar o alerta velho):
  1. `internalShare`: pageviews dos últimos 35 dias divididos em 7d recentes vs
     28d anteriores, com `count FILTER (WHERE is_internal)` — 1 query agregada.
  2. `adDays`: linhas de `ad_daily_stats` do dia BRT corrente e do anterior
     (`todayStr` — `ads.ts:31-34`, cf. auditoria) COM `date >= adsReliableSince`
     (key `settings.ads_reliable_since`, PRD 04 §6.2; `null` → segmento `null` +
     skip `prd04_reparo_pendente`), juntadas aos pageviews não-internos
     (`type='pageview' AND is_internal=false`) dos mesmos 2 dias BRT — 2 queries
     pequenas. Somente colunas PÚBLICAS `impressions`/`clicks` (a dimensão
     `internal_*` do PRD 04 fica fora da sanidade, como lá definido).
  3. `paid`: `activePaidCampaigns().length` (memoização do PRD 05 RF3) +
     `count(*)` de `analytics_events WHERE referrer='pago' AND ts >=
     to_timestamp(brtDayStartMs(PAID_RULE_SINCE)/1000)` — 1 query. Se o PRD 05
     não estiver implementado (sem export `PAID_RULE_SINCE`), segmento `null` +
     skip `prd05_pendente`.
  4. `reservedBehaviorCount`: `count(*)` de `behavior_events WHERE event_type IN
     ('video_play','download') AND ts >= now() - interval '30 days'` — 1 query.
- Chama `evaluateHealthAlerts` e anexa `alerts`/`alertsSkipped` à resposta,
  mantendo TODOS os campos atuais (`reliableSince`, `filters[]` — cujo texto por
  endpoint já é entregue pelo PRD 03 §7.4 — e `adsReliableSince` do PRD 04 §7.3,
  repassado se a key existir).
- O endpoint continua `authMiddleware` sem `requirePermission` (comportamento
  atual — `analytics.ts:351`; mudança de permissão está fora de escopo).
- Falha TOTAL do gatherer nunca derruba o endpoint: em erro inesperado, responde o
  shape atual + `alerts: []` + `alertsSkipped` com `db_error` nas regras de banco.

### RF5 — UI dos alertas no card Saúde

Em `Analytics.tsx`, no TOPO do card Saúde (antes dos tiles, `:1344`):

- Se `health.alerts?.length > 0`: uma faixa por alerta — fundo vermelho
  (`critical`) ou âmbar (`warning`), texto via i18n `an.alert.<id>` com params
  interpolados (padrão simples de replace `{param}`); id desconhecido (versão
  futura da API) cai num texto genérico `an.alertUnknown` + o próprio id — a UI
  nunca quebra por alerta novo.
- Se `alerts` existir e estiver vazio: linha discreta "Nenhum alerta ativo"
  (`an.alertNone`) — estado saudável é informação, não ausência.
- Se `alertsSkipped?.length > 0`: nota pequena "N regras não avaliadas" com
  tooltip listando `id: reason` (transparência sem poluir).
- Auto-refresh já existente (30s) cobre a atualização — nenhum mecanismo novo.

### RF6 — `filters[]`, `reliableSince`, `adsReliableSince` e `bootAt` no card

- **`filters[]`** (mantido no payload — obrigação literal do escopo): passa a ser
  RENDERIZADO num `<details>` "Filtros ativos da coleta" no rodapé do card, uma
  linha por item do array (conserta o dead-fetch do §2.1). O TEXTO do array é o do
  PRD 03 §7.4 (cobertura real por endpoint) — este PRD não o redefine; se o PRD 03
  ainda não estiver no ar, exibe o texto atual (`analytics.ts:355-361`) sem ajuste.
- **`reliableSince`** (mantido): exibição atual intocada (`:1366` e rodapé da
  página `:1373`).
- **`adsReliableSince`** (PRD 04): nova linha no rodapé do card — "Anúncios
  confiáveis desde dd/mm/aaaa" quando string; "Anúncios: reparo pendente" quando
  `null`; linha OMITIDA quando o campo não existe no JSON (PRD 04 não implantado).
- **`bootAt`**: exibido conforme RF2.

### RF7 — i18n e documentação

- Chaves novas nos DOIS blocos de `web/lib/adminI18n.ts` (pt-BR na vizinhança de
  `:296-317`; EN na de `:1124-1142` — painel admin tem idioma POR USUÁRIO,
  CLAUDE.md §15): `an.hEndpointTable`, `an.hEpEvent`, `an.hEpBehavior`,
  `an.hEpAdImp`, `an.hEpAdClick`, `an.hInvalid` (coluna "Inválidos" — contador
  existia e nunca foi exibido, §2.1), `an.hByReason`, `an.hBootAt`,
  `an.hAdsReliableSince`, `an.hAdsRepairPending`, `an.hFiltersTitle`,
  `an.alertNone`, `an.alertUnknown`, `an.alertSkipped`, e `an.alert.<id>` para os
  8 ids do catálogo (RF3). MESMO número de chaves nos dois blocos.
- `docs/ANALYTICS.md`: nova seção "Saúde da coleta e alertas" — semântica
  desde-o-boot (decisão RF2), catálogo de alertas com as regras exatas e as
  razões de skip, TTL de 60s, e a nota de que regras contínuas/por período são
  PRD 11. Não alterar as seções de dicionário de métricas (donos: PRDs 06/07).

---

## 5. Requisitos não-funcionais

- **Performance**: parte de contadores é O(1); parte de banco são 5 queries
  agregadas pequenas (janelas de 2 a 35 dias, tabelas de blog novo), atrás de TTL
  de 60s e SÓ no endpoint autenticado de admin — zero custo no site público e zero
  query nova no `/stats`. `evaluateHealthAlerts` é O(nº linhas de adDays + nº
  regras).
- **LGPD**: nenhum dado novo coletado/persistido; alertas e contadores são
  agregados sem IP/UA/sessão; o `/health` continua autenticado. Parte da rede
  opera conteúdo político-adjacente: não introduzir rastreio novo é requisito.
- **Confiabilidade**: gatherer nunca lança para o client (try/catch por consulta →
  `db_error` em `skipped`); alerta é LEITURA pura — nenhum UPDATE/DELETE em tabela
  alguma; UI tolerante a todos os campos ausentes (API antiga) e a ids futuros.
- **Multi-blog**: mesma imagem para os 8 blogs; alertas avaliados POR BLOG contra o
  banco DO BLOG (sp011/Supabase; replicados no pg-blogs via `db-config.enc`) —
  nenhum passo manual por blog; nada condicionado a BLOG_ID; rollout §6 do
  CLAUDE.md obrigatório (§8.3) com canário resenhavip e revalidação POR BLOG (§8.4).
- **Windows/dev (CLAUDE.md §14)**: typecheck por pacote (filtro da raiz não casa no
  Windows); `vite build` do web NÃO roda local — build real na VPS; testes só
  `node --test` com imports relativos com extensão `.ts` explícita; NUNCA unicode
  literal em regex (`\uXXXX`).

---

## 6. Modelo de dados

**Este PRD NÃO cria coluna, tabela nem índice.** Regra do doc v2 ("colunas novas
SEMPRE via schema Drizzle E `ensureSchema.ts`") respeitada por vacuidade — decisão
RF2 elimina a única candidata (persistência de contadores). O que este PRD LÊ, já
entregue por outros PRDs (conferir presença antes de implementar — §8.1):

- `analytics_events.is_internal` (rodada 2 — `db/schema/analytics.ts:36` +
  `ensureSchema.ts:54`, cf. inventário §5) — query do `internal_share_shift`.
- `ad_daily_stats` com UNIQUE `(ad_id,date)` + colunas `internal_impressions`/
  `internal_clicks` + key `settings.ads_reliable_since` — **PRD 04 §6** (a
  sanidade usa só as colunas públicas `impressions`/`clicks`).
- `behavior_events.event_type` (`db/schema/behavior_events.ts:3-15`, cf.
  inventário) — query do `reserved_behavior_type` (dispensa `is_internal`).
- `paidCampaigns` em settings + `PAID_RULE_SINCE` + colunas `gclid`/`fbclid` —
  **PRD 05 RF-1/RF-4/RF-5** (o alerta usa o cadastro e a coluna `referrer`).

Estado em memória novo (não é schema): cache TTL 60s do resultado das consultas do
gatherer (RF4) — zera no restart, coberto pela decisão RF2.

---

## 7. Contrato de API

### 7.1 `GET /api/analytics/health` — campos ADITIVOS (único endpoint tocado)

Shape atual preservado (`analyticsHealth.ts:43-52` + `analytics.ts:351-363`; os
campos do PRD 03 §7.4 e do PRD 04 §7.3 são repassados quando presentes):

```jsonc
{
  // … campos atuais inalterados: received, droppedBot, droppedRate, droppedInvalid,
  // droppedDuplicate, flaggedInternal, flushedOk, flushFailed, buffered,
  // lastEventAt, lastFlushAt, bootAt, uptimeSeconds, reliableSince, filters[] …
  // … campos do PRD 03 (repassados): byEndpoint{4×6}, internalByReason{3} …
  // … campo do PRD 04 (repassado): adsReliableSince …

  "alerts": [
    { "id": "flush_failed", "severity": "critical", "params": { "flushFailed": 12 } },
    { "id": "ad_sanity", "severity": "warning",
      "params": { "adId": "abc", "date": "2026-07-23", "impressions": 91, "limit": 9 } }
  ],
  "alertsSkipped": [
    { "id": "paid_without_campaign", "reason": "prd05_pendente" }
  ]
}
```

- `alerts` é SEMPRE um array (vazio = saudável); ordenação: `critical` antes de
  `warning`, depois por `id`.
- `alertsSkipped` lista as regras não avaliadas com razão de máquina
  (`prd03_pendente` | `prd04_reparo_pendente` | `prd05_pendente` | `db_error`).
- `reliableSince` e `filters[]` MANTIDOS com semântica atual (obrigação do escopo).
- Nenhuma mudança em `GET /api/analytics/stats`, nas rotas de ingest, nem em
  qualquer endpoint público.

### 7.2 Assinaturas internas novas (não-HTTP)

```ts
// api/lib/healthAlerts.ts (novo, zero imports — RF3)
export interface HealthAlertDto { id: string; severity: "critical" | "warning"; params: Record<string, number | string>; }
export interface SkippedRule { id: string; reason: string; }
export interface HealthAlertInput { /* §4/RF3 */ }
export const AD_SANITY_MARGIN = 3;
export const HEALTH_ALERT_THRESHOLDS: { privateIpDominanceMinReceived: 30; privateIpDominanceShare: 0.9; internalShiftMinSample: 50; internalShiftPoints: 40 };
export function evaluateHealthAlerts(input: HealthAlertInput): { alerts: HealthAlertDto[]; skipped: SkippedRule[] };
```

---

## 8. Comandos de verificação (rodar exatamente estes, com resultado esperado)

### 8.1 Local (Windows, antes do commit)

Pré-requisitos de outros PRDs (se algum grep falhar, a regra correspondente DEVE
degradar para `alertsSkipped` — conferir §4/RF3; a implementação deste PRD segue
válida):

```powershell
cd "c:\Users\Usuario(a) Master\sp011"
git grep -n "byEndpoint" -- artifacts/api-server/src/lib/analyticsHealth.ts
# esperado: >=1 (PRD 03 no ar) — se vazio, alertas de contador por razao entram como skip
git grep -n "ads_reliable_since" -- artifacts/api-server/src
# esperado: >=1 (PRD 04 no ar) — se vazio, ad_sanity/ad_clicks entram como skip
git grep -n "PAID_RULE_SINCE" -- artifacts/api-server/src/lib/analyticsShared.ts
# esperado: 1 (PRD 05 no ar) — se vazio, paid_without_campaign entra como skip
```

Typecheck e testes:

```powershell
cd "c:\Users\Usuario(a) Master\sp011\artifacts\api-server"
pnpm run typecheck
# esperado: sem erros
node --test "test/**/*.test.ts"
# esperado: TODOS passam, incluindo a suite nova healthAlerts.test.ts (§12)
cd "c:\Users\Usuario(a) Master\sp011\artifacts\brasilia-agora"
pnpm run typecheck
# esperado: sem erros
```

Greps de estrutura:

```powershell
cd "c:\Users\Usuario(a) Master\sp011"
git grep -n "evaluateHealthAlerts" -- artifacts/api-server/src
# esperado: definicao em lib/healthAlerts.ts + uso em routes/analytics.ts
git grep -n "alertsSkipped" -- artifacts/api-server/src/routes/analytics.ts
# esperado: >=1 (campo presente na resposta do /health)
git grep -Fn "an.alert." -- artifacts/brasilia-agora/src/lib/adminI18n.ts
# esperado: 2x o numero de ids do catalogo (blocos pt-BR e EN com as MESMAS chaves)
git grep -Fn "health.filters" -- artifacts/brasilia-agora/src/pages/admin/Analytics.tsx
# esperado: >=1 (filters[] agora renderizado — dead-fetch corrigido)
git grep -Fn "byEndpoint" -- artifacts/brasilia-agora/src/pages/admin/Analytics.tsx
# esperado: >=1 (tabela por endpoint no card)
git grep -n "UPDATE\|DELETE" -- artifacts/api-server/src/lib/healthAlerts.ts
# esperado: NENHUM resultado (motor 100% leitura)
git diff --stat HEAD~1 -- lib/db
# esperado: VAZIO (nenhum schema novo — decisao RF2)
```

### 8.2 VPS — verificação com dados reais — **PENDENTE DE EXECUÇÃO**

(MCP Supabase não conectado na escrita deste PRD; blocos completos para colar,
padrão CLAUDE.md §12. Testes ativos sempre com `internal:true` e sessões `prd08-*`
— marcados internos, NUNCA poluem métricas públicas. UA de navegador obrigatório:
`curl/` cai no `BOT_RE`.)

**V1 — `/health` protegido e com os campos novos** (observação objetiva):

```bash
DOM='https://resenhavip.midia.run'
curl -s -o /dev/null -w '%{http_code}\n' "$DOM/api/analytics/health"
# esperado: 401 (endpoint segue autenticado)
```

Com admin logado no navegador, abrir `https://resenhavip.midia.run/api/analytics/health`:
JSON contém `alerts` (array, possivelmente vazio), `alertsSkipped`, `reliableSince`,
`filters` (array não-vazio) e `bootAt`. Anotar o conteúdo de `alertsSkipped`: deve
listar EXATAMENTE as regras cujos PRDs-fonte ainda não estão no ar (§8.1) e nada
além.

**V2 — alerta `reserved_behavior_type` dispara com evento sintético interno**
(pré-requisito: PRD 03 no ar — sem ele o evento interno é dropado e não conta):

```bash
DOM='https://resenhavip.midia.run'
curl -s -X POST "$DOM/api/analytics/behavior" -A "Mozilla/5.0 (verificacao PRD08)" -H 'Content-Type: application/json' -d '{"eventType":"video_play","sessionId":"prd08-verif","internal":true}'
# esperado: {"ok":true}
sleep 65
```

Recarregar o `/health` autenticado (após o TTL de 60s): `alerts` contém
`{"id":"reserved_behavior_type","severity":"warning",...}` e o card Saúde do
painel exibe a faixa âmbar correspondente. Limpeza (remove o alerta no próximo
ciclo de TTL):

```bash
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d resenhavip -v ON_ERROR_STOP=1 -c "DELETE FROM behavior_events WHERE session_id LIKE 'prd08-%';"
```

**V3 — `paid_without_campaign` NÃO dispara em blog sem linhas pós-corte** (espelho
SQL da regra; pós-PRD 05 nenhum blog sem campanha deve ter linha nova `pago`):

```bash
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d resenhavip -v ON_ERROR_STOP=1 -c "SELECT count(*) AS pago_pos_corte FROM analytics_events WHERE referrer='pago' AND ts >= (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo');"
# ajustar o filtro de ts para PAID_RULE_SINCE real do commit do PRD 05;
# esperado: pago_pos_corte = 0 e ausencia do alerta no /health
```

**V4 — espelho SQL da sanidade de ads** (mesma conta do gatherer, dia corrente +
anterior; esperado: nenhuma linha em violação → sem alerta `ad_sanity`):

```bash
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d resenhavip -v ON_ERROR_STOP=1 -c "WITH pv AS (SELECT (ts AT TIME ZONE 'America/Sao_Paulo')::date AS dia, count(*) AS pageviews FROM analytics_events WHERE type='pageview' AND is_internal=false AND (ts AT TIME ZONE 'America/Sao_Paulo')::date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - 1 GROUP BY 1) SELECT s.ad_id, s.date, s.impressions, s.clicks, COALESCE(pv.pageviews,0) AS pageviews, (s.impressions > GREATEST(COALESCE(pv.pageviews,0),1) * 3) AS estouro_sanidade, (s.clicks > s.impressions + 1) AS estouro_cliques FROM ad_daily_stats s LEFT JOIN pv ON pv.dia = s.date::date WHERE s.date::date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - 1 ORDER BY s.date DESC;"
# esperado: estouro_sanidade = f e estouro_cliques = f em todas as linhas
# (linhas com estouro = o alerta correspondente DEVE estar presente no /health — coerencia painel×banco)
# NOTA: o gatherer so avalia datas >= adsReliableSince (RF4/CA8: datas anteriores NUNCA sao
#   avaliadas). Dia corrente + anterior sao >= adsReliableSince no regime estavel pos-reparo,
#   mas no transiente logo apos o reparo (adsReliableSince = hoje) "ontem" pode ter dado velho:
#   para o espelho ser fiel, acrescentar "AND s.date >= '<adsReliableSince do commit do PRD 04>'"
#   as duas clausulas de data (padrao do ajuste de PAID_RULE_SINCE do V3).
```

**V5 — espelho SQL do `internal_share_shift`** (no MESMO blog do canário — resenhavip
— para casar com o `/health` de `$DOM`; V1–V4 usam a mesma conexão local `pg-blogs`):

```bash
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d resenhavip -v ON_ERROR_STOP=1 -c "SELECT count(*) FILTER (WHERE ts >= now() - interval '7 days') AS recentes, count(*) FILTER (WHERE ts >= now() - interval '7 days' AND is_internal) AS recentes_int, count(*) FILTER (WHERE ts < now() - interval '7 days') AS anteriores, count(*) FILTER (WHERE ts < now() - interval '7 days' AND is_internal) AS anteriores_int FROM analytics_events WHERE type='pageview' AND ts >= now() - interval '35 days';"
# esperado: alerta presente no /health SE E SOMENTE SE recentes>=50 E anteriores>=50 E
# abs(100*recentes_int/recentes - 100*anteriores_int/anteriores) >= 40
# NOTA: em canario recem-criado as duas janelas ficam <50 -> regra SILENCIOSA (correto, CA10:
#   volume baixo nao e bug). Para exercitar um caso que DISPARA, rodar a MESMA query no sp011
#   (mae — o unico blog com historico grande, ex.: os 104/106 internos) via SUPABASE_DATABASE_URL
#   e conferir contra o /health de https://sp011.com.br (nao contra o do resenhavip):
#   DBURL=$(grep -m1 '^SUPABASE_DATABASE_URL=' /opt/sp011/.env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
#   docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "<a mesma query acima>"
```

### 8.3 Rollout multi-blog (CLAUDE.md §6 — obrigatório)

Arquivos tocados → serviços (§5): `artifacts/api-server` → `api` E
`artifacts/brasilia-agora` → `web`:

```bash
cd /opt/sp011
git pull
V=$(grep -m1 '^BLOG_IMAGE_VERSION=' .env | cut -d= -f2); N="v$((${V#v}+1))"
sed -i "s|^BLOG_IMAGE_VERSION=.*|BLOG_IMAGE_VERSION=$N|" .env
grep '^BLOG_IMAGE_VERSION=' .env
docker compose build api web
docker compose up -d api web
```

```bash
# canário (resenhavip) — rodar V1–V5 do §8.2 e conferir os cards do §8.4 ANTES de seguir
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

Diagnóstico anti-mistura (incidente clássico): `curl -s https://<dominio>/api/site |
grep -o '"siteName":"[^"]*"'` em cada domínio deve devolver o próprio nome.

### 8.4 Cards do dashboard a revalidar POR BLOG após o rollout

Em sp011.com.br, ksports.bebee.me, esporteagora.midia.run, resenhavip.midia.run,
oleysports.midia.run, beeesportes.midia.run (+ pontofarma/creditovc quando no ar).
Critério dominante: **NÃO-REGRESSÃO dos números públicos** (nenhuma métrica muda —
este PRD só lê):

1. Analytics → **Saúde da coleta** (item 25 — o card deste PRD): 6 tiles legados
   com os mesmos valores/semântica; tabela "Por endpoint" visível (ou oculta, se
   PRD 03 pendente); faixa de alertas OU "Nenhum alerta ativo"; "Desde o boot"
   com data/hora; `<details>` "Filtros ativos" abrindo com a lista; "Dados
   confiáveis desde" inalterado; "Anúncios confiáveis desde"/"reparo pendente"
   conforme estado do PRD 04 no blog.
2. Analytics → **5 KPIs**, **Tráfego ao longo do tempo**, **Fontes de tráfego**,
   **Propagandas (KPIs/tabela/top-3)**, **Resumo de interações** (itens 4/5-11/
   19-21/24): valores IDÊNTICOS aos pré-rollout na mesma janela (o `/stats` não é
   tocado).
3. Em blog novo sem tráfego: card Saúde com contadores em 0, `alerts: []`,
   "Nenhum alerta ativo" — estados vazios corretos (volume baixo não é bug).

---

## 9. Critérios de aceite

Mapeamento: item **25** da checklist do doc v2 (CA1–CA6, CA9); superfície das
regras do PRD 11 `cliques ≤ impressões` / `paid > 0% exige campanha` / `impressões
≤ pageviews × slots × margem` (CA4, CA7, CA8); itens 4/19/20/21 e 11 ganham
superfície de alerta (CA7/CA8). Nenhum critério é subjetivo; os que exigem
banco/produção estão marcados **PENDENTE DE EXECUÇÃO** (MCP Supabase não conectado
na escrita — nunca marcar como atendido sem rodar o comando na VPS).

| # | Critério | Verificação | Status na escrita |
|---|---|---|---|
| CA1 | Typecheck (api-server e brasilia-agora) e `node --test` passam, incluindo `healthAlerts.test.ts` | §8.1 → exit 0 / todos ok | a executar no dev |
| CA2 | `GET /health` devolve `alerts` (array) e `alertsSkipped`, mantendo TODOS os campos legados + `reliableSince` + `filters[]` | teste de shape do §12 + §8.2 V1 | **PENDENTE DE EXECUÇÃO** (parte VPS) |
| CA3 | Card Saúde exibe: tabela por endpoint (quando `byEndpoint` presente), `internalByReason`, `bootAt`, `filters[]` renderizado, `adsReliableSince` | greps do §8.1 + observação objetiva §8.4 grupo 1 | **PENDENTE DE EXECUÇÃO** (parte obs.) |
| CA4 | Catálogo dos 8 alertas implementado com as regras EXATAS do RF3 (limiares travados por teste, inclusive fronteiras) | suite do §12 (um caso dispara/não-dispara por regra) | a executar no dev |
| CA5 | Decisão RF2 aplicada: NENHUM schema novo (contadores seguem em memória) e o card rotula o zero com `bootAt` | `git diff --stat lib/db` vazio (§8.1) + observação §8.4 | a executar no dev |
| CA6 | Degradação honesta: PRD 03/04/05 ausente ⇒ regra correspondente em `alertsSkipped` com a razão certa; nunca alerta falso, nunca 500 | teste do §12 (inputs null) + §8.2 V1 | **PENDENTE DE EXECUÇÃO** (parte VPS) |
| CA7 | `paid_without_campaign`: dispara ⇔ 0 campanhas ativas E ≥1 linha `pago` pós-`PAID_RULE_SINCE`; em blog saudável pós-PRD 05, ausente | teste do §12 + §8.2 V3 | **PENDENTE DE EXECUÇÃO** (parte SQL) |
| CA8 | `ad_sanity`/`ad_clicks_gt_impressions`: coerência painel×banco — linha em violação no SQL V4 ⇔ alerta presente; sem violação ⇔ ausente; datas < `adsReliableSince` nunca avaliadas | teste do §12 + §8.2 V4 | **PENDENTE DE EXECUÇÃO** (parte SQL) |
| CA9 | `reserved_behavior_type` dispara com evento sintético interno e some após limpeza + TTL | §8.2 V2 | **PENDENTE DE EXECUÇÃO** |
| CA10 | `internal_share_shift` e `internal_privateip_dominant` silenciosos em operação normal (104/106 internos NÃO alerta); espelho SQL V5 coerente com o painel | teste do §12 (caso 104/106 → sem alerta) + §8.2 V5 | **PENDENTE DE EXECUÇÃO** (parte SQL) |
| CA11 | Não-regressão por blog pós-rollout: grupos 2–3 do §8.4 com valores idênticos na mesma janela; `/stats` sem diff de código | observação objetiva por blog (§8.3 canário primeiro) + `git diff` não toca o handler do `/stats` | **PENDENTE DE EXECUÇÃO** |
| CA12 | i18n completo: mesmas chaves novas nos blocos pt-BR e EN (contagem igual no grep) | grep `an.alert.` do §8.1 | a executar no dev |

---

## 10. Invariantes do §17 preservadas por este PRD

1. **"Tráfego interno marcado `is_internal`, nunca dropado"** — não tocada:
   nenhum ingest muda; os alertas apenas LEEM `is_internal` (e o alerta de
   dominância de `privateIp` protege a PRECISÃO da marcação, reforçando a
   invariante).
2. **"Heartbeat cumulativo agregado por MAX"** — não tocada: nenhum código de
   `read`/agregação é alterado (`analyticsShared.ts:319-327` intacto, cf.
   auditoria).
3. **"`totals.*` do /stats fixos ao agora"** — não tocada: o `/stats`
   (`analytics.ts:366+`) não recebe NENHUM diff neste PRD (CA11).
4. **"Canal classificado no servidor"** — não tocada: `classifyChannel`/first-touch
   intactos (dono: PRD 05); o alerta de pago só CONTA linhas já classificadas.
5. **"Migrações de coluna via Drizzle schema E ensureSchema"** — respeitada por
   vacuidade (decisão RF2: zero schema novo; `git diff lib/db` vazio — CA5).
6. **"Colunas novas se autocriam no boot"** — idem (nada a criar).
7. **Isolamento entre blogs / nunca hardcodar por blog na imagem** (§13, reforça
   §17) — alertas 100% genéricos, avaliados contra o banco do próprio blog; zero
   referência a BLOG_ID.
8. **SSR/perf ("HTML `no-cache` nunca `no-store`", sanitize isomórfico, allowlist
   do proxy de imagem)** — não tocadas: o diff do client é restrito ao card do
   painel `/admin` (`Analytics.tsx` + `adminI18n.ts`); nenhum header de cache,
   nenhuma rota pública, nada de SSR.
9. **"Linhas históricas nunca são reescritas"** (precedente
   `analyticsShared.ts:143`, cf. auditoria §5.4) — o motor de alertas é 100%
   leitura (grep de UPDATE/DELETE no §8.1).

---

## 11. Casos de borda

- **Blog novo com zero tráfego**: todos os contadores 0, todas as janelas abaixo
  das amostras mínimas → `alerts: []`. É o estado ESPERADO (princípio do PRD);
  o card mostra "Nenhum alerta ativo", não um vazio ambíguo.
- **PRD 03/04/05 ainda não no ar** (ordem de implementação invertida): campos
  ausentes ⇒ regras degradam para `alertsSkipped` com razão específica; a UI
  oculta a tabela por endpoint. Este PRD é implementável em qualquer ordem, mas o
  VALOR pleno exige 03+04+05 antes (dependência recomendada — §14).
- **Restart no meio da observação**: contadores e alertas de contador zeram
  (`flush_failed`, `buffer_identity`, `internal_privateip_dominant` somem até
  reincidir); alertas de banco sobrevivem (RF2 ponto 3). `bootAt` exibido data o
  zero — o operador vê que houve reset.
- **Rollout parcial da rede** (canário na tag nova, irmãos na antiga): cada blog é
  internamente consistente (api+web da mesma tag por blog); a UI nova tolera API
  antiga (campos opcionais) para o caso de janela entre `up -d` do api e do web
  no MESMO blog.
- **`adsReliableSince` null (reparo do PRD 04 pendente no blog)**: sanidade de ads
  PULADA com `prd04_reparo_pendente` — dados legados inflados (auditoria claim i:
  soma (N²+3N)/2) disparariam alarme permanente sem valor diagnóstico.
- **Dia BRT sem pageview mas com impressão** (assinatura da assimetria de
  consentimento — auditoria claim j): `max(pageviews,1)` no denominador mantém a
  regra avaliável; com M=3, 4+ impressões num dia de 0 pageviews disparam
  `ad_sanity` — é exatamente a anomalia que se quer ver.
- **Virada do dia BRT durante o TTL**: a linha de "hoje" pode referir o dia
  anterior por até 60s — irrelevante (o gatherer sempre avalia as 2 datas mais
  recentes).
- **Múltiplas abas/admins**: TTL de 60s compartilhado no módulo — N abas custam as
  mesmas 5 queries por minuto.
- **Flag `internal:true` forjada em massa** (borda herdada do PRD 03 §11):
  auto-exclusão, nunca infla métrica pública; pode elevar `internalByReason.flag`
  — NÃO dispara `internal_privateip_dominant` (regra é específica de `privateIp`)
  e só dispara `internal_share_shift` se mover 40 pontos com amostra ≥50 — caso em
  que o operador DEVE mesmo ser avisado.
- **Ids de alerta futuros** (PRD 11 pode ampliar o catálogo): UI cai em
  `an.alertUnknown` + id — nunca quebra.
- **Banco fora no momento do `/health`**: regras de banco viram `db_error` em
  `alertsSkipped`; contadores continuam servidos; endpoint nunca 500 por isso.

---

## 12. Plano de testes (`node --test`, CLAUDE.md §14)

Suite nova em `artifacts/api-server/test/healthAlerts.test.ts` (imports relativos
com extensão `.ts` explícita; sem unicode literal em regex; padrão das suites
existentes `test/analyticsShared.*.test.ts`). Tudo lógica pura — sem banco, sem
Express:

1. **Por regra do catálogo (CA4)** — um caso que DISPARA e um que NÃO dispara,
   incluindo as fronteiras exatas: `flushFailed` 0→1; drift 1000 (não) vs 1001
   (sim); `received=29` com privateIp 100% (não — amostra) vs `received=30`
   privateIp 27/30 (sim); shift 39,9 pontos (não) vs 40 (sim) e amostra 49 (não);
   sanidade `impressions = limite` (não) vs `limite+1` (sim) com
   `pageviews=0 → max(...,1)`; `clicks = impressions+1` (não) vs `+2` (sim);
   pago `{0 campanhas, 0 linhas}` (não), `{0, 1}` (sim), `{1, 1}` (não);
   reservado 0 (não) vs 1 (sim).
2. **Caso-régua do item 25 (CA10)**: input equivalente a "104 de 106 internos,
   estável nas duas janelas" → ZERO alertas (proporção alta legítima nunca
   alerta).
3. **Degradação (CA6)**: cada segmento `null` → regra em `skipped` com o id certo
   e NENHUM alerta falso; todos `null` → `alerts:[]` e 6 entradas em `skipped`
   (as 2 regras de contadores puros sempre avaliam).
4. **Ordenação e shape (CA2)**: `critical` antes de `warning`; `params` sempre
   presentes; ids do catálogo estáveis (snapshot da lista de 8 ids — trava
   renomeações acidentais que quebrariam o i18n).
5. **Constantes**: `AD_SANITY_MARGIN === 3` e limiares de
   `HEALTH_ALERT_THRESHOLDS` exatamente como no RF3 (mudança consciente exige
   mudar o teste junto).
6. **Suites existentes continuam passando** (`analyticsShared.*` etc.): nenhum
   valor esperado muda — este PRD não altera nenhuma função existente do
   api-server além do handler do `/health`.

UI (`Analytics.tsx`) não tem harness de teste no repo (sem vitest — CLAUDE.md
§14): a verificação é objetiva por grep (§8.1: `health.filters`, `byEndpoint`) e
observação do §8.4. Validação com dados reais: exclusivamente §8.2 na VPS
(**PENDENTE DE EXECUÇÃO**), sempre com `internal:true`/sessões `prd08-*`.

---

## 13. Plano de rollback

Cenário A — **regressão de código** (ex.: `/health` 500, card quebrando o
painel): rollback de IMAGEM por blog — este PRD não criou schema nem gravou dado,
então o rollback é limpo e total:

```bash
# sp011 (raiz): voltar BLOG_IMAGE_VERSION para a tag anterior e recriar
cd /opt/sp011
sed -i "s|^BLOG_IMAGE_VERSION=.*|BLOG_IMAGE_VERSION=vANTERIOR|" .env
docker compose up -d api web
# cada blog replicado com problema:
cd /opt/blogs/<id>
sed -i "s|^BLOG_IMAGE_TAG=.*|BLOG_IMAGE_TAG=vANTERIOR|" .env
docker compose up -d
```

Cenário B — **um blog isolado**: cada blog fixa a própria `BLOG_IMAGE_TAG` —
rollback pontual sem afetar os irmãos (o canário resenhavip pega antes da rede).

Cenário C — **alerta ruidoso** (regra disparando errado sem quebrar nada): NÃO
exige rollback de imagem — os limiares vivem em `HEALTH_ALERT_THRESHOLDS`/
`AD_SANITY_MARGIN` (healthAlerts.ts): commit de 1 linha + rollout normal. Até lá o
alerta é informativo (nenhuma ação automática é tomada por alerta — design).

Efeitos de dados no rollback: NENHUM — o PRD é 100% leitura; nenhuma linha,
coluna ou key de settings é criada/alterada (a key `ads_reliable_since` pertence
ao PRD 04). O único estado perdido é o cache TTL em memória.

---

## 14. Riscos e dependências de outros PRDs (FRONTEIRAS do STATUS.md)

| PRD | Fronteira/dependência |
|---|---|
| **PRD 03** (ingestão/filtros) | **Fonte dos contadores**: "incremento nas rotas → PRD 03; exposição/alerta → PRD 08" (fronteira literal). Este PRD expõe `byEndpoint`/`internalByReason` (PRD 03 §7.4) e implementa os alertas prometidos lá: dominância de `privateIp` (RF4 de lá), identidade `received = flushedOk + flushFailed + buffered` (RF6.3 de lá). O texto de `filters[]` por endpoint é DO PRD 03 — este PRD só o renderiza. Sem PRD 03: tabela oculta + skips `prd03_pendente` (degradação prevista, mas implementar 03 antes é o recomendado). |
| **PRD 04** (propagandas) | Dono da fórmula de sanidade (RF6 de lá: fórmula, `checkAdSanity`/`checkClicksVsImpressions`, M=3→1.5) e do campo `adsReliableSince` (§7.3 de lá: "exibição no card: PRD 08"). Este PRD avalia a regra APENAS para as 2 datas mais recentes ≥ `adsReliableSince` — a varredura de período completo é PRD 11. Sem PRD 04: skips `prd04_reparo_pendente`. |
| **PRD 05** (fontes de tráfego) | Dono do cadastro `paidCampaigns`, de `PAID_RULE_SINCE` e das colunas `gclid`/`fbclid`; "exposição/alerta 'paid > 0% sem campanha cadastrada' é do 08" (fronteira literal de lá). O alerta usa `activePaidCampaigns()` (RF3 de lá) + contagem de linhas `pago` pós-corte. Sem PRD 05: skip `prd05_pendente` (e o alerta seria inútil antes, já que a regra antiga produz "pago" legitimamente segundo o código velho). |
| **PRD 01** (modelo de dados) | Entrega a regra "tipo reservado > 0 ⇒ anomalia" (RF6/CA11 de lá) — implementada aqui como `reserved_behavior_type`. Nenhuma dependência de schema além do que já existe. |
| **PRD 02** (tracking client) | Quando o PRD 02 alinhar a admissão (gate de consentimento em impressão/clique), reduzir `AD_SANITY_MARGIN` para 1.5 e promover `ad_sanity` a `critical` (PRD 04 RF6) — anotado como follow-up de 1 linha + teste. |
| **PRD 06/07** (agregações/comportamento) | Sem interseção de código: este PRD não toca `/stats` nem `behaviorStats`. A query do `reserved_behavior_type` é própria (count simples) e não depende dos totais não-truncados do PRD 07. |
| **PRD 09** (APIs do dashboard) | O `/health` permanece endpoint próprio — o PRD 09 não deve fundi-lo no contrato por card sem preservar `alerts`/`alertsSkipped`/`filters[]`/`reliableSince`. |
| **PRD 10** (frontend) | "Não redesenhar" — este PRD altera SOMENTE o card Saúde da coleta (dono: PRD 08) e chaves i18n novas; qualquer reestilização geral do dashboard é PRD 10 e deve preservar a semântica dos elementos deste card. |
| **PRD 11** (validação cross-metric) | **Fronteira central**: regras de sanidade CONTÍNUAS por blog = PRD 11; este PRD é a superfície on-demand (avaliação no `/health`, 2 datas, TTL 60s) e a UI de alerta. O PRD 11 DEVE reusar `evaluateHealthAlerts`/os mesmos ids de alerta ao ampliar o catálogo (a UI já tolera ids novos — RF5), e pode publicar violações contínuas pelo mesmo campo `alerts`. |
| **PRD 12** (testes/validação) | O script de tráfego sintético pode ASSERTAR sobre o `/health` (alertas esperados/inesperados por cenário); sessões de teste `prd08-*` seguem o padrão `internal:true` + limpeza por `session_id LIKE` (precedente PRD 03 §8.2). |

**Riscos técnicos**: (1) alerta ruidoso minando a confiança do operador →
limiares conservadores com amostra mínima + Cenário C do rollback (ajuste de 1
linha); (2) custo de queries no `/health` com painel aberto em N abas → TTL 60s +
janelas curtas (2–35 dias) + endpoint autenticado; (3) divergência entre a conta
do gatherer e a regra do PRD 11 quando este chegar → mitigada por `evaluateHealthAlerts`
compartilhável e testes de fronteira idênticos; (4) UI quebrar com API antiga
durante rollout → todos os campos novos opcionais (CA3/§11). **Risco de
processo**: este PRD depende do VALOR dos PRDs 03/04/05 — implementá-lo antes
deles produz um painel que apenas lista skips; a ordem recomendada do roadmap
(04/05 → 01/02/03 → … → 08) deve ser mantida.

---

## 15. Estimativa de esforço

**M** (médio). Um módulo puro novo (`healthAlerts.ts`) + 1 handler alterado
(`/health` async com gatherer e TTL) + 1 card alterado no admin + chaves i18n em
dois blocos + 1 suite de teste — zero schema, zero endpoint novo, zero mudança em
métricas públicas. O maior custo é a calibração honesta das regras (fronteiras de
disparo travadas por teste) e a validação multi-blog do §8.2–8.4 (pendente de
execução na VPS).
