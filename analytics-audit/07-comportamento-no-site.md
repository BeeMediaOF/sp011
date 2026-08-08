# PRD 07 — Comportamento no site (buscas, links externos, resumo de interações)

> **O que é este documento.** PRD de implementação, escrito para ser consumido pelo
> Claude Code numa sessão futura SEM o contexto da auditoria — autocontido: dá para
> executar lendo só este arquivo. Fontes: `analytics-audit/00-auditoria-estado-atual.md`
> (Fase 0.2, achados com evidência — itens 22, 23, 24 e §4.5/§4.6), 
> `analytics-audit/00-inventario.md` (mapa; §8 tem correções de linha),
> `analytics-audit/STATUS.md` (FRONTEIRAS entre PRDs),
> `PRD_ANALYTICS_PLANEJAMENTO_v2.md` (template e descrição do módulo 07),
> `docs/ANALYTICS.md` e CLAUDE.md §§5, 6, 14, 17. Todas as evidências `arquivo:linha`
> abaixo foram REABERTAS nos arquivos reais na sessão de escrita deste PRD
> (2026-07-23), exceto onde marcado "(cf. auditoria)".
>
> **Princípio obrigatório:** volume baixo NÃO é bug — os blogs são novos. Bug é o que
> for logicamente incorreto ou inconsistente, independente do volume. O bug central
> deste PRD (item 24) é um exemplo canônico: somar uma lista TRUNCADA e rotular como
> total é logicamente incorreto mesmo com 3 buscas na janela.
>
> **Multi-blog:** os 8 blogs (sp011, ksports, esporteagora, resenhavip, oleysports,
> beeesportes, pontofarma, creditovc) rodam a MESMA imagem `blog-api:vN`/`blog-web:vN`
> (CLAUDE.md §6). Este PRD altera SÓ o `api-server` — a correção chega a todos os
> blogs no rollout do §6 (bump `BLOG_IMAGE_VERSION`, canário resenhavip, demais).
> Nenhum fix pode ser condicionado a BLOG_ID (CLAUDE.md §13/§17).
>
> **Fronteiras que delimitam este PRD (STATUS.md, obrigatórias):**
> - Totais NÃO truncados de comportamento servidos pelo backend → **ESTE PRD**;
>   a EXIBIÇÃO desses totais nos cards (trocar as somas do frontend) → **PRD 10**.
> - `is_internal` em `behavior_events`: a COLUNA → **PRD 01** (já especificada lá,
>   RF3/§6); a MARCAÇÃO no ingest → **PRD 03**; a EXCLUSÃO de interno na LEITURA dos
>   cards de comportamento → **ESTE PRD**.
> - Gate de consentimento da newsletter e cobertura do `link_click`
>   (`mailto:`/`tel:` filtrados na ORIGEM, links fora do corpo do artigo) → **PRD 02**;
>   este PRD trata só a compatibilidade de LEITURA com as linhas históricas.
> - Demais agregações do `/stats` (inclusive a chave de dedup do scroll, item 18) →
>   **PRD 06** (que declara explicitamente NÃO mexer em
>   `topSearchTerms`/`topLinkDomains`/`behaviorStats` — zero conflito de arquivo).
>
> **Encurtamentos:** `api = artifacts/api-server/src`, `web = artifacts/brasilia-agora/src`,
> `db = lib/db/src`.

---

## 1. Objetivo

Tornar exatos os três cards de "Comportamento" do dashboard de Analytics — **Termos
mais buscados** (item 22 da checklist), **Links externos clicados por domínio**
(item 23) e **Resumo de interações** (item 24: eventos totais, buscas, cliques
externos, newsletter, compartilhamentos, leitura 100%) — corrigindo no BACKEND:

1. **Totais não truncados** (bug confirmado do item 24): o servidor passa a servir
   `searchesTotal` e `externalClicksTotal` (totais reais da janela) além dos tops
   truncados `topSearchTerms` (15) / `topLinkDomains` (10) — hoje o frontend soma
   as listas truncadas e rotula como total.
2. **Exclusão de tráfego interno na leitura**: os cards de comportamento passam a
   excluir linhas `is_internal = true` de `behavior_events`, como TODAS as demais
   métricas do dashboard já fazem com `analytics_events` (coluna do PRD 01,
   marcação do PRD 03 — este PRD fecha a ponta de leitura).
3. **Compatibilidade com linhas históricas inválidas de `link_click`**: cliques
   `mailto:`/`tel:` gravados antes do PRD 02 filtrar na origem viram "domínio
   vazio" no card — a agregação passa a admitir só `http(s)` com hostname
   não-vazio, fazendo o domínio vazio sumir SEM reescrever linha alguma.
4. **Definição única de leitura-100%**: ratificar (sem reimplementar) que
   "Leitura 100%" é DERIVADA do marco `scroll=100` (pares sessão×conteúdo),
   idêntica à entidade `article_read_complete` da taxonomia do PRD 01 — nenhum
   tipo novo de evento, nenhum segundo cálculo.

Itens da checklist do doc v2 cobertos: **22** (Termos mais buscados), **23** (Links
externos clicados — só a ponta de leitura; a cobertura do client é PRD 02), **24**
(Resumo de interações — backend; exibição é PRD 10). Habilita regras novas de
consistência para o PRD 11 (§9).

---

## 2. Contexto / estado atual (achados da auditoria, com evidência)

### 2.1 A cadeia de comportamento hoje (Confirmado no código, reaberto nesta sessão)

**Client (emissores — nada disso muda neste PRD; donos: PRD 02):**

- Busca: submit com query não-vazia → `trackSearch` (`web/hooks/useAnalytics.ts:
  261-264` — corta em 200) → `sendBehavior` (`:249-259`, com gate
  `getConsent()==="accepted"` e flag `internal` — cf. auditoria). Emissores:
  `web/components/Header.tsx:296-302` e
  `web/components/blocks/HomeCustomBlocks.tsx:478-484` (cf. auditoria). Busca por
  URL direta (`/arquivo?q=`) NÃO é rastreada (auditoria §4.9).
- Link externo: `trackLinkClick` (`useAnalytics.ts:266-268` — corta em 500).
  Emissores SÓ no corpo do artigo: `web/pages/Artigo.tsx:281-285` (markdown) e
  `:408-413` (delegação HTML **sem filtro de esquema** — `mailto:`/`tel:` passam;
  cf. auditoria §4.5). Correção da origem e cobertura do site inteiro: **PRD 02**
  (RF2 de lá: só `http(s)` de origin externo chega ao servidor).
