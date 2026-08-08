# PRD 01 — Modelo de dados e taxonomia de eventos

> **O que é este documento.** PRD de implementação, escrito para ser consumido pelo
> Claude Code numa sessão futura SEM o contexto da auditoria — autocontido: dá para
> executar lendo só este arquivo. Fontes: `analytics-audit/00-auditoria-estado-atual.md`
> (Fase 0.2, achados com evidência), `analytics-audit/00-inventario.md` (mapa; §8 tem
> correções de linha), `analytics-audit/STATUS.md` (FRONTEIRAS entre PRDs),
> `PRD_ANALYTICS_PLANEJAMENTO_v2.md` (template e descrição do módulo 01),
> `docs/ANALYTICS.md` e CLAUDE.md §§5, 6, 14, 17. Todas as evidências `arquivo:linha`
> abaixo foram REABERTAS nos arquivos reais na sessão de escrita deste PRD
> (2026-07-23), exceto onde marcado "(cf. auditoria)".
>
> **Princípio obrigatório:** volume baixo NÃO é bug — os blogs são novos. Bug é o que
> for logicamente incorreto ou inconsistente, independente do volume. Este PRD não
> muda nenhum número do dashboard: ele é a FUNDAÇÃO (dicionário de eventos + colunas +
> processo de migração) sobre a qual os PRDs 02–12 corrigem os números.
>
> **Multi-blog:** os 8 blogs (sp011, ksports, esporteagora, resenhavip, oleysports,
> beeesportes, pontofarma, creditovc) rodam a MESMA imagem `blog-api:vN`/`blog-web:vN`
> (CLAUDE.md §6). Toda mudança de schema aqui se autocria no boot de CADA banco
> (sp011/Supabase + replicados no pg-blogs). Nenhum fix pode ser condicionado a
> BLOG_ID (CLAUDE.md §13/§17).
>
> **Encurtamentos:** `api = artifacts/api-server/src`, `web = artifacts/brasilia-agora/src`,
> `db = lib/db/src`.

---

## 1. Objetivo

1. **Taxonomia canônica**: consolidar num dicionário único todos os tipos de evento
   do sistema (pageview, read/heartbeat, category, scroll, share, search,
   link_click, newsletter, video_play, download, impressão de anúncio, clique de
   anúncio; sessão implícita via `sessionId`; leitura-100% derivada do marco
   `scroll=100`), com payload padrão de cada um e o relacionamento com
   artigo/categoria/anúncio/sessão/visitante — publicado em `docs/ANALYTICS.md` e
   ancorado em constantes exportadas no código (fonte única).
2. **Colunas de fundação**: entregar `behavior_events.is_internal` via schema Drizzle
   E `ensureSchema.ts` (fronteira do STATUS.md: a COLUNA é deste PRD; a lógica de
   marcação no ingest é do PRD 03).
3. **Processo padrão de migração**: registrar o estado atual (o `ensureSchema` cobre
   só as colunas da rodada 2 + 1 índice; 4 dos 5 índices de `analytics_events` e as
   tabelas-base dependem de `drizzle-kit push` manual) e definir o processo
   obrigatório para TODA mudança futura de schema de analytics — o deploy NÃO roda
   `drizzle-kit push` (CLAUDE.md §17).
4. **Decisão `video_play`/`download`**: tipos aceitos no servidor sem emissor no
   client — decidir manter/remover (decisão: MANTER como reservados, ver RF6).
5. **Ratificação dos nomes** das extensões de modelo definidas nos PRDs 04
   (`UNIQUE (ad_id,date)` + dimensão interna de ads) e 05 (`gclid`/`fbclid` +
   `paidCampaigns` em settings), fechando a cláusula "em conflito de nomes, o PRD 01
   manda" declarada nos dois PRDs.

Itens da checklist do doc v2 cobertos: este PRD é transversal (fundação). Toca
diretamente o **24** (Resumo de interações — coluna que permite auditar interno em
`behavior_events`) e o **25** (Saúde da coleta — precisão da marcação interna);
habilita estruturalmente os itens 4/19/20/21 (PRD 04), 11 (PRD 05), 22/23 (PRD 07)
e as regras por blog do PRD 11.

---

## 2. Contexto / estado atual (achados da auditoria, com evidência)

### 2.1 Onde a taxonomia vive hoje (Confirmado no código)

A taxonomia está espalhada em QUATRO lugares, sem dicionário único:

1. **Enum do Postgres + Drizzle** — `analytics_event_type` com 5 valores
   (`pageview`, `read`, `category`, `scroll`, `share`): `db/schema/analytics.ts:3-5`
   (pgEnum) e `lib/db/migrations/0000_init.sql:8` (CREATE TYPE). O device também é
   enum (`analytics_device`: mobile/desktop/tablet — `analytics.ts:6-8`,
   `0000_init.sql:7`).
2. **Whitelist do servidor para `/event`** — `VALID_TYPES` com os MESMOS 5 valores
   (`api/lib/analyticsShared.ts:27`) + `SCROLL_MILESTONES` {25,50,75,100} (`:28`) +
   `MAX_READ_SECONDS=1800` (`:30`).
3. **Whitelist inline do `/behavior`** — `const ALLOWED = new Set(["search",
   "link_click", "newsletter", "video_play", "download"])` DENTRO do handler
   (`api/routes/analytics.ts:325`), sem export, sem teste. O comentário do schema
   está desatualizado: `db/schema/behavior_events.ts:5` documenta só
   `'search' | 'link_click' | 'newsletter'`.
4. **Rotas de anúncio** — impressão/clique não são "eventos" de tabela de eventos:
   são agregados direto em `ad_daily_stats` (dia BRT) + contadores all-time em `ads`
   (`api/routes/ads.ts:184-220` impressão, `:141-181` clique — cf. auditoria §2.1 e
   PRD 04 §2).

**Sem evento próprio no sistema** (inventário §3): sessão (implícita no `sessionId`
gerado por aba — `web/hooks/useAnalytics.ts:21-32`, chave `bee_session_id`),
heartbeat como tipo (reutiliza `read` com duração CUMULATIVA — `:179-215`),
leitura-100% como tipo (derivada no servidor: sessões×conteúdo que atingiram o marco
`scroll=100` — `readCompletions = agg.scrollSessions[100]?.size`,
`api/routes/analytics.ts:513`). **Sem emissor no client** (inventário §3): 
`video_play` e `download` — aceitos pelo servidor (`analytics.ts:325`), nenhum
call-site em `web/` os envia.

### 2.2 Estado do `ensureSchema.ts` (Confirmado no código — a lacuna central)

Docstring `api/lib/ensureSchema.ts:1-14`: "O projeto aplica o schema via
`drizzle-kit push` manualmente"; o `ensureSchema` roda no boot apenas statements
idempotentes (`ADD COLUMN IF NOT EXISTS` / `CREATE ... IF NOT EXISTS`), cada um em
try/catch não-fatal (`:76-82`). Cobertura ATUAL de analytics (`:47-57`):

- 8 colunas da rodada 2 de `analytics_events`: `visitor_id` (`:49`), `utm_source`
  (`:50`), `utm_medium` (`:51`), `utm_campaign` (`:52`), `ref_host` (`:53`),
  `is_internal` (`:54`), `browser` (`:55`), `os` (`:56`);
- 1 índice: `analytics_visitor_ts_idx` (`:57`).

**Tudo o mais depende do push manual** (inventário §5, reconferido):

- a tabela `analytics_events` em si + enums (`0000_init.sql:7-8,124,131`);
- os outros 4 índices de `analytics_events`: `analytics_ts_idx`,
  `analytics_type_ts_idx`, `analytics_session_idx`, `analytics_article_idx`
  (declarados no Drizzle `db/schema/analytics.ts:41-44`; criados só na migração
  `0000_init.sql:315-318`);
- `behavior_events` (tabela `0000_init.sql:301-309`; índices `:323-325`;
  Drizzle `db/schema/behavior_events.ts:11-15`);
