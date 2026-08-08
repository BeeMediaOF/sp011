# PRD 09 — APIs do dashboard (contrato, cache/TTL, paginação, versionamento)

> **Como usar este documento.** Este PRD é autocontido: qualquer sessão futura do
> Claude Code deve conseguir implementá-lo lendo SÓ este arquivo, sem reconstruir o
> contexto desta auditoria. Todas as referências `arquivo:linha` foram reabertas e
> conferidas nesta sessão de escrita (2026-07-23) diretamente no código-fonte do
> repo (`artifacts/api-server/src/routes/analytics.ts`, `admin.ts`,
> `realtime-stats.ts`, `ads.ts`, `artifacts/api-server/src/lib/analyticsHealth.ts`,
> `analyticsShared.ts`, `artifacts/brasilia-agora/src/pages/admin/Analytics.tsx`,
> `lib/adminApi.ts`).
>
> **Escopo estrito deste PRD:** contrato de transporte (request/response, cache,
> paginação, versionamento) dos endpoints que alimentam o painel `/admin` de
> Analytics/Propagandas/Dashboard. Este PRD **não corrige nenhum bug de precisão
> de dado** — essas correções pertencem aos PRDs 01–08 (fronteiras, §14). Quando
> este documento cita um bug (ex.: ordenação de `topCategories`), é só para
> documentar o shape ATUAL da resposta com fidelidade; a correção do VALOR é de
> outro PRD.
>
> **Princípio herdado do plano-mãe:** volume baixo não é bug — os 8 blogs da rede
> são novos. Os requisitos deste PRD (cache, paginação, versionamento) são sobre
> **corretude lógica e robustez de contrato**, não sobre otimizar para volume alto
> que ainda não existe. Onde a decisão foi "não implementar X porque o volume não
> justifica hoje", isso está registrado explicitamente com o raciocínio, não como
> lacuna esquecida.

---

## 1. Objetivo

Formalizar, congelar e tornar seguro para rollout multi-blog o contrato HTTP dos
endpoints que o painel `/admin` consome para renderizar o dashboard de Analytics,
o resumo de Propagandas e o card "Tempo real": um endpoint por seção do `/stats`
já existe de fato (é um único endpoint agrupado — ver §3.1 para a avaliação de
por que isso é a decisão certa), então este PRD não cria N micro-endpoints; ele:

1. Documenta o shape REQUEST/RESPONSE atual de cada endpoint do módulo, com
   evidência `arquivo:linha`, e sobrepõe as mudanças de shape/valor que os PRDs
   04, 05, 06, 07 e 08 introduzem (para que uma implementação futura saiba
   exatamente o que já mudou por baixo antes de mexer no transporte).
2. Introduz um campo de versão de contrato (`contractVersion`) em `/stats` e
   `/health`, com uma política de evolução (aditivo não bump; não-aditivo bump +
   changelog nesta seção) — a resposta ao requisito "versionamento da resposta
   para rollout multi-blog sem quebrar admin antigo".
3. Introduz cache de curta duração (TTL) em `GET /api/analytics/stats` para
   absorver o auto-refresh de 30s do front sem custo de recômputo a cada poll,
   preservando a invariante "`totals.*` fixos ao agora" (§17).
4. Introduz paginação parametrizada (opcional, aditiva) em `topArticles` como
   caso de referência, com justificativa explícita de por que os demais campos
   truncados NÃO ganham paginação neste PRD.
5. Remove o campo morto `topCategoryViews` de `GET /api/admin/realtime-stats`
   (decisão explícita pedida pelo escopo deste PRD — ver §3.4).

## 2. Contexto / estado atual

### 2.1 Endpoints do módulo (evidência: `analytics-audit/00-inventario.md` §2 + releitura nesta sessão)

| Rota | Handler | Auth | Consumidor no client |
|---|---|---|---|
| `GET /api/analytics/stats?period=&from=&to=` | `artifacts/api-server/src/routes/analytics.ts:366` | `authMiddleware` + `requirePermission("analytics.view")` (`:366`) | `Analytics.tsx:213` (poll 30s) + `Dashboard.tsx` (cards "Top categorias"/"Propagandas") + `adminApi.ts:113-122` (`getAnalyticsStats`, tipagem solta `AnalyticsStats` em `:423-444`) |
| `GET /api/analytics/health` | `analytics.ts:351` | `authMiddleware` | `Analytics.tsx:214` (poll 30s, junto do `/stats`) |
| `GET /api/admin/ads` | `artifacts/api-server/src/routes/admin.ts:979` | `authMiddleware` global do router (`admin.ts:307`, aplicado a tudo depois dessa linha) | `adminApi.ts:82` (`getAds`) → `AdsManager.tsx`, `Dashboard.tsx:374-403` |
| `GET /api/admin/ads/block-stats` | `admin.ts:989-1004` | idem (`admin.ts:307`) | `adminApi.ts:84` (`getAdBlockStats`) → `AdsManager.tsx` |
| `GET /api/admin/realtime-stats` | `artifacts/api-server/src/routes/realtime-stats.ts:12` | `authMiddleware` explícito na própria rota | nenhum componente identificado consome `topCategoryViews` (ver §2.4); demais campos presumivelmente por um card "Tempo real" não mapeado em detalhe pela auditoria (fora do escopo desta correção) |

Montagem das rotas: `artifacts/api-server/src/routes/index.ts:43` (`/ads`
público — fora do escopo deste PRD, é consumido pelo SITE, não pelo dashboard),
`:51` (`/analytics`), `:59` (`/admin/realtime-stats`), `:40` (`/admin` — onde
vive `admin.ts`).

### 2.2 Shape atual completo de `GET /api/analytics/stats`

Reconferido linha a linha em `analytics.ts:715-762` nesta sessão. O handler
roda 12 queries em paralelo (`Promise.all`, `:383-496`), monta um `agg` único
via `buildWindowAggregates` (`analyticsShared.ts`, chamada em `analytics.ts:503`)
e devolve:

```jsonc
{
  "period":     { "key": "30d", "from": "2026-06-24", "to": "2026-07-23", "label": "Últimos 30 dias", "days": 30 },
  "totals":     { "today": 0, "week": 0, "month": 3, "allTime": 3, "window": 3 },
  "engagement": { "uniqueSessions": 2, "avgReadTime": 41, "bounceRate": 50, "readCompletions": 0 },
  "visitors":   { "unique": 2, "new": 2, "returning": 0, "since": "2026-07-08" },
  "trends":     { "today": null, "week": null, "month": null, "window": null, "uniqueSessions": null, "visitors": null, "avgReadTime": null, "bounceRate": null },
  "dailyChart":     [ { "date": "2026-06-24", "views": 0 }, "... 1 entrada por dia da janela" ],
  "hourlyChart":    [ { "hour": 0, "views": 0 }, "... 24 entradas fixas" ],
  "peakHour":       null,
  "dayOfWeekChart": [ { "day": "Dom", "views": 0 }, "... 7 entradas fixas" ],
  "peakDay":        null,
  "topArticles":    [ { "id": "abc", "title": "...", "views": 2, "avgTime": 30 }, "... até 10" ],
  "topCategories":  [ { "name": "esportes", "views": 0, "clicks": 0, "articles": 12 }, "... até 10" ],
  "topCities":      [ { "name": "Não identificado", "views": 3 }, "... até 8" ],
  "topRegions":     [ "... até 8" ],
  "devices":        { "mobile": 2, "desktop": 1, "tablet": 0 },
  "browsers":       [ { "name": "Chrome", "views": 2 }, "... até 8" ],
  "osList":         [ "... até 8" ],
  "scrollDepthChart": [ { "depth": 25, "count": 0 }, { "depth": 50, "count": 0 }, { "depth": 75, "count": 0 }, { "depth": 100, "count": 0 } ],
  "referrerChart":  [ { "name": "direto", "value": 2 }, { "name": "pago", "value": 1 }, "... sem entradas zeradas exceto 'pago' (zero-init)" ],
  "topRefHosts":    [ "... até 10" ],
  "topCampaigns":   [ "... até 10" ],
  "shareChart":     [ "... 1 por plataforma usada" ],
  "adStats":        [ { "id": "ad1", "name": "...", "position": "slot_01", "active": true, "impressions": 62, "clicks": 0, "ctr": 0, "hasData": true }, "... SEM limite" ],
  "adDailyChart":   [ { "date": "2026-07-01", "AnuncioA": 5, "AnuncioB": 0 }, "... 1 por dia da janela, só top-3 anúncios" ],
  "adTopNames":     [ "AnuncioA", "AnuncioB", "AnuncioC" ],
  "adHasAnyData":   true,
  "adKpis":         { "totalImpressions": 91, "totalClicks": 0, "avgCtr": 0, "bestAdName": "AnuncioA", "bestAdCtr": 0 },
  "behaviorStats":  { "totalEvents": 3, "newsletterSignups": 0, "topSearchTerms": [ "... até 15" ], "topLinkDomains": [ "... até 10" ] }
}
```

Origem de cada campo (`analytics.ts:715-762`, ordem do arquivo):

