# Analytics — documentação técnica da coleta

> Rodada 2 aplicada em **08/07/2026**. Dados são confiáveis a partir de
> **2026-07-08** (`ANALYTICS_V2_SINCE`) — antes disso o histórico foi limpo
> (eventos de admin e duplicados removidos) e não existiam visitor_id, UTM,
> navegador/SO nem flag de tráfego interno.

## Pipeline (navegador → banco → painel)

```
useAnalytics (hook do site)
  │  consentimento LGPD (bee_analytics_consent) — nada sai sem aceite
  │  sendBeacon/fetch keepalive
  ▼
POST /api/analytics/event  (público)
  │  1. filtro de bot (user-agent)            → descartado (contador droppedBot)
  │  2. rate limit 120/min por IP             → descartado (droppedRate)
  │  3. validação whitelist (tipo/caps/enums) → 400 (droppedInvalid)
  │  4. caminho /admin                        → descartado (droppedInvalid)
  │  5. pageview repetido sessão+path <15s    → descartado (droppedDuplicate)
  │  6. tráfego interno (flag/IP/privado)     → MARCADO is_internal (flaggedInternal)
  │  7. canal classificado no servidor (classifyChannel) + parse de UA
  ▼
buffer em memória (máx 500, flush a cada 30s, drenado no SIGTERM/SIGINT)
  ▼
Postgres analytics_events  (lote; fallback linha a linha descarta só o evento inválido)
  ▼
GET /api/analytics/stats?period=…  (admin, Bearer)
  │  linhas da janela (is_internal = false) + buffer não persistido
  │  + queries SQL agregadas (totais fixos, janela anterior, geo, browser/SO, visitantes)
  ▼
Painel /admin/analytics  (+ GET /api/analytics/health para a faixa de saúde)
```

Módulos: lógica pura em `artifacts/api-server/src/lib/analyticsShared.ts`
(testada em `artifacts/api-server/test/`), rotas em `src/routes/analytics.ts`,
contadores em `src/lib/analyticsHealth.ts`, filtros em `src/lib/trafficGuard.ts`.
Cliente: `artifacts/brasilia-agora/src/hooks/useAnalytics.ts` + lógica pura em
`src/lib/analyticsClient.ts` (testada em `src/lib/analyticsClient.test.ts`).

## Taxonomia canônica de eventos

Dicionário único dos tipos de evento. **Valores são persistidos — nunca renomear**
(enum `analytics_event_type`, strings de `event_type`, chaves `block:<id>`): o nome
canônico é o que JÁ está no banco. A coluna "alias doc v2" registra sinônimos só de
documentação. Fonte em código: `VALID_TYPES` e `BEHAVIOR_TYPES` em
`analyticsShared.ts` (travadas pelo teste `test/analyticsTaxonomy.test.ts`).

**Família A — audiência** (`analytics_events`, `POST /api/analytics/event`, enum PG):

| Evento | Alias doc v2 | Payload essencial (client → servidor) | Dedup |
|---|---|---|---|
| `pageview` | pageview | `{type, path*, sessionId*, title?, category?, articleId?, visitorId?}` + first-touch 1×/sessão: `{firstTouch, refHost?, utmSource?, utmMedium?, utmCampaign?, paidClick?}` + `internal?` | servidor: 15s por `sessionId\|path` |
| `read` | heartbeat | `{type, path*, sessionId*, duration* (segundos CUMULATIVOS ≤1800), articleId?}` | agregado por **MAX** por `sessionId\|path` (reenvio nunca soma) |
| `category` | — | `{type, path*, sessionId*, category*}` (mount da listagem) | nenhum (dedup do evento `category` → PRD 03) |
| `scroll` | scroll_depth | `{type, path*, sessionId*, scrollDepth* ∈ {25,50,75,100}, articleId?}` | client: sessão×conteúdo; agregação: Set por `sessionId\|articleId ?? path` |
| `share` | share | `{type, path*, sessionId*, platform*, articleId?}` | nenhum (cada clique conta) |

Derivados pelo SERVIDOR (nunca do body): `device`, `browser`/`os` (UA), `ts`,
`city`/`region` (geo por IP, só pageview não-interno), `is_internal`, `referrer` =
canal classificado (`classifyChannel`).

**Família B — comportamento** (`behavior_events`, `POST /api/analytics/behavior`,
`event_type` text + whitelist `BEHAVIOR_TYPES`):