- `ads`, `ad_daily_stats` (`0000_init.sql:293-299,321-322`), `article_views`,
  `category_views`, `geo_stats` (`:319-320`), `settings`.

Consequência: uma mudança feita SÓ no schema Drizzle nunca chega aos 8 bancos em
produção (sp011/Supabase + 7 replicados no pg-blogs, quando todos no ar) — e uma
mudança feita SÓ no `ensureSchema` deixa o Drizzle cego para a coluna. O repo já
tem o precedente correto (rodada 2 foi aos dois lugares), mas o PROCESSO nunca foi
formalizado — este PRD formaliza (RF5).

### 2.3 Assimetrias de modelo já confirmadas pela auditoria

- **`behavior_events` não tem coluna de marcação interna**
  (`db/schema/behavior_events.ts:3-15` — nenhuma coluna boolean). Por isso o
  handler DROPA o evento interno em vez de marcá-lo:
  `if (b["internal"] === true || internalIpSet().has(ip)) { res.json({ok:true}); return; }`
  (`api/routes/analytics.ts:328-330`, com comentário admitindo a limitação) —
  exceção DOCUMENTADA à invariante §17 "tráfego interno marcado `is_internal`,
  nunca dropado" (auditoria §5, invariante 2). Nota adicional da auditoria (item
  24, §4.6): o drop do `/behavior` não tem a perna `isPrivateIp` que o `/event` tem
  (`analytics.ts:239-243` vs `:330`), e os dois formulários de newsletter fazem
  fetch direto sem `getConsent()`/`internal` (`web/components/Footer.tsx:62-76`;
  `web/components/blocks/HomeCustomBlocks.tsx:364-378`) — a correção desses
  caminhos é PRD 02 (client) e PRD 03 (servidor); a COLUNA que habilita "marcar em
  vez de dropar" é DESTE PRD (fronteira do STATUS.md).
- **`ad_daily_stats` sem UNIQUE em `(ad_id,date)`** (`db/schema/ad_daily_stats.ts:
  9-12` usa `index()` comum; `0000_init.sql:321-322` só CREATE INDEX;
  `ensureSchema.ts` sem statement algum para a tabela) → upsert defeituoso com
  inflação ~quadrática (auditoria, claim i). Correção, reparo e dimensão interna
  (`internal_impressions`/`internal_clicks`): **PRD 04** (fronteira) — os nomes são
  ratificados aqui (RF7).
- **`analytics_events.referrer` guarda o CANAL CLASSIFICADO** (`pago`, `direto`,
  `busca`, `social`, `referencia`, `email`, `interno`, `desconhecido`), não a URL
  do referrer — gravado só na linha first-touch da sessão (`analytics.ts:263-265`,
  `toRow` `:68`; catálogo `CHANNELS` em `analyticsShared.ts:97`). Colunas novas
  `gclid`/`fbclid` e o cadastro `paidCampaigns`: **PRD 05** (fronteira).
- **`settings` é KV (`key` PK, `value` text — `db/schema/settings.ts:3-7`)** e já é
  o mecanismo sancionado para extensão de modelo sem coluna nova: `internalIps`
  dentro do JSON de `site_settings` (cf. PRD 05), key avulsa `ads_reliable_since`
  (PRD 04 RF2), futuro `paidCampaigns` (PRD 05 RF-1).

### 2.4 Payloads e filtros hoje (base factual da taxonomia do RF1)

- **`POST /api/analytics/event`** (`analytics.ts:206-311`): interface
  `AnalyticsEvent` (`:22-49`); obrigatórios `type` ∈ `VALID_TYPES`, `path` ≤500,
  `sessionId` ≤100 (`:216-221`); clamps `title` ≤300, `category` ≤100, `articleId`
  ≤100, `platform` ≤50, `visitorId` ≤64 (`:245-249`), `utm*` ≤120, `refHost` ≤253
  lowercased sem `www.` (`:252-255`), `duration` ≤1800 (`:267-270`), `scrollDepth`
  ∈ marcos (`:272-273`). Filtros na ordem: bot (`:208`) → rate 120/min/IP (`:212`)
  → payload (`:221`) → `/admin` (`:228`) → dedup pageview 15s `pv:sessionId|path`
  (`:231`) → marcação `is_internal` = flag OU IP cadastrado OU IP privado
  (`:239-243`). Servidor deriva: `device` (`detectDevice`), `browser`/`os`
  (`parseUa`), `ts` (relógio do servidor, `:289`), geo por IP (`:278-282`), canal
  (`:263-265`). Transporte client: `sendBeacon` com fallback `fetch keepalive`
  (`useAnalytics.ts:112-124`); gate de consentimento `getConsent() !== "accepted" →
  não envia` (`:107`); `internal:true` quando admin_token/DEV (`:54-61,:111`).
- **`POST /api/analytics/behavior`** (`analytics.ts:314-348`): obrigatórios
  `eventType` ≤30 ∈ ALLOWED, `sessionId` ≤100; opcionais `value` ≤500, `articleId`
  ≤100; deriva `device` do UA; `ts` do servidor. Filtros: bot (`:316`, sem
  contador) → rate 30/min/IP (`:318`) → drop interno (`:330` — flag ou IP
  cadastrado; SEM `isPrivateIp`). Gate de consentimento só no caminho
  `sendBehavior` (`useAnalytics.ts:249-259`) — os dois formulários de newsletter o
  ignoram (§2.3).
- **`POST /api/ads/:id/impression` e `/click`** (`ads.ts:184-220`, `:141-181`):
  hoje SEM body; filtros só bot + rate (60/30 por min/IP); id = linha de `ads` ou
  chave `block:<id>` validada nas settings. O PRD 04 §7 adiciona body
  `{sessionId?, path?, internal?}` — contrato já ratificado lá.
- **Agregação (relacionamentos efetivos)** — `buildWindowAggregates`
  (`analyticsShared.ts:264-343`): sessões únicas = chaves distintas de
  `sessionPageviews` (`:305`; leitura `analytics.ts:506`); read agregado por MAX
  com chave `sessionId|path ?? articleId` (`:319-322`) e por artigo
  `articleId|sessionId` (`:323-326`); scroll dedupado por Set com chave
  `sessionId|articleId ?? path` (`:329-331`); share por `platform` (`:333-335`);
  categoria: views por `category` do pageview (`:312`) e "cliques" pelo evento
  `category` (`:315-317`).

---

## 3. Problema a resolver

1. **Não existe dicionário único de eventos.** A taxonomia real vive em 4 lugares
   (§2.1) e diverge da nomenclatura do doc v2 (`impression_ad`, `click_ad`,
   `session_start`, `heartbeat`, `scroll_depth`, `newsletter_signup`,
   `click_external`, `article_read_complete` não existem como strings no código).
   PRDs e sessões futuras precisam de UM mapa canônico nome↔endpoint↔tabela↔payload
   para não recriar eventos nem renomear valores persistidos por engano.
2. **A whitelist do `/behavior` é inline e sem teste** (`analytics.ts:325`), com o
   comentário do schema desatualizado (`behavior_events.ts:5` omite
   `video_play`/`download`) — a fonte da verdade em código não existe.
3. **`behavior_events` não tem `is_internal`** → o handler viola (com exceção
   documentada) a invariante "marcado, nunca dropado", e o item 24 fica sem
   auditoria possível de tráfego interno (não dá para saber quanto foi dropado).
4. **O processo de migração é implícito e incompleto**: `ensureSchema` cobre só a
   rodada 2 + 1 índice; 4 dos 5 índices de `analytics_events` e todas as
   tabelas-base dependem de `drizzle-kit push` manual (§2.2). Sem processo formal,
   o próximo PRD que criar coluna só no Drizzle quebra a rede inteira no boot (o
   Drizzle projeta a coluna no SELECT — docstring `ensureSchema.ts:9-11`).
