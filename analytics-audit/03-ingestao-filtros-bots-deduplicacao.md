# PRD 03 — Ingestão: filtros de bots, deduplicação, rate limits, buffer e marcação interna

> **O que é este documento.** PRD de implementação, escrito para ser consumido pelo
> Claude Code numa sessão futura SEM o contexto da auditoria — autocontido: dá para
> executar lendo só este arquivo. Fontes: `analytics-audit/00-auditoria-estado-atual.md`
> (Fase 0.2, achados com evidência), `analytics-audit/00-inventario.md` (mapa; §8 tem
> correções de linha), `analytics-audit/STATUS.md` (FRONTEIRAS entre PRDs),
> `PRD_ANALYTICS_PLANEJAMENTO_v2.md` (template e descrição do módulo 03),
> `docs/ANALYTICS.md` e CLAUDE.md §§5, 6, 14, 17. Todas as evidências `arquivo:linha`
> abaixo foram REABERTAS nos arquivos reais na sessão de escrita deste PRD
> (2026-07-23), exceto onde marcado "(cf. auditoria)" ou "(cf. inventário)".
>
> **Princípio obrigatório:** volume baixo NÃO é bug — os blogs são novos. Bug é o que
> for logicamente incorreto ou inconsistente, independente do volume. Nada neste PRD
> visa "subir números": visa que o que é contado seja verdadeiro e que o que é
> descartado seja VISÍVEL.
>
> **Multi-blog:** os 8 blogs (sp011, ksports, esporteagora, resenhavip, oleysports,
> beeesportes, pontofarma, creditovc) rodam a MESMA imagem `blog-api:vN`/`blog-web:vN`
> (CLAUDE.md §6). Toda correção aqui vale para a rede inteira no próximo rollout do §6
> — e um erro quebra a rede inteira de uma vez. Nenhum fix pode ser condicionado a
> BLOG_ID (CLAUDE.md §13/§17). Os contadores de saúde são POR CONTAINER — cada blog
> tem os seus, o que já é o comportamento correto para diagnóstico por blog.
>
> **Encurtamentos:** `api = artifacts/api-server/src`, `web = artifacts/brasilia-agora/src`,
> `db = lib/db/src`.

---

## 1. Objetivo

Tornar o ingest do api-server **uniforme e observável** em todos os endpoints
públicos de métricas, sem mudar nenhum número público legado:

1. **Filtro de bots uniforme COM contadores por endpoint** — hoje `droppedBot` só
   incrementa no `/event`; `/behavior` e `/ads/:id/*` descartam em silêncio, e o
   card Saúde da coleta pode exibir "0 bots filtrados" enquanto as rotas de anúncio
   descartam (ou deixam passar) volume invisível (auditoria, claim d).
2. **Dedup do evento `category` no ingest** — o evento escapa do dedup de 15s
   (que só cobre pageview): F5/remount infla os "cliques" do card Top categorias
   (auditoria §4.1; fronteira do STATUS.md: "dedup do evento category → PRD 03").
3. **Marcação `is_internal` em `behavior_events`** — trocar o DROP atual de evento
   interno por marcação, usando a coluna entregue pelo PRD 01 e os MESMOS 3
   gatilhos do `/event` (flag do client, IP cadastrado, IP privado — hoje o
   `/behavior` nem tem a perna `isPrivateIp`), alinhando o endpoint à invariante
   §17 "tráfego interno marcado, nunca dropado".
4. **Precisão da marcação interna (item 25)** — garantir, com contadores por
   razão e verificações objetivas, que visitante real nunca vira interno por
   engano (e que o operador nunca vira público por engano).
5. **Rate limits e buffer** — revisão dos valores (decisão: MANTER, com fonte
   única nomeada), documentação do comportamento em restart e correção do buraco
   de reconciliação do flush degradado (`Aceitos = Gravados + Falhas + buffer`).
6. **Infraestrutura genérica de filtros** que o PRD 04 consome — helper de dedup
   com retenção configurável e teto de chaves. O dedup server-side de IMPRESSÃO
   em si é do **PRD 04** (fronteira explícita do STATUS.md).

Itens da checklist do doc v2 cobertos: **25** (Saúde da coleta — núcleo deste PRD),
**24** (Resumo de interações — lado servidor da marcação interna), **3/14** (Top
categorias — dedup do evento `category`); habilita a observabilidade dos itens
4/19/20/21 (contadores das rotas de ads; a correção da contagem é PRD 04).

---

## 2. Contexto / estado atual (achados da auditoria, com evidência)

### 2.1 Filtros existentes e onde cada um (não) conta — Confirmado no código

O guard compartilhado é `api/lib/trafficGuard.ts`: `BOT_RE` (`:14-15` — tokens
específicos de crawlers/CLIs; `curl/`, `wget/`, `python`, `headless` etc.),
`isBotRequest` (`:17-20` — UA vazio OU casando o regex), `isRecentDuplicate`
(`:43-48` — janela DESLIZANTE em memória; o sweeper `:27-36` descarta entradas de
`_lastSeen` com mais de 60s, o que o torna INADEQUADO para janelas longas — nota do
PRD 04 RF4) e `overRateLimit` (`:51-60` — janela de 1 min por chave em `Map`
`_hits`, declarado na `:24`).

Aplicação e contadores hoje (contadores em `api/lib/analyticsHealth.ts:9-18`,
todos em memória, zerados no restart — limitação divulgada na própria UI):

| Rota | Bot | Rate limit | Dedup | Contador? |
|---|---|---|---|---|
| `POST /api/analytics/event` (`api/routes/analytics.ts:206`) | `:208` | `ev:${ip}` 120/min (`:212`) | pageview `pv:${sessionId}\|${path}` 15s (`:231`) | **SIM** — `droppedBot` `:208`, `droppedRate` `:212`, `droppedInvalid` `:222,:228`, `droppedDuplicate` `:232`, `flaggedInternal` `:243`, `received` `:284` |
| `POST /api/analytics/behavior` (`analytics.ts:314`) | `:316` | `bh:${ip}` 30/min (`:318`) | nenhum | **NÃO** — descarte com `res.json({ok:true})` sem `bumpHealth` |
| `POST /api/ads/:id/impression` (`api/routes/ads.ts:184`) | `:187-190` | `adimp:${ip}` 60/min (`:187`) | nenhum server-side | **NÃO** — `analyticsHealth` nem é importado em `ads.ts` |
| `POST /api/ads/:id/click` (`ads.ts:141`) | `:145-148` | `adclick:${ip}` 30/min (`:145`) | nenhum server-side | **NÃO** — idem |

O `filters[]` do `GET /api/analytics/health` (`analytics.ts:355-361`) descreve
apenas os filtros do `/event` — o card Saúde da coleta (`web/pages/admin/
Analytics.tsx:1336-1369`) apresenta esses contadores como se fossem a coleta
inteira. Consequência (auditoria, claim d): "0 bots filtrados" é enganoso — não
significa que não houve bot, significa que ninguém contou fora do `/event`.

O IP usado nas chaves é o real: `app.set("trust proxy", 1)` (`api/app.ts:106`,
cf. auditoria) resolve o X-Forwarded-For adicionado pelo Caddy; o `/event` e o
`/behavior` normalizam com `normalizeIp` (`analytics.ts:211,:317`; função em
`api/lib/analyticsShared.ts:36-38` — remove prefixo `::ffff:`).

### 2.2 Evento `category` sem dedup — Confirmado no código

O dedup de 15s cobre SÓ pageview: ``if (type === "pageview" &&
isRecentDuplicate(`pv:${sessionId}|${path}`, 15_000))`` (`analytics.ts:231`).
O evento `category` (disparado no mount da página de listagem —
`web/pages/CategoryArchivePage.tsx:21,26` → `trackCategory`,
`web/hooks/useAnalytics.ts:232-234`) passa direto: F5 na página de categoria
infla os "cliques" do card Top categorias sem inflar "views" (auditoria §4.1 —
"assimetria adicional: o evento `category` não passa pelo dedup de 15s").
A semântica de "cliques" do card é exatamente a contagem de eventos `category`
(visitas à página de listagem — `analyticsShared.ts:315-317`). O contador
all-time `store.trackCategoryView(category)` também é incrementado por evento
aceito não-interno (`analytics.ts:305-306`) — herda a mesma inflação por F5.

### 2.3 `/behavior` DROPA interno em vez de marcar — Confirmado no código

`analytics.ts:328-330`:

```ts
// behavior_events não tem coluna de tráfego interno (limitação documentada):
// eventos internos são simplesmente não gravados para não sujar os oficiais.
if (b["internal"] === true || internalIpSet().has(ip)) { res.json({ ok: true }); return; }
```