| Evento | Alias doc v2 | Payload | Observação |
|---|---|---|---|
| `search` | search | `{eventType, sessionId*, value* = termo}` | — |
| `link_click` | click_external | `{eventType, sessionId*, value* = URL externa, articleId?}` | emissores só no corpo do artigo (item 23) |
| `newsletter` | newsletter_signup | `{eventType, sessionId*, value = e-mail, internal?}` | via `trackNewsletter` DENTRO do gate LGPD (PRD 02 RF1); admin envia `internal:true` (servidor descarta). É só métrica — sem backend de mailing |
| `video_play` | — | **RESERVADO** | sem emissor no client — linha existente = anomalia (sinal de forja/teste) |
| `download` | — | **RESERVADO** | idem |

**Família C — anúncios** (agregados em `ad_daily_stats` por dia BRT + all-time em
`ads`; SEM evento individual persistido):

| Conceito | Alias doc v2 | Endpoint |
|---|---|---|
| impressão de anúncio | impression_ad | `POST /api/ads/:id/impression` (id de `ads` ou chave `block:<id>`) |
| clique de anúncio | click_ad | `POST /api/ads/:id/click` |

**Entidades derivadas (NUNCA criar endpoint):** sessão (`session_start`) = `sessionId`
por aba; visitante = `visitorId` pós-consentimento; leitura-100%
(`article_read_complete`) = pares sessão×conteúdo com marco `scroll=100`; canal de
origem = `referrer` da linha first-touch. **Sem foreign keys por design** — eventos
referenciam artigo/categoria/anúncio por id textual e sobrevivem à exclusão do alvo.

## Regras de exclusão de tráfego (aplicadas a TODAS as métricas públicas)

| Regra | Onde | Efeito |
|---|---|---|
| User-agent de bot/CLI ou vazio | servidor (`trafficGuard.isBotRequest`) | descartado em silêncio |
| >120 eventos/min por IP (30/min behavior, 30–60/min ads) | servidor | descartado em silêncio |
| Caminho `/admin*` | cliente E servidor | não enviado / descartado |
| Pageview repetido (mesma sessão+path em <15s — F5) | servidor | descartado |
| Admin logado no navegador (`admin_token` no localStorage) | cliente envia `internal:true` | gravado com `is_internal=true`, fora das métricas |
| Prévia do admin (`?adminPreview=1` capturado nesta aba) | cliente envia `internal:true` (PRD 02 RF5) | idem — inclui impressão/clique de anúncio (`internal_*`) |
| Ambiente dev (`import.meta.env.DEV`) | cliente | idem |
| IP na lista de Configurações → “IPs internos (Analytics)” | servidor (`settings.internalIps`) | idem |
| IP privado/loopback (dev local, health checks) | servidor | idem |
| Sem consentimento LGPD | cliente | nada é enviado — **inclusive newsletter e impressão/clique de anúncio** (PRD 02 RF1/RF6); visitor_id nem existe |

Tráfego interno é **marcado, não apagado** (`is_internal=true`) — auditável via
SQL, tanto em `analytics_events` quanto em `behavior_events` (PRD 03 fechou a
exceção antiga: o `/behavior` agora GRAVA `is_internal` em vez de dropar, com a
tripla completa flag do client / IP configurado / IP privado; os leitores públicos
excluem `is_internal=true`). A razão de cada marcação (flag/configuredIp/privateIp)
é contabilizada no `/health` (`internalByReason`) para diagnóstico.

## Dicionário de métricas

Formato: **evento fonte · regra de cálculo · filtros · janela · fuso · dedup**.
Filtros = as exclusões da tabela acima, sempre. Fuso = dias/horas de Brasília
(UTC-3 fixo; horário de verão abolido em 2019). “Janela” = período selecionado
no painel (`?period=today|yesterday|7d|30d|custom`), ecoado em `stats.period`.