5. **`video_play`/`download` aceitos sem emissor**: qualquer POST forjado passa
   pelos filtros e vira linha em `behavior_events` sem que exista caminho legítimo
   — decisão pendente de manter/remover.
6. **Cláusulas abertas nos PRDs 04/05**: ambos declararam "se o PRD 01 definir
   nomes diferentes, o PRD 01 manda" — enquanto este PRD não ratificar os nomes, a
   implementação deles fica juridicamente ambígua.

---

## 4. Requisitos funcionais

### RF1 — Dicionário canônico da taxonomia (a tabela abaixo É o dicionário)

A tabela seguinte se torna a taxonomia OFICIAL do sistema (a implementação a copia
para `docs/ANALYTICS.md`, seção "Taxonomia canônica de eventos" — RF8). Regra de
ouro: **valores persistidos nunca são renomeados** (enum `analytics_event_type`,
strings de `event_type`, chaves `block:<id>`) — o nome canônico é o nome JÁ gravado
no banco; os aliases do doc v2 ficam registrados como sinônimos de documentação.

**Família A — audiência (`analytics_events`, `POST /api/analytics/event`, enum PG):**

| Evento | Alias doc v2 | Payload padrão (client → servidor) | Dedup | Relacionamentos |
|---|---|---|---|---|
| `pageview` | pageview | `{type, path*, sessionId*, title?, category?, articleId?, visitorId?}` + first-touch 1×/sessão: `{firstTouch:true, refHost?, utmSource?, utmMedium?, utmCampaign?, paidClick?}` (`useAnalytics.ts:80-99,130-134`) + `internal?` | servidor: 15s por `pv:sessionId\|path` (`analytics.ts:231`) | artigo (`articleId`), categoria (`category`), sessão, visitante; canal da SESSÃO gravado em `referrer` só no first-touch |
| `read` | **heartbeat** | `{type, path*, sessionId*, duration* (segundos CUMULATIVOS, ≤1800), articleId?}` — heartbeat 30s + visibilitychange/pagehide/troca SPA (`useAnalytics.ts:179-215`) | por idempotência: agregado por **MAX** por `sessionId\|path` (`analyticsShared.ts:319-322`) — reenvio nunca soma | artigo, sessão |
| `category` | — | `{type, path*, sessionId*, category*}` — mount da página de listagem (`web/pages/CategoryArchivePage.tsx:21,26`) | **nenhum** (escapa do dedup de 15s — fronteira: PRD 03) | categoria, sessão; alimenta "cliques" do card Top categorias |
| `scroll` | **scroll_depth** | `{type, path*, sessionId*, scrollDepth* ∈ {25,50,75,100}, articleId?}` (`useAnalytics.ts:276-339`) | client: sessão×conteúdo (`bee_scroll_<id>`/`bee_scroll_p:<path>`); agregação: Set por `sessionId\|articleId ?? path` (`analyticsShared.ts:330`) | artigo, sessão |
| `share` | share | `{type, path*, sessionId*, platform* (facebook/twitter/whatsapp/copy), articleId?}` (`useAnalytics.ts:241-244`; `web/pages/Artigo.tsx:139-151`) | nenhum (cada clique conta) | artigo, sessão |

Campos derivados pelo SERVIDOR em toda a família A (nunca confiados do body):
`device`, `browser`/`os` (UA), `ts`, `city`/`region` (geo por IP, só pageview
não-interno), `is_internal` (tripla flag/IP cadastrado/IP privado,
`analytics.ts:239-243`), `referrer` = canal classificado (PRD 05 é o dono da regra).

**Família B — comportamento (`behavior_events`, `POST /api/analytics/behavior`,
`event_type` text + whitelist):**

| Evento | Alias doc v2 | Payload padrão | Dedup | Relacionamentos |
|---|---|---|---|---|
| `search` | search | `{eventType, sessionId*, value* = termo (client corta em 200, servidor em 500)}` (`useAnalytics.ts:261-264`) | nenhum | sessão |
| `link_click` | **click_external** | `{eventType, sessionId*, value* = URL externa ≤500, articleId?}` (`useAnalytics.ts:266-268`; emissores só no corpo do artigo — limitação do item 23, PRD 02) | nenhum | artigo, sessão; agregado por domínio no `/stats` |
| `newsletter` | **newsletter_signup** | `{eventType, sessionId*, value = e-mail}` — ATENÇÃO: 2 emissores fora do padrão sem consent/internal (§2.3; correção PRD 02) | nenhum | sessão |
| `video_play` | — | **RESERVADO** (RF6): aceito no servidor, SEM emissor no client | — | — |
| `download` | — | **RESERVADO** (RF6): aceito no servidor, SEM emissor no client | — | — |

**Família C — anúncios (agregados: `ad_daily_stats` por dia BRT + all-time em
`ads`; SEM evento individual persistido):**

| Evento | Alias doc v2 | Endpoint | Payload | Relacionamentos |
|---|---|---|---|---|
| impressão de anúncio | **impression_ad** | `POST /api/ads/:id/impression` (`ads.ts:184-220`) | hoje sem body; pós-PRD 04: `{sessionId?, path?, internal?}` | anúncio (`ad_id` = id de `ads` OU chave `block:<id>` de bloco da home; pseudo-bloco `block:header-banner`); sessão (dedup server do PRD 04) |
| clique de anúncio | **click_ad** | `POST /api/ads/:id/click` (`ads.ts:141-181`) | idem | idem |

**Entidades implícitas/derivadas (não são tipos de evento — NUNCA criar endpoint
para elas):**

| Conceito | Alias doc v2 | Derivação |
|---|---|---|
| sessão | **session_start** | implícita: `sessionId` gerado por aba (`bee_session_id`, sessionStorage — `useAnalytics.ts:21-32`); "sessões únicas" = `sessionId` distintos com pageview na janela (`analytics.ts:506`) |
| visitante | — | `visitorId` UUID em localStorage criado SÓ pós-consentimento (`useAnalytics.ts:36-50`) |
| leitura-100% | **article_read_complete** | derivada: `scrollSessions[100].size` (pares sessão×conteúdo com marco 100 — `analytics.ts:513`) |
| canal de origem | — | `referrer` da linha first-touch (classificado NO SERVIDOR — invariante §17; regra: PRD 05) |

Relacionamento geral: **não há foreign keys por design** — eventos referenciam
artigo/categoria/anúncio por id/slug textual e sobrevivem à exclusão do alvo
(anúncio deletado mantém histórico em `ad_daily_stats`; auditoria §4.9 registra os
recortes órfãos). Validação referencial acontece no ingest quando existe (anúncio
ativo/bloco visível — `ads.ts:193-210`).

### RF2 — Fonte única da taxonomia em código

- Extrair a whitelist inline do `/behavior` para constante exportada em
  `api/lib/analyticsShared.ts` (arquivo de lógica pura, zero imports — header
  `:1-7`), ao lado de `VALID_TYPES` (`:27`):

  ```ts
  /** Tipos de behavior_events. video_play/download: RESERVADOS (sem emissor no
   *  client — ver docs/ANALYTICS.md, Taxonomia). Valores são persistidos: nunca
   *  renomear. */
  export const BEHAVIOR_TYPES: ReadonlySet<string> = new Set([
    "search", "link_click", "newsletter", "video_play", "download",
  ]);
  ```

- O handler `/behavior` passa a usar `BEHAVIOR_TYPES` no lugar do `ALLOWED` local
  (`analytics.ts:325-326`) — refactor estritamente comportamento-preservante
  (mesmos 5 valores).
- Corrigir o comentário desatualizado de `db/schema/behavior_events.ts:5` para
  listar os 5 tipos + nota "reservados: video_play/download".
- Teste novo (§12) trava os dois conjuntos contra o dicionário do RF1.

### RF3 — Coluna `behavior_events.is_internal` (Drizzle + ensureSchema; coluna AQUI, marcação no PRD 03)