Três defeitos: (a) viola a invariante §17 "tráfego interno marcado `is_internal`,
nunca dropado" (exceção documentada, transitória — auditoria §5, invariante 2);
(b) **falta a perna `isPrivateIp`** que o `/event` tem (`analytics.ts:239-243`) —
evento de comportamento vindo de rede privada (dev, health check) é gravado como
PÚBLICO; (c) nenhum contador — o drop é invisível. O PRD 01 entregou a coluna
`behavior_events.is_internal boolean NOT NULL DEFAULT false` (Drizzle +
ensureSchema — PRD 01 §6, RF3) exatamente para este PRD trocar o drop por
marcação (fronteira do STATUS.md: "coluna → PRD 01; lógica de marcação no
ingest → PRD 03").

Agravante do item 24 (auditoria §4.6): os dois formulários de newsletter fazem
`fetch` direto a `/api/analytics/behavior` **sem `getConsent()` e sem flag
`internal`** (`web/components/Footer.tsx:62-76`;
`web/components/blocks/HomeCustomBlocks.tsx:364-378`) — inscrição feita por
admin/dev conta como signup real. A correção do CLIENT (flag + consentimento) é
**PRD 02**; este PRD entrega o lado servidor (a perna `isPrivateIp` + IP
cadastrado já pegam parte dos casos) e **anota que o servidor não distingue
consentimento** (fronteira literal do STATUS.md).

### 2.4 Marcação interna do `/event` — como decide hoje (base do requisito de precisão)

`analytics.ts:239-243`:

```ts
const isInternal =
  b["internal"] === true ||       // cliente detectou admin logado ou ambiente dev
  internalIpSet().has(ip) ||      // IP cadastrado em Configurações
  isPrivateIp(ip);                // localhost/rede privada (dev, health checks)
```

- Flag do client: `internal:true` quando `admin_token` no localStorage ou
  `import.meta.env.DEV` (`useAnalytics.ts:54-61,:111`); o token só existe no
  navegador que fez login (`web/pages/admin/Login.tsx:70,:100`).
- `internalIpSet()` (`analytics.ts:142-149`): memoização sobre
  `store.getSettings().internalIps`, reconstruída sem restart quando a string
  muda; parse em `parseInternalIps` (`analyticsShared.ts:53-56`) que **já
  normaliza cada entrada com `normalizeIp`** — simétrico ao `req.ip` normalizado
  na `:211` (verificado nesta sessão: não há bug de assimetria `::ffff:`).
- `isPrivateIp` (`analyticsShared.ts:40-50`): vazio, loopback, 10.x, 192.168.x,
  172.16-31.x.
- Interno marcado NUNCA é dropado no `/event`: grava com `is_internal=true`
  (`toRow` `:78`), canal vira `"interno"` (`:263-264`), e o `/stats` exclui na
  leitura (`is_internal = false` em `:408,:420,:429,:438-439,:448,:458,:465,
  :474-475` e no buffer `:501,:520` — cf. auditoria/inventário §4).
- O que NÃO existe hoje: atribuição de RAZÃO (qual dos 3 gatilhos marcou) — o
  contador `flaggedInternal` (`:243`) é um agregado cego. Se um dia 100% do
  tráfego virar "interno" por `isPrivateIp` (ex.: proxy mal configurado deixando
  `req.ip` privado), o dashboard público zera e NADA aponta a causa. Item 25 do
  doc v2: os 104/106 internos observados são comportamento CORRETO (acessos ao
  admin) — o que se pede é PRECISÃO verificável, não menos marcação.

### 2.5 Rate limits e buffer — estado atual

- Valores (todos em memória, janela de 1 min por chave): `/event` 120/min/IP,
  `/behavior` 30/min/IP, impressão 60/min/IP, clique 30/min/IP (§2.1). Números
  espalhados como literais nos call-sites, sem fonte única.
- Restart: `_hits`/`_lastSeen` (`trafficGuard.ts:24-25`) e os contadores de
  saúde (`analyticsHealth.ts:20-27`) zeram — comportamento "fail-open" (nunca
  bloqueia tráfego legítimo por estado perdido), documentado na UI da Saúde.
- Buffer do `/event`: `BUFFER_MAX = 500` (`analytics.ts:52`), flush a cada 30s
  (`:120`) e quando cheio (`:122-125`), dreno no shutdown
  (`api/routes/index.ts:26` — cf. inventário §4). **Buraco de reconciliação**
  (auditoria §4.7): no flush degradado (banco fora, `ok === 0`), o
  re-enfileiramento é truncado em `BUFFER_MAX` e o excedente é descartado SEM
  `noteFlush(false, …)` (`analytics.ts:109-111`) — quebra a identidade
  "Aceitos = Gravados + Falhas + buffer" do card Saúde. Além disso `pushEvent`
  (`:122-125`) não tem teto próprio: com banco fora, o buffer pode crescer além
  de 500 com eventos novos enquanto o flush falha.
- `/behavior` grava DIRETO no banco (sem buffer — `analytics.ts:336-343`), com
  try/catch que responde `{ok:true}` até em erro (`:345-347`).

### 2.6 O que o PRD 04 espera deste PRD (fronteira reproduzida)

O PRD 04 (`analytics-audit/04-propagandas-impressoes-e-cliques.md`) é dono do
dedup server-side de impressão/clique (RF4 de lá: chave `adimp:<adId>:<sessionId>`
30 min; `adclick:<adId>:<sessionId>` 10s) e da marcação interna das rotas de ads
(RF3 de lá: dimensão `internal_impressions`/`internal_clicks`). Ele declara
textualmente: "Contadores de observabilidade dos descartes (bot/rate/dup das
rotas de ads): **PRD 03** (incremento) e **PRD 08** (exposição/alerta) — este PRD
apenas deixa os pontos de descarte claramente identificáveis no código (um
comentário `// PRD 03: bumpHealth aqui` em cada caminho de descarte)". E, para o
dedup de 30 min, pede "helper novo em `trafficGuard.ts` com retenção
configurável" (não usar `isRecentDuplicate`, cujo sweeper limpa >60s). Este PRD
entrega o helper (RF5) e os incrementos (RF1).

---

## 3. Problema a resolver

1. **Observabilidade assimétrica**: 3 dos 4 endpoints de ingest descartam
   bot/flood em silêncio — o card Saúde da coleta descreve só o `/event` e induz
   a conclusão errada ("0 bots filtrados"). Lógica incorreta independente de
   volume.
2. **Dedup assimétrico**: F5 na página de categoria conta "clique" novo a cada
   refresh, enquanto o pageview da mesma ação é dedupado — inconsistência
   interna do mesmo dashboard (itens 3/14).
3. **`/behavior` viola a invariante §17** (dropa interno) e ainda tem a tripla
   de detecção INCOMPLETA (sem `isPrivateIp`) — evento interno de rede privada
   entra como público; evento interno de admin some sem registro.
4. **Marcação interna sem atribuição de razão**: impossível diagnosticar uma
   marcação anômala (todo mundo interno / ninguém interno) sem ler código.
5. **Reconciliação do buffer furada** no flush degradado: eventos descartados
   sem contabilização quebram a identidade do card Saúde.
6. **Sem infraestrutura genérica de dedup** com retenção configurável — o PRD 04
   precisaria duplicar mecânica de janela/teto/varredura.

---

## 4. Requisitos funcionais

Ordem de implementação recomendada: RF5 (infra) → RF1 (contadores) → RF2 (dedup
category) → RF3 (marcação behavior) → RF4 (precisão/razões) → RF6 (buffer) →
RF7 (rate limits/docs). Tudo cabe numa única imagem/rollout.

### RF1 — Contadores de descarte por endpoint (fecha o "0 bots filtrados" enganoso)

Generalizar `api/lib/analyticsHealth.ts` mantendo TODOS os campos atuais com a
semântica atual (o card Saúde e a reconciliação de buffer dependem deles):

```ts
export type IngestEndpointId = "event" | "behavior" | "adImpression" | "adClick";

export interface EndpointCounters {
  received: number;         // aceito e contabilizado pelo endpoint
  droppedBot: number;       // UA de bot/CLI ou vazio
  droppedRate: number;      // acima do rate limit por IP
  droppedInvalid: number;   // payload inválido, id desconhecido/inativo, /admin
  droppedDuplicate: number; // dedup (pv/category no event; impressão/clique pós-PRD 04)
  flaggedInternal: number;  // aceito e MARCADO interno (nunca dropado)
}

export function bumpEndpoint(ep: IngestEndpointId, key: keyof EndpointCounters): void;
```

- `bumpHealth(key)` (usada pelo `/event` em `analytics.ts:208,:212,:222,:228,
  :232,:243,:284`) passa a ESPELHAR automaticamente em
  `byEndpoint.event[key]` quando a chave existir em `EndpointCounters`
  (`flushedOk`/`flushFailed` são de buffer, não de endpoint — ficam só no
  agregado legado). **Zero mudança nos call-sites do `/event`.**