| Métrica (painel) | Evento fonte | Cálculo | Janela | Dedup |
|---|---|---|---|---|
| Visualizações de página | `pageview` | contagem | selecionada (`totals.window`) | F5 <15s descartado; artigo não conta pageview genérico em dobro |
| Hoje/7d/30d/Total (Dashboard) | `pageview` | contagem SQL | fixas ao agora, independem do seletor | idem |
| Visitantes únicos | `pageview.visitor_id` | `COUNT(DISTINCT visitor_id)` | selecionada | ID aleatório em localStorage, criado só pós-consentimento |
| — novos / recorrentes | idem | recorrente = tem evento `ts <` início da janela (`EXISTS` no índice `visitor_id,ts`) | selecionada | — |
| Sessões únicas | `pageview.session_id` | nº de sessões com ≥1 pageview | selecionada | sessionStorage = 1 por aba/visita |
| Tempo médio por página | `read` | `MAX(duration)` por (sessão, path), depois média. Heartbeats de 30s enviam o total **cumulativo** de tempo ATIVO VISÍVEL (aba oculta pausa o relógio) — o MAX torna reenvio idempotente. Teto 1800s | selecionada | MAX por sessão+página |
| Taxa de rejeição | `pageview` | sessões com exatamente 1 pageview ÷ sessões | selecionada | — (tendência em pontos percentuais) |
| Tendências (badges) | todos | janela atual vs janela imediatamente anterior de mesmo tamanho; `null` = sem base → sem badge (nunca inventa %) | selecionada | — |
| Tráfego ao longo do tempo | `pageview` | contagem por dia BRT | selecionada | — |
| Pico por hora / dia da semana | `pageview` | bucket hora/dia BRT; `null` sem dados | selecionada | — |
| Fontes de tráfego | `pageview.referrer` (canal) | canal atribuído 1× por sessão (first-touch); classificado NO SERVIDOR a partir de refHost+UTM+gclid/fbclid: `direto, busca, social, referencia, email, pago, desconhecido`. **"pago" SÓ quando uma campanha ativa cadastrada casa os sinais (PRD 05)** — `gclid`/`fbclid` órfão vira `busca`/`social`, nunca `pago`; `utm_medium=cpc\|ppc\|…` sem campanha vira `desconhecido`/host. Linhas legadas: `outro`→`referencia` e `pago` anterior a `PAID_RULE_SINCE` são remapeadas só na agregação (nunca reescritas) | selecionada | 1 por sessão (`bee_ref_done`) |
| Domínios de origem / Campanhas | `pageview.ref_host` / `utm_campaign` | contagem, top 10 | selecionada | first-touch por sessão |
| Dispositivos | `pageview.device` | derivado do UA no servidor (mobile/desktop/tablet) | selecionada | — |
| Navegadores / Sistemas | `pageview.browser/os` | parse próprio do UA no ingest (8 famílias; fora do catálogo = `outro`) | selecionada | — |
| Artigos com melhor desempenho | `pageview.article_id` (+`read`) | views por artigo; tempo médio = média dos MAX por sessão | selecionada | — |
| Top categorias | `pageview.category` + `category` | views (pageviews com categoria) e cliques (evento `category`) separados | selecionada | — |
| Localização | `pageview.city/region` | agregado por evento DA JANELA; cidade nula = **“Não identificado”** (nunca inventamos local). `geo_stats` virou histórico bruto, não alimenta o painel | selecionada | — |
| Profundidade de leitura | `scroll` (25/50/75/100) | **sessões únicas** (sessão+artigo) por marco; % medido sobre o BLOCO do corpo do artigo (contentRef — cabeçalho/lateral/rodapé não contam); página curta = 100% após 3s | selecionada | sessionStorage `bee_scroll_<artigo>` — remount não redispara |
| Leram 100% | `scroll depth=100` | tamanho do set de sessões | selecionada | idem |
| Impressões de anúncio | `POST /api/ads/:id/impression` | IntersectionObserver ≥50% visível por **1s contínuo** (dwell IAB) **e só com consentimento LGPD** (PRD 02 RF6 — mesmo gate do pageview; sem aceite, zero impressão pública); anúncio inativo/expirado não conta (checado no servidor). Gravação ATÔMICA por `(ad_id, date)` com índice único (PRD 04 RF1 — antes: upsert sem UNIQUE inflava ~quadraticamente) | selecionada (`ad_daily_stats` por dia BRT) | cliente 1×/aba (`bee_adimp_<id>`) **+ servidor 1×/sessão/anúncio em 30min** (PRD 04 RF4); admin/dev/prévia envia `internal:true` → conta em `internal_impressions`, fora do público |
| Blocos "É uma propaganda" | idem, com chave `block:<id do bloco>` | blocos de imagem/HTML da home ou da lateral marcados `isAd` medem impressão (mesma regra de dwell) e clique (qualquer link do bloco); validados contra as settings no servidor; contadores só em `ad_daily_stats` (sem linha na tabela `ads`); entram em adStats/adKpis como posição "bloco da home" | selecionada | cliente 1×/aba + servidor 1×/sessão em 30min; bloco oculto não conta |
| Cliques de anúncio | `POST /api/ads/:id/click` | registrado antes do redirect (target=_blank), **só com consentimento** (PRD 02 RF6); clique mais rápido que o dwell dispara a impressão-irmã antes (mantém clicks ≤ impressions) | selecionada | servidor dedup 10s por sessão/anúncio (mata duplo-clique); admin/dev/prévia envia `internal:true` → `internal_clicks` |
| CTR | derivado | cliques válidos ÷ impressões válidas × 100, por anúncio e médio | selecionada | — |
| Melhor anúncio | derivado | maior CTR entre anúncios com impressão > 0 na janela; `—` sem dados | selecionada | — |
| “sem dados no período” (ads) | `ad_daily_stats` | anúncio sem NENHUMA linha diária na janela (≠ zero real); `adHasAnyData=false` = coleta nunca começou (“Acumulando…”) | selecionada | — |
| Termos buscados / Links externos / Newsletter | `behavior_events` (search/link_click/newsletter) | contagem; link externo = href http(s) de origin DIFERENTE, capturado por **listener delegado único de SITE INTEIRO** (rodapé/menu/blocos, não só o corpo do artigo — PRD 02 RF2); `mailto:`/`tel:`/âncoras e cliques em `[data-bee-ad]` NÃO contam; debounce 1s por href; newsletter dentro do gate (RF1) | selecionada | internos MARCADOS no ingest (PRD 03) e EXCLUÍDOS na leitura (`is_internal=false`, PRD 07 RF3) |
| Resumo de interações (totais) | `behaviorStats` do `/stats` (PRD 07) | `searchesTotal`/`externalClicksTotal` = totais **NÃO truncados** da janela, servidos JUNTO dos tops truncados (`topSearchTerms` top-15, `topLinkDomains` top-10) + `searchTermsDistinct`/`linkDomainsDistinct`. O card NUNCA soma o top-N e chama de total (bug do item 24). Admissão válida (vale p/ tops E totais): busca = `value.trim()` não-vazio; clique externo = `value` http(s) com `URL.hostname` não-vazio, domínio sem `www.` — `mailto:`/`tel:`/legado sem host ficam FORA de tops/totais mas contam em `totalEvents`. Leitura-100% é DERIVADA do marco scroll 100 (linha "Leram 100%") — nunca há segundo cálculo/evento | selecionada | função pura `buildBehaviorStats` (testada); linhas legadas não-http(s) somem da leitura sem reescrever o banco |

