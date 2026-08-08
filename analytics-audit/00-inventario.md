# 00 — Inventário do sistema de analytics (Fase 0.1)

> **Regra deste documento (ajuste 1):** registro NEUTRO — apenas o que existe/não
> existe e onde (`arquivo:linha`). Nenhuma afirmação de causa, correção ou defeito;
> análise fica em `00-auditoria-estado-atual.md` (Fase 0.2).
> **Origem:** 3 varreduras de exploração (server, client+admin, schema+docs) na sessão
> de 2026-07-22; os trechos marcados ⭐ foram reconferidos abrindo o arquivo real nesta
> mesma sessão. **Ajuste 2:** a Fase 0.2 reconfere TODAS as referências de linha nos
> arquivos reais antes de usá-las em análise.
> Caminhos relativos à raiz do repo. Encurtamentos usados: `api = artifacts/api-server/src`,
> `web = artifacts/brasilia-agora/src`, `db = lib/db/src`.

---

## 1. Árvore dos diretórios relevantes (limitada a analytics/tracking/anúncios/dashboard)

### `artifacts/api-server`
```
src/routes/analytics.ts        ingest /event e /behavior + GET /stats e /health
src/routes/ads.ts              GET /api/ads (lista pública) + POST impression/click
src/routes/realtime-stats.ts   GET /api/admin/realtime-stats
src/routes/index.ts            montagem: /ads (:43), /analytics (:51), /admin/realtime-stats (:59)
src/lib/analyticsShared.ts     lógica pura: tipos, validação, UA, canal, período, agregação
src/lib/analyticsHealth.ts     contadores de saúde da coleta (em memória)
src/lib/trafficGuard.ts        BOT_RE, isBotRequest, isRecentDuplicate, overRateLimit
src/lib/ensureSchema.ts        statements idempotentes de coluna/índice no boot
src/lib/store.ts               contadores all-time (trackArticleView/trackCategoryView) — não lido linha a linha
src/lib/dataRetention.ts       retenção de dados (correlato; não lido linha a linha)
test/analyticsShared.channel.test.ts    classifyChannel/normalizeLegacyChannel
test/analyticsShared.aggregate.test.ts  buildWindowAggregates (read MAX, scroll, canais…)
test/analyticsShared.period.test.ts     resolvePeriod/brtDayKey (fuso BRT)
test/analyticsShared.ua.test.ts         parseUa/detectDevice/isBotRequest
test/analyticsShared.validate.test.ts   cleanStr/IPs/isRecentDuplicate/whitelists
```
Observação de escopo: `src/routes/ingest.ts` NÃO é analytics — é o receptor de notícias
do painel central (HMAC).

### `artifacts/brasilia-agora`
```
src/hooks/useAnalytics.ts           SDK de tracking (sessão, consentimento, envio, eventos)
src/lib/analyticsClient.ts          lógica pura client (parseUtm, refHostOf, scroll, dwell)
src/lib/analyticsClient.test.ts     testes da lógica pura client
src/components/ads/useAds.ts        fetch de anúncios + trackImpression/trackClick + useAdImpression
src/components/ads/AdSlot.tsx       slot com refs de impressão (:22) e clique (:30)
src/components/ads/AdBanner.tsx     carrossel; observa items[index]?.id (:73); clique (:114)
src/components/ads/AdSidebar.tsx    impressão (:24), clique (:33)
src/components/ads/AdInFeed.tsx     impressão (:29), clique (:37); Placeholder interno (:8-23) sem tracking
src/components/ads/AdCentral.tsx    impressão (:7), clique (:27)
src/components/ads/AdSlotBand.tsx   wrapper (renderiza AdBanner; sem tracking próprio)
src/components/ads/AdBetween.tsx    wrapper sem tracking próprio
src/components/ads/AdInContent.tsx  wrapper sem tracking próprio
src/components/ads/AdNative.tsx     placeholder estático; sem id/ref/tracking
src/components/ads/AdStickyBottom.tsx placeholder fixo (3s, :6-8); sem tracking
src/components/LGPDConsent.tsx      banner de consentimento (bee_analytics_consent) — não lido linha a linha
src/pages/admin/Analytics.tsx       dashboard de Analytics (todos os cards)
src/pages/admin/AdsManager.tsx      gestão de anúncios + stat cards all-time
src/pages/admin/Dashboard.tsx       card "Propagandas" all-time (:374-403)
src/pages/admin/HomeBlocksManager.tsx  prévia da home/notícia em iframe (:3013-3014)
src/lib/adminApi.ts                 getAds (:82), getAdBlockStats (:84), getSettings (:75)…
Pontos de instrumentação em páginas/componentes: App.tsx (:165-168, :357),
Artigo.tsx (:131, :139-151, :155-157, :281-285, :408-413), Header.tsx (:296-298, :362, :374),
Footer.tsx (:68-72), HomeCustomBlocks.tsx (:94/:147, :139, :244/:253, :257, :370-374, :478-482),
CategoryArchivePage.tsx (:21, :26), Home.tsx (:523, :755-756, :884-888, :1028),
PortalZoneBlocks.tsx (:762-765)
```