- Newsletter: 2 formulários fazem `fetch` direto a `/api/analytics/behavior` sem
  `getConsent()` e sem flag `internal` (`web/components/Footer.tsx:62-76`;
  `web/components/blocks/HomeCustomBlocks.tsx:364-378` — cf. auditoria §4.6).
  Correção: **PRD 02** (client) e **PRD 03** (servidor).

**Ingest — `POST /api/analytics/behavior` (`api/routes/analytics.ts:314-348`):**
filtros bot (`:316`, sem contador — PRD 03) e rate 30/min/IP (`:318`); whitelist
inline `ALLOWED = {search, link_click, newsletter, video_play, download}` (`:325`
— o PRD 01 RF2 a extrai para `BEHAVIOR_TYPES`); **interno é DROPADO, não marcado**
(`:328-330` — flag `internal` ou IP cadastrado; sem a perna `isPrivateIp` do
`/event`): exceção documentada à invariante §17, que o PRD 03 troca por marcação
usando a coluna `is_internal` criada pelo PRD 01. INSERT direto (`:336-343`) —
**behavior não passa pelo buffer** de `analytics_events`.

**Leitura — dentro do `GET /api/analytics/stats` (`analytics.ts:366`):**

- Query da janela: `db.select().from(behaviorEventsTable)` com só
  `ts >= winFrom AND ts < winTo` (`analytics.ts:492-495`) — **sem filtro de
  interno** (a coluna não existia até o PRD 01).
- Agregação inline no handler (`analytics.ts:683-710`):
  - `search`: admite `ev.value` truthy; `term = ev.value.toLowerCase().trim()`
    (`:689-691`) — **value só-espaços vira termo vazio `""`** (contado e
    renderizável como barra sem rótulo);
  - `link_click`: `new URL(ev.value).hostname.replace(/^www\./, "")` em try/catch
    (`:693-698`) — **`mailto:`/`tel:` parseiam com hostname `""`** → domínio vazio
    contado (bug de leitura do item 23);
  - `newsletter`: contador simples de janela (`:699`) — este já é NÃO truncado e
    correto;
  - `topSearchTerms = sort desc → slice(0, 15)` (`:702-705`);
    `topLinkDomains = sort desc → slice(0, 10)` (`:707-710`).
- Payload (`analytics.ts:756-761`): `behaviorStats = { totalEvents:
  behaviorRows.length, newsletterSignups, topSearchTerms, topLinkDomains }` —
  **os totais de buscas e cliques NÃO são servidos**, só os tops truncados.

**UI (`web/pages/admin/Analytics.tsx` — NÃO muda neste PRD; dona: PRD 10):**

- Card Termos buscados `:1206-1239` (exibe `slice(0, 8)` do top-15, `:1220`);
- Card Links externos `:1242-1275` (exibe `slice(0, 8)` do top-10, `:1256`);
- Card Resumo de interações `:1278-1332`, com o BUG do item 24:
  - "Buscas realizadas" = `topSearchTerms.reduce(...)` (`:1297`) — soma do top-15,
    não o total;
  - "Cliques externos" = `topLinkDomains.reduce(...)` (`:1302`) — soma do top-10,
    não o total;
  - corretos no mesmo card: `totalEvents` (`:1292`), `newsletterSignups`
    (`:1307`), compartilhamentos via `shareChart` (`:1312`) e "Leitura 100%" via
    `engagement.readCompletions` (`:1317`).

**Leitura-100% (definição vigente, correta):** derivada do marco de scroll —
`readCompletions = agg.scrollSessions[100]?.size ?? 0` (`analytics.ts:513`),
servida em `engagement` (`:718`); o card de Profundidade de leitura usa a MESMA
fonte (`scrollDepthChart`, `:738`). `scrollSessions` é Set por par
`sessionId|articleId ?? path` (`api/lib/analyticsShared.ts:330`). A taxonomia do
PRD 01 (RF1, entidade `article_read_complete`) registra exatamente esta derivação.
A dupla contagem possível na troca de chave `path`→`articleId` durante o load
(item 18, auditoria §4.4) é defeito da AGREGAÇÃO — dono: **PRD 06** (que unifica a
chave); este PRD não recomputa nada.

### 2.2 Status dos itens na auditoria

| Item | Status | Causa (etapa que quebra) |
|---|---|---|
| 22 Termos mais buscados | OK | nenhuma (cadeia íntegra; termo vazio é borda corrigida aqui) |
| 23 Links externos por domínio | Parcial | evento client: cobertura só do corpo do artigo + sem filtro de esquema (PRD 02); leitura: domínio vazio de `mailto:`/`tel:` legado (ESTE PRD) |
| 24 Resumo de interações | **Bug confirmado** | endpoint→UI: "Buscas"/"Cliques externos" = soma do top-N truncado (`Analytics.tsx:1297,:1302` sobre `analytics.ts:702-705,:707-710`); newsletter sem gate/flag (PRD 02/03) |

### 2.3 O que os PRDs vizinhos já entregam (pré-requisitos e não-sobreposição)

- **PRD 01** (escrito): coluna `behavior_events.is_internal boolean NOT NULL
  DEFAULT false` no Drizzle E `ensureSchema` (§6.1/§6.2 de lá); constante
  `BEHAVIOR_TYPES` exportada em `analyticsShared.ts` (RF2); taxonomia com
  `link_click` = alias `click_external`, `newsletter` = `newsletter_signup`,
  leitura-100% = `article_read_complete` derivada. PRD 01 §14 delega a este PRD:
  "O PRD 07 servirá totais NÃO truncados de `behavior_events` e deverá usar
  `is_internal=false` quando o PRD 03 ativar a marcação".
- **PRD 02** (escrito): `isExternalHttpHref` no client — `mailto:`/`tel:` nunca
  mais chegam ao servidor; listener global amplia cobertura (mais domínios reais
  no card DEPOIS do rollout dele); decide NÃO criar emissores de
  `video_play`/`download` (reservados — PRD 01 RF6).
- **PRD 03** (pendente de escrita): trocará o DROP de interno do `/behavior` por
  marcação `is_internal=true` (alinhando com `isPrivateIp`) — a partir daí o
  filtro de leitura deste PRD passa a ter efeito real.
- **PRD 06** (escrito): não toca `behaviorStats` (declaração explícita, seção de
  fronteiras de lá); corrige a chave do scroll (muda o VALOR de `readCompletions`
  sem mudar a DEFINIÇÃO).
- **PRD 10**: trocará `Analytics.tsx:1297/:1302` pelos campos novos
  `searchesTotal`/`externalClicksTotal` e cuidará de estados vazios/rotulagem.