| Campo | Linha | Origem | Limite/shape |
|---|---|---|---|
| `period` | `:716` | `resolvePeriod` (`analyticsShared.ts:177-217`) | fixo, 5 chaves |
| `totals` | `:717` | queries SQL fixas ao "agora" (`:410-421`) + buffer (`:520-525`) | fixo, 5 chaves |
| `engagement` | `:718` | derivados de `agg` (`:506-513`) | fixo, 4 chaves |
| `visitors` | `:719-724` | query `EXISTS` (`:469-482`) | fixo, 4 chaves |
| `trends` | `:725` | comparação com janela anterior (`:540-550`) | fixo, 8 chaves |
| `dailyChart` | `:726` | `agg.byDay` | 1 por dia da janela (≤366) |
| `hourlyChart` | `:727` | `agg.byHour` | 24 fixas |
| `peakHour` | `:728` | `Math.max` sobre `byHour` | escalar |
| `dayOfWeekChart` | `:729` | `agg.byDow` | 7 fixas |
| `peakDay` | `:730` | `Math.max` sobre `byDow` | escalar |
| `topArticles` | `:731` | `:561-572`, `.slice(0, 10)` (`:572`) | **até 10, SEM parâmetro** |
| `topCategories` | `:732` | `:584-589`, `.slice(0, 10)` (`:589`) | até 10 |
| `topCities` | `:733` | `.slice(0, 8)` inline | até 8 |
| `topRegions` | `:734` | `.slice(0, 8)` inline | até 8 |
| `devices` | `:735` | `agg.deviceMap` | fixo, 3 chaves |
| `browsers` | `:736` | `toTopList(..., 8)` (`:612-613`) | até 8 |
| `osList` | `:737` | `toTopList(..., 8)` | até 8 |
| `scrollDepthChart` | `:738` | 4 marcos fixos | 4 fixas |
| `referrerChart` | `:739` | `agg.channelMap` | 1 por canal existente (zero-init inclui `"pago"`, `analyticsShared.ts:271-273`) |
| `topRefHosts` | `:740` | `toTopList(..., 10)` | até 10 |
| `topCampaigns` | `:741` | `toTopList(..., 10)` | até 10 |
| `shareChart` | `:742` | `agg.shareMap` | 1 por plataforma usada |
| `adStats` | `:744` | `:635-649` | **SEM `.slice` — todos os anúncios + blocos `isAd`** |
| `adDailyChart` | `:745` | `:652-670` | 1 por dia da janela, só top-3 `adStats` |
| `adTopNames` | `:746` | `top3AdIds` | até 3 |
| `adHasAnyData` | `:747` | `EXISTS` global (`:491`, `:681`) | escalar |
| `adKpis` | `:748-754` | agregação de `adStats` | fixo, 5 chaves |
| `behaviorStats` | `:756-761` | `:684-710` | `topSearchTerms` até 15, `topLinkDomains` até 10 |

**Achado próprio desta releitura (não estava explícito no inventário/auditoria):**
`adStats` (`:744`, fonte `:645-649`) é o ÚNICO campo de lista do payload sem
NENHUM corte — cresce linearmente com o número de anúncios clássicos ativos/
inativos (`allAds` vem de `db.select().from(adsTable)` sem `WHERE`, `:483-486`)
mais blocos `isAd` das settings (`:624-634`). Hoje, com poucos slots configurados
por blog, isso é inofensivo; ver §3.1 (avaliação de payload) sobre por que isso
não justifica paginação AGORA.

### 2.3 Shape atual de `GET /api/analytics/health`

`analytics.ts:351-363` + `analyticsHealth.ts:43-52`:

```jsonc
{
  "received": 106, "droppedBot": 0, "droppedRate": 0, "droppedInvalid": 0,
  "droppedDuplicate": 0, "flaggedInternal": 104, "flushedOk": 106, "flushFailed": 0,
  "buffered": 0,
  "lastEventAt": "2026-07-23T12:00:00.000Z",
  "lastFlushAt": "2026-07-23T11:59:30.000Z",
  "bootAt": "2026-07-22T08:00:00.000Z",
  "uptimeSeconds": 100800,
  "reliableSince": "2026-07-08",
  "filters": [
    "user-agent de bot/CLI",
    "rate limit 120 eventos/min por IP",
    "pageview duplicado (mesma sessão+página em <15s)",
    "caminhos /admin",
    "tráfego interno marcado (admin logado, dev, IPs configurados, rede privada)"
  ]
}
```

Todos os contadores são em memória, zeram no restart do container (documentado
na própria UI, achado #25 da auditoria — Parcial, fora do escopo de correção
deste PRD).

### 2.4 Shape atual de `GET /api/admin/realtime-stats`

`realtime-stats.ts:95-124` (arquivo completo lido nesta sessão):

```jsonc
{
  "activeArticles": 40, "draftArticles": 5, "totalArticles": 45,
  "totalAds": 3, "activeAds": 2,
  "totalUsers": 2, "activeUsers": 2,
  "topArticleViews":  [ { "id": "...", "title": "...", "views": 10 }, "... até 10" ],
  "topCategoryViews": [ { "category": "esportes", "views": 5 }, "... até 10" ],
  "recentAnalyticsEvents": [ { "type": "pageview", "path": "/...", "title": "...", "sessionId": "...", "device": "mobile", "ts": "..." }, "... até 20" ],
  "rssSourcesCount": 12, "perplexityTopicsCount": 4,
  "serverUptime": 100800.5, "nodeVersion": "v22...", "dbStatus": "ok"
}
```

`topCategoryViews` vem de `categoryViewsTable` (`realtime-stats.ts:46-53`,
`store.trackCategoryView` grava a tabela `category_views`) e é devolvido em
`:104`. **Confirmado nesta sessão** (grep repo-wide em
`artifacts/brasilia-agora/src` por `topCategoryViews` e por `realtime-stats`):
**zero ocorrências** — nenhum componente do client lê este endpoint nem este
campo especificamente. Mesma conclusão do achado #4.9 da auditoria
(`00-auditoria-estado-atual.md:519-521`): "cadeia morta... sem nenhum
consumidor no client".

### 2.5 Shape atual de `GET /api/admin/ads` e `GET /api/admin/ads/block-stats`

`admin.ts:960-976` (`adRowToPublic`) + `:979-1004`:

```jsonc
// GET /api/admin/ads
{ "ads": [ { "id": "...", "name": "...", "imageBase64": "data:...", "imageUrl": null, "link": "https://...", "position": "slot_01", "active": true, "clicks": 0, "impressions": 62, "targetDevices": ["desktop","mobile"], "expiresAt": null, "createdAt": "...", "updatedAt": "..." } ] }

// GET /api/admin/ads/block-stats
{ "stats": { "header-banner": { "impressions": 24, "clicks": 0 }, "hero-block": { "impressions": 5, "clicks": 0 } } }
```

`block-stats` faz `SUM` direto sobre `ad_daily_stats` filtrando `ad_id LIKE
'block:%'` (`admin.ts:989-1004`) — herda a inflação do bug do PRD 04
(`upsertDailyStat` sem UNIQUE, `ads.ts:36-50`) até aquele PRD ser implementado;
este PRD 09 não muda o cálculo, só documenta o shape (inalterado pelo PRD 04 —
ver §2.6).

### 2.6 O que os PRDs 04/05/06/07/08 mudam neste contrato (consolidado)

Fonte: seção "Contrato de API" de cada PRD irmão, relida nesta sessão
(`analytics-audit/04-...md:467-507`, `05-...md:373-394`, `06-...md:327-347`,
`07-...md:393-427`, `08-...md:431-463`).

| PRD | Endpoint tocado | Tipo de mudança | Detalhe |
|---|---|---|---|
| **04** (impressões/cliques) | `POST /ads/:id/impression`, `POST /ads/:id/click` | Aditiva (body opcional novo) | body ganha `{sessionId?, path?, internal?}`; response `{ok:true}` inalterada |
| **04** | `GET /api/analytics/health` | Aditiva | campo novo `adsReliableSince: string \| null` |
| **04** | `GET /api/analytics/stats` | **Sem mudança de shape** — só de VALOR | `adStats`/`adKpis`/`adDailyChart` passam a refletir base reparada (sem duplicação); `GET /api/admin/ads/block-stats` idem, sem mudança de código |
| **05** (fontes de tráfego) | `POST /api/analytics/event` | Aditiva (body opcional novo) | body ganha `gclid?: boolean`, `fbclid?: boolean`; `paidClick` continua aceito (legado) |
| **05** | `GET /api/analytics/stats` | **Shape inalterado** — só VALOR de `referrerChart` | regra nova de classificação + remap do legado |
| **06** (agregações/rollups) | `GET /api/analytics/stats` | Aditiva + semântica | `dayOfWeekChart[]` ganha `occurrences`/`avg`; `topCategories` reordenado (empate por artigos, depois nome); `peakDay` passa a ser por MÉDIA, não soma bruta; `visitors.returning`/`.new` corrigidos (exige pageview não-interno); `scrollDepthChart`/`readCompletions` dedup corrigido |
| **07** (comportamento no site) | `GET /api/analytics/stats` | Aditiva | `behaviorStats` ganha `searchesTotal`, `externalClicksTotal`, `searchTermsDistinct`, `linkDomainsDistinct`; `topSearchTerms`/`topLinkDomains` PERMANECEM truncados em 15/10 (decisão explícita do PRD 07 — ver §3.3 deste PRD) |
| **08** (saúde da coleta) | `GET /api/analytics/health` | Aditiva | ganha `alerts: HealthAlertDto[]` e `alertsSkipped: SkippedRule[]`; repassa `adsReliableSince` (04) e campos do PRD 03 quando presentes |