### `lib/db`
```
src/schema/analytics.ts        tabela analytics_events + enums
src/schema/behavior_events.ts  tabela behavior_events
src/schema/ads.ts              tabela ads + enum ad_position + helpers
src/schema/ad_daily_stats.ts   tabela ad_daily_stats
src/schema/article_views.ts    tabela article_views (all-time por artigo)
src/schema/category_views.ts   tabela category_views (all-time por categoria)
src/schema/geo_stats.ts        tabela geo_stats
src/schema/ingest_nonces.ts    anti-replay do ingest da central (correlato)
src/schema/push_subscriptions.ts  push (correlato)
src/schema/index.ts            agregador (export *)
```

### Documentação existente
- `docs/ANALYTICS.md` — pipeline navegador→banco→painel, dicionário de métricas
  (evento fonte · cálculo · filtros · janela · fuso · dedup), regras de exclusão,
  LGPD, 8 limitações admitidas, testes. Rodada 2 aplicada em 2026-07-08
  (`ANALYTICS_V2_SINCE`, `api/lib/analyticsShared.ts:21`).
- `docs/ANALYTICS-VALIDACAO.md` — roteiro manual com 11 cenários-oráculo.
- Histórico na raiz (pré-rodada-2): `auditoria_sistema_analytics.md`,
  `auditoria-completa-analytics.md`, `auditoria-analytics-rodape-seo.md`.

---

## 2. Endpoints (ingest e leitura), `arquivo:linha`

Montagem das rotas: `api/routes/index.ts:43` (`/ads`), `:51` (`/analytics`), `:59`
(`/admin/realtime-stats`).

### Ingest (escrita)

| Rota | Onde | Aceita |
|---|---|---|
| `POST /api/analytics/event` | `api/routes/analytics.ts:206` ⭐ | tipos da whitelist `VALID_TYPES` (`api/lib/analyticsShared.ts:27`): `pageview`, `read` (duração cumulativa de leitura), `category`, `scroll` (marcos 25/50/75/100, `:28`), `share`. Payload: interface `AnalyticsEvent` (`analytics.ts:22-49`); validação/clamps em `:214-273` (`type`/`path`≤500/`sessionId`≤100 obrigatórios; `title`, `category`, `articleId`, `platform`, `visitorId`, `utmSource/Medium/Campaign`, `refHost`, `paidClick`, `duration` com teto `MAX_READ_SECONDS`, `scrollDepth` ∈ marcos) |
| `POST /api/analytics/behavior` | `api/routes/analytics.ts:314` | whitelist `ALLOWED` (`:325`): `search`, `link_click`, `newsletter`, `video_play`, `download`. Grava `eventType`, `value`≤500, `sessionId`, `device`, `articleId`, `ts` (`:336-343`) |
| `POST /api/ads/:id/impression` | `api/routes/ads.ts:184` ⭐ | id de anúncio da tabela `ads` OU chave `block:<id>` de bloco da home (`BLOCK_PREFIX`, `:193-198`) |
| `POST /api/ads/:id/click` | `api/routes/ads.ts:141` ⭐ | idem (`:151-160` para blocos) |

Não existe endpoint de "sessão" — sessão é derivada do `sessionId` na agregação.

### Leitura (dashboard)