---

## 3. Problema a resolver

1. **Somas sobre listas truncadas (item 24, bug lógico independente de volume):**
   o servidor trunca `topSearchTerms` em 15 e `topLinkDomains` em 10 ANTES de
   enviar (`analytics.ts:702-705,:707-710`) e não serve os totais; o card soma o
   truncado (`Analytics.tsx:1297,:1302`). Com >15 termos ou >10 domínios
   distintos na janela, "Buscas realizadas" e "Cliques externos" SUBCONTAM. O
   frontend não tem como corrigir sozinho: o dado não existe no payload.
2. **Comportamento não exclui interno na leitura:** a query da janela
   (`analytics.ts:492-495`) lê `behavior_events` inteira. Hoje isso é mascarado
   pelo DROP no ingest (`:328-330`), mas quando o PRD 03 passar a MARCAR em vez de
   dropar (invariante §17), os cards de comportamento contariam interno — ao
   contrário de todos os cards de `analytics_events`, que filtram
   `is_internal=false` (`:408,:420,:429`, etc.). A ponta de leitura precisa nascer
   filtrada ANTES da marcação ativar (filtro no-op até lá).
3. **Domínio vazio de `mailto:`/`tel:` legado (item 23):** linhas históricas com
   `value` não-`http(s)` produzem `hostname === ""` e viram barra sem rótulo no
   card. O PRD 02 estanca a FONTE; as linhas já gravadas continuarão no banco para
   sempre ("linhas históricas nunca são reescritas" — precedente
   `analyticsShared.ts:143`) — a exclusão tem de ser na agregação.
4. **Termo vazio possível:** `value` só-espaços passa o truthy check e vira termo
   `""` (`analytics.ts:689-691`) — mesma classe de defeito de leitura.
5. **Leitura-100% sem definição amarrada:** o valor está correto hoje
   (`:513` e `:738` derivam do MESMO Set), mas nada impede uma sessão futura de
   criar um segundo cálculo/tipo de evento divergente — a definição única precisa
   virar contrato verificável (regra para o PRD 11).
6. **Agregação inline intestável:** a lógica vive dentro do handler HTTP
   (`analytics.ts:683-710`) — sem função pura, sem `node --test` possível (as
   demais agregações já vivem em `analyticsShared.ts`, que tem 5 suites).

---

## 4. Requisitos funcionais

### RF1 — Extrair a agregação de comportamento para função pura `buildBehaviorStats`

Nova função em `api/lib/analyticsShared.ts` (arquivo de lógica pura, zero imports
— padrão de `buildWindowAggregates`), substituindo o bloco inline
`analytics.ts:683-710`:

```ts
export interface BehaviorRowLike {
  eventType: string;
  value: string | null;
  isInternal?: boolean | null; // tolerante a linhas/consumidores pré-PRD 01
}

export interface BehaviorStats {
  totalEvents: number;          // linhas NÃO-internas da janela, todos os tipos
  newsletterSignups: number;    // não-internos; já era não-truncado (inalterado)
  searchesTotal: number;        // NOVO — total real de buscas válidas na janela
  externalClicksTotal: number;  // NOVO — total real de cliques externos válidos
  searchTermsDistinct: number;  // NOVO — nº de termos distintos na janela
  linkDomainsDistinct: number;  // NOVO — nº de domínios distintos na janela
  topSearchTerms: { term: string; count: number }[];   // top-15 (inalterado)
  topLinkDomains: { domain: string; count: number }[]; // top-10 (inalterado)
}

export function buildBehaviorStats(rows: BehaviorRowLike[]): BehaviorStats
```

Regras internas (únicas — valem para tops E totais, garantindo consistência por
construção):

1. **Exclusão de interno**: `rows.filter((r) => r.isInternal !== true)` — tudo o
   mais (totalEvents, totais, tops, newsletter) é computado sobre o resultado.
   `undefined`/`null` contam como não-interno (a coluna é `NOT NULL DEFAULT
   false`; a tolerância é para tipos/consumidores).
2. **Busca válida**: `eventType === "search"` E `value` com `trim()` não-vazio.
   Termo = `value.toLowerCase().trim()` (normalização ATUAL preservada).
   `searchesTotal` = contagem de linhas válidas; termo vazio nunca entra.
3. **Clique externo válido**: `eventType === "link_click"` E `value` casando
   `/^https?:\/\//i` E `new URL(value).hostname` não-vazio (try/catch → inválido).
   Domínio = `hostname.replace(/^www\./, "")` (regra ATUAL preservada).
   `externalClicksTotal` = contagem de linhas válidas. `mailto:`/`tel:`/
   `javascript:`/valor truncado ilegível ficam FORA de tops e totais (mas dentro
   de `totalEvents`).
4. **Newsletter**: `eventType === "newsletter"` → `newsletterSignups++`
   (independe de `value` — semântica atual preservada).
5. **Tops**: sort desc por count + `slice(0, 15)` / `slice(0, 10)` — a truncagem
   dos tops é EXIBIÇÃO e permanece (o que muda é servir os totais junto).
6. **Distintos**: `searchTermsDistinct`/`linkDomainsDistinct` = nº de chaves dos
   mapas (permite ao PRD 10 exibir "top 15 de N termos").

Invariantes por construção (testadas no §12): `Σ topSearchTerms.count ≤
searchesTotal`, com igualdade se e só se `searchTermsDistinct ≤ 15`; idem domínios
com 10; `totalEvents ≥ searchesTotal + externalClicksTotal + newsletterSignups`
(a diferença = tipos reservados + link_click inválido + search vazio).

### RF2 — Handler do `/stats` passa a usar a função e a servir os campos novos

Em `api/routes/analytics.ts`: substituir `:683-710` por
`const behaviorStats = buildBehaviorStats(behaviorRows);` e o objeto literal de
`:756-761` por `behaviorStats` (o shape antigo é SUBCONJUNTO do novo — mudança
100% aditiva; nenhum campo é removido ou renomeado, frontend atual continua
funcionando sem alteração). A query da janela (`:492-495`) permanece como está —
a exclusão de interno é feita na função (decisão: filtro em JS, não em SQL, para
a regra ser testável por `node --test` e tolerante por tipo; o volume de
`behavior_events` por janela é mínimo nos blogs novos e a linha já é lida hoje
sem filtro).

### RF3 — Exclusão de interno na leitura (fecha a ponta do trio 01/03/07)

Com o RF1/RF2, os três cards de comportamento passam a excluir
`is_internal = true` como as demais métricas:

- ANTES do PRD 03: filtro é no-op comprovável (o ingest DROPA interno —
  `analytics.ts:328-330`; a coluna do PRD 01 nasce `DEFAULT false` e o PRD 01
  CA5/V3 verifica 0 linhas internas) → NENHUM número muda neste rollout por causa
  do filtro.
- DEPOIS do PRD 03 (marcação ativa): buscas/cliques/newsletter de admin/dev/IP
  interno são gravados marcados e EXCLUÍDOS dos cards — sem drop (invariante
  §17), com auditoria possível via SQL.

Este PRD NÃO altera o handler `/behavior` (drop atual permanece até o PRD 03 —
fronteira do STATUS.md).

### RF4 — Compatibilidade com linhas históricas inválidas (item 23)

A admissão do RF1 regra 3 faz o "domínio vazio" sumir dos cards imediatamente,
sem UPDATE/DELETE em `behavior_events` (proibido — §10.6). Consequências
esperadas e aceitas no rollout:

- `topLinkDomains` perde a entrada `domain: ""` (se existia);
- a soma exibida hoje pelo card "Cliques externos" (frontend ainda soma o top-10)
  pode DIMINUIR exatamente pelo nº de cliques legados inválidos — é correção, não
  regressão: aqueles cliques nunca foram "externos com domínio";
- `totalEvents` NÃO muda (linhas inválidas continuam contadas como eventos).

### RF5 — Leitura-100%: definição única ratificada (nenhum código novo)

`engagement.readCompletions` continua sendo derivado de
`agg.scrollSessions[100].size` (`analytics.ts:513`) — o MESMO Set que alimenta a
barra 100 de `scrollDepthChart` (`:738`). Este PRD:

- **Proíbe** criar tipo de evento `article_read_complete`/`read_complete` ou
  segundo cálculo (a taxonomia do PRD 01 lista leitura-100% como entidade
  DERIVADA — "NUNCA criar endpoint para elas");
- **Formaliza a regra de consistência** (oferecida ao PRD 11): em toda resposta
  do `/stats`, `engagement.readCompletions ===
  scrollDepthChart.find(d => d.depth === 100).count` — verificável por observação
  do JSON (§8.4);
- Registra que o PRD 06 pode mudar o VALOR (unificação da chave de dedup do
  scroll, item 18) sem violar a regra — as duas pontas derivam do mesmo Set, a
  igualdade sobrevive a qualquer correção de agregação.

### RF6 — Regras novas oferecidas ao PRD 11 (e alerta ao PRD 08)

Regras de sanidade contínuas, por blog (o `/stats` é por blog por construção —
banco isolado):

| # | Regra | Violação indica |
|---|---|---|
| R07-1 | `Σ topSearchTerms.count ≤ behaviorStats.searchesTotal` e `Σ topLinkDomains.count ≤ behaviorStats.externalClicksTotal` | regressão da truncagem (alguém voltou a somar top como total) |
| R07-2 | `behaviorStats.totalEvents ≥ searchesTotal + externalClicksTotal + newsletterSignups` | admissão inconsistente entre totais |
| R07-3 | `topLinkDomains` sem `domain === ""` | regressão do filtro de esquema na leitura |
| R07-4 | `engagement.readCompletions === scrollDepthChart[depth=100].count` | segunda fonte de leitura-100% divergente |

### RF7 — Documentação

Atualizar `docs/ANALYTICS.md` (seção do dicionário de métricas — o PRD 01 RF8
reservou as seções de métricas para os PRDs 06/07): definição de admissão de
busca/clique externo válidos, semântica de `searchesTotal`/`externalClicksTotal`
vs tops truncados, exclusão de interno na leitura de `behavior_events` (com a
nota "marcação: PRD 03"), leitura-100% como derivada do marco scroll 100, e a
nota de compatibilidade com linhas legadas não-`http(s)`.

---

## 5. Requisitos não-funcionais

- **Performance**: zero query nova (mesma leitura de janela de `:492-495`); a
  função pura processa as mesmas linhas que o loop inline atual; payload cresce
  4 números. Nenhum caminho de site público é tocado; nada de SSR/cache muda.
- **LGPD**: nenhuma coleta nova; nenhum dado pessoal novo trafega. O e-mail em
  `newsletter.value` (dado pessoal já existente) NÃO passa a ser exibido — os
  campos novos são contagens. A exclusão de interno na leitura REDUZ exposição de
  comportamento do operador nos cards. Parte da rede opera conteúdo
  político-adjacente: termos de busca são dado sensível em potencial — os tops
  continuam agregados por termo, sem sessão/visitante associado no payload.
- **Confiabilidade**: mudança aditiva de contrato (shape antigo ⊂ novo); frontend
  atual funciona sem deploy casado; rollback = voltar imagem (§13). Função pura
  sem I/O — sem novos modos de falha no `/stats`.
- **Multi-blog**: mesma imagem para os 8 blogs; correção vale para todos no
  rollout §6 (§8.3); validação por blog na lista de cards (§8.3).
- **Windows/dev (CLAUDE.md §14)**: typecheck por pacote (dentro de
  `artifacts/api-server`); testes `node --test` com imports `.ts` explícitos; sem
  unicode literal em regex (as regex deste PRD são ASCII); build real na VPS.

---

## 6. Modelo de dados

**Nenhuma coluna, tabela ou índice novo neste PRD.** Consome:

- `behavior_events.is_internal boolean NOT NULL DEFAULT false` — criada pelo
  **PRD 01** (§6.1 Drizzle + §6.2 ensureSchema de lá). PRÉ-REQUISITO DE ROLLOUT:
  o PRD 01 precisa estar deployado e verificado (V1 do §8.2 dele: coluna presente
  em CADA banco — sp011/Supabase + replicados no pg-blogs) antes ou junto deste
  PRD. Motivo: desde a imagem do PRD 01, `db.select().from(behaviorEventsTable)`
  projeta a coluna — um banco onde o boot falhou quebraria o `/stats` inteiro
  (nota de borda herdada do PRD 01 §11; ver §11 abaixo).
- Schema atual de `behavior_events` para referência: `db/schema/behavior_events.
  ts:3-15` (id, event_type text, value, session_id, device, article_id, ts +
  índices type+ts/ts/session) — cf. auditoria/inventário §5.

Se durante a implementação surgir necessidade de coluna nova (não deve), seguir
OBRIGATORIAMENTE o processo RF5 do PRD 01: schema Drizzle E `ensureSchema.ts` no
mesmo commit (CLAUDE.md §17 — o deploy NÃO roda `drizzle-kit push`), `pnpm exec
tsc -b` em `lib/db` antes do typecheck do api-server.