- Nova coluna `is_internal boolean NOT NULL DEFAULT false` em `behavior_events`,
  nos DOIS lugares (§6.2).
- **Este PRD NÃO muda o handler `/behavior`**: o drop de interno em
  `analytics.ts:328-330` permanece como está (exceção documentada, transitória)
  até o PRD 03 trocá-lo por marcação — fronteira explícita do STATUS.md
  ("coluna → PRD 01; lógica de marcação no ingest → PRD 03"). Com a coluna criada
  e default `false`, todas as linhas existentes e novas continuam com a semântica
  atual ("tudo que está gravado é não-interno") — a mudança é INERTE até o PRD 03.
- Quando o PRD 03 ativar a marcação, os leitores de `behavior_events`
  (`analytics.ts:683-710` — behaviorStats; `:756-760` — payload) precisarão do
  filtro `is_internal = false`; esse ajuste de leitura pertence ao PRD 03/07 e fica
  registrado aqui apenas como dependência (§14).

### RF4 — Índices-base espelhados no `ensureSchema` (fechar a lacuna do §2.2)

Adicionar ao array `statements` (`ensureSchema.ts:24-75`) os índices que hoje só
existem via push manual — todos `IF NOT EXISTS` (no-op imediato nos bancos
atuais, que já os têm pela migração; converge bancos futuros ou incompletos):

- `analytics_events`: `analytics_ts_idx`, `analytics_type_ts_idx`,
  `analytics_session_idx`, `analytics_article_idx` (espelho de
  `db/schema/analytics.ts:41-44` / `0000_init.sql:315-318`).
- `behavior_events`: `behavior_type_ts_idx`, `behavior_ts_idx`,
  `behavior_session_idx` (espelho de `behavior_events.ts:11-15` /
  `0000_init.sql:323-325`).
- `geo_stats`: `geo_stats_region_idx`, `geo_stats_city_idx` (espelho de
  `0000_init.sql:319-320`).

**Fora deste RF, por decisão explícita**: (a) índices de `ad_daily_stats` — o
PRD 04 substitui `ad_daily_ad_date_idx` pelo único `ad_daily_ad_date_uniq` e é o
dono dessa transição (adicionar o índice comum aqui criaria trabalho para o PRD 04
desfazer); (b) `CREATE TABLE` das tabelas-base — a criação-base continua no fluxo
de instalação (`drizzle-kit push` manual/migração `0000_init.sql`, conforme a
docstring `ensureSchema.ts:1-14`); o `ensureSchema` é o mecanismo de EVOLUÇÃO
incremental, não de bootstrap do schema inteiro (duplicá-lo inteiro dobraria a
superfície de manutenção sem ganho: nenhum banco em produção nasce sem as
tabelas-base).

### RF5 — Processo padrão de migração de schema (obrigatório para os PRDs 02–12 e além)

Checklist canônica, a registrar em `docs/ANALYTICS.md` (RF8) e a seguir em TODA
mudança de schema de analytics:

1. Editar o schema Drizzle (`lib/db/src/schema/*.ts`) — fonte da verdade de tipos
   e queries.
2. `cd lib/db && pnpm exec tsc -b` (pacote composite; dist gitignored — CLAUDE.md
   §2/§14) ANTES de typecheckar api-server.
3. Adicionar statement idempotente EQUIVALENTE no `api/lib/ensureSchema.ts`
   (mesmo commit): `ADD COLUMN IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` /
   `CREATE UNIQUE INDEX IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` (para
   tabelas NOVAS de feature, precedente `ingest_nonces` `:44` e
   `social_connections` `:59-74`).
4. **UNIQUE sobre dados possivelmente violadores**: precedido de rotina de
   dedup/reparo transacional com guarda de idempotência (precedente: PRD 04 RF2 —
   `ensureAdDailyStatsIntegrity`; a auditoria §5 invariante 5 exige o dedup antes
   do CREATE UNIQUE INDEX, senão ele falha para sempre em try/catch).
5. **Tipo novo de evento**: preferir a família B (`behavior_events.event_type` é
   `text` + whitelist em código — basta ampliar `BEHAVIOR_TYPES`). Se for
   inevitável ampliar o enum `analytics_event_type`, usar
   `ALTER TYPE analytics_event_type ADD VALUE IF NOT EXISTS '<valor>'` como
   statement isolado no `ensureSchema` (roda fora de transação — o loop
   `:76-82` executa statement a statement) E adicionar o valor ao pgEnum do
   Drizzle (`db/schema/analytics.ts:3-5`) e a `VALID_TYPES`
   (`analyticsShared.ts:27`). Nunca REMOVER nem RENOMEAR valor de enum.
6. Leituras/agregações defensivas: o `ensureSchema` é não-fatal (`:76-82`) — um
   banco onde o statement falhou fica sem a coluna até o próximo boot; código que
   lê coluna nova deve tolerar `NULL`/ausência sem lançar.
7. `node --test` no api-server + typecheck por pacote (CLAUDE.md §14).
8. Rollout §6 do CLAUDE.md (bump `BLOG_IMAGE_VERSION`, canário resenhavip, demais
   blogs) + verificação por banco com `information_schema.columns`/`pg_indexes`
   (padrão §12 do CLAUDE.md — blocos prontos no §8 deste PRD).
9. Registrar a mudança na seção Taxonomia/Modelo de `docs/ANALYTICS.md`.

**Proibições permanentes** (violação = quebra de invariante §17): depender de
`drizzle-kit push` no deploy; statement destrutivo (`DROP COLUMN`/`ALTER ... TYPE`
que reescreva dados) no `ensureSchema`; `UPDATE` em massa de `analytics_events`
("linhas históricas nunca são reescritas" — `analyticsShared.ts:143`); renomear
valores persistidos; condicionar schema a BLOG_ID.

### RF6 — Decisão `video_play`/`download`: MANTER como tipos RESERVADOS

**Decisão: manter na whitelist, sem emissor, documentados como reservados.**
Racional: (a) removê-los não conserta nada (nenhum card os exibe individualmente;
só entram em `behaviorStats.totalEvents`, `analytics.ts:757`) e quebraria um
cliente futuro legítimo; (b) mantê-los custa zero; (c) são plausíveis a curto
prazo (embeds de vídeo nos blogs de esporte; downloads de material B2B no
pontofarma/creditovc — CLAUDE.md §4); (d) enquanto NÃO existe emissor, qualquer
linha `video_play`/`download` em `behavior_events` é, por definição, tráfego
forjado ou de teste — um sinal de sanidade GRATUITO. Consequências normativas:

- A taxonomia (RF1) e o `docs/ANALYTICS.md` (RF8) os marcam "RESERVADO — sem
  emissor no client; linha existente = anomalia".
- **Regra de sanidade oferecida ao PRD 11/08**: `count(behavior_events onde
  event_type IN ('video_play','download')) > 0` ⇒ alerta de tráfego
  forjado/teste, por blog, enquanto não houver emissor oficial (quando o PRD 02 ou
  outro criar o emissor, a regra é removida no mesmo commit).
- O PRD 02 NÃO deve criar emissores para eles (fora do escopo dele — a lista de
  eventos ausentes do módulo 02 no doc v2 não os inclui).

### RF7 — Ratificação dos nomes das extensões dos PRDs 04/05 (fecha a cláusula "PRD 01 manda")

Este PRD RATIFICA, sem alteração, os nomes já especificados:

| Extensão | Nome canônico ratificado | Dono da implementação |
|---|---|---|
| Dimensão interna de ads (colunas em `ad_daily_stats`) | `internal_impressions integer NOT NULL DEFAULT 0`, `internal_clicks integer NOT NULL DEFAULT 0` (Drizzle: `internalImpressions`/`internalClicks`) | **PRD 04** §6 |
| Constraint de unicidade diária de ads | índice único `ad_daily_ad_date_uniq` em `(ad_id, date)`; remoção do comum `ad_daily_ad_date_idx` | **PRD 04** §6 (com reparo RF2 de lá) |
| Marcador de confiabilidade de ads | key `ads_reliable_since` na tabela `settings` (KV) | **PRD 04** RF2 |
| Sinais crus de click-id | `analytics_events.gclid boolean NULL`, `analytics_events.fbclid boolean NULL` (só booleano de presença; NULL = pré-regra/não-first-touch) | **PRD 05** (Modelo de dados) |
| Cadastro de campanhas pagas | campo `paidCampaigns: PaidCampaign[]` DENTRO do JSON de `site_settings` (tabela `settings` KV) — sem tabela nova; redigido do `/api/site` | **PRD 05** RF-1/RF-7 |
| Dimensão interna de behavior | `behavior_events.is_internal boolean NOT NULL DEFAULT false` | **este PRD** (coluna) + **PRD 03** (marcação) |

Convenções gerais ratificadas: colunas snake_case no banco/camelCase no Drizzle
(padrão existente); flags internas sempre `boolean NOT NULL DEFAULT false` quando a
semântica retroativa correta é "não-interno" (caso de `behavior_events`) e
`boolean NULL` quando o histórico é indeterminável (caso de `gclid`/`fbclid`);
extensões de configuração leve vão no JSON de `site_settings` ou em key própria da
tabela `settings` — nunca tabela nova sem necessidade de query relacional.

### RF8 — Documentação

Atualizar `docs/ANALYTICS.md` na implementação: (a) nova seção "Taxonomia canônica
de eventos" = tabelas do RF1 (com aliases do doc v2); (b) nova seção "Processo de
migração de schema" = checklist do RF5; (c) nota dos tipos reservados (RF6);
(d) corrigir o comentário de `behavior_events.ts:5` (RF2). Não alterar as seções de
dicionário de métricas existentes (donos: PRDs 06/07).

---

## 5. Requisitos não-funcionais

- **Performance**: coluna nova com `DEFAULT false` é metadata-only no Postgres 11+
  (sem rewrite da tabela); os `CREATE INDEX IF NOT EXISTS` do RF4 são no-op nos
  bancos atuais (índices já existem) — custo de boot ~zero; nenhum caminho quente
  de leitura muda. Nenhuma query nova no `/stats`.
- **LGPD**: nenhuma coleta nova. A taxonomia DOCUMENTA os dados pessoais já
  presentes (e os PRDs donos): `newsletter.value` = e-mail em texto claro em
  `behavior_events` hoje sem gate de consentimento nos 2 formulários (PRD 02);
  `visitorId` = UUID aleatório pós-consentimento sem fingerprinting
  (`useAnalytics.ts:34-50`); IP transiente (`_ip` nunca vai ao banco —
  `analytics.ts:46-48`); geolocalização via ip-api.com (limitações registradas na
  auditoria §4.8 — fora deste PRD). Parte da rede opera conteúdo
  político-adjacente: não introduzir rastreio novo é requisito.
- **Confiabilidade**: statements idempotentes em try/catch não-fatal (padrão
  `ensureSchema.ts:76-82`); boot repete até convergir; a coluna do RF3 é inerte
  (nenhum comportamento muda até o PRD 03).
- **Multi-blog**: mesma imagem para os 8 blogs; schema se autocria no boot de cada
  banco (sp011/Supabase via `SUPABASE_DATABASE_URL`; replicados via
  `db-config.enc`). Zero passo manual por blog. Rollout §6 obrigatório (§8.3).
- **Windows/dev (CLAUDE.md §14)**: `pnpm exec tsc -b` em `lib/db` após mexer no
  schema; typecheck por pacote (o filtro da raiz não casa no Windows); testes só
  `node --test` com imports `.ts` explícitos; sem unicode literal em regex; build
  real na VPS.

---

## 6. Modelo de dados

Colunas/índices novos SEMPRE nos DOIS lugares (CLAUDE.md §17 — o deploy NÃO roda
`drizzle-kit push`; blogs criam no boot via `ensureSchema`).

### 6.1 Coluna nova deste PRD — `db/schema/behavior_events.ts`

```ts
import { pgTable, serial, text, timestamp, index, boolean } from "drizzle-orm/pg-core";

export const behaviorEventsTable = pgTable("behavior_events", {
  id:        serial("id").primaryKey(),
  // 'search' | 'link_click' | 'newsletter' | 'video_play' | 'download'
  // (video_play/download RESERVADOS — sem emissor no client; ver docs/ANALYTICS.md)
  eventType: text("event_type").notNull(),
  value:     text("value"),               // termo de busca, URL externa, e-mail…
  sessionId: text("session_id").notNull(),
  device:    text("device"),
  articleId: text("article_id"),
  ts:        timestamp("ts", { withTimezone: true }).notNull(),
  // Tráfego interno (PRD 01: coluna; PRD 03: marcação no ingest). Até o PRD 03,
  // o handler continua DROPANDO interno — toda linha gravada é false.
  isInternal: boolean("is_internal").notNull().default(false),
}, (t) => [
  index("behavior_type_ts_idx").on(t.eventType, t.ts),
  index("behavior_ts_idx").on(t.ts),
  index("behavior_session_idx").on(t.sessionId),
]);
```

Após editar: `cd lib/db && pnpm exec tsc -b` antes de typecheckar o api-server.

### 6.2 `ensureSchema.ts` — statements novos (no array `statements`, todos idempotentes)

```ts
// PRD 01 — dimensão interna de behavior_events (coluna aqui; marcação no PRD 03).
sql`ALTER TABLE behavior_events ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false`,
// PRD 01 — índices-base espelhados (hoje só na migração 0000_init.sql; no-op onde
// já existem — fecham a lacuna "4 dos 5 índices dependem de push manual").
sql`CREATE INDEX IF NOT EXISTS analytics_ts_idx ON analytics_events (ts)`,
sql`CREATE INDEX IF NOT EXISTS analytics_type_ts_idx ON analytics_events (type, ts)`,
sql`CREATE INDEX IF NOT EXISTS analytics_session_idx ON analytics_events (session_id)`,
sql`CREATE INDEX IF NOT EXISTS analytics_article_idx ON analytics_events (article_id)`,
sql`CREATE INDEX IF NOT EXISTS behavior_type_ts_idx ON behavior_events (event_type, ts)`,
sql`CREATE INDEX IF NOT EXISTS behavior_ts_idx ON behavior_events (ts)`,
sql`CREATE INDEX IF NOT EXISTS behavior_session_idx ON behavior_events (session_id)`,
sql`CREATE INDEX IF NOT EXISTS geo_stats_region_idx ON geo_stats (region)`,
sql`CREATE INDEX IF NOT EXISTS geo_stats_city_idx ON geo_stats (city)`,
```

### 6.3 Extensões de OUTROS PRDs (ratificadas no RF7 — NÃO implementar aqui)

`ad_daily_stats`: `internal_impressions`/`internal_clicks` + `ad_daily_ad_date_uniq`
(+ reparo) → **PRD 04** §6. `analytics_events`: `gclid`/`fbclid` → **PRD 05**.
`settings`: keys/campos `ads_reliable_since` (PRD 04) e `paidCampaigns` (PRD 05).
Os statements deles são idempotentes — qualquer ordem de rollout entre 01/04/05
converge (ver §11).

### 6.4 O que NÃO muda

Nenhuma alteração em `analytics_events` (colunas), `ads`, `article_views`,
`category_views`, `geo_stats` (colunas), enums, nem em qualquer handler de rota
além do refactor do RF2 (whitelist importada — comportamento idêntico).

---

## 7. Contrato de API

**Nenhum endpoint novo; nenhum shape de request/response muda.** Este PRD
CANONIZA os contratos atuais de ingest (a tabela do RF1 é o contrato de payload) e
registra as referências:

| Endpoint | Contrato (inalterado) |
|---|---|
| `POST /api/analytics/event` | Body da família A (RF1); obrigatórios `type` ∈ `VALID_TYPES`, `path` ≤500, `sessionId` ≤100; resposta `{ok:true}` (sempre 200 em descarte silencioso; 400 só payload inválido — `analytics.ts:216-236`) |
| `POST /api/analytics/behavior` | Body da família B (RF1); obrigatórios `eventType` ∈ `BEHAVIOR_TYPES` (RF2 — mesmos 5 valores de hoje), `sessionId`; resposta `{ok:true}`/400 (`analytics.ts:320-326`) |
| `POST /api/ads/:id/impression`, `/click` | Contrato atual sem body; evolução do body é do **PRD 04** §7 (ratificado) |
| `GET /api/analytics/stats` | Shape intacto (`analytics.ts:366,715-762`); valores intactos (este PRD é inerte) |
| `GET /api/analytics/health` | Intacto (`analytics.ts:351-363`); campo `adsReliableSince` é do PRD 04 |

Assinatura interna nova (não-HTTP):

```ts
// api/lib/analyticsShared.ts
export const BEHAVIOR_TYPES: ReadonlySet<string>; // RF2 — fonte única da família B
```

---

## 8. Comandos de verificação (rodar exatamente estes)

### 8.1 Local (Windows, antes do commit)

```powershell
cd "c:\Users\Usuario(a) Master\sp011\lib\db"
pnpm exec tsc -b
# esperado: exit 0 (schema novo compila)

cd "c:\Users\Usuario(a) Master\sp011\artifacts\api-server"
pnpm run typecheck
# esperado: sem erros
node --test "test/**/*.test.ts"
# esperado: TODOS passam, incluindo o novo test/analyticsTaxonomy.test.ts (§12)
```

```powershell
cd "c:\Users\Usuario(a) Master\sp011"
git grep -n "is_internal" -- lib/db/src/schema/behavior_events.ts artifacts/api-server/src/lib/ensureSchema.ts
# esperado: >=1 ocorrencia em CADA um dos dois arquivos (coluna nos DOIS lugares)
git grep -n "BEHAVIOR_TYPES" -- artifacts/api-server/src
# esperado: definicao em lib/analyticsShared.ts E uso em routes/analytics.ts
git grep -Fn 'new Set(["search"' -- artifacts/api-server/src/routes
# esperado: NENHUM resultado (whitelist inline removida — fonte unica)
git grep -Fn 'eventType: "video_play"' -- artifacts/brasilia-agora/src
git grep -Fn 'eventType: "download"' -- artifacts/brasilia-agora/src
# esperado: NENHUM resultado nos dois (tipos continuam SEM emissor — reservados)
git diff --stat HEAD~1 -- artifacts/brasilia-agora
# esperado: vazio (este PRD nao toca o client)
```

### 8.2 VPS — estado do banco após o boot da imagem nova — **PENDENTE DE EXECUÇÃO**

(MCP Supabase não conectado na escrita deste PRD; blocos completos para colar,
padrão CLAUDE.md §12.) **sp011** (Supabase):

```bash
cd /opt/sp011
DBURL=$(grep -m1 '^SUPABASE_DATABASE_URL=' /opt/sp011/.env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
# V1 — coluna nova de behavior_events (esperado: 1 linha "is_internal | boolean | false-ish default")
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name='behavior_events' AND column_name='is_internal';"
# V2 — indices espelhados presentes (esperado: 9 linhas — 4 analytics_*, 3 behavior_*, 2 geo_stats_*)
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "SELECT indexname FROM pg_indexes WHERE indexname IN ('analytics_ts_idx','analytics_type_ts_idx','analytics_session_idx','analytics_article_idx','behavior_type_ts_idx','behavior_ts_idx','behavior_session_idx','geo_stats_region_idx','geo_stats_city_idx') ORDER BY 1;"
# V3 — coluna e inerte: toda linha existente e false (esperado: internos=0)
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "SELECT count(*) AS total, count(*) FILTER (WHERE is_internal) AS internos FROM behavior_events;"
```

**Blog replicado** (repetir por blog trocando a 1ª linha; banco local = BLOG_ID):

```bash
BLOG='resenhavip'
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d "$BLOG" -v ON_ERROR_STOP=1 -c "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name='behavior_events' AND column_name='is_internal';"
docker compose exec -T pg-blogs psql -U postgres -d "$BLOG" -v ON_ERROR_STOP=1 -c "SELECT count(*) AS indices FROM pg_indexes WHERE indexname IN ('analytics_ts_idx','analytics_type_ts_idx','analytics_session_idx','analytics_article_idx','behavior_type_ts_idx','behavior_ts_idx','behavior_session_idx','geo_stats_region_idx','geo_stats_city_idx');"
# esperado: indices = 9
docker compose exec -T pg-blogs psql -U postgres -d "$BLOG" -v ON_ERROR_STOP=1 -c "SELECT count(*) AS total, count(*) FILTER (WHERE is_internal) AS internos FROM behavior_events;"
# esperado: internos = 0
```

Comportamento do `/behavior` inalterado (teste ativo SEGURO — usa `internal:true`,
que o handler atual DROPA; UA de navegador porque `curl/` cai no BOT_RE,
`trafficGuard.ts:14-19`):

```bash
DOM='https://resenhavip.midia.run'
cd /opt/sp011
# contagem antes
docker compose exec -T pg-blogs psql -U postgres -d resenhavip -c "SELECT count(*) FROM behavior_events;"
curl -s -X POST "$DOM/api/analytics/behavior" -A "Mozilla/5.0 (verificacao PRD01)" -H 'Content-Type: application/json' -d '{"eventType":"search","sessionId":"prd01-verif","value":"teste prd01","internal":true}'
# esperado: {"ok":true}
# contagem depois — esperado: IGUAL a antes (interno continua dropado ate o PRD 03)
docker compose exec -T pg-blogs psql -U postgres -d resenhavip -c "SELECT count(*) FROM behavior_events;"
# tipo reservado (RF6) — aceito pelo contrato, mas por vir com internal:true nao grava:
curl -s -X POST "$DOM/api/analytics/behavior" -A "Mozilla/5.0 (verificacao PRD01)" -H 'Content-Type: application/json' -d '{"eventType":"video_play","sessionId":"prd01-verif","internal":true}'
# esperado: {"ok":true} e contagem inalterada
docker compose exec -T pg-blogs psql -U postgres -d resenhavip -c "SELECT count(*) FROM behavior_events;"
```

### 8.3 Rollout multi-blog (CLAUDE.md §6 — obrigatório)

Arquivos tocados → serviços (§5): `lib/db` + `artifacts/api-server` → `api`.
(`web` não é tocado por este PRD, mas o bump de imagem versiona os dois — build
padrão do §6 cobre ambos.) Bump + build + sp011:

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
# canário (resenhavip) — conferir V1/V2/V3 do §8.2 e os cards do §9/CA9 ANTES de seguir
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

**Cards do dashboard a revalidar POR BLOG após o rollout** — este PRD é INERTE:
o critério é NÃO-REGRESSÃO (valores idênticos aos pré-rollout na mesma janela; em
blog novo, estados vazios continuam vazios). Em sp011.com.br, ksports.bebee.me,
esporteagora.midia.run, resenhavip.midia.run, oleysports.midia.run,
beeesportes.midia.run (+ pontofarma/creditovc quando no ar):

1. Analytics → **Resumo de interações** (item 24 — leitor de `behavior_events`).
2. Analytics → **Termos mais buscados** e **Links externos clicados** (itens 22/23
   — leitores de `behavior_events`).
3. Analytics → **Saúde da coleta** (item 25 — contadores continuam funcionando).
4. Analytics → **5 KPIs** + **Tráfego ao longo do tempo** (itens 5–10 — leitores
   de `analytics_events`, que só ganhou índices no-op).