| Rota | Onde | Devolve |
|---|---|---|
| `GET /api/analytics/stats?period=…` | `api/routes/analytics.ts:366` (auth + `analytics.view`) | endpoint ÚNICO agrupado de todos os cards. Resposta (`:715-762`): `period`, `totals`, `engagement`, `visitors`, `trends`, `dailyChart`, `hourlyChart`/`peakHour`, `dayOfWeekChart`/`peakDay`, `topArticles`, `topCategories`, `topCities`/`topRegions`, `devices`, `browsers`/`osList`, `scrollDepthChart`, `referrerChart`, `topRefHosts`, `topCampaigns`, `shareChart`, `adStats`/`adDailyChart`/`adKpis`/`adHasAnyData`, `behaviorStats` |
| `GET /api/analytics/health` | `api/routes/analytics.ts:351` (auth) | contadores de saúde + `buffered`, `lastEventAt`, `lastFlushAt`, `reliableSince`, `filters[]` (`:351-363`) |
| `GET /api/admin/realtime-stats` | `api/routes/realtime-stats.ts:12` (auth) | contagens de artigos/anúncios/usuários, top views do `store`, últimos 20 eventos, uptime/versão |
| `GET /api/admin/ads` | `api/routes/admin.ts:979-982` (client: `web/lib/adminApi.ts:82`) | anúncios com contadores all-time |
| `GET /api/admin/ads/block-stats` | `api/routes/admin.ts:989-1004` (client: `web/lib/adminApi.ts:84`) | contadores de blocos-propaganda |
| `GET /api/ads` | `api/routes/ads.ts` (término do handler em `:136-138` ⭐; linha inicial não anotada) | lista pública de anúncios ativos; `Cache-Control: public, max-age=10` (`:136`) |

---

## 3. Eventos de tracking no client, `arquivo:linha`

Gate comum de envio: `send()` em `web/hooks/useAnalytics.ts:106-126` — só envia com
`getConsent()==="accepted"`; injeta `sessionId`, `visitorId` (se consentido) e
`internal:true` quando `isInternalClient()` (admin_token no localStorage ou
`import.meta.env.DEV` — `:54-61`). Transporte: `navigator.sendBeacon` com fallback
`fetch keepalive` (`:112-124`). Chaves de storage: `bee_session_id`, `bee_visitor_id`,
`bee_ref_done`, `bee_utm`, `bee_scroll_<id>`, `bee_adimp_<id>`, `bee_analytics_consent`.

| Evento | Disparo | Onde | Dedup/controle no client |
|---|---|---|---|
| pageview (genérico) | troca de rota que não casa `ADMIN_RE`/`ARTICLE_RE` | `useAnalytics.ts:217-219` (regexes `:16-19`) | rotas de artigo e `/admin` não disparam este caminho |
| pageview (artigo) | `useEffect([article?.id])` | `trackArticle` `useAnalytics.ts:236-239`; chamada em `Artigo.tsx:155-157` | 1× por `article.id` |
| pageview (pós-consentimento) | listener `bee_consent_change` | `useAnalytics.ts:149-156` | — |
| first-touch (origem) | 1º pageview da sessão | `takeFirstTouch` `useAnalytics.ts:80-99`; UTM `captureUtmOnce` `:66-71` | 1×/sessão (`bee_ref_done`, `:101-103`); anexa `refHost`, `utm*`, `paidClick` |
| read (tempo de leitura) | acúmulo ativo-visível; envia se `secs>2` | `sendReadIfWorth` `:179-186`; heartbeat 30s `:213-215` (`READ_HEARTBEAT_MS` `:14`); visibilitychange `:188-199`; pagehide `:201`; troca SPA `:168-171` | valor cumulativo; teto `MAX_READ_SECONDS` (`:11`) |
| category | mount de página de categoria | `trackCategory` `:232-234`; `CategoryArchivePage.tsx:21,26` | — |
| scroll (25/50/75/100) | listener + timer 3s p/ página curta | `useScrollDepth` `:276-339`; consumo `Artigo.tsx:131`; marcos `web/lib/analyticsClient.ts:59-61` | sessão+artigo via `bee_scroll_<id>`/`bee_scroll_p:<path>` (`:283-297`) |
| share | clique facebook/twitter/whatsapp/copy | `trackShare` `:241-244`; `Artigo.tsx:139-151` | sem dedup (cada clique envia) |
| busca | submit com query não-vazia | `trackSearch` `:261-264` → `sendBehavior` `:249-259`; `Header.tsx:296-298`, `HomeCustomBlocks.tsx:478-482` | — |
| link_click (externo) | clique em `<a>` https de outra origem | `trackLinkClick` `:266-268`; `Artigo.tsx:281-285` (markdown) e `:408-413` (delegação no corpo HTML) | — |
| newsletter | submit de e-mail válido | `Footer.tsx:68-72` e `HomeCustomBlocks.tsx:370-374` — `fetch` direto a `/api/analytics/behavior` | estes dois pontos não chamam `sendBehavior`/`getConsent()` e não enviam campo `internal` |
| impressão de anúncio | IntersectionObserver ≥50% + 1s contínuo | `useAdImpression` `web/components/ads/useAds.ts:144-175` ⭐; envio `trackImpression` `:121-124` | 1×/anúncio/sessão (`bee_adimp_<id>`, `:130-135`) + Set em memória; não envia quando `isInternalTraffic()` (`:106-114`: DEV ou admin_token) |
| clique de anúncio | onClick do `<a>` do anúncio | `trackClick` `useAds.ts:116-119` ⭐ | sem dedup; não envia quando `isInternalTraffic()` |