## Saúde da coleta (`GET /api/analytics/health`, admin)

Contadores **em memória desde o boot** (reiniciar o container zera — proposital,
é diagnóstico, não histórico): `received, droppedBot, droppedRate,
droppedInvalid, droppedDuplicate, flaggedInternal, flushedOk, flushFailed,
buffered, lastEventAt, lastFlushAt, reliableSince, filters[]`, mais
`adsReliableSince` (PRD 04 — data a partir da qual as métricas de anúncio são
contagem exata; anteriores são reparadas por estimativa; `null` = reparo ainda não
rodou). Exibidos na faixa “Saúde da coleta” do painel (a UI do `adsReliableSince`
é do PRD 08). `flushFailed > 0` aparece em vermelho.

**Contadores por endpoint (PRD 03).** O `/health` agora inclui `byEndpoint`
(`event`/`behavior`/`adImpression`/`adClick`, cada um com received/droppedBot/
droppedRate/droppedInvalid/droppedDuplicate/flaggedInternal) e `internalByReason`
(flag/configuredIp/privateIp). Antes só o `/event` contava — o card exibia
"0 bots filtrados" mesmo com as rotas de `behavior`/ads descartando em silêncio.
A exibição desses campos no painel é do PRD 08. **Reconciliação** (regra do PRD 11):
`received = flushedOk + flushFailed + buffered` (do pipeline do `/event`, com
tolerância do lote em voo) — fecha sempre desde o PRD 03 (o excedente do flush
degradado passou a contar em `flushFailed`; teto duro do buffer em `2×BUFFER_MAX`).