5. Dashboard → **Views hoje/7 dias** + **Top categorias** + **Propagandas**
   (itens 1–4 — inalterados).

---

## 9. Critérios de aceite

Mapeamento: itens **24** e **25** da checklist (fundação de auditoria interna) +
não-regressão de TODOS os cards; regras do PRD 11 habilitadas: as 6 regras do doc
v2 passam a ter modelo de dados suficiente por blog, e este PRD ADICIONA a regra
"tipo reservado > 0 ⇒ anomalia" (RF6). Nenhum critério é subjetivo; os que exigem
banco/produção estão marcados **PENDENTE DE EXECUÇÃO** (MCP Supabase não conectado
na escrita — nunca marcar como atendido sem rodar o comando na VPS).

| # | Critério | Verificação | Status na escrita |
|---|---|---|---|
| CA1 | Typecheck de `lib/db` e `api-server` passa; `node --test` passa incluindo `test/analyticsTaxonomy.test.ts` | §8.1 → exit 0 / todos ok | a executar no dev |
| CA2 | `behavior_events.is_internal` existe NOS DOIS lugares do repo (Drizzle E ensureSchema) | grep do §8.1 → ≥1 hit em cada arquivo | a executar no dev |
| CA3 | Whitelist do `/behavior` tem fonte única exportada (`BEHAVIOR_TYPES`) e a inline foi removida; conjuntos idênticos aos 5 valores atuais | greps do §8.1 + teste do §12 (igualdade de conjuntos) | a executar no dev |
| CA4 | Client intocado: nenhum diff em `artifacts/brasilia-agora` e zero emissor de `video_play`/`download` | `git diff --stat` + greps do §8.1 → vazios | a executar no dev |
| CA5 | Coluna criada no banco pelo boot em sp011 E ≥1 blog replicado, com default false e 0 linhas internas (inércia) | §8.2 V1+V3 | **PENDENTE DE EXECUÇÃO** |
| CA6 | 9 índices espelhados presentes por banco (sp011 + replicados) | §8.2 V2 | **PENDENTE DE EXECUÇÃO** |
| CA7 | `/behavior` preserva comportamento: POST com `internal:true` responde `{ok:true}` e NÃO grava (contagem inalterada), inclusive para tipo reservado | teste ativo do §8.2 | **PENDENTE DE EXECUÇÃO** |
| CA8 | Taxonomia canônica publicada em `docs/ANALYTICS.md` cobrindo os 12 eventos + 4 entidades derivadas do RF1, com aliases do doc v2 e marcação RESERVADO | `git grep -n "Taxonomia" docs/ANALYTICS.md` → seção existe; grep dos 12 nomes canônicos na seção → todos presentes | a executar no dev |
| CA9 | Não-regressão dos cards por blog após rollout: os 5 grupos do §8.3 exibem, na mesma janela, os mesmos valores de antes do rollout (blog novo: estados vazios idênticos) | observação objetiva no admin de cada blog (comparação antes/depois na mesma janela) | **PENDENTE DE EXECUÇÃO** |
| CA10 | Processo de migração (RF5) publicado com as proibições; PRDs 04/05 permanecem consistentes com os nomes ratificados (RF7) | `git grep -n "internal_impressions" analytics-audit/04-propagandas-impressoes-e-cliques.md` → hit; `git grep -n "gclid" analytics-audit/05-fontes-de-trafego-e-classificacao.md` → hit; seção do processo presente em `docs/ANALYTICS.md` | a executar no dev |
| CA11 | Regra de sanidade dos reservados formalizada para o PRD 11/08: SQL abaixo devolve 0 linhas em todos os blogs (linha >0 = anomalia a investigar, não bloqueio) | `SELECT event_type, count(*) FROM behavior_events WHERE event_type IN ('video_play','download') GROUP BY 1;` por banco (padrão §12) | **PENDENTE DE EXECUÇÃO** |

---

## 10. Invariantes do §17 preservadas por este PRD

1. **"Migrações de coluna via Drizzle schema E ensureSchema"** — é o OBJETO deste
   PRD: cumprida no §6 (os dois lugares) e formalizada como processo (RF5) com o
   corolário "colunas novas se autocriam no boot" (§17 último bullet — zero
   migração manual por blog).
2. **"Tráfego interno marcado `is_internal`, nunca dropado"** — este PRD cria a
   COLUNA que torna possível alinhar o `/behavior` à invariante; o handler
   continua com a exceção documentada (drop — `analytics.ts:328-330`) ATÉ o
   PRD 03, e este PRD declara explicitamente essa transição (RF3). Nenhum
   comportamento de marcação/drop muda aqui.
3. **"Heartbeat cumulativo agregado por MAX"** — não tocada; a taxonomia (RF1)
   DOCUMENTA `read` como cumulativo/MAX (`analyticsShared.ts:319-327`), reforçando
   a invariante para sessões futuras.
4. **"`totals.*` do /stats fixos ao agora"** — não tocada (`analytics.ts:374-381,
   515-524` intactos).
5. **"Canal classificado no servidor"** — não tocada; a taxonomia registra que
   `referrer` = canal classificado server-side e que a regra pertence ao PRD 05.
6. **SSR/perf (`no-cache` nunca `no-store`, sanitize isomórfico, proxy de
   imagem)** — não tocadas (client sem nenhum diff — CA4).
7. **Isolamento entre blogs / nada hardcodado por blog na imagem** — schema e
   taxonomia 100% genéricos; nenhuma referência a BLOG_ID.
8. **"Linhas históricas nunca são reescritas"** (precedente
   `analyticsShared.ts:143`) — nenhum UPDATE em `analytics_events`/
   `behavior_events`; a coluna nova nasce com DEFAULT sem reescrever histórico
   (ADD COLUMN com default é metadata-only).

---

## 11. Casos de borda

- **Ordem de rollout entre PRDs 01/04/05**: todos os statements de schema são
  idempotentes (`IF NOT EXISTS`); qualquer ordem converge. Se o PRD 04 for
  implementado antes deste, os statements dele já estarão no `ensureSchema` — este
  PRD só ADICIONA os seus (sem tocar nos dele). Conflito de nomes está eliminado
  pela ratificação (RF7).
- **Boot com banco fora/lento**: try/catch não-fatal (`ensureSchema.ts:76-82`) —
  o blog sobe sem a coluna e o próximo boot converge. Como a coluna é inerte
  (nenhum leitor a usa até o PRD 03), não há janela de erro de SELECT. ATENÇÃO
  para o PRD 03: quando o Drizzle passar a PROJETAR `is_internal` em queries de
  `behavior_events`, um banco que falhou o boot quebraria a query — o PRD 03 deve
  herdar esta nota (a docstring `ensureSchema.ts:9-11` descreve exatamente esse
  modo de falha com `social_title`).
- **`ADD COLUMN ... NOT NULL DEFAULT false` em tabela populada**: metadata-only no
  Postgres 11+ (pg-blogs é postgres:16; Supabase ≥15) — sem lock longo, sem
  rewrite. Volumes atuais são mínimos (blogs novos) de toda forma.
- **`CREATE INDEX` não-concorrente no boot**: no-op nos bancos atuais (índices
  já existem). Só criaria de fato num banco futuro/incompleto — tabelas nascem
  vazias nesse cenário; custo ~zero. Não usar `CONCURRENTLY` (não roda em
  contexto transacional de algumas pools e é desnecessário aqui).
- **Rollback de imagem com coluna criada**: a imagem antiga ignora a coluna
  (Drizzle antigo não a projeta); os índices extras são inofensivos. Rollback de
  código não exige rollback de schema (§13).
- **Enum `analytics_event_type` em bancos com o valor "faltando"**: hoje os 5
  valores existem em todos os bancos (migração 0000). O caso só surge se um PRD
  futuro ampliar o enum — coberto pelo passo 5 do RF5 (`ALTER TYPE ... ADD VALUE
  IF NOT EXISTS`, statement isolado). Este PRD não amplia enum nenhum.