Sem emissor localizado no client (tipos aceitos pelo servidor): `video_play`,
`download`. Sem evento próprio no sistema: session start/end (implícito no
`sessionId`, `useAnalytics.ts:21-32`), heartbeat como tipo (reutiliza `read`),
leitura-100% como tipo (derivada do marco `scroll=100` no servidor,
`analytics.ts:513`).

### Instrumentação de anúncios por componente (site público)

| Componente | Ref de impressão | Clique |
|---|---|---|
| `AdSlot.tsx` | `:22` | `:30` |
| `AdBanner.tsx` (carrossel; auto-rotação `:55-65`; observa `items[index]?.id` `:73`) | `:73` | `:114` |
| `AdSidebar.tsx` | `:24` | `:33` |
| `AdInFeed.tsx` | `:29` | `:37` |
| `AdCentral.tsx` | `:7` | `:27` |
| `DestaquesListaBadge.tsx` (AdSidebarInline) | `:90` | `:100` |
| `Header.tsx` (banner do cabeçalho, chave `block:header-banner`) | `:362` | `:374` |
| `HomeCustomBlocks.tsx` ImageBlock isAd (chave `block:<id>`, `:93`) | `:94`/`:147` | `:139` |
| `HomeCustomBlocks.tsx` HtmlBlock isAd (`:243`) | `:244`/`:253` | `:257` (delegado) |

Sem tracking: `AdNative.tsx`, `AdStickyBottom.tsx`, `Placeholder` de `AdInFeed.tsx:8-23`.
Posicionamento dos slots: `Home.tsx:523,884-888,1028`; `PortalZoneBlocks.tsx:762-765`;
`Artigo.tsx:87,742,808`.

### Painel admin e tracking

- `AnalyticsProvider` montado fora do check de admin (`App.tsx:165-168`, `:357`) —
  o SDK existe em todas as rotas; os eventos pageview/read/scroll têm checagens de
  `ADMIN_RE` (`useAnalytics.ts:16`, usos em `:151,168,180,217`).
- Prévia de anúncio do `AdsManager` usa `<img>` estático + preview com
  `pointer-events-none` (`AdsManager.tsx:481-511`) — sem componentes de slot.
- Prévia da home/notícia do `HomeBlocksManager` é o site real em iframe:
  `src={\`${previewPath}?adminPreview=1\`}` (`HomeBlocksManager.tsx:3013-3014`). A flag
  `isAdminPreview` (`Home.tsx:755-756`) controla visibilidade de blocos/postMessage;
  não há nesse caminho supressão de tracking associada à flag — a distinção interna
  vem de `admin_token`/DEV (`useAnalytics.ts:54-61`; `useAds.ts:106-114`).
- "Abrir site"/"Ver site" abrem o site em nova aba (`HomeBlocksManager.tsx:3004`,
  `Dashboard.tsx:179-186`).

---

## 4. Mecanismos centrais, `arquivo:linha`

### Filtro de bots
- Definição: `BOT_RE` `api/lib/trafficGuard.ts:14`; `isBotRequest` `:17-20`
  (UA vazio ou casando o regex).