- `healthSnapshot()` (`analyticsHealth.ts:43-52`) ganha os campos ADITIVOS
  `byEndpoint` e `internalByReason` (RF4) — shape completo no §7.
- **`/behavior`** (`analytics.ts:314-348`): incrementar
  `bumpEndpoint("behavior", …)`: `droppedBot` no descarte de bot (`:316`),
  `droppedRate` no rate (`:318`), `droppedInvalid` nos 400 de payload
  (`:323,:326`), `flaggedInternal` quando marcar interno (RF3), `received` no
  insert aceito.
- **`/ads/:id/impression` e `/click`** (`ads.ts:184-220`, `:141-181`): importar
  o helper e incrementar. O `if` composto atual (`isBotRequest(req) ||
  overRateLimit(…)` — `:145-148,:187-190`) precisa ser SEPARADO em dois `if`s
  para atribuir o contador correto:

  ```ts
  if (isBotRequest(req)) { bumpEndpoint("adImpression", "droppedBot"); res.json({ ok: true }); return; }
  if (overRateLimit(`adimp:${req.ip ?? ""}`, INGEST_RATE_LIMITS.adImpression)) {
    bumpEndpoint("adImpression", "droppedRate"); res.json({ ok: true }); return;
  }
  ```

  (idem `adClick` com 30/min). Demais incrementos: `droppedInvalid` nos caminhos
  de id desconhecido/bloco invisível/anúncio inativo-expirado (`:153-155` 404 do
  clique; `:168-170` 404 do clique clássico; `:193-198` bloco não visível;
  `:207-210` impressão de inativo/expirado — este responde `{ok:true}` e hoje
  some sem rastro); `received` nas gravações aceitas (`:157,:178` clique;
  `:195,:217` impressão); `flaggedInternal` no ponto de decisão interna do
  PRD 04 RF3 (se o PRD 04 já estiver implementado) e `droppedDuplicate` nos
  pontos de dedup do PRD 04 RF4 (comentários `// PRD 03: bumpHealth aqui`).
  Se o PRD 04 AINDA não estiver implementado, esses dois contadores das rotas de
  ads ficam legitimamente em 0 — documentar no código.