**Conclusão prática para quem implementar este PRD 09:** se 04–08 já estiverem
implementados (ordem pretendida pelo roadmap: 04,05 → 01,02,03 → 06,07 →
08,09,10), o shape de `/stats` na hora de codificar este PRD JÁ inclui os
campos aditivos acima. Este PRD 09 soma a eles `contractVersion` (§7.6),
`X-Cache` (§7.7) e `topArticlesLimit` (§7.8) — todas aditivas, nenhuma remove
ou renomeia campo existente (exceto `topCategoryViews` do `realtime-stats`,
tratado à parte por não ter consumidor comprovado — §3.4).

### 2.7 Auto-refresh e consumo no client

`Analytics.tsx:200-232`: `fetchStats` busca `/api/analytics/stats?...` e
`/api/analytics/health` **em paralelo** (`Promise.all`, `:212-215`) a cada
chamada; `useEffect` dispara na montagem e depois `setInterval(..., 30_000)`
(`:228-232`) — **sem parar quando a aba fica em background** (nenhum uso de
`document.visibilityState` encontrado nesse trecho). Toda troca de período
(`periodKey`/`customFrom`/`customTo`, deps de `fetchStats`, `:226`) dispara
refetch imediato fora do ciclo de 30s. `exportPDF` (`:234-306`) usa o `stats`
já carregado em memória — não faz requisição nova.

Dois tipos TS client, ambos estruturalmente permissivos (quase todo campo
opcional) — evidência de que campos aditivos NUNCA quebram o client mesmo que
uma aba fique com o bundle JS antigo em cache durante um rollout:
`artifacts/brasilia-agora/src/lib/adminApi.ts:423-444` (`AnalyticsStats`,
usado por `Dashboard.tsx`) e `artifacts/brasilia-agora/src/pages/admin/Analytics.tsx:25-80` (`Stats`/`Health`, usados pela página completa).

## 3. Problema a resolver

Quatro perguntas concretas, sem resposta formal hoje:

1. **Existe um contrato documentado e estável?** Não — o shape de `/stats` só
   existe implícito no código (`analytics.ts:715-762`) e em `docs/ANALYTICS.md`
   (dicionário de MÉTRICAS, não contrato HTTP). Uma sessão futura de
   implementação (deste PRD ou de qualquer outro que toque `/stats`) não tem
   onde conferir "isso é aditivo ou quebra alguém?" sem ler o código inteiro.
2. **Manter o endpoint único `/stats` ou dividir por card?** Nunca foi avaliado
   formalmente. Ver §3.1.
3. **Como evoluir o contrato sem quebrar um admin com JS antigo em cache
   durante o rollout multi-blog?** Não existe hoje nenhum mecanismo de detecção
   de versão — ver §3.2.
4. **Alguma lista da resposta precisa de paginação?** Nunca avaliado — ver §3.3.
5. **`topCategoryViews` do `realtime-stats`: remover ou consumir?** Achado
   #4.9 da auditoria deixou em aberto — ver §3.4.

### 3.1 Avaliação: manter `/stats` monolítico ou dividir por card

| Critério | Dividir (1 endpoint por card, ~15) | Manter monolítico (atual) |
|---|---|---|
| Round-trips HTTP por ciclo de refresh (30s) | ~15–20 requisições autenticadas | 2 (`/stats` + `/health`, `Analytics.tsx:212-215`) |
| Reuso de compute | **Quebrado por padrão**: quase todos os cards (`dailyChart`, `hourlyChart`, `topArticles`, `topCategories`, `devices`, `browsers`, `scrollDepthChart`, `referrerChart`, `shareChart`) vêm do MESMO `agg` computado uma única vez (`buildWindowAggregates`, chamada única em `analytics.ts:503`) a partir do MESMO `dbRows` (`:390-409`). Dividir exigiria: (a) recomputar `agg` em cada handler — pior custo total; ou (b) um cache/estado compartilhado entre handlers — exatamente o que a RF2 deste PRD já propõe para o cenário monolítico, sem o ganho de dividir | reuso automático e grátis — 1 query-fan-out, 1 reduce |
| Export PDF (`Analytics.tsx:234-306`) | precisaria orquestrar N respostas antes de montar o PDF | já usa o objeto `stats` completo, pronto |
| Payload total (medido estruturalmente, não por volume) | menor por request individual | maior por request, mas TODOS os campos são limitados por construção: listas truncadas em 8/10/15, séries temporais limitadas pela janela (≤366 dias) ou fixas (24h, 7 dias). Única exceção sem corte: `adStats` (§2.2), inofensivo hoje (poucos slots por blog) |
| Superfície de contrato a versionar/testar/documentar | 15 contratos independentes | 1 contrato (mais fácil de manter aditivo-only, §3.2) |
| Loading progressivo por card | possível ganho de percepção | hoje é tudo-ou-nada (estado de loading único, `Analytics.tsx:200,220,222` — melhorar isso é território do PRD 10, não deste) |

**Decisão: manter o endpoint único.** O único custo real do modelo monolítico —
recomputar as 12 queries + o reduce em JS a cada poll de 30s, mesmo quando
nada mudou — é resolvido por um cache de curta duração (RF2, §4), que
funciona MELHOR num endpoint único (1 cache-slot cobre todos os cards) do que
dividido (N cache-slots, N invalidações a coordenar). Dividir multiplicaria a
superfície de versionamento (§3.2) por ~15 sem resolver nenhum problema que o
cache já não resolva sozinho.

**Risco de escala não resolvido por este PRD, delegado explicitamente:**
`dbRows` (`analytics.ts:390-409`) faz `SELECT` de TODAS as colunas úteis de
TODOS os eventos `pageview`/`read`/`category`/`scroll`/`share` não-internos da
janela (sem `LIMIT`, sem agregação em SQL) e reduz em JavaScript
(`buildWindowAggregates`). Isso escala com o VOLUME de eventos da janela, não
com o payload de resposta — para janelas de 30–366 dias num blog com tráfego
alto, isso pode virar uma tabela inteira trafegada a cada poll. É um problema
de ARQUITETURA DE AGREGAÇÃO (mover para SQL agregado), não de CONTRATO —
pertence à fronteira do **PRD 06** (`STATUS.md`: "Defeitos de agregação do
`/stats`... → PRD 06"). Este PRD 09 mitiga o SINTOMA operacional (recômputo
redundante a cada 30s) com cache (RF2), sem tentar resolver a causa.

### 3.2 Avaliação: versionamento do contrato para rollout multi-blog

Cada blog roda **um par `api`+`web` sempre da MESMA imagem/tag** (CLAUDE.md §6:
`BLOG_IMAGE_TAG` único por blog, `docker compose up -d` sobe os dois juntos) —
logo, DENTRO de um blog, o backend e o bundle JS nunca ficam em versões
diferentes no MOMENTO do deploy. O risco real de skew é outro, e acontece
mesmo sem multi-blog: **uma aba do navegador aberta ANTES do
`docker compose up -d api web`** mantém o bundle JS antigo em memória
(React não recarrega sozinho) e continua fazendo poll de 30s contra o backend
NOVO depois do deploy, até o usuário recarregar a página manualmente.

Como os dois tipos TS do client são estruturalmente permissivos (§2.7,
campos majoritariamente opcionais), um bundle antigo recebendo campos NOVOS
simplesmente os ignora — não quebra. O risco só existiria se um PRD futuro
**removesse ou renomeasse** um campo que o bundle antigo lê incondicionalmente
(ex.: `totals`, `dailyChart`, `topArticles`, `devices` — os únicos campos
`required` na interface `Stats`, `Analytics.tsx:28,39-40,44-45,48`).

**Decisão:** adotar formalmente uma política "aditivo-only por padrão" e expor
um campo de versão (`contractVersion`) SÓ como sinalização/observabilidade —
não como gate de compatibilidade ativo (o navegador não vai recusar renderizar
por causa dele). Serve para: (a) qualquer PRD futuro que precise de uma
mudança NÃO aditiva documentar o bump nesta seção antes de implementar; (b)
uma futura melhoria de UX no PRD 10 (fora do escopo deste PRD) comparar a
versão recebida com uma constante compilada no bundle e mostrar um aviso
"nova versão disponível, atualize a página" sem quebrar a renderização atual.

### 3.3 Avaliação: paginação

Dos 28 campos do payload (§2.2), SOMENTE `adStats` não tem corte
(`analytics.ts:645-649`, sem `.slice`). Todos os demais já são truncados
(8/10/15) ou são séries de tamanho fixo/limitado pela janela. Decisão por
campo:

- **`adStats` (sem corte hoje):** não paginar neste PRD. Cada blog configura
  tipicamente 1 dígito de slots de anúncio (`ads` table) mais alguns blocos
  `isAd` nas settings — crescimento é administrativo (alguém cadastra um
  anúncio no painel), não orgânico por tráfego. Paginar aqui seria
  over-engineering sem problema real a resolver hoje. Se um blog algum dia
  cadastrar dezenas de anúncios, reavaliar.
- **`topArticles` (truncado em 10, `.slice(0, 10)` fixo):** ÚNICO campo deste
  PRD que ganha paginação (RF4, §4) — é a lista mais suscetível a crescer
  de forma que um admin queira "ver mais" (blog com muitos artigos publicados
  e tráfego distribuído), e é a única tabela do dashboard sem NENHUM parâmetro
  de controle hoje (nem mesmo o corte é configurável). Serve de caso de
  referência para o padrão de paginação aditiva deste módulo.
- **`topSearchTerms`/`topLinkDomains` (behaviorStats, truncados em 15/10):**
  **NÃO tocar** — o PRD 07 já decidiu explicitamente mantê-los truncados e
  resolveu o bug de subcontagem (item 24 da checklist) adicionando totais
  NÃO truncados (`searchesTotal`, `externalClicksTotal`) ao lado, sem
  parametrizar o corte (`analytics-audit/07-...md:396-419`, grep de
  confirmação em `:456-458`: "tops CONTINUAM truncados"). Reabrir essa decisão
  aqui violaria a fronteira do PRD 07.
- **`topCities`/`topRegions`/`browsers`/`osList` (truncados em 8):** não
  paginar — são cards de composição (donut/lista curta), não tabelas de
  detalhe; a UX do dashboard não pede "ver mais" para eles hoje (nenhum botão
  "ver todos" existe no código do card, `Analytics.tsx:655-904`).
- **`dailyChart`/`hourlyChart`/`dayOfWeekChart`:** são séries temporais de
  tamanho determinístico pela janela (não listas top-N) — paginação não se
  aplica ao conceito.

### 3.4 Decisão: `topCategoryViews` do `realtime-stats` — remover

Confirmado nesta sessão (grep repo-wide, §2.4): zero consumidores no client.
Mantê-lo custa uma query (`categoryViewsTable`, `realtime-stats.ts:46-51`) a
cada chamada do endpoint sem nenhum benefício. **Decisão: remover** o campo e
a query associada. Não se remove a tabela `category_views` nem o
`store.trackCategoryView` (caminho de escrita) — isso é infraestrutura que
pode servir a uma feature futura de "categorias mais vistas all-time"; tocar
nisso é decisão de schema/produto fora do escopo de um PRD de contrato de API
(se algum PRD futuro quiser reaproveitar, os dados continuam sendo gravados).
Se um consumidor aparecer antes deste PRD ser implementado, esta decisão deve
ser revisitada (basta reverter a remoção — mudança trivialmente reversível,
ver §13).

## 4. Requisitos funcionais

**RF1 — Campo de versão do contrato.** Adicionar constante
`DASHBOARD_API_CONTRACT_VERSION = 1` em `artifacts/api-server/src/lib/analyticsShared.ts` (função pura, zero import de DB — mesmo padrão de
`ANALYTICS_V2_SINCE`, já na `:21` do mesmo arquivo). Emitir o campo
`contractVersion: DASHBOARD_API_CONTRACT_VERSION` no topo da resposta de
`GET /api/analytics/stats` (`analytics.ts:715`) e de `GET /api/analytics/health`
(`analytics.ts:352`). Política de evolução, registrada nesta tabela (a ser
atualizada por qualquer PRD futuro que quebre um campo existente):

| Versão | Data | Mudança | Aditiva? |
|---|---|---|---|
| 1 | (data da implementação deste PRD) | Baseline — shape descrito em §2.2/§2.3, já incluindo os campos aditivos de PRD 04/05/06/07/08 | — (linha de partida) |

Regra: campo NOVO nunca exige bump. Campo REMOVIDO, RENOMEADO, ou com TIPO/
SEMÂNTICA redefinida sem mudar de nome (ex.: o que o PRD 06 faz com `peakDay`
— muda de "maior soma bruta" para "maior média por ocorrência", mesmo campo,
semântica diferente) **deveria**, pela letra desta regra, exigir bump — mas
como o PRD 06 é implementado ANTES deste PRD 09 (ordem pretendida do
roadmap), a v1 deste PRD já nasce com a semântica corrigida do PRD 06
embutida na baseline, sem precisar de bump retroativo. Esta tabela só
registra bumps a partir da v1 em diante.

**RF2 — Cache de curta duração em `GET /api/analytics/stats`.** Novo arquivo
`artifacts/api-server/src/lib/statsCache.ts` (puro, zero import de DB/Express —
testável isoladamente):

```ts
export interface StatsCacheEntry<T> { key: string; value: T; computedAtMs: number }

export class StatsResponseCache<T> {
  private entry: StatsCacheEntry<T> | null = null;
  constructor(private readonly ttlMs: number) {}

  get(key: string, nowMs: number): T | null {
    if (!this.entry || this.entry.key !== key) return null;
    if (nowMs - this.entry.computedAtMs >= this.ttlMs) return null;
    return this.entry.value;
  }

  set(key: string, value: T, nowMs: number): void {
    this.entry = { key, value, computedAtMs: nowMs };
  }
}

export const STATS_CACHE_TTL_MS = 20_000; // < 30s do auto-refresh do front (Analytics.tsx:230)
```

Design: **cache de 1 único slot** (não um `Map` por chave) — a chave é
`${period.key}:${period.fromDay}:${period.toDay}`. Se dois admins (ou duas
abas) tiverem períodos diferentes abertos ao mesmo tempo, cada poll alterna
a entrada e ambos sempre recomputam (mesmo comportamento de HOJE, sem
regressão — nunca retorna dado errado, só nunca ganha o benefício do cache
nesse cenário específico; ver caso de borda em §11). Em `analytics.ts`:

```ts
const STATS_CACHE = new StatsResponseCache<StatsResponsePayload>(STATS_CACHE_TTL_MS);

router.get("/stats", authMiddleware, requirePermission("analytics.view"), async (req, res) => {
  const now = Date.now();
  const win = resolvePeriod(req.query as ..., now);
  const cacheKey = `${win.key}:${win.fromDay}:${win.toDay}`;
  const cached = STATS_CACHE.get(cacheKey, now);
  if (cached) {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Cache", "HIT");
    res.json(cached);
    return;
  }
  // ... computo atual inalterado (linhas 383-762) ...
  const payload = { contractVersion: DASHBOARD_API_CONTRACT_VERSION, period: ..., /* resto igual */ };
  STATS_CACHE.set(cacheKey, payload, now);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Cache", "MISS");
  res.json(payload);
});
```

Cache é **por processo** (por container = por blog) — nunca cruza blogs
(preserva isolamento §13). Zera no restart (mesmo padrão dos contadores de
`analyticsHealth.ts`, sem persistência — documentado, não é regressão).
Nomenclatura do header `X-Cache: HIT|MISS` reaproveita o padrão JÁ existente
no mesmo módulo (`artifacts/api-server/src/routes/ads.ts:69,102`, cache de
imagem WebP) — consistência interna, não invenção de convenção nova.

**RF3 — Headers HTTP de cache explícitos.** Hoje `GET /api/analytics/stats` e
`GET /api/analytics/health` não setam `Cache-Control` (confirmado: grep por
`Cache-Control` em `analytics.ts` retorna zero ocorrências nesta sessão,
contra o `GET /api/ads` público que já seta `Cache-Control: public,
max-age=10` em `ads.ts:136`). Adicionar `Cache-Control: private, no-store`
explícito nos dois — protege contra qualquer proxy/cache intermediário futuro
(hoje só o Caddy está na frente, CLAUDE.md §3, mas nada impede um cache HTTP
ser adicionado depois) servir um payload de janela ou de blog errado. Não
altera nenhum dado — é só o cabeçalho.

**RF4 — Paginação de `topArticles`.** `GET /api/analytics/stats` passa a
aceitar `?topArticlesLimit=` opcional. Função pura nova em
`analyticsShared.ts`:

```ts
/** Clampa um parâmetro inteiro de query string: ausente/inválido cai no
 *  default, nunca gera erro HTTP — mesmo padrão de resolvePeriod (:177-217). */
export function clampIntParam(raw: unknown, def: number, min: number, max: number): number {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || Number.isNaN(n)) return def;
  return Math.min(max, Math.max(min, n));
}
```

Em `analytics.ts`, na montagem de `topArticles` (`:561-572`):
`.slice(0, clampIntParam(req.query.topArticlesLimit, 10, 1, 50))` no lugar do
`.slice(0, 10)` fixo (`:572`). Default `10` preserva o comportamento atual
byte-a-byte quando o parâmetro não é enviado (nenhum cliente hoje o envia —
mudança 100% aditiva). Teto `50` evita abuso (payload/custo de query
descontrolado).

**RF5 — Remover `topCategoryViews` de `GET /api/admin/realtime-stats`.**
Em `realtime-stats.ts`: remover a query `topCategoryViews`
(`:47-53`, a 5ª entrada do `Promise.all` de `:13-20`), o nome
`topCategoryViews` da desestruturação do `Promise.all` (`:18`) e o campo
`topCategoryViews` da resposta (`:104`). Demais 14 campos do endpoint
permanecem idênticos (o `res.json` de `:95-124` tem 15 chaves; removendo
`topCategoryViews` sobram 14). Não tocar em `categoryViewsTable`/`store.trackCategoryView` (decisão de escopo, §3.4).