- Aplicação: `/event` `analytics.ts:208` ⭐ (com `bumpHealth("droppedBot")`);
  `/behavior` `analytics.ts:316` (sem incremento de contador); `/ads/:id/click`
  `ads.ts:145` ⭐ (sem incremento); `/ads/:id/impression` `ads.ts:187` ⭐ (sem
  incremento).

### Marcação `is_internal`
- Decisão (⭐ `analytics.ts:239-243`): `b["internal"] === true` OU
  `internalIpSet().has(ip)` (settings, memoização `:142-149`; parse
  `analyticsShared.ts:53-56`) OU `isPrivateIp(ip)` (`analyticsShared.ts:40-50`).
- Gravação na linha: `toRow` `analytics.ts:78`. Canal vira `"interno"` quando
  interno (⭐ `:263-264`). Contadores all-time e geo: só `!isInternal`
  (`:279-282`, `:305`).
- Uso nas queries do `/stats` (cláusula `is_internal = false`): `analytics.ts:408,
  420, 429, 438-439, 449, 458, 465, 474-475`; filtro equivalente no buffer `:501,
  :520`. A subquery `EXISTS` de visitantes recorrentes (`:479-481`) contém as
  cláusulas `visitor_id` e `ts < winFrom`; não contém cláusula `is_internal`.
- `/behavior`: a tabela `behavior_events` não tem coluna de marcação interna
  (schema §5); o handler não grava marcação (`analytics.ts:330`).
- Rotas `/ads/:id/*`: o arquivo `ads.ts` não contém referência a `internal`,
  `isPrivateIp` ou `internalIpSet` ⭐.

### Deduplicação e rate limiting
- `isRecentDuplicate` (janela deslizante em memória) `trafficGuard.ts:43-48`;
  aplicado a pageview: `pv:${sessionId}|${path}` 15s (⭐ `analytics.ts:231`).
- `overRateLimit` (janela 1 min/chave em memória) `trafficGuard.ts:51-60`:
  `/event` `ev:${ip}` 120/min (`analytics.ts:212`); `/behavior` `bh:${ip}` 30/min
  (`:318`); clique `adclick:${ip}` 30/min (⭐ `ads.ts:145`); impressão
  `adimp:${ip}` 60/min (⭐ `ads.ts:187`).
- Dedup estrutural na agregação: scroll = Set por `sessionId|articleId`
  (`analyticsShared.ts:330`); read = MAX por `sessionId|path` (`:322`).
- Rotas `/ads/:id/*`: mecanismos presentes = bot + rate limit por IP; o arquivo não
  contém dedup por sessão/pageview/slot ⭐. No client, o dedup de impressão existe
  por sessão (`bee_adimp_<id>`, `useAds.ts:130-135` ⭐).

### Classificação de canal
- Classificador único: `classifyChannel` ⭐ `api/lib/analyticsShared.ts:121-141`;
  canais `CHANNELS` `:97`; hosts `SEARCH_HOST_RE` `:100-101`, `SOCIAL_HOST_RE`
  `:102-103`, `MAIL_HOST_RE` `:104-105`; `ChannelSignals` `:107-113` (comentário do
  campo `paidClick` em `:110`: "gclid/fbclid presente na URL de entrada").
  Precedência documentada no comentário `:115-120`. Primeira regra (⭐ `:126`):
  `if (sig.paidClick || /^(cpc|ppc|paid|display|cpm|banner|retargeting)$/.test(medium)) return "pago"`.
- Remap legado só na agregação: `normalizeLegacyChannel` `:144-147`; uso em
  `:299-300` (exclui `interno` do `channelMap`).
- Sinais crus no ingest (⭐ `analytics.ts:252-257`): `utmSource/Medium/Campaign`,
  `refHost` (lowercase, sem `www.`), `paidClick = b["paidClick"] === true` (`:256`),
  `legacyChannel`. First-touch (⭐ `:259-265`): classifica 1×/sessão; interno vira
  `"interno"`.
- Client: `parseUtm` em `web/lib/analyticsClient.ts` captura `utm_*` e a presença de
  `gclid`/`fbclid` (sem o valor) — coberto por `analyticsClient.test.ts:5-42`;
  captura 1×/sessão em `useAnalytics.ts:66-71, 80-103`.

### Heartbeat / tempo de leitura
- Client: acúmulo ativo-visível com envio a cada 30s e em visibilitychange/pagehide
  (`useAnalytics.ts:179-215`).