---

## 7. Contrato de API

Endpoint único afetado: **`GET /api/analytics/stats`** (`analytics.ts:366`; auth +
permissão `analytics.view`; janela via `?period=`). Mudança SÓ no campo
`behaviorStats` — aditiva:

```jsonc
// ANTES (analytics.ts:756-761)
"behaviorStats": {
  "totalEvents": 42,
  "newsletterSignups": 3,
  "topSearchTerms": [{ "term": "flamengo", "count": 5 }],   // top-15
  "topLinkDomains": [{ "domain": "ge.globo.com", "count": 4 }] // top-10
}

// DEPOIS (este PRD) — campos antigos intactos + 4 novos
"behaviorStats": {
  "totalEvents": 42,            // agora: só linhas não-internas da janela
  "newsletterSignups": 3,       // agora: só não-internas (semântica igual até o PRD 03)
  "searchesTotal": 23,          // NOVO — total NÃO truncado de buscas válidas
  "externalClicksTotal": 16,    // NOVO — total NÃO truncado de cliques externos válidos
  "searchTermsDistinct": 19,    // NOVO
  "linkDomainsDistinct": 12,    // NOVO
  "topSearchTerms": [ /* top-15, regra de admissão do RF1 */ ],
  "topLinkDomains": [ /* top-10, sem domínio vazio (RF4) */ ]
}
```

- Nenhum outro campo do `/stats` muda de shape. `engagement.readCompletions`
  (`:718`) e `scrollDepthChart` (`:738`) ficam intactos (RF5 só ratifica).
- Nenhum endpoint novo; nenhuma mudança em `POST /api/analytics/behavior` (o
  contrato de ingest é do PRD 01/03) nem em `GET /api/analytics/health` (PRD 08).
- Consumidor futuro dos campos novos: PRD 10 (`Analytics.tsx:1297/:1302` →
  `searchesTotal`/`externalClicksTotal`). Até lá o frontend ignora os campos —
  compatível.

Assinatura interna nova (não-HTTP):

```ts
// api/lib/analyticsShared.ts
export function buildBehaviorStats(rows: BehaviorRowLike[]): BehaviorStats; // RF1
```

---

## 8. Comandos de verificação (rodar exatamente estes)

### 8.1 Local (Windows, antes do commit)

```powershell
cd "c:\Users\Usuario(a) Master\sp011\artifacts\api-server"
pnpm run typecheck
# esperado: sem erros
node --test "test/**/*.test.ts"
# esperado: TODOS passam, incluindo o novo test/analyticsBehavior.test.ts (§12)
```

```powershell
cd "c:\Users\Usuario(a) Master\sp011"
git grep -n "buildBehaviorStats" -- artifacts/api-server/src
# esperado: definicao em lib/analyticsShared.ts E uso em routes/analytics.ts (>=2 hits)
git grep -n "searchesTotal" -- artifacts/api-server/src
# esperado: >=1 hit em lib/analyticsShared.ts (campo servido)
git grep -nE "\.slice\(0, 15\)$" -- artifacts/api-server/src/lib/analyticsShared.ts
git grep -nE "\.slice\(0, 10\)$" -- artifacts/api-server/src/lib/analyticsShared.ts
# esperado: 1 hit cada (tops CONTINUAM truncados — o que muda e servir totais junto).
# ANCORADO em $ de proposito: o arquivo JA tem dois slice(0, 10) de toISOString()
# (datas ISO, analyticsShared.ts:14 e :168, ambos NAO no fim da linha) que NAO sao
# truncagem de tops; um "git grep slice(0, 10)" cru devolveria 3 hits, nao 1.
git grep -n "searchTerms" -- artifacts/api-server/src/routes/analytics.ts
# esperado: NENHUM loop inline remanescente no handler (agregacao extraida)
git diff --stat HEAD~1 -- artifacts/brasilia-agora
# esperado: vazio (este PRD NAO toca o client — exibicao e do PRD 10)
git diff --stat HEAD~1 -- lib/db
# esperado: vazio (nenhuma coluna nova — modelo de dados e do PRD 01)
```

### 8.2 VPS — espelho SQL dos campos novos — **PENDENTE DE EXECUÇÃO**

(MCP Supabase não conectado na escrita deste PRD; blocos completos para colar,
padrão CLAUDE.md §12. Rodar LOGO APÓS abrir o dashboard, para janela comparável.)

**sp011** (Supabase — janela 30d espelhando o critério do card):

```bash
cd /opt/sp011
DBURL=$(grep -m1 '^SUPABASE_DATABASE_URL=' /opt/sp011/.env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
# V1 — totais que o /stats deve servir (comparar com behaviorStats do JSON — §8.4)
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "SELECT count(*) AS total_events, count(*) FILTER (WHERE event_type='search' AND btrim(coalesce(value,'')) <> '') AS searches_total, count(*) FILTER (WHERE event_type='link_click' AND value ~* '^https?://[^/?#]') AS external_clicks_total, count(*) FILTER (WHERE event_type='newsletter') AS newsletter_signups, count(*) FILTER (WHERE event_type='link_click' AND (value IS NULL OR value !~* '^https?://[^/?#]')) AS link_click_legado_invalido FROM behavior_events WHERE is_internal = false AND ts >= now() - interval '30 days';"
# V2 — termos e dominios distintos (comparar com searchTermsDistinct/linkDomainsDistinct)
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "SELECT count(DISTINCT lower(btrim(value))) AS termos_distintos FROM behavior_events WHERE is_internal = false AND event_type='search' AND btrim(coalesce(value,'')) <> '' AND ts >= now() - interval '30 days';"
```

**Blog replicado** (repetir por blog trocando a 1ª linha; banco local = BLOG_ID):

```bash
BLOG='resenhavip'
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d "$BLOG" -v ON_ERROR_STOP=1 -c "SELECT count(*) AS total_events, count(*) FILTER (WHERE event_type='search' AND btrim(coalesce(value,'')) <> '') AS searches_total, count(*) FILTER (WHERE event_type='link_click' AND value ~* '^https?://[^/?#]') AS external_clicks_total, count(*) FILTER (WHERE event_type='newsletter') AS newsletter_signups, count(*) FILTER (WHERE event_type='link_click' AND (value IS NULL OR value !~* '^https?://[^/?#]')) AS link_click_legado_invalido FROM behavior_events WHERE is_internal = false AND ts >= now() - interval '30 days';"
```