- **`sessionId` degradado** (`"unknown"` quando sessionStorage bloqueado —
  `useAnalytics.ts:29-31`): a taxonomia registra que TODOS os relacionamentos por
  sessão colapsam num balde `unknown` nesse cenário (sessões únicas subcontam;
  dedup server de ads do PRD 04 degrada por IP). Comportamento pré-existente,
  documentado — não corrigido aqui (client é PRD 02).
- **POST forjado de tipo reservado com `internal` ausente e IP público**: grava
  linha em `behavior_events` (comportamento atual, inalterado) — é exatamente o
  que a regra do CA11 detecta. O bloqueio/contadores de forja são PRD 03/08.
- **Nomes duplicados entre famílias** (`category` evento vs `category` campo do
  pageview; `referrer` coluna vs `referrer` body legado ≤20 chars,
  `analytics.ts:257`): ambiguidade real do código atual — o dicionário do RF1
  os distingue explicitamente (evento `category` = visita à listagem; campo
  `category` = categoria do artigo do pageview; body `referrer` = canal legado do
  bundle antigo, coluna `referrer` = canal classificado).

---

## 12. Plano de testes (`node --test`, CLAUDE.md §14)

Arquivo novo `artifacts/api-server/test/analyticsTaxonomy.test.ts` (imports
relativos com extensão `.ts` explícita; sem unicode literal em regex; padrão das
suites existentes `test/analyticsShared.*.test.ts`). Tudo função pura/constantes —
sem banco, sem Express:

1. **Família A fechada**: `VALID_TYPES` contém EXATAMENTE
   `{pageview, read, category, scroll, share}` (igualdade de conjunto, não
   subconjunto — pega adição acidental).
2. **Família B fechada**: `BEHAVIOR_TYPES` contém EXATAMENTE
   `{search, link_click, newsletter, video_play, download}`.
3. **Famílias disjuntas**: interseção `VALID_TYPES` × `BEHAVIOR_TYPES` vazia
   (nenhum tipo pode existir nas duas tabelas — ambiguidade de destino).
4. **Marcos de scroll**: `SCROLL_MILESTONES` = `{25, 50, 75, 100}` e
   `MAX_READ_SECONDS` = 1800 (âncoras do dicionário; mudou = atualizar
   docs/ANALYTICS.md junto — o teste força a percepção).
5. **Catálogo de canais**: `CHANNELS` contém exatamente os 8 canais documentados
   na taxonomia (`analyticsShared.ts:97`) — trava contra rename acidental de valor
   persistido.
6. **Suites existentes continuam passando**: `node --test "test/**/*.test.ts"`
   (nenhuma expectativa muda — o refactor do RF2 é comportamento-preservante).

Dados sintéticos apenas; nenhum teste toca banco real. Validação com dados reais é
exclusivamente via §8.2 na VPS (**PENDENTE DE EXECUÇÃO**) — o teste ativo usa
`internal:true` justamente para nunca poluir métricas públicas de produção.

---

## 13. Plano de rollback

Cenário A — **bug de código** (ex.: typo no ensureSchema derruba o boot; regressão
no `/behavior`): rollback de imagem por blog, SEM tocar no schema (coluna e
índices novos são inofensivos para a imagem antiga — Drizzle antigo não os
projeta):

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

**NÃO dropar** a coluna nem os índices no rollback: são aditivos, inertes e outros
PRDs (03/07/11) dependem deles; um DROP criaria exatamente o drift
schema-Drizzle×banco que este PRD elimina.

Cenário B — **um blog isolado com problema**: cada blog fixa a própria
`BLOG_IMAGE_TAG` — rollback pontual sem afetar os irmãos (o canário resenhavip
existe para pegar isso antes da rede).

Cenário C — **taxonomia documentada com erro** (dicionário divergindo do código):
correção é só de docs (`docs/ANALYTICS.md`) — commit + `git pull` na VPS, sem
rebuild (CLAUDE.md §5: commits só de docs → só `git pull`).

Dados: nada a desfazer em nenhum cenário — este PRD não escreve nem reescreve
linha alguma (CA5/V3 provam a inércia).

---

## 14. Riscos e dependências de outros PRDs (FRONTEIRAS do STATUS.md)

| PRD | Fronteira/dependência |
|---|---|
| **PRD 02** (tracking client) | Consome a taxonomia do RF1 como contrato dos emissores (inclusive newsletter fora do padrão e cobertura de `link_click` — fronteiras "gate de consentimento da newsletter → PRD 02" e "cobertura do link_click → PRD 02"). NÃO deve criar emissores de `video_play`/`download` (RF6). Nenhum arquivo em conflito (este PRD não toca o client — CA4). |
| **PRD 03** (ingestão/filtros) | DONO da lógica de marcação `is_internal` no `/behavior` (trocar drop por marcação usando a coluna do RF3, alinhar a tripla com `isPrivateIp`, adicionar filtro `is_internal=false` nos leitores) e do dedup do evento `category` (fronteira do STATUS.md). Herda a nota de borda sobre projeção Drizzle de coluna nova (§11). Contadores de descarte → PRD 03; exposição → PRD 08. |
| **PRD 04** (propagandas) | Dono de `UNIQUE (ad_id,date)`, `internal_impressions`/`internal_clicks`, reparo histórico e `ads_reliable_since` — nomes RATIFICADOS aqui (RF7), cláusula "PRD 01 manda" resolvida SEM ajuste no PRD 04. Statements idempotentes convergem em qualquer ordem (§11). |
| **PRD 05** (fontes de tráfego) | Dono de `gclid`/`fbclid` e `paidCampaigns` (settings) — ratificados (RF7). A taxonomia do RF1 já registra os dois sinais novos no payload first-touch (o PRD 05 os implementa). |
| **PRD 06/07** (agregações/comportamento) | Consomem o dicionário (chaves de dedup, unidades por evento). O PRD 07 servirá totais NÃO truncados de `behavior_events` (fronteira do STATUS.md) e deverá usar `is_internal=false` quando o PRD 03 ativar a marcação. |
| **PRD 08** (saúde/alertas) | Recebe a regra "tipo reservado > 0 ⇒ anomalia" (RF6/CA11) para alerta automático, junto do que o PRD 03 contar. |
| **PRD 11** (validação cross-metric) | As 6 regras do doc v2 + a regra dos reservados passam a ter modelo de dados suficiente POR BLOG (is_internal em behavior, dimensão interna de ads via PRD 04, campanhas via PRD 05). |
| **PRD 12** (testes/validação) | O script de tráfego sintético deve usar os payloads canônicos do RF1 e marcação `internal:true` (nunca poluir dados reais — precedente do teste ativo do §8.2). |

**Riscos técnicos**: (1) divergência futura dicionário×código → mitigada pelo
teste do §12 (conjuntos travados) e pelo processo RF5 (passo 9 obriga atualizar a
doc); (2) PRD implementado fora de ordem esquecer o `ensureSchema` → mitigado pelo
processo RF5 formal + CA2 como padrão de verificação replicável; (3) boot não-fatal
deixar um banco sem a coluna e o PRD 03 quebrar a query → nota de borda herdada
pelo PRD 03 (§11). **Risco de processo**: este PRD muda ZERO números — se qualquer
card mudar de valor após o rollout (CA9), a causa NÃO é este PRD e deve ser
investigada antes de prosseguir a fila de PRDs.

---

## 15. Estimativa de esforço

**P** (pequeno). Código mínimo e localizado: 1 coluna (2 lugares), ~10 statements
de índice idempotentes, 1 constante exportada + troca do uso inline, 1 suite de
testes de constantes, atualização de `docs/ANALYTICS.md`. Sem migração de dados,
sem endpoint novo, sem mudança de client, sem mudança de comportamento. O maior
custo é editorial (dicionário do RF1 na doc) e a verificação multi-blog do §8.2
(pendente de execução na VPS).