- Agregação em memória (janela atual): MAX por `sessionId|path` e por
  `articleId|sessionId` — `analyticsShared.ts:319-327`; média `analytics.ts:507-510`;
  por artigo `:553-559`.
- Janela anterior em SQL com a mesma regra: `max(LEAST(duration, MAX_READ_SECONDS))
  … GROUP BY session_id, path` — `analytics.ts:433-442`.

### Buffer e saúde da coleta
- Buffer em memória: `analytics.ts:52-53`; flush a cada 30s `:120`; lote com
  fallback linha a linha `:90-112`; dreno no shutdown `api/routes/index.ts:26`.
- Contadores (`api/lib/analyticsHealth.ts:9-18`): `received`, `droppedBot`,
  `droppedRate`, `droppedInvalid`, `droppedDuplicate`, `flaggedInternal`,
  `flushedOk`, `flushFailed`; helpers `:29-43`; tudo em memória (zera no restart).
- Pontos de incremento (todos no `/event`): `droppedBot` `:208`; `droppedRate`
  `:212`; `droppedInvalid` `:222` e `:228` (path `/admin`); `droppedDuplicate`
  `:232`; `flaggedInternal` `:243`; `received` `:284`. Flush: `:90/:108/:112`.
- Exposição: `GET /health` `:351-363`, com `reliableSince = ANALYTICS_V2_SINCE`
  (`analyticsShared.ts:21` = "2026-07-08").

### Contagem de anúncios (gravação e leitura)
- Impressão (⭐ `ads.ts:184-220`): checagens `isBotRequest` + `overRateLimit`;
  blocos `block:<id>` → só `upsertDailyStat` se bloco visível (`:193-198`);
  anúncio clássico → só ativo e não expirado (`:200-210`), então
  `impressions + 1` em `adsTable` (`:212-215`) + `upsertDailyStat` (`:217`).
- Clique (⭐ `ads.ts:141-181`): mesmas checagens; bloco `:151-160`; clássico só
  ativo (`:162-171`), `clicks + 1` (`:173-176`) + diário (`:178`).
- `upsertDailyStat`: `ads.ts:36-50`; dia BRT `todayStr` `ads.ts:31-34`;
  `BLOCK_PREFIX` `ads.ts:15-34`. **[corrigido pela 0.2]** Não existe constraint
  UNIQUE em `(ad_id, date)` em nenhuma fonte de schema (`ad_daily_stats.ts:9-12`
  usa `index()` comum; migração `0000_init.sql:293-322` sem UNIQUE;
  `ensureSchema.ts` sem statement; snapshot Drizzle `isUnique:false`) — a
  semântica do código é INSERT sempre + UPDATE em todas as linhas do par.
- Leitura do período (dentro do `/stats`): linhas de `ad_daily_stats` da janela
  `analytics.ts:487-490`; somas `adWindowTotals` `:616-621`; `buildAdStat` (CTR)
  `:635-644`; `adStats` `:645-649`; série `adDailyChart` `:652-670`; KPIs
  `:748-754`. All-time (`adsTable.impressions/clicks`) é consumido pelo
  AdsManager/Dashboard, não pelo card de período.

---

## 5. Schema Drizzle e `ensureSchema`

### Tabelas (Drizzle, `lib/db/src/schema/`)

| Tabela | Arquivo | Colunas |
|---|---|---|
| `analytics_events` | `analytics.ts` (tabela `:10`; enums `:3-8`) | id serial PK, type, path, title, category, article_id, session_id, duration, device, ts, ua, referrer, scroll_depth, platform, city, region (`:11-26`); rodada 2: visitor_id `:28`, utm_source/medium/campaign `:30-32`, ref_host `:33`, is_internal default false `:36`, browser `:38`, os `:39`. Índices `:40-46`: ts, type+ts, session, article, visitor+ts |
| `behavior_events` | `behavior_events.ts:3-15` | id, event_type, value, session_id, device, article_id, ts; índices type+ts/ts/session. Não há coluna de marcação interna |
| `ads` | `ads.ts` (`:13-26`) | id, name, image_base64, link, position (enum `:5-11`), active, clicks, impressions, target_devices, image_url, expires_at, created_at, updated_at |
| `ad_daily_stats` | `ad_daily_stats.ts:3-12` | id, ad_id, date (texto YYYY-MM-DD), impressions, clicks; índices ad+date/date |
| `article_views` | `article_views.ts:3-7` | article_id PK, title, views, updated_at |
| `category_views` | `category_views.ts:3-6` | category PK, views, updated_at |
| `geo_stats` | `geo_stats.ts:3-13` | id, city, region, country default 'BR', views, updated_at; índices region/city |
| correlatas | `ingest_nonces.ts:8-10`, `push_subscriptions.ts:3` | anti-replay do ingest central; push |