Nota de leitura: a janela do `/stats` usa fronteiras próprias (`resolvePeriod`) —
rodar o SQL e a leitura do JSON com poucos minutos de diferença; divergência
tolerada = eventos ingeridos ENTRE as duas leituras (novos), nunca a menor no
JSON com banco parado. O predicado `^https?://[^/?#]` espelha a regra JS do RF1
(regra 3: esquema http(s) E hostname não-vazio): `mailto:`/`tel:` e um
`https://` sem host caem em `link_click_legado_invalido`, exatamente como a
função os exclui de `externalClicksTotal` (mantendo-os em `totalEvents`) — sem
isso, um `git grep`/SQL cru contaria o `https://` sem host que o `new URL()` do
código descarta, e o CA9 acusaria divergência falsa.

### 8.3 Rollout multi-blog (CLAUDE.md §6 — obrigatório)

Arquivo tocado → serviço (§5): `artifacts/api-server` → `api`. (O bump versiona
`api` e `web` juntos — build padrão do §6.) **Pré-requisito:** rollout do PRD 01
concluído e verificado (coluna `is_internal` presente por banco — V1 do PRD 01
§8.2). Bump + build + sp011:

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
# canário (resenhavip) — conferir §8.2 + §8.4/CA por blog ANTES de seguir
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

**Cards do dashboard a revalidar POR BLOG após o rollout** — em sp011.com.br,
ksports.bebee.me, esporteagora.midia.run, resenhavip.midia.run,
oleysports.midia.run, beeesportes.midia.run (+ pontofarma/creditovc quando no ar),
no admin → Analytics:

1. **Termos mais buscados** (item 22): mesma lista de antes; nenhuma barra com
   rótulo vazio (se havia termo `""`, ela some — mudança esperada).
2. **Links externos clicados** (item 23): nenhuma barra sem rótulo (domínio vazio
   legado some — mudança esperada e documentada); demais domínios idênticos.
3. **Resumo de interações** (item 24): "Eventos", "Newsletter", "Compartilhamentos"
   e "Leitura 100%" idênticos aos pré-rollout na mesma janela; "Buscas realizadas"
   e "Cliques externos" iguais OU menores (frontend ainda soma o top-N — a queda
   possível é exatamente o legado inválido/termo vazio removido do top; a troca
   pelos totais reais é o PRD 10).
4. **Profundidade de leitura** (item 18) e **5 KPIs**: valores idênticos — este
   PRD não toca essas cadeias.
5. **Saúde da coleta** (item 25): contadores continuam funcionando (não tocada).

### 8.4 Observação objetiva do JSON (por blog, admin logado)

No navegador logado como admin: DevTools → Network → request
`GET /api/analytics/stats?period=30d` → Response:

- `behaviorStats` contém `searchesTotal`, `externalClicksTotal`,
  `searchTermsDistinct`, `linkDomainsDistinct` (números ≥ 0);
- `Σ topSearchTerms[].count ≤ searchesTotal` e
  `Σ topLinkDomains[].count ≤ externalClicksTotal` (R07-1);
- `totalEvents ≥ searchesTotal + externalClicksTotal + newsletterSignups` (R07-2);
- nenhum item de `topLinkDomains` com `domain: ""` (R07-3);
- `engagement.readCompletions` === `count` do item `depth:100` de
  `scrollDepthChart` (R07-4).

---

## 9. Critérios de aceite

Mapeamento: itens **22, 23, 24** da checklist do doc v2 + regras **R07-1..R07-4**
oferecidas ao PRD 11 (§RF6). Nenhum critério é subjetivo; os que exigem
banco/produção estão marcados **PENDENTE DE EXECUÇÃO** (MCP Supabase não
conectado na escrita — nunca marcar como atendido sem rodar o comando na VPS).

| # | Critério | Item/Regra | Verificação | Status na escrita |
|---|---|---|---|---|
| CA1 | Typecheck e `node --test` do api-server passam, incluindo `test/analyticsBehavior.test.ts` | 22/23/24 | §8.1 → exit 0 / todos ok | a executar no dev |
| CA2 | `buildBehaviorStats` existe em `analyticsShared.ts`, o handler a usa e o loop inline `:683-710` foi removido | 24 | greps do §8.1 | a executar no dev |
| CA3 | Contrato aditivo: `behaviorStats` serve os 4 campos novos E mantém os 4 antigos com mesmos nomes; tops continuam truncados em 15/10 | 24, R07-1 | greps `slice(0, 15)`/`slice(0, 10)` do §8.1 + teste de shape do §12 | a executar no dev |
| CA4 | Client e lib/db intocados (exibição → PRD 10; coluna → PRD 01) | fronteiras | `git diff --stat` do §8.1 → vazios | a executar no dev |
| CA5 | Com 16+ termos distintos sintéticos, `searchesTotal` > `Σ topSearchTerms.count` (o bug do item 24 é impossível de reintroduzir sem quebrar teste) | 24, R07-1 | teste 1 do §12 | a executar no dev |
| CA6 | Linhas `mailto:`/`tel:`/inválidas não aparecem em `topLinkDomains` nem em `externalClicksTotal`, mas contam em `totalEvents`; termo só-espaços excluído | 23, R07-3 | testes 3-4 do §12 | a executar no dev |
| CA7 | Linhas `isInternal:true` excluídas de TODOS os campos de `behaviorStats` | 24, fronteira 01/03/07 | teste 5 do §12 | a executar no dev |
| CA8 | JSON do `/stats` em produção satisfaz R07-1..R07-4 no sp011 E ≥1 blog replicado | 22/23/24, R07-* | §8.4 (observação objetiva do JSON, por blog) | **PENDENTE DE EXECUÇÃO** |
| CA9 | Campos novos do JSON batem com o espelho SQL (mesma janela, leituras próximas): `searches_total`, `external_clicks_total`, `newsletter_signups`, `total_events` | 24 | §8.2 V1/V2 × §8.4 | **PENDENTE DE EXECUÇÃO** |
| CA10 | Não-regressão por blog: os 5 grupos do §8.3 conferem (mudanças permitidas SÓ as documentadas: sumiço de barra vazia e queda de "Buscas"/"Cliques externos" ≤ legado inválido) | 22/23/24, 18, 25 | observação objetiva antes/depois na mesma janela, por blog | **PENDENTE DE EXECUÇÃO** |
| CA11 | `docs/ANALYTICS.md` atualizado: admissão válida de busca/clique, totais vs tops, exclusão de interno na leitura, leitura-100% derivada | RF7 | `git grep -n "searchesTotal" docs/ANALYTICS.md` → ≥1 hit; seções presentes | a executar no dev |

---

## 10. Invariantes do §17 preservadas por este PRD