**RF6 — Este documento como referência formal do contrato.** As tabelas de
§2.2/§2.3/§2.4/§2.5 e a política de versionamento de §4/RF1 SÃO o contrato
formal a partir deste PRD. Recomenda-se (não bloqueia a implementação) linkar
este arquivo a partir de `docs/ANALYTICS.md` numa atualização futura de
documentação.

**RF7 — Confirmação da decisão de não dividir o endpoint.** Nenhuma mudança
estrutural de rotas além das listadas em RF1–RF5. `GET /api/analytics/stats`
continua sendo o único endpoint agrupado (justificativa em §3.1).

## 5. Requisitos não-funcionais

- **Performance:** RF2 elimina o recômputo das 12 queries + `SELECT` completo
  da janela (`dbRows`, `:390-409`) + `buildWindowAggregates` em polls
  repetidos dentro de `STATS_CACHE_TTL_MS` (20s). Não resolve o custo do
  PRIMEIRO cômputo de cada janela — isso é território do PRD 06 (§3.1). Nenhum
  campo novo aumenta o payload em ordem de grandeza (todos limitados,
  §2.2/§3.3).
- **Confiabilidade:** o handler de `/stats` não tem `try/catch` próprio hoje —
  qualquer exceção cai no `errorHandler` global (`artifacts/api-server/src/app.ts:194-200`, confirmado nesta sessão). RF2 não muda isso: `get`/`set` do
  `StatsResponseCache` são operações síncronas de objeto JS puro (sem I/O,
  sem `try` necessário) — não introduz novo modo de falha. Se o cache HIT
  falhasse por algum motivo hipotético, o pior caso é cair no caminho de MISS
  normal (nunca um 500 novo).
- **Multi-blog:** cache RF2 é 1 instância por processo Node = 1 por container
  = 1 por blog — nunca compartilhado entre blogs (mesma garantia de isolamento
  que já vale para `_buffer` e `analyticsHealth` counters, que também são
  módulo-level em memória). `DASHBOARD_API_CONTRACT_VERSION` é uma constante
  fixa no código-fonte da imagem compartilhada — **idêntica em todos os
  blogs** que rodam a mesma tag (`BLOG_IMAGE_TAG`); durante um rollout
  faseado (canário primeiro), blogs em tags diferentes podem reportar
  `contractVersion` diferente entre si — isso é esperado e inofensivo (não é
  consumido por nenhum outro serviço, só pelo próprio admin daquele blog).
- **LGPD:** nenhum campo novo expõe dado pessoal adicional. `topArticlesLimit`
  não muda QUAIS dados aparecem, só QUANTOS itens de uma lista já pública
  (título/views de artigo) o admin autenticado vê.
- **Retrocompatibilidade:** todas as mudanças de RF1–RF5 (exceto RF5, com
  justificativa própria em §3.4) são estritamente aditivas — nenhum campo
  existente muda de nome, tipo ou desaparece.

## 6. Modelo de dados

**Nenhuma coluna, tabela ou índice novo.** Este PRD é estritamente de
contrato de transporte (HTTP request/response, cache em memória de processo,
parâmetros de query) — não introduz persistência nova. Confirmação esperada
ao implementar (mesmo padrão usado pelos PRDs 06 e 08, que também não tocam
schema):

```powershell
cd "c:\Users\Usuario(a) Master\sp011"
git diff --stat HEAD~1 -- lib/db
# esperado: saída VAZIA (nenhum arquivo de lib/db tocado)
```

Se uma implementação futura decidir persistir o cache ou o contador de
versão em banco (não recomendado por este PRD — o cache é intencionalmente
efêmero, RF2), a coluna nova precisaria seguir o padrão obrigatório do
CLAUDE.md §17: schema Drizzle **E** `artifacts/api-server/src/lib/ensureSchema.ts` (deploy não roda `drizzle-kit push`).

## 7. Contrato de API

### 7.1 `GET /api/analytics/stats?period=today|yesterday|7d|30d|custom&from=&to=&topArticlesLimit=`

- **Auth:** `authMiddleware` + `requirePermission("analytics.view")`
  (`analytics.ts:366`, inalterado).
- **Query params:**
  - `period` (opcional, string): `today`|`yesterday`|`7d`|`30d`|`custom`;
    inválido/ausente → `30d` (`resolvePeriod`, `analyticsShared.ts:181-184`,
    inalterado).
  - `from`/`to` (obrigatórios só se `period=custom`, formato `YYYY-MM-DD`);
    inválidos → cai no default de 30d (`:192-204`, inalterado).
  - `topArticlesLimit` (NOVO, opcional, inteiro): default `10`, clamp
    `[1, 50]`, inválido → default (RF4).
- **Response 200:** shape completo em §2.2, agora com `contractVersion:
  number` como primeiro campo (RF1) e sujeito ao corte parametrizável de
  `topArticles` (RF4). Todos os demais campos inalterados em shape;
  VALORES já refletem as correções de PRD 04/05/06/07 se esses já estiverem
  implementados (§2.6).
- **Headers de resposta:** `Cache-Control: private, no-store` (RF3, NOVO);
  `X-Cache: HIT|MISS` (RF2, NOVO).
- **Erros:** sem auth → `401` (inalterado, `authMiddleware`); sem permissão →
  `403` (inalterado, `requirePermission`); qualquer exceção não tratada →
  `errorHandler` global (`app.ts:194-200`, inalterado).

### 7.2 `GET /api/analytics/health`

- **Auth:** `authMiddleware` (`analytics.ts:351`, inalterado).
- **Query params:** nenhum.
- **Response 200:** shape completo em §2.3, agora com `contractVersion:
  number` (RF1). Ganha (quando PRD 04/08 já implementados) `adsReliableSince`,
  `alerts[]`, `alertsSkipped[]` — campos daqueles PRDs, não deste.
- **Headers:** `Cache-Control: private, no-store` (RF3, NOVO). **Sem cache de
  conteúdo** (RF2 só cobre `/stats` — os contadores de saúde são baratos de
  computar, é leitura direta de objeto em memória, `analyticsHealth.ts:43-52`,
  não justificam cache).

### 7.3 `GET /api/admin/ads`