### `ensureSchema.ts` (`api/lib/ensureSchema.ts`)
- Docstring `:1-14`: roda só `ADD COLUMN IF NOT EXISTS`/`CREATE … IF NOT EXISTS`
  idempotente no boot; schema-base é aplicado por `drizzle-kit push` manual.
- Statements para analytics: colunas rodada-2 de `analytics_events` — visitor_id
  `:49`, utm_source `:50`, utm_medium `:51`, utm_campaign `:52`, ref_host `:53`,
  is_internal `:54`, browser `:55`, os `:56` — e índice `analytics_visitor_ts_idx`
  `:57`. `ingest_nonces` com CREATE TABLE `:44`.
- Sem statements para: criação da tabela `analytics_events` e colunas-base; os
  outros 4 índices de `analytics_events`; `behavior_events`; `ads`;
  `ad_daily_stats`; `article_views`; `category_views`; `geo_stats`;
  `push_subscriptions`. Cada statement roda em try/catch não-fatal (`:77-81`).

---

## 6. Dashboard admin — card → campo/endpoint

`web/pages/admin/Analytics.tsx` (rota `App.tsx:313-315`, permissão
`analytics.view`); fontes: `GET /stats` (`:213`) + `GET /health` (`:214`);
auto-refresh 30s (`:228-232`); seletor de período (`:131-137, 455-475`).

| Card | Linhas | Campo |
|---|---|---|
| 5 KPIs (views, visitantes, sessões, tempo, rejeição) | `:370-433, 495-526` | `totals`, `visitors`, `engagement`, `trends` |
| Tráfego ao longo do tempo | `:531-584` | `dailyChart` |
| Fontes de tráfego + domínios + campanhas | `:586-653` | `referrerChart`, `topRefHosts`, `topCampaigns` |
| Dispositivos/Navegadores/Sistemas | `:655-723` | `devices`, `browsers`, `osList` |
| Artigos top | `:729-772` | `topArticles` |
| Categorias detalhado | `:774-821` | `topCategories` |
| Localização (Cidades/Estados) | `:823-904` | `topCities`, `topRegions` |
| Pico por hora / dia da semana | `:910-948` / `:950-984` | `hourlyChart`/`peakHour`, `dayOfWeekChart`/`peakDay` |
| Profundidade de leitura | `:986-1018` | `scrollDepthChart` |
| Propagandas: KPIs, tabela, gráfico top-3 | `:1032-1072, 1076-1141, 1143-1192` | `adKpis`, `adStats`, `adDailyChart`/`adTopNames`/`adHasAnyData` |
| Termos buscados / Links externos / Resumo de interações | `:1206-1239, 1242-1275, 1278-1332` | `behaviorStats`, `shareChart`, `engagement.readCompletions` |
| Saúde da coleta | `:1336-1369` | `GET /health` |
| Export PDF | `:234-306` | mesmo `stats` |

All-time: `AdsManager.tsx` stat cards `:624-636, 767-819` + tabela de blocos
`:822-938` + tabela clássica `:940-1146` (via `getAds`/`getAdBlockStats`);
`Dashboard.tsx:374-403` (via `getAds`).

---

## 7. Lacunas de visibilidade

1. **Dados de produção: nenhuma verificação executada.** "Validação contra dados
   reais do banco não executada nesta sessão — MCP Supabase não conectado" (ajuste
   4). Composição real das 91 impressões e das sessões classificadas "pago" no
   sp011: não consultada. A Fase 0.2 entregará SQLs prontos (padrão §12 do
   CLAUDE.md) para execução pelo usuário na VPS.
2. Não lidos linha a linha: internals do `store.ts`
   (`trackArticleView`/`trackCategoryView`/tops), `lookupGeoAsync`/`_geoCache`
   (`analytics.ts:278-282` localizado; implementação não), `realtime-stats.ts` em
   detalhe, export PDF (`Analytics.tsx:234-306` localizado; conteúdo não),
   `LGPDConsent.tsx` internals, `dataRetention.ts`.