1. **"Tráfego interno marcado `is_internal`, nunca dropado"** — este PRD implementa
   o lado LEITURA do padrão sancionado (marcar no ingest, excluir na leitura), o
   mesmo que os pageviews já usam (`analytics.ts:408,:420,:429`, etc.). Nenhum
   evento passa a ser dropado por este PRD; o drop pré-existente do `/behavior`
   (`:328-330`, exceção documentada) fica intacto até o PRD 03.
2. **"Heartbeat cumulativo agregado por MAX"** — não tocada
   (`analyticsShared.ts:319-327` e `analytics.ts:433-442` intactos; cf. auditoria).
3. **"`totals.*` do /stats fixos ao agora"** — não tocada: `totals` vem da cadeia
   de pageviews (`analytics.ts:515-524`, cf. auditoria); `behaviorStats` é métrica
   de JANELA e continua sendo (nenhum total fixo é reindexado).
4. **"Canal classificado no servidor"** — não tocada (cadeia do PRD 05).
5. **"Migrações de coluna via Drizzle schema E ensureSchema"** — nenhuma coluna
   nova aqui; a coluna consumida (`behavior_events.is_internal`) foi entregue nos
   DOIS lugares pelo PRD 01 (§6 de lá); o processo RF5 do PRD 01 é referenciado
   como obrigatório para qualquer necessidade imprevista (§6).
6. **"Linhas históricas nunca são reescritas"** (precedente
   `analyticsShared.ts:143`) — o legado `mailto:`/`tel:` é tratado EXCLUSIVAMENTE
   por regra de admissão na agregação (RF4), zero UPDATE/DELETE — mesmo mecanismo
   do `normalizeLegacyChannel` (remap só na leitura).
7. **SSR/perf ("HTML `no-cache` nunca `no-store`", sanitize isomórfico, proxy de
   imagem)** — não tocadas: nenhum arquivo do client muda (CA4).
8. **Isolamento entre blogs / nada hardcodado por blog na imagem** — lógica 100%
   genérica; nenhuma referência a BLOG_ID; cada blog lê o próprio banco.

---

## 11. Casos de borda

- **Banco onde o boot do PRD 01 falhou (sem a coluna)**: `db.select().from(
  behaviorEventsTable)` projeta `is_internal` desde a imagem do PRD 01 — o
  `/stats` quebraria ali INDEPENDENTE deste PRD (borda herdada do PRD 01 §11).
  Mitigação: pré-requisito de rollout (§8.3) = V1 do PRD 01 verificado por banco;
  o `ensureSchema` reconverge no próximo boot em caso de falha transitória.
- **Ordem em relação ao PRD 03**: antes dele, o filtro de interno é no-op (ingest
  dropa; coluna toda `false`) — rollout deste PRD não muda número algum por causa
  do filtro. Depois dele, "Eventos"/"Buscas"/etc. podem CAIR (interno passa a ser
  gravado marcado e excluído) — mudança esperada, pertence à validação do PRD 03.
- **Valor de `link_click` truncado no ingest** (`value` ≤500,
  `analytics.ts:332`): URL longa cortada pode falhar no `new URL` → excluída de
  tops/totais (mesmo efeito do try/catch atual), contada em `totalEvents`.
- **Esquema em maiúsculas** (`HTTPS://...`): regex `/^https?:\/\//i` casa —
  admitida (o `new URL` normaliza).
- **`http://localhost`/IP interno como destino**: admitido (hostname não-vazio) —
  comportamento atual preservado; a exclusão de origem interna é por
  `is_internal` da LINHA, não pelo destino do link.
- **Hostname IDN/punycode**: contado como o `URL.hostname` devolver (punycode) —
  comportamento atual preservado.
- **`www.` stripping**: só o prefixo literal `www.` (regra atual; `www2.` fica) —
  preservado para não mudar chaves históricas de agregação.
- **Empates no top-N**: ordem entre itens de mesmo count é a do sort estável
  sobre inserção (comportamento atual) — não é bug; os TOTAIS independem da ordem.
- **`value` NULL em search/link_click**: excluído de tops/totais (regra de
  admissão), contado em `totalEvents` — hoje o loop já pulava por truthy check.
- **Tipos reservados `video_play`/`download` na janela** (PRD 01 RF6): contam em
  `totalEvents` e em nada mais — e a existência deles é sinal de anomalia coberto
  pelo CA11 do PRD 01 (alerta: PRD 08).
- **Janela sem nenhum evento**: todos os campos zerados e arrays vazios —
  `EmptyState` do frontend continua funcionando (nenhum shape muda).
- **Buffer**: `behavior_events` não passa pelo buffer do `/event` (INSERT direto,
  `analytics.ts:336-343`) — nenhuma reconciliação nova; o JSON reflete o banco no
  momento da query.
- **Dois admins com janelas diferentes abertas**: `behaviorStats` é por request/
  janela (sem cache server-side novo) — sem interferência.

---

## 12. Plano de testes (`node --test`, CLAUDE.md §14)

Arquivo novo `artifacts/api-server/test/analyticsBehavior.test.ts` (imports
relativos com extensão `.ts` explícita; sem unicode literal em regex; padrão das
suites existentes `test/analyticsShared.*.test.ts`). Tudo função pura — sem
banco, sem Express, dados sintéticos:

1. **Truncagem vs total (CA5)**: 20 termos distintos (1 busca cada) →
   `topSearchTerms.length === 15`, `searchesTotal === 20`,
   `Σ top < searchesTotal`, `searchTermsDistinct === 20`. Análogo com 12 domínios
   → top 10, `externalClicksTotal === 12`.
2. **Igualdade quando cabe no top**: 5 termos / 4 domínios → `Σ top ===
   searchesTotal` e `Σ top === externalClicksTotal` (R07-1 com igualdade).
3. **Admissão de link_click (CA6)**: linhas com `mailto:a@b.c`, `tel:+5511...`,
   `javascript:void(0)`, `""`, `null`, `"https://"` (inválida) e
   `"HTTPS://www.Ex.com/x"` → só a última entra (`domain === "ex.com"`);
   `externalClicksTotal === 1`; `totalEvents` conta TODAS as linhas;
   nenhum `domain === ""` em `topLinkDomains`.
4. **Admissão de search (CA6)**: `value: "  "` e `value: null` excluídos;
   `"  Flamengo "` normaliza para `"flamengo"`; `searchesTotal` conta só válidas.
5. **Exclusão de interno (CA7)**: mistura com `isInternal: true` → excluída de
   `totalEvents`, totais, tops e `newsletterSignups`; `isInternal: undefined` e
   `null` contam como não-interno.