**Comportamento em restart (fail-open).** As janelas de rate limit e de dedup e
TODOS os contadores vivem em memória e zeram no restart — nunca bloqueiam tráfego
legítimo por estado perdido; `bootAt`/`uptimeSeconds` datam o zero. Um F5 nos
primeiros 15s após o deploy pode contar 2× (janela de dedup perdida — aceito). O
buffer é drenado no shutdown limpo e perdido em crash (até `2×BUFFER_MAX` eventos).
Tetos de rate limit em fonte única (`INGEST_RATE_LIMITS`): 120/min event, 30/min
behavior, 60/min impressão, 30/min clique. ⚠️ **Risco de `internalIps` com CGNAT:**
cadastrar um IP compartilhado (CGNAT, Wi-Fi público) marca TODO visitante atrás dele
como interno — diagnosticável por `internalByReason.configuredIp` desproporcional.

## LGPD / privacidade

- Nada é enviado antes do aceite do banner (`bee_analytics_consent`).
- `visitor_id` = UUID aleatório em localStorage, criado só após o aceite; sem
  fingerprinting; rejeitou = nunca existe.
- UTM da URL de entrada fica em sessionStorage até o aceite — não sai do
  dispositivo sem consentimento. `gclid`/`fbclid`: só a PRESENÇA é enviada
  (flag `paidClick`), nunca o ID.
- **Todo** evento passa pelo mesmo gate (PRD 02): pageview, read, scroll, share,
  category, search, link_click, **newsletter** (e-mail, dado pessoal) e
  **impressão/clique de anúncio**. Não há mais fetch direto fora do SDK.
- IPs não são gravados em `analytics_events` (o campo `_ip` do buffer é
  transiente, para retro-preencher geo, e não vai ao banco).

## Limitações conhecidas (explícitas de propósito)

1. **Geolocalização = ip-api.com gratuito** (decisão de 08/07/2026: manter por
   ora). Plano grátis é HTTP-only e proíbe uso comercial. A agregação é
   agnóstica de provedor (lê `city/region` das linhas): trocar de provedor =
   trocar só `lookupGeoAsync` em `routes/analytics.ts`. Alternativas: MaxMind
   GeoLite2 local (precisa de conta/licença) ou desligar cidade/estado.
2. **Toggles de categoria do banner LGPD são cosméticos** — aceite/rejeição é
   tudo-ou-nada (`bee_analytics_consent` único).
3. **Contadores de saúde zeram no restart** (em memória).
4. **~~`behavior_events`: interno ainda é dropado~~ — RESOLVIDO (PRD 03)**: o
   `/behavior` grava `is_internal=true` (tripla completa) e os leitores excluem
   interno. Deixou de ser limitação.
5. **visitor_id/UTM/navegador/SO/interno só existem a partir de 08/07/2026** —
   períodos anteriores mostram esses cards zerados/parciais (o card Visitantes
   avisa “desde 08/07/2026”).
6. **Skew de ~30s**: geo/browser/visitantes vêm de SQL e não veem o buffer
   ainda não persistido; o gráfico diário vê. Diferenças somem no flush.
7. **Impressões de anúncio caíram após 08/07/2026** — é o número honesto
   (dwell de 1s + 1× por sessão). Comparações com o histórico anterior
   superestimado não são válidas. Totais all-time seguem no AdsManager.
   **O PRD 02 (gate LGPD nas impressões) derruba de novo:** visitante que não
   aceita o banner deixa de gerar impressão pública — some a assimetria "M
   impressões / zero pageview". Continua sendo o número honesto.
8. **Reparo histórico do PRD 04 (`ad_daily_stats`)** — o upsert antigo, sem índice
   único em `(ad_id, date)`, inflava a contagem diária ~quadraticamente (medido: de
   ~3× a ~27× por blog). O boot da imagem do PRD 04 faz, uma vez por banco: backup
   (`ad_daily_stats_backup_prd04`), reparo por estimativa (`MAX−1` por par — validado
   contra o all-time: 65 = 65 num anúncio real) e criação do índice único. Datas
   ANTERIORES ao marcador `settings.ads_reliable_since` são reparadas por estimativa;
   a partir dele, contagem exata. **Os números de impressão caem de novo após o
   reparo — é o valor honesto.** O all-time de `ads` (contador independente) não é
   tocado.