3. Linhas não anotadas: início do handler `GET /api/ads` (`ads.ts`); handlers
   server de `GET /api/admin/ads` e `/api/admin/ads/block-stats` (presumivelmente
   `api/routes/admin.ts`); emissores client de `video_play`/`download` (não
   localizados).
4. Referências de linha deste inventário vêm da exploração; a Fase 0.2 as
   reconfere no arquivo real antes de qualquer análise (ajuste 2). Divergências
   serão corrigidas aqui e registradas no `STATUS.md`.
5. Estado de runtime (contadores de saúde atuais, buffer, uptime) não observado —
   exige `GET /api/analytics/health` autenticado em produção.

---

## 8. Correções registradas pela Fase 0.2 (ajuste 2 — céticos reabriram os arquivos)

Substantivas (já aplicadas inline acima, marcadas **[corrigido pela 0.2]**):
1. §4/anúncios — `upsertDailyStat` NÃO tem chave única `(ad_id, date)`; semântica
   real: INSERT sempre + UPDATE em todas as linhas do par (ver §4).
2. §2 — handlers server preenchidos: `GET /api/admin/ads` = `admin.ts:979-982`;
   `GET /api/admin/ads/block-stats` = `admin.ts:989-1004`.

Registro (não aplicadas linha a linha; valem sobre o texto acima):
3. Caminho real de `HomeCustomBlocks.tsx` e `PortalZoneBlocks.tsx` é
   `web/components/blocks/` (o inventário omite o subdiretório `blocks/`; as
   linhas citadas conferem no caminho real).
4. `docs/ANALYTICS.md:87` descreve dedup de impressão "1× por anúncio por
   sessão"; o mecanismo real é 1× por ABA (sessionStorage) e apenas client-side.
   Doc histórico `auditoria_sistema_analytics.md:142` ("upsert correto") é
   contradito pelo código atual.
5. §4 is_internal — cláusula da rejeição da janela anterior está em
   `analytics.ts:448` (não :449); o `EXISTS` de recorrentes (`:479-481`) também
   não filtra `type` (além de não filtrar `is_internal`).
6. §4 canal — cobertura de `parseUtm` no teste: `analyticsClient.test.ts:5-17`
   (não 5-42); first-touch em `analytics.ts:261-265` (259-260 é comentário);
   gravação do canal na coluna `referrer` via `toRow` em `analytics.ts:68`.
7. §4 dedup na agregação — chave de read é `sessionId|path??articleId`
   (`analyticsShared.ts:321`); chave de scroll é `sessionId|articleId??path`
   (`:330`) — os fallbacks haviam sido omitidos.
8. §3 — `trackArticle` no `Artigo.tsx:155-160` (chamada em :157); `useAds.ts`
   `isInternalTraffic` `:107-114`, `trackImpression` `:121-124`; iframe do
   preview `HomeBlocksManager.tsx:3013-3016` (src na :3014); `admin_token` é
   gravado em `Login.tsx:70` (senha) e `:100` (2FA), removido em `Admin.tsx:23`
   e `adminApi.ts:27`; `adminApi.ts:90` (`trackAdClick`) não tem consumidor.
9. §6 — card "Top categorias" do `Dashboard.tsx:326-368` (janela 30d via
   `getAnalyticsStats()` sem period) faltava no mapa card→endpoint; gráfico
   top-3 abre em `Analytics.tsx:1144`; `realtime-stats.ts:46-53/:104` devolve
   `topCategoryViews` sem nenhum consumidor no client.
10. §7 lacunas resolvidas — `lookupGeoAsync`/`_geoCache` = `analytics.ts:151-203`;
    `LGPDConsent.tsx` foi lido por completo na 0.2 (confere com o inventário);
    `analyticsHealth.ts` helpers ocupam `:29-52`; `BOT_RE` `trafficGuard.ts:14-15`.
11. Divergências triviais de 1–4 linhas sem impacto de conteúdo: `cachedGeo`
    `analytics.ts:278`; handler de impressão completo `ads.ts:184-220`; teste de
    `SOCIAL_HOST_RE` na `analyticsShared.ts:132`; `_hits` Map em
    `trafficGuard.ts:24`.