- **Exposição na UI e alertas: PRD 08** (fronteira do STATUS.md — "incremento
  nas rotas → PRD 03; exposição/alerta → PRD 08"). Este PRD entrega os dados no
  JSON do `/health`; não toca `Analytics.tsx`.
- Atualizar o array `filters[]` do `GET /health` (`analytics.ts:355-361`) para
  descrever a cobertura REAL por endpoint (texto no §7.4) — corrige a descrição
  enganosa sem redesenhar o card.

### RF2 — Dedup do evento `category` no `/event` (itens 3/14)

Logo após o dedup de pageview (`analytics.ts:231-236`), mesmo padrão e mesma
janela:

```ts
// F5/remount na página de categoria não é clique novo: mesma sessão+path em <15s.
if (type === "category" && isRecentDuplicate(`cat:${sessionId}|${path}`, 15_000)) {
  bumpHealth("droppedDuplicate");
  res.json({ ok: true });
  return;
}
```

- Prefixo de chave `cat:` próprio — não colide com `pv:` (o pageview do mesmo
  path continua com dedup independente).
- Posição ANTES da marcação interna (mesma ordem do pageview): duplicata é
  descartada seja interna ou não — é dedup, não drop de interno (precedente
  sancionado do `pv:` 15s; a invariante §17 não é afetada — ver §10).
- Efeito colateral desejado: `store.trackCategoryView(category)`
  (`analytics.ts:305-306`) deixa de ser incrementado pelas duplicatas (o
  contador all-time herda o dedup por vir depois do guard).
- **Linhas históricas não são tocadas** (invariante "linhas históricas nunca são
  reescritas" — `analyticsShared.ts:143`): a correção vale do rollout em diante;
  os "cliques" já gravados por F5 permanecem no banco (o reparo NÃO é possível —
  não há como distinguir F5 de visita real retroativamente — e não é necessário:
  o card ordena por janela e o efeito decai com o tempo).

### RF3 — Marcação `is_internal` no `/behavior` (troca o drop por marcação) + filtro nos leitores

Pré-requisito: coluna `behavior_events.is_internal` do PRD 01 (§6.1/6.2 de lá)
presente no schema Drizzle E no `ensureSchema.ts` — conferir ANTES de começar
(comando no §8.1; se ausente, implementar o PRD 01 primeiro).

**Handler** (`analytics.ts:328-343`) — substituir o drop:

```ts
// Tráfego interno: marcado e gravado (auditável), fora das métricas públicas.
// Mesma tripla do /event (flag do client, IP cadastrado, IP privado) — §17.
const det = detectInternal(b["internal"] === true, ip, internalIpSet());
if (det.internal) bumpEndpoint("behavior", "flaggedInternal");
// … validações existentes inalteradas …
await db.insert(behaviorEventsTable).values({
  eventType, value: value ?? null, sessionId,
  device: detectDevice(ua), articleId: articleId ?? null, ts: new Date(),
  isInternal: det.internal,
});
bumpEndpoint("behavior", "received");
```

- `detectInternal` é o helper puro do RF4; `internalIpSet()` é a memoização
  existente (`analytics.ts:142-149`), extraída para módulo compartilhável
  (RF4) para que `ads.ts` (PRD 04 RF3) reuse sem duplicar.
- A tripla agora INCLUI `isPrivateIp` — mudança de comportamento declarada:
  eventos de comportamento vindos de rede privada, que hoje entram como
  públicos, passam a ser marcados internos (alinhamento com o `/event`; era a
  lacuna apontada na auditoria §4.6).
- **Leitores** — o `/stats` lê `behavior_events` da janela sem filtro
  (`analytics.ts:492-495`) e agrega em `behaviorStats`
  (`:683-710`, payload `:756-761`). Adicionar o filtro:

  ```ts
  db.select().from(behaviorEventsTable).where(and(
    eq(behaviorEventsTable.isInternal, false),
    gte(behaviorEventsTable.ts, winFrom),
    lt(behaviorEventsTable.ts, winTo),
  )),
  ```

  Como TODAS as linhas legadas têm `is_internal=false` (default do PRD 01,
  CA5/V3 de lá) e linhas internas nunca eram gravadas, **os números públicos não
  mudam no rollout** — só deixam de crescer com tráfego interno futuro. O PRD 07
  (totais não truncados) e o PRD 06 herdam a obrigação de MANTER este filtro em
  qualquer query nova de `behavior_events` (§14).
- O servidor **não distingue consentimento LGPD** — não há sinal no payload que
  diga se o visitante aceitou o banner; o gate é 100% client-side
  (`useAnalytics.ts:106-107`) e os dois formulários de newsletter o ignoram
  (§2.3). Este PRD APENAS ANOTA essa limitação (fronteira literal do STATUS.md);
  a correção é **PRD 02**. Consequência prática até lá: newsletter de
  admin/dev só é marcada interna se o IP estiver cadastrado ou for privado.

### RF4 — Precisão da marcação interna (item 25): razões contabilizadas + helper único

**Helper puro** em `api/lib/analyticsShared.ts` (arquivo de lógica pura, zero
imports — padrão do header `:1-7`):

```ts
export type InternalReason = "flag" | "configuredIp" | "privateIp";

/** Tripla canônica de detecção de tráfego interno (mesma semântica de
 *  analytics.ts:239-243). Precedência de ATRIBUIÇÃO de razão: flag >
 *  configuredIp > privateIp (o resultado booleano independe da ordem). */
export function detectInternal(
  flag: boolean, ip: string, configured: ReadonlySet<string>,
): { internal: boolean; reason: InternalReason | null } {
  if (flag) return { internal: true, reason: "flag" };
  if (configured.has(ip)) return { internal: true, reason: "configuredIp" };
  if (isPrivateIp(ip)) return { internal: true, reason: "privateIp" };
  return { internal: false, reason: null };
}
```

**Módulo compartilhável** `api/lib/internalTraffic.ts` (novo): mover para lá a
memoização `internalIpSet()` de `analytics.ts:140-149` (import de `store`
permitido — este módulo é impuro; o puro fica no analyticsShared). Exportar
`internalIpSet()` e um conveniente `detectInternalRequest(bodyFlag, ip)` que
combina os dois. `routes/analytics.ts` passa a importar daqui (o PRD 04 RF3
declara que reusa exatamente esse extraível para as rotas de ads).

**Aplicação**:

- `/event`: refactor comportamento-preservante de `:239-243` para
  `detectInternal(...)` — mesmos 3 gatilhos, mesmo resultado; ganha a razão.
- `/behavior`: RF3 (novo uso).
- Contador global `internalByReason: { flag, configuredIp, privateIp }` no
  `analyticsHealth` (incrementado junto com `flaggedInternal`, somando `/event` +
  `/behavior`; ads entram quando o PRD 04 plugar o RF3 dele).

**Por que isso é "precisão" verificável (item 25):**

- **Falso positivo por proxy quebrado** (todo visitante com IP privado →
  `privateIp` marca 100% do tráfego interno): passa a ser DIAGNOSTICÁVEL em
  segundos pelo `/health` (`internalByReason.privateIp` ≈ `received`) — hoje
  exigiria ler código e adivinhar. Alerta automático: **PRD 08**.
- **Falso positivo por IP cadastrado errado** (operador cadastra IP de
  CGNAT/compartilhado e marca um bairro inteiro como interno): diagnóstico por
  `internalByReason.configuredIp` desproporcional + SQL V5 do §8.2. Este PRD
  DOCUMENTA o risco na doc (RF7); validação de plausibilidade de IP no painel é
  UI (fora de escopo; anotar para PRD 10 se desejado).
- **Flag forjada pelo visitante** (`internal:true` num POST hostil): efeito é
  AUTO-EXCLUSÃO (o evento é gravado como interno e sai das métricas públicas) —
  nunca infla nada; comparece em `internalByReason.flag`. Aceito por design
  (equivale a opt-out); registrado como caso de borda (§11).
- **Falso negativo** (operador vira público): celular do operador em 4G sem
  login não tem flag nem IP cadastrado — comportamento conhecido (auditoria,
  claim b). Mitigação existente: cadastrar IPs em Configurações. Sem mudança de
  regra aqui (qualquer heurística nova — ex.: por UA — criaria falsos positivos
  em visitantes reais, violando o princípio deste módulo).
- **Simetria de normalização**: já correta (`parseInternalIps` normaliza
  `::ffff:` igual ao `req.ip` — §2.4); o teste do §12 TRAVA essa simetria.

### RF5 — Infraestrutura genérica de dedup (consumida pelo PRD 04)

Novo helper em `api/lib/trafficGuard.ts` (ao lado de `isRecentDuplicate`, que
permanece INTACTO para as janelas curtas do `/event`):

```ts
export interface DedupWindowOpts {
  windowMs: number;          // retenção da chave
  maxKeys?: number;          // teto de memória (default 50_000; excedeu → descarta as mais antigas)
  sliding?: boolean;         // false (default): janela fixa a partir do 1º hit; true: cada hit renova
  now?: () => number;        // relógio injetável (testes — exigência do PRD 04 §12)
}
export interface DedupWindow {
  /** true = chave já vista dentro da janela (duplicata); false = primeira vez. */
  hit(key: string): boolean;
  size(): number;
}
export function createDedupWindow(opts: DedupWindowOpts): DedupWindow;
```

- Varredura periódica própria com `unref()` (padrão do sweeper existente,
  `trafficGuard.ts:27-36`), intervalo proporcional à janela — resolve a
  limitação que impede `isRecentDuplicate` de servir janelas >60s (o sweeper
  dele descarta `_lastSeen` >60s, `:32-34`).
- Semânticas: `sliding:false` para clique de anúncio (duplo-clique dedupado sem
  suprimir clique legítimo repetido); o PRD 04 escolhe por chave — a POLÍTICA
  (chaves `adimp:`/`adclick:`, janelas 30min/10s, fallback por IP) é TODA do
  PRD 04 (fronteira). Este PRD entrega só o MECANISMO.
- Ordem de implementação entre 03 e 04 — qualquer uma converge:
  - 03 primeiro: o helper fica disponível; PRD 04 o consome no RF4 dele.
  - 04 primeiro: ele terá implementado um `Map` próprio em `ads.ts` (permitido
    pelo RF4 dele); este PRD então REFATORA esse Map para `createDedupWindow`
    (comportamento-preservante, coberto pelos testes ativos do PRD 04 §8).
- Este PRD **não aplica** `createDedupWindow` a nenhuma rota (o `/event` já tem
  o que precisa via `isRecentDuplicate`; ads é PRD 04).

### RF6 — Buffer do `/event`: reconciliação e teto

1. **Excedente do flush degradado contabilizado** — em `flushBuffer`
   (`analytics.ts:109-111`), o descarte por falta de espaço passa a contar:

   ```ts
   if (ok === 0 && failed.length > 0) {
     const room = Math.max(0, BUFFER_MAX - _buffer.length);
     const requeued = failed.slice(0, room);
     const discarded = failed.length - requeued.length;
     _buffer.unshift(...requeued);
     if (discarded > 0) {
       noteFlush(false, discarded);
       logger.warn({ discarded }, "analytics: excedente do buffer descartado em flush degradado");
     }
   }
   ```

   (Nota: `noteFlush(false, …)` também atualiza `lastFlushAt` —
   `analyticsHealth.ts:37-41` — o que aqui é correto: houve uma tentativa com
   perda registrada. No caminho de falha total SEM descarte, `lastFlushAt`
   continua estagnado de propósito: nada foi gravado nem perdido — os eventos
   seguem no buffer.)
2. **Teto duro do buffer** — `pushEvent` (`:122-125`) ganha cap de `2 ×
   BUFFER_MAX` (1000): ao exceder, descarta os MAIS ANTIGOS com
   `noteFlush(false, n)` (mais antigos porque os novos têm mais chance de
   flush com geo retro-preenchida e são mais relevantes para o realtime).
3. **Identidade formal da Saúde** (oferecida ao PRD 08/11 como regra):
   `received = flushedOk + flushFailed + buffered` (tolerância: o lote em voo
   durante um flush — na prática ±BUFFER_MAX por instantes). Com o item 1, a
   identidade passa a valer SEMPRE; hoje quebra no flush degradado.
4. `/behavior` continua SEM buffer (gravação direta, `:336-343`) — decisão
   mantida: volume baixo, perda aceitável no try/catch silencioso (`:345-347`);
   documentar no `docs/ANALYTICS.md` (RF7).

### RF7 — Rate limits: fonte única, decisão de valores e documentação

1. **Fonte única nomeada** em `api/lib/trafficGuard.ts`:

   ```ts
   /** Tetos por IP por minuto, por endpoint de ingest. Fail-open: janelas em
    *  memória zeram no restart (nunca bloqueiam tráfego legítimo por estado
    *  perdido). Revisão PRD 03 (2026-07): valores MANTIDOS. */
   export const INGEST_RATE_LIMITS = {
     event: 120, behavior: 30, adImpression: 60, adClick: 30,
   } as const;
   ```

   Call-sites (`analytics.ts:212,:318`; `ads.ts:145,:187`) passam a usar as
   constantes (refactor comportamento-preservante — mesmos números).
2. **Decisão: MANTER os valores atuais.** Racional registrado: (a) volume baixo
   não é bug — a rede é nova e nenhum valor atual está comprovadamente errado;
   (b) 120 pv/min/IP acomoda NAT/CGNAT moderado sem abrir flood ilimitado;
   (c) o teto teórico de 86.400 impressões/dia/IP (auditoria, claim h) NÃO se
   resolve com rate limit e sim com o dedup por sessão do PRD 04 — apertar o
   rate aqui puniria IPs compartilhados reais sem fechar o buraco; (d) qualquer
   mudança futura vira diff de UMA linha auditável.
3. **Comportamento em restart documentado** (em `docs/ANALYTICS.md`, seção
   "Saúde da coleta"): janelas de rate/dedup e contadores zeram no restart
   (fail-open); `bootAt`/`uptimeSeconds` do `/health` (`analyticsHealth.ts:
   43-52`) datam o zero; o dedup de 15s perde o estado → um F5 logo após deploy
   pode contar 2× (aceito; janela de exposição de segundos); buffer é drenado
   no shutdown limpo (`routes/index.ts:26`) e perdido em crash (até
   `2×BUFFER_MAX` eventos — RF6).
4. **`filters[]` do `/health` atualizado** (texto exato no §7.4) + nota sobre o
   risco CGNAT de `internalIps` (RF4) na mesma seção da doc.

---

## 5. Requisitos não-funcionais

- **Performance**: contadores são incrementos O(1) em memória; o filtro
  `is_internal=false` na query de `behavior_events` usa a coluna nova (tabelas
  pequenas; índices existentes por ts — custo desprezível); `createDedupWindow`
  é O(1) por hit com teto de 50k chaves (~poucos MB no pior caso); nenhuma
  query nova no caminho quente do `/stats`. O dedup de `category` REDUZ
  gravações.
- **LGPD**: nenhum dado novo é coletado ou persistido — razões de marcação
  interna são contadores agregados em memória (sem IP/UA/sessão); IPs continuam
  transientes (`_ip` nunca vai ao banco — `analytics.ts:46-48`). O PRD registra
  (sem corrigir — PRD 02) que `newsletter.value` = e-mail segue entrando sem
  gate de consentimento pelos 2 formulários fora do padrão. Parte da rede opera
  conteúdo político-adjacente: não introduzir rastreio novo é requisito.
- **Confiabilidade**: todos os descartes continuam SILENCIOSOS para o cliente
  (`{ok:true}` — não recompensa sondagem, padrão do docstring
  `trafficGuard.ts:1-10`); contadores nunca lançam; `/behavior` mantém o
  try/catch que nunca falha para o client (`analytics.ts:345-347`); fail-open
  em restart (RF7).
- **Multi-blog**: mesma imagem para os 8 blogs; contadores por container =
  diagnóstico por blog; nenhuma lógica condicionada a BLOG_ID; rollout §6
  obrigatório (§8.3) com canário resenhavip e revalidação de cards POR BLOG.
- **Windows/dev (CLAUDE.md §14)**: typecheck por pacote (o filtro da raiz não
  casa no Windows); testes só `node --test` com imports relativos com extensão
  `.ts` explícita; NUNCA unicode literal em regex (usar `\uXXXX`); build real na
  VPS; se o PRD 01 ainda não tiver rodado `pnpm exec tsc -b` em `lib/db` na
  máquina, rodar antes de typecheckar o api-server (dist gitignored).

---

## 6. Modelo de dados

**Este PRD NÃO cria coluna nem índice.** Regra do doc v2 respeitada por
referência: colunas novas SEMPRE via schema Drizzle E `ensureSchema.ts` — a
única coluna que este PRD USA é a do PRD 01, reproduzida aqui para
autossuficiência (conferir presença antes de implementar — §8.1):

- Drizzle (`db/schema/behavior_events.ts`, PRD 01 §6.1):
  `isInternal: boolean("is_internal").notNull().default(false)`.
- `ensureSchema` (`api/lib/ensureSchema.ts`, PRD 01 §6.2):
  `sql\`ALTER TABLE behavior_events ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false\``.

Nota herdada do PRD 01 (§11 de lá), agora ATIVA: a partir deste PRD o Drizzle
PROJETA `is_internal` nas queries de `behavior_events` (insert do RF3 e select
do `/stats`). Num banco onde o statement do boot falhou (banco fora no
`ensureSchema`, try/catch não-fatal `:76-82`), o insert do `/behavior` falha
silenciosamente (try/catch responde `{ok:true}` — perda até o próximo boot) e o
`/stats` responderia 500. Mitigação: o statement roda a CADA boot e converge; o
modo de falha é o mesmo já documentado na docstring `ensureSchema.ts:9-11`
(precedente `social_title`). Não adicionar fallback de query (mascararia erro
real).

Estado em memória novo (não é schema): contadores `byEndpoint`/
`internalByReason` (RF1/RF4) e instâncias de `createDedupWindow` (RF5) — zeram
no restart, documentado (RF7).

---

## 7. Contrato de API

### 7.1 `POST /api/analytics/event` — sem mudança de shape

Request e response inalterados (`{ok:true}` sempre; 400 só payload inválido —
`analytics.ts:216-236`). Mudança de COMPORTAMENTO: evento `type:"category"`
repetido (mesma sessão+path em <15s) passa a ser dedupado com `{ok:true}`
silencioso (RF2) — idêntico ao pageview hoje.

### 7.2 `POST /api/analytics/behavior` — sem mudança de shape

Request e response inalterados. Mudança de COMPORTAMENTO: evento interno (flag
`internal:true`, IP cadastrado OU IP privado) passa a ser **GRAVADO com
`is_internal=true`** em vez de descartado (RF3). Consumidores públicos não veem
diferença (leitores filtram).

### 7.3 `POST /api/ads/:id/impression` e `/click` — sem mudança de contrato

Este PRD só adiciona incrementos de contador nos caminhos existentes (RF1).
Body/pipeline/dedup são do **PRD 04** (§7.1/7.2 de lá).

### 7.4 `GET /api/analytics/health` — campos ADITIVOS

Shape atual (`analyticsHealth.ts:43-52` + `analytics.ts:351-363`) preservado;
novos campos:

```jsonc
{
  // … campos atuais inalterados: received, droppedBot, droppedRate,
  // droppedInvalid, droppedDuplicate, flaggedInternal, flushedOk, flushFailed,
  // buffered, lastEventAt, lastFlushAt, bootAt, uptimeSeconds, reliableSince …
  "byEndpoint": {
    "event":        { "received": 0, "droppedBot": 0, "droppedRate": 0, "droppedInvalid": 0, "droppedDuplicate": 0, "flaggedInternal": 0 },
    "behavior":     { "received": 0, "droppedBot": 0, "droppedRate": 0, "droppedInvalid": 0, "droppedDuplicate": 0, "flaggedInternal": 0 },
    "adImpression": { "received": 0, "droppedBot": 0, "droppedRate": 0, "droppedInvalid": 0, "droppedDuplicate": 0, "flaggedInternal": 0 },
    "adClick":      { "received": 0, "droppedBot": 0, "droppedRate": 0, "droppedInvalid": 0, "droppedDuplicate": 0, "flaggedInternal": 0 }
  },
  "internalByReason": { "flag": 0, "configuredIp": 0, "privateIp": 0 },
  "filters": [
    "user-agent de bot/CLI (todos os endpoints: event, behavior, impressao e clique de anuncio)",
    "rate limit por IP: 120/min event, 30/min behavior, 60/min impressao, 30/min clique",
    "duplicado: pageview e category (mesma sessao+pagina em <15s); impressao/clique: dedup do PRD 04",
    "caminhos /admin",
    "trafego interno marcado, nunca dropado (admin logado, dev, IPs configurados, rede privada) — event e behavior; ads: dimensao interna do PRD 04"
  ]
}
```

Campos legados mantêm a semântica atual (pipeline `/event` + buffer) — a
reconciliação `received = flushedOk + flushFailed + buffered` continua se
referindo a eles (e passa a fechar SEMPRE, RF6). A exibição de `byEndpoint`/
`internalByReason` no card Saúde é **PRD 08**.

### 7.5 `GET /api/analytics/stats` — shape intacto, 1 filtro novo

`behaviorStats` (`analytics.ts:756-761`) mantém shape; a query-fonte ganha
`is_internal = false` (RF3). Valores idênticos para dados legados (todas as
linhas legadas são `false`).

### 7.6 Assinaturas internas novas (não-HTTP)

```ts
// api/lib/analyticsShared.ts
export type InternalReason = "flag" | "configuredIp" | "privateIp";
export function detectInternal(flag: boolean, ip: string, configured: ReadonlySet<string>):
  { internal: boolean; reason: InternalReason | null };

// api/lib/internalTraffic.ts (novo)
export function internalIpSet(): Set<string>;                    // memoização movida de analytics.ts:142-149
export function detectInternalRequest(bodyFlag: boolean, ip: string):
  { internal: boolean; reason: InternalReason | null };

// api/lib/analyticsHealth.ts
export type IngestEndpointId = "event" | "behavior" | "adImpression" | "adClick";
export function bumpEndpoint(ep: IngestEndpointId, key: keyof EndpointCounters): void;

// api/lib/trafficGuard.ts
export const INGEST_RATE_LIMITS: { event: 120; behavior: 30; adImpression: 60; adClick: 30 };
export function createDedupWindow(opts: DedupWindowOpts): DedupWindow;
```

---

## 8. Comandos de verificação (rodar exatamente estes, com resultado esperado)

### 8.1 Local (Windows, antes do commit)

Pré-requisito PRD 01 (a coluna precisa existir no repo — se algum grep falhar,
implementar o PRD 01 antes):

```powershell
cd "c:\Users\Usuario(a) Master\sp011"
git grep -n "is_internal" -- lib/db/src/schema/behavior_events.ts artifacts/api-server/src/lib/ensureSchema.ts
# esperado: >=1 ocorrencia em CADA um dos dois arquivos
```

Typecheck e testes:

```powershell
cd "c:\Users\Usuario(a) Master\sp011\lib\db"
pnpm exec tsc -b
# esperado: exit 0
cd "c:\Users\Usuario(a) Master\sp011\artifacts\api-server"
pnpm run typecheck
# esperado: sem erros
node --test "test/**/*.test.ts"
# esperado: TODOS passam, incluindo as suites novas do §12
```

Greps de estrutura (fonte única, incrementos e ausência de regressão):

```powershell
cd "c:\Users\Usuario(a) Master\sp011"
git grep -n "bumpEndpoint" -- artifacts/api-server/src/routes/ads.ts
# esperado: >=6 hits (bot/rate/invalid/received nas duas rotas)
git grep -n "bumpEndpoint" -- artifacts/api-server/src/routes/analytics.ts
# esperado: >=3 hits (behavior: bot/rate/invalid/flagged/received)
git grep -n "INGEST_RATE_LIMITS" -- artifacts/api-server/src
# esperado: definicao em lib/trafficGuard.ts + usos em routes/analytics.ts e routes/ads.ts
git grep -Fn "cat:" -- artifacts/api-server/src/routes/analytics.ts
# esperado: 1 hit (chave do dedup de category)
git grep -Fn "internalIpSet().has(ip)) { res.json" -- artifacts/api-server/src/routes/analytics.ts
# esperado: NENHUM resultado (drop do /behavior removido — virou marcacao)
git grep -Fn "isInternal: det.internal" -- artifacts/api-server/src/routes/analytics.ts
# esperado: >=1 hit (o insert do /behavior agora grava a marcacao interna — RF3;
#           string exata do bloco de codigo do RF3)
git grep -n "createDedupWindow" -- artifacts/api-server/src/lib/trafficGuard.ts
# esperado: definicao presente
git diff --stat HEAD~1 -- artifacts/brasilia-agora
# esperado: VAZIO (este PRD nao toca o client)
```

### 8.2 VPS — testes ativos e SQLs — **PENDENTE DE EXECUÇÃO**

(MCP Supabase não conectado na escrita deste PRD; blocos completos para colar,
padrão CLAUDE.md §12. Todos os testes ativos usam `internal:true` e sessões
`prd03-*` — marcados internos, NUNCA poluem métricas públicas. UA de navegador
obrigatório: `curl/` cai no `BOT_RE`, `trafficGuard.ts:14-19`.)

**V1 — `/behavior` agora MARCA em vez de dropar** (inverte o teste do PRD 01
§8.2, que esperava contagem inalterada):

```bash
DOM='https://resenhavip.midia.run'
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d resenhavip -v ON_ERROR_STOP=1 -c "SELECT count(*) AS total, count(*) FILTER (WHERE is_internal) AS internos FROM behavior_events;"
curl -s -X POST "$DOM/api/analytics/behavior" -A "Mozilla/5.0 (verificacao PRD03)" -H 'Content-Type: application/json' -d '{"eventType":"search","sessionId":"prd03-verif","value":"teste prd03","internal":true}'
# esperado: {"ok":true}
docker compose exec -T pg-blogs psql -U postgres -d resenhavip -v ON_ERROR_STOP=1 -c "SELECT count(*) AS total, count(*) FILTER (WHERE is_internal) AS internos FROM behavior_events;"
# esperado: total = anterior+1 E internos = anterior+1 (gravou COM marcacao)
```

**V2 — dedup do evento `category`** (2 POSTs em <15s → 1 linha; o /event usa
buffer com flush de 30s, por isso o sleep):

```bash
DOM='https://resenhavip.midia.run'
cd /opt/sp011
curl -s -X POST "$DOM/api/analytics/event" -A "Mozilla/5.0 (verificacao PRD03)" -H 'Content-Type: application/json' -d '{"type":"category","path":"/categoria/futebol","sessionId":"prd03-cat-verif","category":"futebol","internal":true}'
curl -s -X POST "$DOM/api/analytics/event" -A "Mozilla/5.0 (verificacao PRD03)" -H 'Content-Type: application/json' -d '{"type":"category","path":"/categoria/futebol","sessionId":"prd03-cat-verif","category":"futebol","internal":true}'
# esperado: {"ok":true} nas duas
sleep 40
docker compose exec -T pg-blogs psql -U postgres -d resenhavip -v ON_ERROR_STOP=1 -c "SELECT count(*) AS linhas FROM analytics_events WHERE type='category' AND session_id='prd03-cat-verif';"
# esperado: linhas = 1 (a 2a foi dedupada)
```

**V3 — bot em rota de ads incrementa o contador do endpoint** (o UA `curl/`
padrão cai no BOT_RE de propósito):

```bash
DOM='https://resenhavip.midia.run'
curl -s -X POST "$DOM/api/ads/inexistente/impression"
# esperado: {"ok":true} (descarte silencioso preservado)
```

Conferência: admin logado no blog abre `https://resenhavip.midia.run/api/analytics/health`
no navegador → `byEndpoint.adImpression.droppedBot >= 1` (observação objetiva;
o card completo é PRD 08).

**V4 — leitores públicos excluem interno** (espelho SQL da query do `/stats`
pós-RF3 — a linha do V1 NÃO deve aparecer):

```bash
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d resenhavip -v ON_ERROR_STOP=1 -c "SELECT count(*) AS visiveis FROM behavior_events WHERE is_internal = false AND session_id = 'prd03-verif';"
# esperado: visiveis = 0 (a linha de teste existe mas e interna)
```

**V5 — precisão da marcação interna (item 25)** — proporção por tipo (mesma
A5 da auditoria) + sessões com marcação mista no sp011 (Supabase):

```bash
cd /opt/sp011
DBURL=$(grep -m1 '^SUPABASE_DATABASE_URL=' /opt/sp011/.env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "SELECT type, count(*) AS total, count(*) FILTER (WHERE is_internal) AS internos, round(100.0 * count(*) FILTER (WHERE is_internal) / count(*), 1) AS pct_interno FROM analytics_events WHERE ts >= now() - interval '30 days' GROUP BY type ORDER BY total DESC;"
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "SELECT session_id, count(*) FILTER (WHERE is_internal) AS internas, count(*) FILTER (WHERE NOT is_internal) AS publicas FROM analytics_events WHERE ts >= now() - interval '30 days' GROUP BY 1 HAVING count(*) FILTER (WHERE is_internal) > 0 AND count(*) FILTER (WHERE NOT is_internal) > 0 ORDER BY 2 DESC LIMIT 50;"
```

Leitura (princípio: volume baixo não é bug): `pct_interno` alto com uso diário
do admin é ESPERADO (item 25 do doc v2 — os 104/106 são corretos); a 2ª query
lista sessões MISTAS (linhas internas e públicas na mesma sessão) — o único
cenário legítimo é login/logout do admin no MEIO da sessão; volume alto de
mistas sem essa explicação indica falso positivo/negativo a investigar com o
`internalByReason` do `/health`. Limpeza opcional das linhas de teste:
`DELETE FROM behavior_events WHERE session_id LIKE 'prd03-%'` e
`DELETE FROM analytics_events WHERE session_id LIKE 'prd03-%'` (inofensivo:
linhas internas já ficam fora das métricas).

### 8.3 Rollout multi-blog (CLAUDE.md §6 — obrigatório)

Arquivos tocados → serviços (§5): só `artifacts/api-server` → **`api`** (o
client não muda; o bump versiona as duas imagens — build padrão cobre ambas).

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
# canário (resenhavip) — rodar V1–V4 do §8.2 e conferir os cards do §8.4 ANTES de seguir
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
oleysports.midia.run, beeesportes.midia.run (+ pontofarma/creditovc quando no
ar). Critério dominante: **NÃO-REGRESSÃO dos números públicos** (mesma janela,
mesmos valores; em blog novo, estados vazios continuam vazios):

1. Analytics → **Saúde da coleta** (item 25): contadores legados funcionando;
   `lastEventAt`/`buffered` evoluindo; `/health` JSON com `byEndpoint` e
   `internalByReason` (card completo: PRD 08).
2. Analytics → **Resumo de interações**, **Termos mais buscados**, **Links
   externos clicados** (itens 22/23/24): valores idênticos aos pré-rollout na
   mesma janela (linhas legadas todas `is_internal=false`); teste V1 não aparece.
3. Dashboard → **Top categorias** e Analytics → **Top categorias detalhado**
   (itens 3/14): sem mudança retroativa de valores; F5 em página de categoria
   deixa de somar "cliques" (conferível repetindo o V2 sem `internal` — não
   fazer em produção sem marcar interno).
4. Analytics → **5 KPIs** + **Tráfego ao longo do tempo** (itens 5–10):
   não-regressão (o `/event` só ganhou dedup de category e refactor interno).
5. Analytics → **Propagandas** (KPIs/tabela/top-3, itens 4/19–21): não-regressão
   — este PRD só adiciona contadores nas rotas de ads (a contagem em si é
   PRD 04).

---

## 9. Critérios de aceite

Mapeamento: itens **25** (CA2/CA3/CA6/CA8/CA9/CA11), **24** (CA4/CA7), **3/14**
(CA5) da checklist do doc v2; regras do PRD 11 habilitadas: a identidade de
reconciliação da Saúde (RF6.3) entra como regra automatizável por blog, e a
separação interno/público de `behavior_events` viabiliza as regras por blog do
módulo 11 sobre comportamento; os contadores por endpoint são o insumo dos
alertas do PRD 08 (proporção anômala de internos — regra literal do módulo 08
do doc v2). Nenhum critério é subjetivo; os que exigem banco/produção estão
marcados **PENDENTE DE EXECUÇÃO** (MCP Supabase não conectado na escrita —
nunca marcar como atendido sem rodar o comando na VPS).

| # | Critério | Verificação | Status na escrita |
|---|---|---|---|
| CA1 | Typecheck (`lib/db` se necessário + api-server) e `node --test` passam, incluindo as 4 suites novas do §12 | §8.1 → exit 0 / todos ok | a executar no dev |
| CA2 | As 4 rotas de ingest incrementam contadores por endpoint (bot/rate/invalid/received; dup/flagged onde aplicável) | greps do §8.1 (`bumpEndpoint` em ads.ts ≥6 e analytics.ts ≥3) + teste do §12 | a executar no dev |
| CA3 | `GET /health` devolve `byEndpoint` (4 endpoints × 6 contadores) e `internalByReason` (3 razões), com campos legados intactos | teste de shape do §12 + observação objetiva no navegador autenticado (V3) | a executar no dev |
| CA4 | `/behavior` interno é GRAVADO com `is_internal=true` (não mais dropado): POST com `internal:true` → total+1 E internos+1 | §8.2 V1 | **PENDENTE DE EXECUÇÃO** |
| CA5 | Evento `category` dedupado: 2 POSTs mesma sessão+path em <15s → exatamente 1 linha | §8.2 V2 | **PENDENTE DE EXECUÇÃO** |
| CA6 | Bot em rota de ads é contado: POST com UA `curl` → `{ok:true}` e `byEndpoint.adImpression.droppedBot` ≥ 1 | §8.2 V3 (observação objetiva no /health autenticado) | **PENDENTE DE EXECUÇÃO** |
| CA7 | Leitores públicos de `behavior_events` filtram `is_internal=false`; números públicos legados INALTERADOS na mesma janela | grep do filtro no §8.1 + §8.2 V4 + §8.4 grupo 2 | **PENDENTE DE EXECUÇÃO** (parte SQL/obs) |
| CA8 | Reconciliação do buffer fecha sempre: excedente do flush degradado conta em `flushFailed`; teto duro 2×BUFFER_MAX em `pushEvent` | teste unitário do §12 (helper de requeue/cap) + code review por grep de `noteFlush(false` em `flushBuffer` | a executar no dev |
| CA9 | Rate limits com fonte única `INGEST_RATE_LIMITS` e valores INALTERADOS (120/30/60/30) | grep do §8.1 + teste do §12 (igualdade dos 4 valores) | a executar no dev |
| CA10 | Não-regressão por blog pós-rollout: os 5 grupos de cards do §8.4 com valores idênticos na mesma janela | observação objetiva antes/depois em cada blog (§8.3 canário primeiro) | **PENDENTE DE EXECUÇÃO** |
| CA11 | Precisão da marcação interna auditável: `detectInternal` com precedência flag>configuredIp>privateIp travada por teste; SQLs V5 interpretados sem anomalia não explicada | teste do §12 + §8.2 V5 | **PENDENTE DE EXECUÇÃO** (parte SQL) |
| CA12 | Client intocado: nenhum diff em `artifacts/brasilia-agora` | `git diff --stat` do §8.1 → vazio | a executar no dev |

---

## 10. Invariantes do §17 preservadas por este PRD

1. **"Tráfego interno marcado `is_internal`, nunca dropado"** — este PRD
   ESTENDE o cumprimento: o `/behavior` deixa de ser a exceção documentada
   (drop → marcação com a coluna do PRD 01). O dedup de `category` (RF2) NÃO é
   drop de interno: descarta DUPLICATA, mesmo precedente sancionado do `pv:` 15s
   (`analytics.ts:231`) — vale igualmente para eventos internos e públicos.
2. **"Heartbeat cumulativo agregado por MAX"** — não tocada: nenhum código de
   `read`/agregação muda (`analyticsShared.ts:319-327` intacto); o dedup novo
   não se aplica a `read`.
3. **"`totals.*` do /stats fixos ao agora"** — não tocada (`analytics.ts:
   515-526` intacto; o único diff no `/stats` é o filtro da query de
   `behavior_events`, que não participa dos totals).
4. **"Canal classificado no servidor"** — não tocada; `classifyChannel` e o
   first-touch (`analytics.ts:252-265`) intactos (dono: PRD 05).
5. **"Migrações de coluna via Drizzle schema E ensureSchema"** — nenhuma coluna
   nova aqui; a dependência (coluna do PRD 01) já cumpre a regra nos dois
   lugares (verificação no §8.1).
6. **"Colunas novas se autocriam no boot"** — herdada via PRD 01; nenhum passo
   manual por blog neste PRD.
7. **Isolamento entre blogs / nunca hardcodar por blog na imagem** — contadores
   e filtros 100% genéricos; nenhuma referência a BLOG_ID.
8. **SSR/perf (`no-cache` nunca `no-store`, sanitize isomórfico, allowlist do
   proxy de imagem)** — não tocadas: zero diff no client (CA12) e nenhum header
   de cache alterado no servidor.
9. **"Linhas históricas nunca são reescritas"** (precedente
   `analyticsShared.ts:143`) — nenhum UPDATE/DELETE em `analytics_events`/
   `behavior_events`; correções valem do rollout em diante (RF2).

---

## 11. Casos de borda

- **`sessionId` degradado** (`"unknown"` quando sessionStorage bloqueado —
  `useAnalytics.ts:29-31`, cf. PRD 01 §11): o dedup `cat:unknown|<path>` colapsa
  visitantes distintos sem storage no mesmo path — 2º visitante em <15s é
  dedupado (subcontagem rara e limitada; MESMO comportamento que o `pv:` já tem
  hoje — nenhuma assimetria nova).
- **Navegação SPA legítima de volta à mesma categoria em <15s** (voltar/avançar):
  dedupada — semântica idêntica à do pageview (F5/bounce imediato não é
  audiência nova). Navegação após 15s conta normalmente.
- **Flag `internal:true` forjada por visitante hostil**: auto-exclusão (o evento
  é marcado interno e sai das métricas públicas) — nunca infla métrica; visível
  em `internalByReason.flag`. Não tratar como ataque (não há incentivo).
- **CGNAT/IP compartilhado em `internalIps`**: marcaria como interno TODO
  visitante atrás daquele IP — risco OPERACIONAL documentado (RF7.4); o
  diagnóstico é `internalByReason.configuredIp` desproporcional + V5. Nenhuma
  validação automática consegue distinguir IP residencial de CGNAT — decisão
  humana.
- **Proxy extra na frente do Caddy** (ex.: CDN futura): `trust proxy, 1`
  (`app.ts:106`) devolveria o IP do edge — visitantes NÃO virariam internos
  (IP público), mas o rate limit passaria a agregar por edge-IP (mais
  restritivo) e a geo apontaria o edge. Fora de escopo; detectável por
  `byEndpoint.*.droppedRate` anômalo pós-mudança de infra.
- **Restart durante rajada**: janelas de rate e dedup zeram → até 1 evento
  duplicado extra por sessão×path na janela do deploy e rajadas readmitidas
  (fail-open). Aceito e documentado (RF7.3); contadores datados por `bootAt`.
- **Banco fora no boot (coluna do PRD 01 ausente)**: insert do `/behavior` falha
  silencioso (perda até o próximo boot; try/catch `analytics.ts:345-347`) e
  `/stats` responde 500 — modo de falha herdado e documentado (§6); converge no
  boot seguinte. Não mascarar com fallback.
- **PRD 04 implementado antes deste**: os pontos `// PRD 03: bumpHealth aqui`
  já existirão em `ads.ts` — este PRD os substitui pelos incrementos reais e
  refatora o Map de dedup do 04 para `createDedupWindow` (comportamento
  idêntico, testes ativos do 04 §8 revalidam). Implementado depois: os
  contadores `droppedDuplicate`/`flaggedInternal` de ads ficam em 0 até lá
  (documentado no código — não é bug).
- **Dois eventos `category` de paths DIFERENTES da mesma categoria** (ex.:
  paginação `/categoria/futebol?page=2` se vier com path distinto): chaves
  diferentes → ambos contam. Correto: são visitas distintas à listagem.
- **Rajada legítima acima do rate** (ex.: sala de aula atrás de NAT): eventos
  descartados são agora VISÍVEIS em `droppedRate` por endpoint — o operador
  pode decidir com dado, em vez de suspeitar de bug de coleta.

---

## 12. Plano de testes (`node --test`, CLAUDE.md §14)

Suites novas em `artifacts/api-server/test/` (imports relativos com extensão
`.ts` explícita; sem unicode literal em regex; padrão das suites existentes
`test/analyticsShared.*.test.ts`). Tudo lógica pura/contadores — sem banco, sem
Express:

1. **`trafficGuard.dedupWindow.test.ts`** — `createDedupWindow` com relógio
   injetado (`now`): (a) 1º hit false, 2º hit dentro da janela true; (b) após a
   janela, false de novo; (c) modo `sliding` renova e `fixed` não; (d) eviction:
   com `maxKeys:3`, a 4ª chave expulsa a mais antiga (que volta a contar como
   primeira vez); (e) `size()` consistente. Também: `INGEST_RATE_LIMITS` com
   exatamente `{event:120, behavior:30, adImpression:60, adClick:30}` (CA9).
2. **`analyticsShared.internal.test.ts`** — `detectInternal`: cada gatilho
   isolado; precedência de razão flag > configuredIp > privateIp quando 2+
   verdadeiros; IP `::ffff:10.0.0.1` marca `privateIp` (normalização);
   simetria `parseInternalIps("::ffff:1.2.3.4")` casa com
   `normalizeIp("::ffff:1.2.3.4")` (trava o §2.4); IP público sem flag/set →
   `{internal:false, reason:null}`.
3. **`analyticsHealth.endpoints.test.ts`** — `bumpEndpoint` incrementa o
   endpoint certo sem vazar para os outros; `bumpHealth("droppedBot")` espelha
   em `byEndpoint.event.droppedBot`; `flushedOk`/`flushFailed` NÃO aparecem em
   `EndpointCounters`; shape do `healthSnapshot` contém `byEndpoint` (4×6) e
   `internalByReason` (3) além de TODOS os campos legados (CA3). (Contadores
   são estado de módulo: o teste mede DELTAS, nunca valores absolutos — ordem
   de execução de testes não pode importar.)
4. **`analyticsBuffer.requeue.test.ts`** — helper puro extraído do RF6 (ex.:
   `planRequeue(failedLen, bufferLen, max)` → `{requeue, discard}`): sem
   espaço → tudo descartado e contado; espaço parcial → divisão exata;
   `discard + requeue === failedLen` sempre (propriedade da identidade CA8);
   cap de `pushEvent` (`capExcess(len, cap)` ou equivalente) descarta
   exatamente `len - cap` quando excede e 0 quando não.
5. **Suites existentes continuam passando** (`analyticsShared.*`,
   `analyticsClient` no web não é tocado): nenhum valor esperado muda — os
   refactors (constantes de rate, detectInternal no `/event`) são
   comportamento-preservantes.

Dados sintéticos apenas; nenhum teste toca banco real. Validação com dados
reais: exclusivamente §8.2 na VPS (**PENDENTE DE EXECUÇÃO**), sempre com
`internal:true`/sessões `prd03-*` (nunca poluir métricas públicas — padrão do
PRD 12).

---

## 13. Plano de rollback

Cenário A — **regressão de código** (ex.: contador lançando, dedup descartando
demais, `/stats` 500): rollback de IMAGEM por blog, sem tocar em schema (este
PRD não criou schema):

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
rollback pontual sem afetar os irmãos (o canário resenhavip existe para pegar
antes da rede).

Efeitos de dados no rollback (avaliados, nenhum bloqueia):

- Linhas de `behavior_events` gravadas com `is_internal=true` PERMANECEM. A
  imagem antiga não projeta a coluna (Drizzle antigo) e **não filtra** na
  leitura → essas linhas internas VOLTARIAM a contar nos cards de comportamento
  até novo rollout. Volume esperado: mínimo (dias de tráfego interno). Limpeza
  opcional e segura se incomodar:
  `DELETE FROM behavior_events WHERE is_internal = true;` (por banco, padrão
  §12) — apaga SÓ marcadas internas, que nunca pertenceram às métricas públicas.
- O dedup de `category` desaparece no rollback → F5 volta a inflar "cliques"
  (estado anterior conhecido; sem corrupção).
- Contadores por endpoint somem do `/health` (campos aditivos) — nenhum
  consumidor legado depende deles (a UI nova é PRD 08).

Cenário C — **erro só de documentação** (`docs/ANALYTICS.md`): commit de docs +
`git pull` na VPS, sem rebuild (CLAUDE.md §5).

---

## 14. Riscos e dependências de outros PRDs (FRONTEIRAS do STATUS.md)

| PRD | Fronteira/dependência |
|---|---|
| **PRD 01** (modelo de dados) | **DEPENDÊNCIA DURA**: a coluna `behavior_events.is_internal` (Drizzle + ensureSchema — PRD 01 §6, RF3) precisa estar no repo ANTES deste PRD (guard no §8.1). Este PRD herda a nota de borda do PRD 01 §11 (projeção Drizzle vs boot falho — §6). Se o PRD 01 tiver entregue `BEHAVIOR_TYPES`, o `/behavior` já usa a constante — este PRD não a altera. Processo de migração RF5 do PRD 01 respeitado por vacuidade (sem schema novo aqui). |
| **PRD 02** (tracking client) | Dono do gate de consentimento e da flag `internal` nos 2 formulários de newsletter e nas rotas de ads client — "o servidor não distingue consentimento; PRD 03 apenas anota" (fronteira literal). Até o PRD 02, newsletter de admin sem IP cadastrado continua entrando como pública (registrado no RF3). |
| **PRD 04** (propagandas) | Dono do dedup server-side de impressão/clique (RF4 de lá) e da marcação interna de ads (RF3 de lá — dimensão `internal_*`). Este PRD entrega o que o 04 declara consumir: `createDedupWindow` (mecanismo genérico) e os incrementos nos pontos `// PRD 03: bumpHealth aqui`. Qualquer ordem converge (§11); ideal: 04 antes ou junto (os contadores de dup/flagged de ads só têm o que contar com o 04 no ar). |
| **PRD 05** (fontes de tráfego) | Dono da classificação de canal; declara que "a validação genérica do ingest continua sendo fronteira do PRD 03" — atendida aqui por observabilidade (POST forjado vira visível nos contadores por endpoint) SEM autenticação nova (endpoint público por design, sendBeacon). Nenhum toque em `classifyChannel`/first-touch. |
| **PRD 06** (agregações) | Defeitos de agregação do `/stats` (EXISTS de recorrentes, byDow, chave do scroll) são do 06 — este PRD não os toca. O 06 herda a obrigação do filtro `is_internal=false` em queries novas de `behavior_events`. |
| **PRD 07** (comportamento) | Servirá totais NÃO truncados de `behavior_events` (fronteira) — DEVE manter o filtro `is_internal=false` introduzido no RF3 (registrado lá como dependência). |
| **PRD 08** (saúde/alertas) | Recebe: exposição de `byEndpoint`/`internalByReason` no card Saúde, alerta de proporção anômala de internos (regra literal do módulo 08 do doc v2), alerta sobre a identidade de reconciliação do RF6.3, e o texto novo de `filters[]` já entregue aqui. |
| **PRD 11** (validação cross-metric) | Ganha por blog: identidade `received = flushedOk + flushFailed + buffered` como regra automatizável; separação interno/público de behavior para as regras de comportamento; contadores por endpoint como insumo. |
| **PRD 12** (testes/validação) | O script de tráfego sintético usa `internal:true` + sessões com prefixo reservado (precedente `prd03-*` do §8.2) — com o RF3, esses eventos passam a ser GRAVADOS (marcados): o PRD 12 deve prever a limpeza por `session_id LIKE` ou aceitar o acúmulo interno (fora das métricas públicas). |

**Riscos técnicos**: (1) esquecer um caminho de descarte sem contador (fica
invisível de novo) → mitigado pelo CA2 (greps com contagem mínima) e pela
tabela do §2.1 como checklist de caminhos; (2) filtro `is_internal=false`
esquecido em query FUTURA de `behavior_events` → registrado como obrigação dos
PRDs 06/07 (fronteira acima; o PRD 11 pode automatizar); (3) dedup de
`category` esconder um problema real de UX (usuário recarregando por página
quebrada) → falso: o F5 continua visível em `droppedDuplicate`; (4) rollback
re-incluindo linhas internas de behavior nos cards → documentado no §13 com
limpeza opcional. **Risco de processo**: números públicos NÃO devem mudar no
rollout (CA7/CA10) — se mudarem, investigar antes de seguir a fila de PRDs.

---

## 15. Estimativa de esforço

**M** (médio). Toca 2 rotas (`analytics.ts`, `ads.ts`) e 3 libs
(`analyticsHealth`, `trafficGuard`, `analyticsShared` + novo `internalTraffic`),
com 4 suites de teste novas — mas: zero schema próprio, zero client, zero
endpoint novo, todos os refactors comportamento-preservantes e verificáveis por
grep/teste. O maior custo é a disciplina de cobrir TODOS os caminhos de
descarte (checklist do §2.1) e a validação multi-blog do §8.2–8.4 (pendente de
execução na VPS).