9. Revisita à mesma página na mesma sessão conta o MAX de tempo (não a soma) —
   leve subestimação, preferida a duplicar leituras.
10. **"Tráfego pago" exige campanha cadastrada (PRD 05)** — o canal `pago` só é
   atribuído quando o operador cadastra uma campanha ativa (Configurações →
   "Campanhas de tráfego pago") cujos identificadores (`utm_campaign`, o par
   `utm_source`+`utm_medium`, ou aceitar `gclid`/`fbclid`) casem a visita.
   ANTES: a mera presença de `gclid`/`fbclid` (incl. cliques ORGÂNICOS do
   Facebook, que anexam `fbclid` a qualquer link) marcava `pago` e vencia
   `social` — daí o falso "Tráfego pago" na rede sem campanha comprada. As
   linhas `pago` gravadas pela regra antiga (antes de `PAID_RULE_SINCE`) são
   remapeadas para social/busca/referência/desconhecido **só na agregação**
   (nenhuma reescrita no banco); as colunas booleanas `gclid`/`fbclid` passam a
   ser persistidas (só a presença, nunca o id) para auditoria futura.

## Processo de migração de schema (obrigatório)

O deploy **NÃO roda `drizzle-kit push`**. Toda mudança de schema de analytics vai a
DOIS lugares no mesmo commit (Drizzle é a verdade de tipos/queries; `ensureSchema`
aplica no boot de cada banco — colunas se autocriam sem passo manual por blog):

1. Editar o schema Drizzle (`lib/db/src/schema/*.ts`).
2. `cd lib/db && pnpm exec tsc -b` (pacote composite; `dist` gitignored) ANTES de
   typecheckar o api-server.
3. Adicionar statement idempotente equivalente em `api/src/lib/ensureSchema.ts`:
   `ADD COLUMN IF NOT EXISTS` / `CREATE [UNIQUE] INDEX IF NOT EXISTS` /
   `CREATE TABLE IF NOT EXISTS` (tabela nova de feature).
4. **UNIQUE sobre dados possivelmente violadores**: precedê-lo de dedup/reparo
   transacional com guarda de idempotência (senão o CREATE UNIQUE INDEX falha para
   sempre no try/catch não-fatal).
5. **Tipo novo de evento**: preferir a família B (basta ampliar `BEHAVIOR_TYPES`).
   Se for inevitável ampliar o enum `analytics_event_type`, usar
   `ALTER TYPE … ADD VALUE IF NOT EXISTS '<valor>'` como statement isolado E
   adicionar o valor ao pgEnum do Drizzle e a `VALID_TYPES`. Nunca REMOVER/RENOMEAR.
6. Leitura defensiva: `ensureSchema` é não-fatal — código que lê coluna nova deve
   tolerar `NULL`/ausência sem lançar.
7. `node --test` no api-server + typecheck por pacote.
8. Rollout §6 do CLAUDE.md (bump `BLOG_IMAGE_VERSION`, canário resenhavip, demais) +
   verificação por banco com `information_schema.columns`/`pg_indexes`.
9. Registrar aqui (Taxonomia/limitações).

**Proibições permanentes** (quebram invariante do CLAUDE.md §17): depender de
`drizzle-kit push` no deploy; statement destrutivo (`DROP COLUMN`/`ALTER … TYPE` que
reescreva dados) no `ensureSchema`; `UPDATE` em massa de `analytics_events`/
`behavior_events` (linhas históricas nunca são reescritas); renomear valores
persistidos; condicionar schema a `BLOG_ID`.

## Testes

- `artifacts/api-server`: `pnpm run test` (node --test) — classificação de
  canal, parse de UA/bot (inclui CUBOT ≠ bot), períodos com virada de mês BRT,
  reducer de agregação (bounce, scroll por sessão, read MAX com heartbeats,
  janela vazia, remap legado), validação/caps/dedup, e taxonomia canônica
  (`analyticsTaxonomy.test.ts` — trava `VALID_TYPES`/`BEHAVIOR_TYPES`/
  `SCROLL_MILESTONES`/`CHANNELS` contra rename/adição acidental).
- `artifacts/brasilia-agora`: `pnpm run test` (tsx --test) — parseUtm,
  refHostOf, scroll relativo ao conteúdo, decisor de dwell com clock injetado.
- Roteiro manual: `docs/ANALYTICS-VALIDACAO.md`.