- **Auth:** `authMiddleware` (herdado de `admin.ts:307`, inalterado).
- **Query params:** nenhum.
- **Response 200:** shape em §2.5, **inalterado por este PRD**. Valores de
  `impressions`/`clicks` refletem a correção do PRD 04 quando implementado
  (contadores all-time da tabela `ads`, já corretos hoje segundo a auditoria —
  achado (i) da auditoria: "Contadores `adsTable.impressions/clicks`
  (all-time) são corretos: +1 por chamada aceita").

### 7.4 `GET /api/admin/ads/block-stats`

- **Auth:** `authMiddleware` (herdado de `admin.ts:307`, inalterado).
- **Response 200:** shape em §2.5, **inalterado por este PRD**. Valores
  passam a refletir a correção do PRD 04 (soma sem duplicação) quando aquele
  PRD estiver implementado — o CÓDIGO deste endpoint (`admin.ts:989-1004`)
  não muda (confirmado pelo próprio PRD 04: "sem mudança de código — a soma
  passa a operar sobre linhas únicas").

### 7.5 `GET /api/admin/realtime-stats`

- **Auth:** `authMiddleware` (`realtime-stats.ts:12`, inalterado).
- **Response 200:** shape em §2.4 **menos** o campo `topCategoryViews`
  (RF5 — removido). 14 campos restantes inalterados (15 chaves no `res.json`
  atual, `realtime-stats.ts:95-124`, menos 1).

### 7.6 Política de versionamento (resumo executável)

- Campo `contractVersion` em `/stats` (§7.1) e `/health` (§7.2), valor
  `DASHBOARD_API_CONTRACT_VERSION` (constante única compartilhada pelos dois
  endpoints).
- Mudança aditiva (campo novo) → **não** bump.
- Mudança não-aditiva (campo removido/renomeado/retipado, ou semântica de um
  campo existente redefinida) → **bump obrigatório** + nova linha na tabela
  de RF1 (§4) antes do commit.
- `topCategoryViews` (RF5) é uma remoção que **não** passa pelo mecanismo de
  versão porque `realtime-stats` está fora do escopo do campo
  `contractVersion` (decisão explícita, justificada por: endpoint de baixo
  consumo, shape simples, e a remoção só foi aceita por prova concreta de
  zero consumidores — §3.4). Qualquer mudança não-aditiva FUTURA nos
  endpoints de §7.3/§7.4/§7.5 deve repetir esse mesmo padrão (prova de
  ausência de consumidor via grep) ou, se o endpoint crescer em
  complexidade/consumo, ser trazido para dentro do mecanismo de
  `contractVersion`.

### 7.7 Cache — comportamento observável

- `X-Cache: MISS` na primeira chamada para uma janela (`period`+`from`+`to`)
  ainda não computada ou expirada.
- `X-Cache: HIT` em chamadas subsequentes para a MESMA janela dentro de
  `STATS_CACHE_TTL_MS` (20s).
- Trocar de janela (período diferente) sempre gera `MISS` (cache de 1 slot,
  RF2).
- `Cache-Control: private, no-store` em ambas as situações — o cache é
  server-side (aplicação), nunca do navegador/proxy.

### 7.8 Paginação — assinatura

- `topArticlesLimit` (inteiro, `1..50`, default `10`) em `GET /api/analytics/
  stats`. Nenhum outro parâmetro de paginação introduzido (justificativa em
  §3.3).

---

## 8. Comandos de verificação (rodar exatamente estes, com resultado esperado)

### 8.1 Local (Windows, antes do commit — CLAUDE.md §14)

```powershell
cd "c:\Users\Usuario(a) Master\sp011\lib\db"
pnpm exec tsc -b
# esperado: compila sem erro (nenhuma mudança de schema — confirma §6)
```

```powershell
cd "c:\Users\Usuario(a) Master\sp011\artifacts\api-server"
pnpm run typecheck
# esperado: sem erros
node --test "test/**/*.test.ts"
# esperado: TODOS os testes passam, incluindo os novos test/statsCache.test.ts
# e os casos novos de clampIntParam em test/analyticsShared.validate.test.ts (§12)
```

```powershell
cd "c:\Users\Usuario(a) Master\sp011"
git diff --stat HEAD~1 -- lib/db
# esperado: VAZIO (§6 — nenhum schema novo)

git grep -n "DASHBOARD_API_CONTRACT_VERSION" -- artifacts/api-server/src
# esperado: >=3 (definição em analyticsShared.ts + uso em GET /stats + uso em GET /health)

git grep -n "private, no-store" -- artifacts/api-server/src/routes/analytics.ts
# esperado: >=2 (um em /stats, um em /health)

git grep -n "X-Cache" -- artifacts/api-server/src/routes/analytics.ts
# esperado: >=2 (HIT e MISS)

git grep -n "topArticlesLimit" -- artifacts/api-server/src
# esperado: >=1

git grep -n "topCategoryViews" -- artifacts/api-server/src/routes/realtime-stats.ts
# esperado: NENHUM resultado (campo removido — RF5)

git grep -n "topCategoryViews" -- artifacts/brasilia-agora/src
# esperado: NENHUM resultado (confirma, de novo, que não havia consumidor —
# se este comando encontrar algo, a RF5 NÃO deve ser implementada como está;
# reavaliar §3.4 antes de prosseguir)

git grep -n "StatsResponseCache" -- artifacts/api-server/src
# esperado: >=2 (definição em lib/statsCache.ts + uso em routes/analytics.ts)
```

### 8.2 VPS — rollout multi-blog (CLAUDE.md §6: bump + build + sp011 + canário + demais)

```bash
# 1) Bump da imagem + sp011
cd /opt/sp011
git pull
V=$(grep -m1 '^BLOG_IMAGE_VERSION=' .env | cut -d= -f2); N="v$((${V#v}+1))"
sed -i "s|^BLOG_IMAGE_VERSION=.*|BLOG_IMAGE_VERSION=$N|" .env
grep '^BLOG_IMAGE_VERSION=' .env
docker compose build api web
docker compose up -d api web
```

```bash
# 2) Canário (resenhavip) — confirmar contrato novo ANTES de seguir
# TOKEN = admin_token de um login no painel do resenhavip
TOKEN='COLE_AQUI'
N=$(grep -m1 '^BLOG_IMAGE_VERSION=' /opt/sp011/.env | cut -d= -f2)
cd /opt/blogs/resenhavip
sed -i "s|^BLOG_IMAGE_TAG=.*|BLOG_IMAGE_TAG=$N|" .env
docker compose up -d
curl -s https://resenhavip.midia.run/api/site | grep -o '"siteName":"[^"]*"'
# esperado: "siteName":"Resenha VIP" (sem mistura de blog)

curl -s -H "Authorization: Bearer $TOKEN" "https://resenhavip.midia.run/api/analytics/stats?period=7d" | jq '{contractVersion, topArticlesCount: (.topArticles | length)}'
# esperado: {"contractVersion": 1, "topArticlesCount": <=10}

curl -s -D - -o /dev/null -H "Authorization: Bearer $TOKEN" "https://resenhavip.midia.run/api/analytics/stats?period=7d" | grep -i "cache-control\|x-cache"
# esperado (1a chamada após deploy, ou após 20s de silêncio): x-cache: MISS
curl -s -D - -o /dev/null -H "Authorization: Bearer $TOKEN" "https://resenhavip.midia.run/api/analytics/stats?period=7d" | grep -i "x-cache"
# esperado (chamada imediatamente seguinte, <20s depois): x-cache: HIT

curl -s -H "Authorization: Bearer $TOKEN" "https://resenhavip.midia.run/api/analytics/stats?period=7d&topArticlesLimit=3" | jq '.topArticles | length'
# esperado: <=3

curl -s -H "Authorization: Bearer $TOKEN" "https://resenhavip.midia.run/api/analytics/health" | jq 'has("contractVersion")'
# esperado: true

curl -s -H "Authorization: Bearer $TOKEN" "https://resenhavip.midia.run/api/admin/realtime-stats" | jq 'has("topCategoryViews")'
# esperado: false
```

```bash
# 3) Demais blogs (pula os que ainda não existem)
N=$(grep -m1 '^BLOG_IMAGE_VERSION=' /opt/sp011/.env | cut -d= -f2)
for b in ksports esporteagora oleysports beeesportes pontofarma creditovc; do
  [ -d "/opt/blogs/$b" ] || continue
  cd "/opt/blogs/$b"
  sed -i "s|^BLOG_IMAGE_TAG=.*|BLOG_IMAGE_TAG=$N|" .env
  docker compose up -d
done
cd /opt/sp011
for d in ksports.bebee.me esporteagora.midia.run resenhavip.midia.run oleysports.midia.run beeesportes.midia.run; do
  curl -s "https://$d/api/site" | grep -o '"siteName":"[^"]*"'
done
# esperado: cada domínio devolve o próprio nome (sem mistura — diagnóstico padrão §6)
```

### 8.3 Revalidação dos cards do dashboard após o rollout (por blog)

Todos os cards de `Analytics.tsx` são alimentados por `/stats`+`/health`
(§2.7) — nenhum muda visualmente por este PRD (mudanças são só de headers,
campo de versão e paginação opcional). Checklist mínima por blog atualizado
(abrir `/admin` logado, aba Analytics):

1. Os 5 KPIs (views hoje/7d, visitantes, sessões, tempo médio, rejeição)
   continuam renderizando os mesmos números de antes do deploy (nenhuma
   mudança de valor esperada — este PRD não toca cálculo).
2. Gráfico "Tráfego ao longo do tempo", Fontes de Tráfego, Dispositivos/
   Navegadores/SO, Artigos top (conferir que a tabela ainda mostra até 10 por
   padrão), Categorias, Localização, Pico por hora/dia, Profundidade de
   leitura, Propagandas (resumo/detalhado/gráfico), Termos buscados/Links
   externos/Resumo de interações, Saúde da coleta — todos renderizam sem
   erro no console do navegador (nenhum campo removido do shape que algum
   componente leia incondicionalmente).
3. `Dashboard.tsx` → card "Propagandas" (via `getAds`) e card "Top
   categorias" (via `getAnalyticsStats()` sem period) continuam populados.
4. `AdsManager.tsx` → stat cards all-time e tabela de blocos continuam
   populados (via `getAds`/`getAdBlockStats`).
5. Auto-refresh de 30s continua funcionando (observar `lastUpdated`/spinner
   de "atualizando" no canto do dashboard, `Analytics.tsx` — sem crash após
   múltiplos ciclos).
6. Nenhum erro 401/403/500 novo no Network tab do navegador ao trocar de
   período (today/7d/30d/custom).

### 8.4 SQL de sanidade — **pendente de execução** (MCP Supabase não conectado)

Este PRD não introduz nenhuma regra nova de consistência de DADO (isso é
território do PRD 11) — não há SQL de correção a validar. O único item
observacional relevante é o tamanho real do payload em produção, útil para
confirmar a avaliação de §3.1 (payload cresce por composição, não
descontroladamente):

```bash
# Tamanho do payload de /stats em produção, por blog (medição, não SELECT —
# mas depende de acesso à VPS, por isso marcado pendente de execução).
TOKEN='COLE_AQUI'
curl -s -o /dev/null -w '%{size_download} bytes\n' -H "Authorization: Bearer $TOKEN" "https://resenhavip.midia.run/api/analytics/stats?period=30d"
# esperado (referência, não trava o PRD): abaixo de 200 KB mesmo em blogs com
# tráfego consolidado — se algum blog exceder isso de forma consistente,
# reavaliar §3.1 (candidato a paginar adStats)
```

---

## 9. Critérios de aceite

Cada item é verificável por um comando de §8 ou por observação objetiva —
nenhum depende de "parece certo".

1. **AC1 (RF1):** `GET /api/analytics/stats` e `GET /api/analytics/health`
   respondem com `contractVersion` inteiro `>= 1`.
   → comando: `curl ... | jq '.contractVersion'` (§8.2), `git grep` (§8.1).
2. **AC2 (RF3):** ambos os endpoints respondem com header
   `Cache-Control: private, no-store`.
   → comando: `curl -D -` + `grep -i cache-control` (§8.2).
3. **AC3 (RF2):** duas chamadas consecutivas (<20s de intervalo) para
   `GET /api/analytics/stats` com a MESMA `period`/`from`/`to` retornam
   `X-Cache: MISS` na primeira e `X-Cache: HIT` na segunda em diante.
   → comando: dois `curl -D -` sequenciais (§8.2).
4. **AC4 (RF2):** trocar de `period` invalida o cache (nova chamada com
   janela diferente sempre é `MISS`, nunca serve o payload da janela
   anterior).
   → observação objetiva: comparar `period.key`/`period.from`/`period.to` do
   corpo da resposta com o `period` requisitado — devem sempre coincidir
   com o que foi pedido, mesmo em `HIT` (nenhuma resposta cross-window).
5. **AC5 (RF4):** `?topArticlesLimit=3` retorna `topArticles.length <= 3`;
   `?topArticlesLimit=abc` (inválido) e ausência do parâmetro retornam
   `topArticles.length <= 10` (default); `?topArticlesLimit=999` retorna
   `topArticles.length <= 50` (teto).
   → comando: 3 chamadas `curl ... | jq '.topArticles | length'` (§8.2 dá o
   caso central; os demais seguem o mesmo padrão).
6. **AC6 (RF5):** `GET /api/admin/realtime-stats` não contém a chave
   `topCategoryViews`; as demais 14 chaves continuam presentes (o `res.json`
   de `realtime-stats.ts:95-124` tem 15 chaves hoje; após a remoção, 14).
   → comando: `jq 'has("topCategoryViews")'` → `false` (§8.2); `jq 'keys | length'`
   → `14`; `jq 'keys'` → compara com a lista de §2.4 menos `topCategoryViews`.
7. **AC7 (§2.6/retrocompat):** nenhum campo pré-existente listado na tabela
   de §2.2 foi removido, renomeado ou mudou de tipo.
   → observação objetiva: `jq 'keys'` da resposta de produção contém todas
   as chaves da tabela de §2.2 (mais `contractVersion`).
8. **AC8:** suíte `node --test` do api-server passa 100% localmente.
   → comando exato de §8.1.
9. **AC9:** rollout validado nos domínios de todos os blogs ativos via
   `curl .../api/site` (sem mistura de blog).
   → comando de §8.2 (item 3).
10. **AC10 (§6):** nenhuma migração de schema — `git diff --stat -- lib/db`
    vazio.
    → comando de §8.1.
11. **AC11 (pendente de execução — depende de acesso à VPS):** tamanho do
    payload de `/stats` em produção medido e registrado (referência de
    §3.1/§8.4), sem exigir um teto específico para aprovação — é
    observacional, não bloqueante.
    → comando de §8.4, marcado **pendente de execução**.

## 10. Invariantes do CLAUDE.md §17 preservadas por este PRD

1. **Heartbeat cumulativo agregado por MAX** — não tocado; RF2 cacheia a
   RESPOSTA já computada pelo pipeline existente (`buildWindowAggregates`,
   `analyticsShared.ts:319-327`, inalterado), nunca reimplementa a lógica de
   agregação.
2. **Tráfego interno marcado `is_internal`, nunca dropado** — não tocado;
   nenhuma query nova é introduzida por este PRD (RF5 REMOVE uma query
   existente de `realtime-stats`, não adiciona).
3. **`totals.*` fixos ao agora** — preservado com uma ressalva documentada
   explicitamente: o cache (RF2) introduz até `STATS_CACHE_TTL_MS` (20s) de
   atraso entre o "agora" real e o "agora" congelado na última resposta
   cacheada. Isso é a MESMA ordem de grandeza de staleness que o pipeline já
   tem hoje (buffer de eventos flusha a cada 30s, `analytics.ts:120`,
   confirmado pelo inventário §4) — não é uma regressão nova, é um atraso
   adicional pequeno e documentado, nunca uma janela errada (o valor cacheado
   sempre foi calculado com `now = Date.now()` do momento do cômputo original,
   nunca com um `now` de uma janela diferente da pedida — AC4 garante isso).
4. **Canal classificado no servidor** — não tocado; `referrerChart` não muda
   de shape nem de lógica por este PRD.
5. **Migrações de coluna via Drizzle schema E `ensureSchema.ts`** — N/A,
   nenhuma coluna nova (§6).
6. **Colunas novas se autocriam no boot** — N/A, idem.
7. **Isolamento entre blogs / nunca hardcodar por blog na imagem** — RF2
   (cache por processo) e RF1 (`contractVersion` como constante fixa no
   código-fonte, idêntica em todos os blogs que rodam a mesma tag) preservam
   isso por construção — nenhum branch condicionado a `BLOG_ID`.
8. **SSR/perf — HTML com `no-cache`, nunca `no-store`** — este PRD mexe em
   endpoints JSON de API autenticados (não em HTML servido ao público), então
   a regra "nunca `no-store` no HTML" não se aplica aqui; ao contrário, para
   JSON autenticado de dashboard, `no-store` é o comportamento CORRETO (RF3)
   — não há bfcache a proteger numa resposta `fetch()` autenticada que nunca
   é renderizada como página. Citado aqui só para deixar explícito que a
   direção oposta da regra de HTML foi considerada e é intencional, não um
   descuido.

## 11. Casos de borda

1. **Meia-noite BRT (fronteira do dia) durante a janela de cache para
   `period=today`:** o valor de `totals.today` cacheado pode ficar até 20s
   "atrasado" em relação ao novo dia — o próximo MISS (após o TTL) já reflete
   o dia correto. Aceito (mesma ordem de grandeza do buffer de 30s já
   existente, ver Invariante 3 em §10).
2. **Dois admins/abas com períodos diferentes simultaneamente:** o cache de
   1 slot alterna entre as duas janelas a cada request, sempre em MISS para
   ambas (nunca serve o payload errado — cada resposta é computada com a
   `period` efetivamente pedida). Sem ganho de performance nesse cenário
   específico, mas sem incorreção (documentado em RF2).
3. **`topArticlesLimit` malformado:** string vazia, não-numérica, negativa,
   zero, decimal (`3.7`), ou maior que 50 — todos caem no `clampIntParam`
   (RF4): não-numérica/ausente → default `10`; negativa/zero → clampada ao
   mínimo `1`; acima de 50 → clampada a `50`; decimal → `Number.parseInt`
   trunca (`3.7` → `3`, dentro do range, aceito). Nunca gera `400`/`500`
   (mesmo padrão de `resolvePeriod`, `analyticsShared.ts:172-175`: "entrada
   inválida NUNCA erra").
4. **Cache HIT precisa ser idêntico ao que seria computado no mesmo instante
   — nunca mistura dados de blogs diferentes:** garantido por construção
   (1 processo Node = 1 container = 1 blog = 1 instância de
   `StatsResponseCache`); não há superfície de código onde uma chave de
   cache poderia colidir entre blogs (não existe `blogId` no app, CLAUDE.md
   §13, e o cache não seria compartilhado mesmo que existisse).
5. **Restart do container durante o rollout (deploy):** zera o cache
   (memória) — próxima chamada é sempre MISS. Mesmo comportamento já
   documentado para `analyticsHealth.ts` counters e `_buffer`. Não é uma
   janela de inconsistência nova.
6. **`topCategoryViews` reaparece como necessário antes deste PRD ser
   implementado:** reverter RF5 é aditivo e seguro (re-adicionar um campo
   nunca quebra nada) — ver §13.
7. **Um blog roda uma tag de imagem MAIS ANTIGA que não tem
   `contractVersion`, enquanto outro (canário) já tem:** ambos continuam
   funcionando de forma totalmente independente — não há comunicação entre
   blogs nem um serviço central lendo `contractVersion` de múltiplos blogs
   ao mesmo tempo hoje. Não é um caso de quebra, é a operação normal de um
   rollout faseado (§6 do CLAUDE.md já prevê essa janela).
8. **Header `X-Cache` em uma resposta de erro (401/403):** RF2/RF3 só setam
   os headers no caminho de sucesso (`res.json(...)`) — respostas de erro dos
   middlewares (`authMiddleware`/`requirePermission`) continuam com o shape
   de erro atual, inalterado, sem os headers novos (não fazem parte do
   payload de dado, então sua ausência em erro é aceitável e não testada por
   este PRD).

## 12. Plano de testes (`node --test`, CLAUDE.md §14)

Sem `vitest`, sem `supertest` no repo (confirmado: `package.json` do
api-server não lista `supertest` nem equivalente; os testes existentes
(`test/*.test.ts`) testam exclusivamente FUNÇÕES PURAS extraídas de
`analyticsShared.ts`/`analyticsHealth.ts`, nunca o Express app inteiro via
HTTP real). Este PRD segue o MESMO padrão: extrai a lógica nova para
funções/classes puras testáveis sem DB/Express, e valida a fiação nas rotas
via `git grep` estrutural (§8.1) + `curl` real na VPS (§8.2) — não via um
novo harness de teste HTTP.

1. **`artifacts/api-server/test/statsCache.test.ts` (NOVO)** — testa
   `StatsResponseCache` isoladamente, com relógio fake passado como
   parâmetro (sem `setTimeout` real, execução instantânea):
   - `get()` antes de qualquer `set()` → `null`.
   - `set(key, value, t0)` seguido de `get(key, t0 + ttl - 1)` → retorna
     `value`.
   - `set(key, value, t0)` seguido de `get(key, t0 + ttl)` (exatamente no
     limite) → `null` (TTL expirado, `>=` na comparação).
   - `set(keyA, valueA, t0)` seguido de `get(keyB, t0)` (chave diferente) →
     `null` (nunca vaza dado de outra janela).
   - `set` duas vezes com chaves diferentes → o `get` da PRIMEIRA chave após
     o segundo `set` retorna `null` (cache de 1 slot é sobrescrito, RF2 —
     confirma o caso de borda #2 de §11).
2. **`artifacts/api-server/test/analyticsShared.validate.test.ts` (adicionar
   casos)** — testa `clampIntParam`:
   - ausente (`undefined`) → default.
   - string não-numérica (`"abc"`) → default.
   - negativo (`"-5"`) → mínimo.
   - zero (`"0"`) → mínimo (assumindo `min=1`).
   - decimal (`"3.7"`) → `3` (trunca, dentro do range).
   - acima do máximo (`"999"`) → máximo.
   - válido dentro do range (`"25"`) → `25`.
3. **Regressão completa:** `node --test "test/**/*.test.ts"` — suíte inteira
   do api-server passa, confirmando que a extração de `clampIntParam` e a
   adição de `StatsResponseCache`/`DASHBOARD_API_CONTRACT_VERSION` não
   quebrou nenhum teste existente (`analyticsShared.aggregate/channel/
   period/ua/validate.test.ts` e os demais listados em §14 do repo).
4. **Verificação estrutural (grep, não `node --test`):** comandos de §8.1
   confirmam que os campos/headers novos estão de fato conectados nas rotas
   (a lógica pura sozinha não garante que o handler a usa).

## 13. Plano de rollback

Nenhuma migração de banco (§6) — rollback é puramente reversão de código +
redeploy da imagem, sem passo de banco a desfazer:

1. `git revert <sha-do-commit-deste-prd>` — reverte RF1–RF5 de uma vez (o
   commit deste PRD deve tocar só `artifacts/api-server/src/lib/analyticsShared.ts`, `statsCache.ts` (novo), `routes/analytics.ts`,
   `routes/realtime-stats.ts` e os arquivos de teste — sem tocar `lib/db`
   nem `artifacts/brasilia-agora`, confirmável com `git show --stat HEAD`,
   mesmo padrão de verificação usado pelo PRD 06).
2. Rebuild + redeploy: mesmo bloco de §8.2 (bump de versão, canário,
   demais blogs).
3. **Mitigação cirúrgica, sem revert completo, se só o cache (RF2) for
   suspeito** (ex.: um admin reporta ver dado "preso" por alguns segundos
   após editar algo que deveria refletir no dashboard na hora): reduzir
   `STATS_CACHE_TTL_MS` para `0` no código (efetivamente desliga o cache,
   todo request vira `MISS`) e redeployar — mudança de 1 linha, mais rápida
   que um revert completo, preserva RF1/RF3/RF4/RF5.
4. **Mitigação cirúrgica se só `topArticlesLimit` (RF4) for suspeito:** o
   parâmetro é opcional e aditivo — não requer rollback de código; se o
   FRONT (fora do escopo deste PRD) começar a enviá-lo de forma problemática,
   basta o front parar de enviar (o backend já ignora ausência com o mesmo
   default de sempre).
5. **Se `topCategoryViews` (RF5) precisar voltar:** reintroduzir o campo é
   aditivo e seguro — não precisa de revert, só de um novo commit
   readicionando a query e o campo (a tabela `category_views` nunca foi
   tocada, os dados continuam lá).
6. Nenhum dado em `ad_daily_stats`, `analytics_events` ou qualquer tabela é
   escrito ou apagado por este PRD — rollback nunca perde dado histórico.

## 14. Riscos e dependências de outros PRDs (fronteiras do STATUS.md)

- **Dependência de ordem de implementação:** este PRD assume, na tabela de
  §2.6, que os PRDs 04, 05, 06, 07 e 08 já estão implementados quando PRD 09
  for codificado — essa é a ordem pretendida pelo roadmap do plano-mãe
  (`PRD_ANALYTICS_PLANEJAMENTO_v2.md`: "08/09/10 depois" de "04 e 05
  primeiro" e "06/07 quando a base estiver limpa"). **Risco:** se a ordem
  real de implementação divergir (ex.: PRD 09 implementado antes do PRD 07),
  a tabela de §2.6 e o shape "ANTES/DEPOIS" citado precisam ser reconferidos
  no código real antes de codificar `contractVersion` = 1 como baseline —
  a v1 deve refletir o shape REALMENTE em produção no momento da
  implementação, não o hipotético descrito aqui.
- **PRD 01** (fronteira, `STATUS.md`): define o padrão canônico de migração
  Drizzle+`ensureSchema` para qualquer coluna nova. Este PRD não usa esse
  padrão (§6, sem coluna nova) — citado só para o caso hipotético de uma
  implementação futura decidir persistir cache/versão em banco (não
  recomendado por este PRD).
- **PRD 04** (fronteira): dono da correção de dado de `adStats`/`adKpis`/
  `adDailyChart`/`block-stats` — este PRD 09 só documenta que o SHAPE não
  muda (§2.6), nunca reimplementa a correção de valor.
- **PRD 05** (fronteira): dono da correção de `referrerChart` — idem, só
  shape documentado, valor é território do 05.
- **PRD 06** (fronteira, `STATUS.md`: "Defeitos de agregação do `/stats`...
  → PRD 06"): dono da correção de `dayOfWeekChart`/`peakDay`/`visitors.
  returning`/`topCategories` (ordenação) e da arquitetura de agregação em
  si (`dbRows` sem `LIMIT`, §3.1) — este PRD 09 explicitamente NÃO tenta
  resolver o risco de escala de `dbRows`, só mitiga o sintoma operacional do
  recômputo repetido a cada poll (RF2).
- **PRD 07** (fronteira, `STATUS.md`: "totais NÃO truncados de comportamento
  servidos pelo backend... → PRD 07"): dono de `behaviorStats`. Este PRD 09
  respeita explicitamente a decisão do PRD 07 de manter `topSearchTerms`/
  `topLinkDomains` truncados sem parametrização (§3.3) — não reabre essa
  decisão.
- **PRD 08** (fronteira): dono de `alerts[]`/`alertsSkipped[]` em
  `GET /health`. Ambos os PRDs (08 e 09) adicionam campos ADITIVOS
  independentes ao mesmo objeto de resposta — não há conflito de shape
  independente da ordem relativa entre eles (ao contrário da dependência com
  04/05/06/07, que PRECISAM vir antes para a tabela de §2.6 estar correta,
  08 e 09 podem, tecnicamente, ser implementados em qualquer ordem entre si
  sem quebrar um ao outro — mas o roadmap os coloca lado a lado por
  proximidade temática, não por dependência técnica).
- **PRD 10** (frontend, fora do escopo deste PRD): consumidor FUTURO de
  `contractVersion` (banner "nova versão disponível") e de `topArticlesLimit`
  (UI "ver mais" na tabela de artigos). Até o PRD 10 rodar, os dois campos
  ficam sem uso visível na UI — mesmo padrão já usado por PRD 06/07 para seus
  próprios campos aditivos ("o front atual ignora campos extras").
- **PRD 11** (contínuo, fora do escopo deste PRD): nenhuma regra de
  consistência cross-metric é definida ou verificada por este PRD — as
  regras de PRD 11 continuam se aplicando aos VALORES retornados pelos
  endpoints aqui documentados, independentemente do trabalho de contrato
  feito aqui.
- **Risco de escopo:** este PRD é estritamente de CONTRATO/TRANSPORTE — se
  uma implementação futura for tentada a "aproveitar e já corrigir" um bug de
  valor (ex.: a ordenação de `topCategories`) dentro do commit deste PRD 09,
  isso violaria a fronteira com o PRD 06 e misturaria responsabilidades num
  único commit, dificultando rollback seletivo (§13). Não fazer.

## 15. Estimativa de esforço

**M (médio).** Justificativa: nenhuma migração de schema, nenhuma correção de
dado (P seria justificável só para isso), mas o escopo cobre 5 endpoints
documentados/tocados, 1 módulo novo (`statsCache.ts`) com testes dedicados,
1 função pura nova (`clampIntParam`) com testes, wiring em 2 arquivos de
rota (`analytics.ts`, `realtime-stats.ts`), e o bloco de rollout completo
(§8.2/§8.3) precisa ser executado/validado em todos os 6+ blogs ativos da
rede — volume de verificação maior que um PRD estritamente de correção
pontual (G ficaria reservado para PRDs que tocam schema+múltiplos arquivos
de pipeline, como o 01 ou o 04).