6. **Newsletter**: 3 linhas newsletter (1 interna) → `newsletterSignups === 2`,
   independente de `value`.
7. **R07-2 estrutural**: fixture com reservados (`video_play`) + inválidos →
   `totalEvents ≥ searchesTotal + externalClicksTotal + newsletterSignups`.
8. **Shape do contrato (CA3)**: objeto retornado contém EXATAMENTE as 8 chaves do
   `BehaviorStats` (igualdade de conjunto de chaves — pega remoção/renome
   acidental dos campos antigos).
9. **Leitura-100% (R07-4, na suite existente de agregação)**: em
   `test/analyticsShared.aggregate.test.ts`, asserção de que
   `scrollSessions[100].size` conta 1 por par sessão×conteúdo com marco 100 —
   fonte única das duas pontas do `/stats` (se o PRD 06 já tiver mudado a chave
   de dedup, a asserção usa a chave vigente; a regra é "um Set, duas leituras").
10. **Suites existentes continuam passando**: `node --test "test/**/*.test.ts"` —
    a extração do RF1 é comportamento-preservante fora das correções definidas.

Validação com dados reais é exclusivamente via §8.2/§8.4 na VPS (**PENDENTE DE
EXECUÇÃO**). Tráfego sintético em produção, se necessário, SEMPRE com
`internal:true` (nunca poluir dados reais — padrão do PRD 01/12; lembrando que
antes do PRD 03 o `/behavior` dropa interno, o que mantém o teste inofensivo).

---

## 13. Plano de rollback

Cenário A — **bug de código** (ex.: regressão no shape do `/stats` quebrando o
dashboard): rollback de imagem por blog, sem nada de schema/dados a desfazer
(este PRD não escreve, não migra e não reescreve linha alguma):

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

Efeito do rollback: os 4 campos novos somem do JSON — o frontend atual (que este
PRD não toca) nunca os leu, então nada quebra. Se o PRD 10 JÁ estiver no ar
consumindo os campos, reverter também a imagem `web` para a tag pré-PRD 10 (cada
PRD tem tag própria — o versionamento do §6 garante o par).

Cenário B — **um blog isolado com problema**: cada blog fixa a própria
`BLOG_IMAGE_TAG` — rollback pontual sem afetar os irmãos (o canário resenhavip
existe para pegar isso antes da rede).

Cenário C — **docs**: correção só de `docs/ANALYTICS.md` → commit + `git pull` na
VPS, sem rebuild (CLAUDE.md §5).

---

## 14. Riscos e dependências de outros PRDs (FRONTEIRAS do STATUS.md)

| PRD | Fronteira/dependência |
|---|---|
| **PRD 01** (modelo de dados) | **PRÉ-REQUISITO DURO**: coluna `behavior_events.is_internal` deployada e verificada por banco (V1 do §8.2 de lá) antes/junto deste rollout (§6/§11). Consome também `BEHAVIOR_TYPES` (fonte única da família B) e a taxonomia (leitura-100% = entidade derivada; aliases `click_external`/`newsletter_signup`). Em conflito de nomes de modelo, o PRD 01 manda. |
| **PRD 02** (tracking client) | Dono do filtro `mailto:`/`tel:` NA ORIGEM (`isExternalHttpHref`), do gate LGPD da newsletter e da cobertura site inteiro do `link_click`. Ordem livre: a admissão de leitura deste PRD (RF4) protege o card ANTES do PRD 02 e continua correta DEPOIS (defesa em profundidade). Após o PRD 02, o perfil do card MUDA legitimamente (mais domínios: rodapé/menu) — validação disso é de lá. |
| **PRD 03** (ingestão/filtros) | Dono da MARCAÇÃO `is_internal` no `/behavior` (trocar drop por marcação, alinhar `isPrivateIp`) e dos contadores de descarte. O filtro de leitura deste PRD é no-op até lá e passa a ter efeito real depois — sem deploy casado necessário (qualquer ordem converge). |
| **PRD 06** (agregações) | Dono das DEMAIS agregações do `/stats` e da chave de dedup do scroll (item 18) — pode mudar o VALOR de `readCompletions` sem violar R07-4 (mesma fonte). Declaração de lá: não mexe em `topSearchTerms`/`topLinkDomains`/`behaviorStats` — zero conflito de merge no handler (este PRD mexe só no bloco `:683-710`/`:756-761`). |
| **PRD 08** (saúde/alertas) | Recebe R07-1..R07-4 como regras de alerta automático, junto do CA11 do PRD 01 (tipos reservados > 0). |
| **PRD 10** (frontend) | Consumirá `searchesTotal`/`externalClicksTotal` nos lugares das somas truncadas (`Analytics.tsx:1297,:1302`) e poderá usar `searchTermsDistinct`/`linkDomainsDistinct` ("top 15 de N"); dono de estados vazios/rotulagem. Sem o PRD 10, o bug de EXIBIÇÃO do item 24 persiste (o backend já serve o dado certo — metade da correção). |
| **PRD 11** (validação cross-metric) | Incorpora R07-1..R07-4 por blog (§RF6) — todas verificáveis só com o JSON do `/stats`. |
| **PRD 12** (testes/validação) | Script de tráfego sintético deve cobrir os 3 cards com `internal:true` e incluir fixtures de >15 termos/>10 domínios para exercitar os totais em staging. |

**Riscos técnicos:** (1) implementar este PRD com o PRD 01 pendente em algum
banco → `/stats` 500 nesse blog (mitigado pelo pré-requisito §8.3 + canário);
(2) "queda" aparente de "Cliques externos" no card após rollout (legado inválido
saindo do top) ser confundida com regressão → documentada como mudança ESPERADA
(RF4/CA10) com o SQL do §8.2 (`link_click_legado_invalido`) quantificando
exatamente a diferença; (3) conflito de merge com PRD 06 no `/stats` → evitado
por fronteira de blocos (ver linha PRD 06 acima); (4) PRD 10 somar os campos
novos com os tops (dupla contagem na UI) → prevenido pelo contrato: os totais
NÃO são "resto", são o total absoluto — registrado no §7 e no docs (RF7).

---

## 15. Estimativa de esforço

**P** (pequeno). Uma função pura extraída + 4 campos aditivos no payload + regras
de admissão (3 condições) + 1 suite de testes + doc. Sem migração, sem coluna,
sem client, sem endpoint novo. O maior custo é a validação multi-blog pós-rollout
(§8.2–§8.4, pendente de execução na VPS) e a coordenação de fronteiras com
01/02/03/06/10 — já resolvida neste texto.
