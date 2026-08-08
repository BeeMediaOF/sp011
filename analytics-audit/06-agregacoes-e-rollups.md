# PRD 06 — Agregações e rollups do `/stats` (comparativos, picos, categorias, recorrentes, dia da semana, scroll)

> **O que é este documento.** PRD de implementação, escrito para ser consumido pelo
> Claude Code numa sessão futura SEM o contexto da auditoria — autocontido: dá para
> executar lendo só este arquivo. Fontes: `analytics-audit/00-auditoria-estado-atual.md`
> (Fase 0.2, achados com evidência), `analytics-audit/00-inventario.md` (mapa; §8 tem
> correções de linha), `analytics-audit/STATUS.md` (FRONTEIRAS entre PRDs),
> `PRD_ANALYTICS_PLANEJAMENTO_v2.md` (template e descrição do módulo 06) e
> CLAUDE.md §§5, 6, 12, 14, 17. As evidências `arquivo:linha` abaixo foram REABERTAS nos
> arquivos reais na sessão de escrita deste PRD (2026-07-23) para
> `api/lib/analyticsShared.ts` (arquivo completo) e `api/routes/analytics.ts:360-765`;
> referências a outros arquivos estão marcadas "(cf. auditoria)" — a Fase 0.2 também
> reabriu esses arquivos.
>
> **Princípio obrigatório:** volume baixo NÃO é bug — os blogs são novos. Bug é o que é
> logicamente incorreto ou inconsistente, independente do volume. Este PRD não faz
> número subir: faz cada agregação do `/stats` refletir a realidade, por menor que seja.
>
> **Multi-blog:** os 8 blogs (sp011, ksports, esporteagora, resenhavip, oleysports,
> beeesportes, pontofarma, creditovc) rodam a MESMA imagem `blog-api:vN`/`blog-web:vN`
> (CLAUDE.md §6). Toda correção aqui vale para a rede inteira no próximo rollout — e um
> erro quebra a rede inteira de uma vez. Nenhum fix pode ser condicionado a BLOG_ID
> (CLAUDE.md §13/§17: isolamento é por infra, não por código).
>
> **Encurtamentos:** `api = artifacts/api-server/src`, `web = artifacts/brasilia-agora/src`,
> `db = lib/db/src`.

---

## 1. Objetivo

Corrigir os 4 defeitos de agregação confirmados no `GET /api/analytics/stats` e
formalizar (preservando) os comparativos de período, picos, geografia e dispositivos:

1. **Item 3/14 (parte endpoint)** — ordenação do "Top categorias" com fallback que
   deixa categoria com ZERO acessos liderar um card rotulado "por acessos"
   (`api/routes/analytics.ts:589`).
2. **Item 6** — subquery `EXISTS` de visitantes recorrentes sem filtro `is_internal`
   e sem filtro de `type` (`api/routes/analytics.ts:479-481`): visitante com histórico
   pré-janela 100% interno vira "recorrente", inconsistente com a definição de "único"
   da própria CTE.
3. **Item 17** — "Pico por dia da semana" eleito por soma bruta sem normalizar pelas
   ocorrências de cada dia na janela (`api/lib/analyticsShared.ts:294`): em janela de
   30 dias, 2 dias da semana ocorrem 5x e 5 ocorrem 4x — até ~25% de vantagem
   estrutural.
4. **Item 18 (parte agregação)** — chave de dedup do scroll
   `${sessionId}|${articleId ?? path}` (`api/lib/analyticsShared.ts:330`) diverge da
   chave do read (`path ?? articleId`, `:321`) e abre dupla contagem quando o mesmo
   marco chega uma vez sem `articleId` (durante o load do artigo) e outra com.

E, sem alterar comportamento, **blindar por teste e por contrato** o que a auditoria
confirmou OK: comparativos de período (hoje vs ontem, 7d vs 7d anteriores, 30d vs
anteriores, janela vs janela anterior — itens 1, 2, 5), sessões únicas (7), tempo médio
por MAX cumulativo (8), taxa de rejeição (9), gráfico diário (10), dispositivos/
navegadores/sistemas (12), geografia da janela (15, parte agregação) e pico por hora
(16).

Itens da checklist do doc v2 cobertos: **3** (parte endpoint), **6**, **17**, **18**
(parte agregação) como correção; **1, 2, 5, 7, 8, 9, 10, 12, 15 (agregação), 16** como
preservação verificada.

---

## 2. Contexto / estado atual (achados da auditoria, com evidência)

### 2.1 Arquitetura da agregação — não existem jobs de rollup

Todo o dashboard é servido por UM endpoint agrupado, `GET /api/analytics/stats`
(`api/routes/analytics.ts:366`), que agrega **on-read** a cada chamada:

- **Reducer puro em memória** — `buildWindowAggregates`
  (`api/lib/analyticsShared.ts:264-343`): um passe sobre os eventos não-internos da
  janela (linhas do banco + buffer ainda não persistido, `analytics.ts:499-503`),
  produzindo `byDay/byHour/byDow`, `deviceMap`, `channelMap`, `scrollSessions`,
  `articleMap`, `catViewMap/catClickMap`, `sessionPageviews`, `readMax` (MAX por
  sessão+página), `articleReadMax`, `refHostMap`, `campaignMap`, `windowPv`.
- **SQLs agregadas paralelas** (`analytics.ts:383-496`): totais fixos ao agora
  (`:410-421`), janela anterior para tendências (`:423-430`), tempo médio anterior com
  a MESMA regra MAX (`:433-442`), rejeição anterior (`:443-452`), geografia da janela
  (`:455-461`), navegador/SO (`:462-468`), visitantes únicos/recorrentes (`:470-482`),
  ads (`:483-491` — PRD 04) e behavior (`:492-495` — PRD 07).
- **Derivados e resposta** (`analytics.ts:505-762`).

Não há tabela de rollup nem job batch para métricas de janela; os contadores all-time
(`article_views`, `category_views`, `geo_stats`, via `store`) são cadeias separadas e
NÃO alimentam os cards de período. Este PRD **mantém o modelo on-read** (volume baixo,
simplicidade, zero risco de drift entre rollup e fonte) — criar jobs de rollup é
não-objetivo.

### 2.2 O que a auditoria confirmou OK (preservar byte a byte a semântica)

- **Comparativos de período** (itens 1, 2, 5 — OK):
  - Totais fixos ao agora (contrato do Dashboard): `today` a partir do início do dia
    BRT, `yesterday`, `week = ts >= now-7d`, `prev_week = [now-14d, now-7d)`,
    `month/prev_month` idem com 30/60d, `all_time` — tudo com
    `type='pageview' AND is_internal=false` (`analytics.ts:410-421`), somando o buffer
    não-interno (`:520-526`). Janelas fixas declaradas em `:374-381`.
  - Tendências da janela selecionada: `prevAggRes` na janela imediatamente anterior de
    mesmo tamanho (`:423-430`), `pctChange` com `null` quando não há base — nunca
    inventa 0% (`analyticsShared.ts:346-348`); rejeição comparada em pontos
    percentuais (`analytics.ts:548-549`).
- **Picos**: `byHour` não tem viés (toda hora ocorre o mesmo nº de vezes em qualquer
  janela de dias inteiros); `peakHour = indexOf(max)` com `null` quando tudo zero
  (`:712, :727-728`).
- **Geografia**: agregada por evento DA JANELA com `is_internal=false`, cidade/região
  vazia vira "Não identificado" — nunca inventa local (`:455-461, :593-602,
  :733-734`). (As ressalvas do item 15 são do PROVEDOR de geolocalização no ingest —
  ip-api.com free, HTTP-only, cache negativo — decisão registrada em
  `docs/ANALYTICS.md:116-120` e fora deste PRD; ver §14.)
- **Dispositivos/Navegadores/Sistemas** (item 12 — OK): `deviceMap` no reducer
  (`analyticsShared.ts:295`), browser/SO por SQL da janela (`analytics.ts:462-468,
  :604-613, :735-737`).
- **Heartbeat MAX**: `readMax`/`articleReadMax` por MAX cumulativo
  (`analyticsShared.ts:319-327`) e a janela anterior em SQL com a mesma regra
  (`analytics.ts:433-442`) — invariante do §17.

### 2.3 Os 4 defeitos confirmados (Fase 0.2; arquivos reabertos nesta sessão)

**(D1) Item 3/14 — ordenação do Top categorias** (`analytics.ts:584-589`):

```ts
const topCategories = Array.from(allCatNames).map((name) => ({
  name,
  views:    agg.catViewMap[name]  ?? 0,
  clicks:   agg.catClickMap[name] ?? 0,
  articles: articleCountByCategory[name] ?? 0,
})).sort((a, b) => (b.clicks + b.views || b.articles) - (a.clicks + a.views || a.articles)).slice(0, 10);
```

Quando `clicks + views === 0`, o `||` troca a métrica pelo nº de artigos publicados:
categoria com 0 acessos e 30 artigos (cenário típico de blog recém-backfillado) ordena
ACIMA de categoria com 2 acessos reais — num card rotulado "por acessos". O mesmo
array alimenta o card do Dashboard (`Dashboard.tsx:326-368`, cf. auditoria) e a tabela
detalhada do Analytics (item 14). Consequência secundária no front (FRONTEIRA PRD 10):
quando o líder vem do fallback com atividade 0, a base de normalização vira 1 e os
chips "%" exibem 300%/1500% (`Analytics.tsx:350, :793-795`; barra do Dashboard
`:343-344` — cf. auditoria).

**(D2) Item 6 — EXISTS de recorrentes** (`analytics.ts:470-482`):

```sql
WITH win_visitors AS (
  SELECT DISTINCT visitor_id AS vid
  FROM analytics_events
  WHERE type = 'pageview' AND is_internal = false AND visitor_id IS NOT NULL
    AND ts >= ${winFrom} AND ts < ${winTo}
)
SELECT
  (SELECT count(*) FROM win_visitors)::int AS uniq,
  (SELECT count(*) FROM win_visitors w WHERE EXISTS (
    SELECT 1 FROM analytics_events e WHERE e.visitor_id = w.vid AND e.ts < ${winFrom}
  ))::int AS returning
```

O `EXISTS` (`:479-481`) filtra só `visitor_id` e `ts < winFrom` — sem `is_internal` e
sem `type` (correção registrada no inventário §8.5): visitante cujo histórico
pré-janela é 100% interno (ex.: era o operador logado, ou o IP estava na lista
interna) ou é só evento não-pageview vira "recorrente" e deixa de ser "novo" —
inconsistente com a definição do `uniq` da MESMA CTE (que exige
`type='pageview' AND is_internal=false`). Nota adjacente da auditoria (§4.2, fora do
defeito): `visitors.unique` vem só do SQL (sem buffer), enquanto `totals.window` e
`uniqueSessions` do mesmo payload incluem buffer — defasagem de até ~30s entre KPIs
vizinhos; tratada como borda documentada (ver §11), não como correção.

**(D3) Item 17 — byDow sem normalização** (`analyticsShared.ts:294` soma bruta
`byDow[brtDow(ev.ts)]++`; eleição do pico em `analytics.ts:713` `maxDowViews =
Math.max(...agg.byDow)` e `:729-730`):

Janela default de 30 dias contém 2 dias da semana com 5 ocorrências e 5 com 4 —
vantagem estrutural de até 25% na soma bruta, independente de dados (propriedade
matemática da janela). "7d" exato não tem viés; custom não múltiplo de 7 tem. O card
`Analytics.tsx:950-984` (cf. auditoria) exibe a soma e o pico eleito por ela.

**(D4) Item 18 — chave de dedup do scroll** (`analyticsShared.ts:329-331`):

```ts
if (ev.type === "scroll" && ev.scrollDepth) {
  scrollSessions[ev.scrollDepth]?.add(`${ev.sessionId}|${ev.articleId ?? ev.path ?? ""}`);
}
```

A chave prefere `articleId` com fallback `path` — o INVERSO da chave do read
(`${ev.sessionId}|${ev.path ?? ev.articleId ?? ""}`, `:321`). O client
(`useScrollDepth`, `web/hooks/useAnalytics.ts:276-339`, cf. auditoria) roda com
`articleId` undefined durante o load do artigo (`Artigo.tsx:130-131` usa
`article?.id`, cf. auditoria) e re-roda após o load: o mesmo marco pode chegar uma vez
só com `path` e outra com `articleId` — chaves distintas no servidor → o par
sessão×conteúdo conta 2x no `scrollDepthChart` (`analytics.ts:738`) e em
`readCompletions` (`:513`). Como `path` é obrigatório no ingest (`:214-273` — todo
evento gravado tem path), alinhar a chave ao padrão do read fecha a janela de dupla
contagem sem mudança no client. O rótulo "sessões" do card para uma unidade que é
sessão×conteúdo é FRONTEIRA do PRD 10; o dedup do lado do client é FRONTEIRA do
PRD 02.

---

## 3. Problema a resolver

Quatro agregações do `/stats` produzem resultado **logicamente incorreto** hoje,
independente de volume:

1. Um card "por acessos" pode ser liderado por categoria sem nenhum acesso (D1).
2. "Novos vs recorrentes" usa duas definições de visitante diferentes no mesmo SELECT
   (D2) — recorrente pode incluir quem nunca teve pageview público antes da janela.
3. O "pico por dia da semana" pode ser eleito por artefato da janela, não por
   comportamento do público (D3).
4. Um único leitor pode contar 2x no funil de profundidade de leitura (D4).

O que NÃO é problema: números pequenos, dias sem eventos, `null` de tendência sem base
de comparação, "Não identificado" em geografia — tudo isso é estado legítimo de blog
novo e já tratado corretamente pelo código.

---

## 4. Requisitos funcionais

### RF-1 — Ordenação do Top categorias por acessos, com desempate por artigos (D1)

Substituir o sort de `analytics.ts:589` por ordenação em dois níveis:

- chave primária: `clicks + views` (acessos) DESC;
- desempate: `articles` DESC;
- desempate final: `name` ASC (ordem estável e determinística entre requests).

Categoria com acessos > 0 NUNCA pode ficar abaixo de categoria com acessos = 0.
Categorias sem nenhum acesso continuam listadas (blog novo mostra o catálogo), apenas
depois das que têm acesso. Implementar como função pura exportada
`compareTopCategories(a, b)` em `api/lib/analyticsShared.ts` (zero imports — padrão do
arquivo, testável por `node --test`), usada pelo route no lugar do lambda atual.

### RF-2 — Recorrente = visitante com pageview PÚBLICO antes da janela (D2)

Adicionar à subquery `EXISTS` (`analytics.ts:479-481`) os mesmos filtros da CTE:

```sql
SELECT 1 FROM analytics_events e
WHERE e.visitor_id = w.vid AND e.ts < ${winFrom}
  AND e.is_internal = false AND e.type = 'pageview'
```

Semântica resultante (documentar no código): "recorrente" = visitante da janela com ao
menos um pageview não-interno anterior à janela. `visitors.new = unique - returning`
permanece (o clamp `Math.max(0, ...)` de `:721` fica como defesa; com o fix,
`returning ⊆ uniq` estruturalmente).

### RF-3 — Pico por dia da semana normalizado pelas ocorrências na janela (D3)

1. Novo helper puro em `api/lib/analyticsShared.ts`:
   `dowOccurrences(win: { fromMs: number; toMs: number }): number[]` — conta quantas
   vezes cada dia da semana (0=Dom..6=Sáb, BRT via `brtDow`) ocorre na janela,
   iterando `fromMs` até `toMs` de `DAY` em `DAY` (mesmo passo do zero-init de `byDay`
   em `:266`).
2. Novo helper puro `pickPeakDow(byDow: number[], occ: number[]): number | null` —
   entre os dias com `occ > 0` e `views > 0`, retorna o índice de maior média
   `views/occ`; empate → maior soma bruta; empate persistindo → menor índice. Sem dia
   com `views > 0` → `null` (preserva o contrato atual de `peakDay: null`).
3. No route: `dayOfWeekChart` passa a incluir, por dia, `occurrences` (int) e `avg`
   (média por ocorrência, 1 casa decimal, `null` quando `occurrences === 0`), MANTENDO
   `views` (soma bruta) para retrocompatibilidade; `peakDay` passa a ser eleito por
   `pickPeakDow`. A exibição (barras por soma ou por média, rótulos) é FRONTEIRA do
   PRD 10 — este PRD só muda o dado e a eleição do pico.

### RF-4 — Chave de dedup do scroll alinhada à do read (D4)

Trocar em `analyticsShared.ts:330` a chave de
`${ev.sessionId}|${ev.articleId ?? ev.path ?? ""}` para
`${ev.sessionId}|${ev.path ?? ev.articleId ?? ""}` — idêntica em forma à chave do read
(`:321`). Efeito: marcos enviados durante o skeleton (só path) e após o load (path +
articleId) colapsam na mesma chave; `scrollDepthChart` e `readCompletions` contam o
par sessão×conteúdo uma única vez. Nenhuma mudança no client neste PRD (FRONTEIRA
PRD 02).

### RF-5 — Preservação verificada dos comparativos, picos, geografia e dispositivos

Sem mudança de comportamento em: totais fixos ao agora (`analytics.ts:374-381,
410-421, 515-526`), tendências (`:423-452, :528-550`, `pctChange`), `byHour`/
`peakHour`, `dailyChart`, `deviceMap`/browsers/osList, geografia (`:593-602`),
sessões únicas, tempo médio (MAX), rejeição. A verificação é por suite de testes +
diff dirigido (ver §8/§9) — qualquer refactor que toque essas linhas precisa manter
resultado byte-idêntico no payload.

### RF-6 — Helpers puros e testáveis

Toda lógica nova (RF-1, RF-3) vive em `api/lib/analyticsShared.ts` como função pura
exportada (zero imports, determinística — regra da docstring `:1-7`), coberta por
`node --test`. O route (`analytics.ts`) apenas as chama. RF-4 já vive no reducer puro
(`buildWindowAggregates`), coberto pelo teste de agregação existente.

---

## 5. Requisitos não-funcionais

- **Performance:** manter o modelo um-passe do reducer (O(n) nos eventos da janela);
  `dowOccurrences` é O(dias da janela) ≤ 366; nenhuma query nova no `/stats` — RF-2
  altera só o predicado do `EXISTS` (o índice `analytics_visitor_ts_idx` sobre
  `(visitor_id, ts)`, criado em `ensureSchema.ts:57` cf. inventário §5, continua
  servindo a busca; os filtros extras são aplicados sobre as linhas do visitante — nos
  volumes atuais é irrelevante; NÃO criar índice novo).
- **Confiabilidade:** janela vazia continua devolvendo estruturas completas
  (zero-init) e `null`s honestos (`peakDay`, `trends.*`) — nunca NaN/undefined no
  payload.
- **LGPD:** nenhum dado pessoal novo é coletado, gravado ou exposto; nenhuma mudança
  em IP/geo/consentimento. As mudanças são só de agregação sobre dados já coletados.
- **Multi-blog:** correção única na imagem compartilhada; proibido condicionar a
  BLOG_ID (CLAUDE.md §13/§17). Rollout e validação em todos os blogs (§15).
- **Windows (CLAUDE.md §14):** testes via `node --test` com imports relativos com
  extensão `.ts` explícita; typecheck por pacote (`pnpm run typecheck` dentro de
  `artifacts/api-server`); sem `vite build` local; nunca caracteres unicode literais
  em regex (usar `\uXXXX` — não há regex nova prevista neste PRD).

---

## 6. Modelo de dados

**Nenhuma coluna, tabela ou índice novo.** Todas as correções são de lógica de
agregação (reducer + 1 predicado SQL + 1 sort). A regra "coluna nova SEMPRE via schema
Drizzle E `ensureSchema.ts`" (CLAUDE.md §17; deploy NÃO roda `drizzle-kit push`) não é
acionada — e fica aqui registrada como obrigatória caso a implementação descubra
necessidade nova (nesse caso: `db/schema/*.ts` + statement idempotente em
`api/lib/ensureSchema.ts`, padrão de migração definido no PRD 01).

Não tocar: `ad_daily_stats` (UNIQUE/upsert/reparo são do PRD 04), `behavior_events`
(coluna `is_internal` é do PRD 01; marcação é do PRD 03).

---

## 7. Contrato de API

Endpoint único afetado: `GET /api/analytics/stats?period=today|yesterday|7d|30d|custom&from=&to=`
(auth + permissão `analytics.view`, `analytics.ts:366`). Campos alterados (todos os
demais permanecem idênticos — inclusive `totals`, `trends`, `dailyChart`,
`hourlyChart`, `peakHour`, `devices`, `browsers`, `osList`, `topCities`, `topRegions`,
`referrerChart`, `adStats`/`adDailyChart`/`adKpis` (PRD 04), `behaviorStats` (PRD 07)):

| Campo | Antes | Depois |
|---|---|---|
| `topCategories[]` | `{name, views, clicks, articles}` ordenado por `(clicks+views \|\| articles)` | mesmo shape; ordenação: acessos DESC, empate por artigos DESC, empate por nome ASC |
| `dayOfWeekChart[]` | `{day: "Dom".."Sáb", views}` | `{day, views, occurrences: number, avg: number \| null}` — `views` inalterado (soma bruta) |
| `peakDay` | nome do dia de maior SOMA bruta; `null` se tudo zero | nome do dia de maior MÉDIA por ocorrência (regras do RF-3); `null` se tudo zero |
| `visitors.returning` | visitantes da janela com QUALQUER evento anterior (inclusive interno/não-pageview) | visitantes da janela com pageview NÃO-interno anterior à janela |
| `visitors.new` | `max(0, unique - returning)` | idem (semântica corrigida por consequência) |
| `scrollDepthChart[].count` / `engagement.readCompletions` | pares sessão×conteúdo com dupla contagem possível na troca de chave | mesmos campos; dedup por `sessionId\|path ?? articleId` (uma contagem por par) |

Mudança **aditiva** de shape (`occurrences`/`avg`) + mudanças **semânticas** de valor
(ordem, `peakDay`, `returning`, contagens de scroll). O front atual ignora campos
extras; a adaptação de exibição (barras por média, rótulo do scroll, chips %) é do
PRD 10. Nenhum payload de request muda; nenhum endpoint novo.

---

## 8. Comandos de verificação (rodar exatamente estes, com resultado esperado)

Local (Windows, repo — CLAUDE.md §14):

1. `cd artifacts/api-server && pnpm run typecheck`
   → exit 0, sem erros.
2. `node --test artifacts/api-server/test/analyticsShared.aggregate.test.ts`
   → todos os testes passam (inclui os novos casos do §12: scroll path/articleId,
   dowOccurrences, pickPeakDow, compareTopCategories).
3. `node --test artifacts/api-server/test/`
   → suite inteira do api-server passa (regressão RF-5: períodos, canal, UA,
   validação).
4. `grep -n "b.clicks + b.views || b.articles" artifacts/api-server/src/routes/analytics.ts`
   → nenhuma ocorrência (exit code 1) — sort antigo removido.
5. `grep -n -A2 "e.visitor_id = w.vid" artifacts/api-server/src/routes/analytics.ts`
   → a saída contém `e.is_internal = false` e `e.type = 'pageview'` no predicado do
   EXISTS.
6. `grep -n "ev.path ?? ev.articleId" artifacts/api-server/src/lib/analyticsShared.ts`
   → 2 ocorrências (chave do read E chave do scroll);
   `grep -n "ev.articleId ?? ev.path" artifacts/api-server/src/lib/analyticsShared.ts`
   → nenhuma ocorrência (exit code 1).
7. `git show --stat HEAD` (no commit da implementação)
   → toca somente `artifacts/api-server/src/lib/analyticsShared.ts`,
   `artifacts/api-server/src/routes/analytics.ts` e arquivos de teste
   `artifacts/api-server/test/*`; NÃO toca `lib/db/`, `ensureSchema.ts`, `ads.ts`,
   nem `artifacts/brasilia-agora/` (fronteiras dos PRDs 01/04/02/10).
8. `git show HEAD -- artifacts/api-server/src/routes/analytics.ts | grep -c "todayStart"`
   → 0 linhas alteradas contendo `todayStart` (bloco de totais fixos ao agora,
   `:374-381`/`:410-421`, intocado — invariante §17).

VPS, pós-deploy (token = o `admin_token` de um login no painel do blog):

```bash
# Contrato novo no canario (dayOfWeekChart com occurrences/avg; topCategories ordenado)
TOKEN='COLE_AQUI'
curl -s -H "Authorization: Bearer $TOKEN" "https://resenhavip.midia.run/api/analytics/stats?period=30d" | jq '{peakDay, dow0: .dayOfWeekChart[0], top2: .topCategories[0:2] | map({name, views, clicks, articles}), visitors}'
```

Resultado esperado: `dayOfWeekChart[0]` tem as chaves `day`, `views`, `occurrences`,
`avg`; se `topCategories` tiver alguma linha com `views+clicks > 0`, a primeira linha
tem `views+clicks >= ` os da segunda; `visitors.new + visitors.returning ==
visitors.unique`.

SQLs de sanidade com dados reais — **pendente de execução** (MCP Supabase não
conectado na sessão desta auditoria; blocos no padrão do CLAUDE.md §12, só SELECT,
sem heredoc). As janelas usam `now() - interval '30 days'` — aproximação da janela
BRT do dashboard; divergência marginal de borda de dia é esperada e aceita.

```bash
# SQL-1 (RF-2/item 6): recorrentes pela regra antiga vs nova — o card pos-fix deve exibir ~recorrentes_regra_nova
cd /opt/sp011
DBURL=$(grep -m1 '^SUPABASE_DATABASE_URL=' /opt/sp011/.env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "WITH win_visitors AS (SELECT DISTINCT visitor_id AS vid FROM analytics_events WHERE type='pageview' AND is_internal=false AND visitor_id IS NOT NULL AND ts >= now() - interval '30 days') SELECT count(*) AS unicos, count(*) FILTER (WHERE EXISTS (SELECT 1 FROM analytics_events e WHERE e.visitor_id = w.vid AND e.ts < now() - interval '30 days')) AS recorrentes_regra_antiga, count(*) FILTER (WHERE EXISTS (SELECT 1 FROM analytics_events e WHERE e.visitor_id = w.vid AND e.ts < now() - interval '30 days' AND e.is_internal = false AND e.type = 'pageview')) AS recorrentes_regra_nova FROM win_visitors w;"
```

```bash
# SQL-2 (RF-1/item 3): ranking real por acessos — a 1a linha com views+clicks>0 deve ser o lider do card pos-fix
cd /opt/sp011
DBURL=$(grep -m1 '^SUPABASE_DATABASE_URL=' /opt/sp011/.env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "SELECT category, count(*) FILTER (WHERE type='pageview') AS views, count(*) FILTER (WHERE type='category') AS clicks FROM analytics_events WHERE is_internal = false AND category IS NOT NULL AND ts >= now() - interval '30 days' GROUP BY 1 ORDER BY (count(*) FILTER (WHERE type='pageview')) + (count(*) FILTER (WHERE type='category')) DESC, 1;"
```

```bash
# SQL-3 (regra PRD 11): soma de views por categoria <= pageviews nao-internos do periodo
cd /opt/sp011
DBURL=$(grep -m1 '^SUPABASE_DATABASE_URL=' /opt/sp011/.env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "SELECT count(*) FILTER (WHERE category IS NOT NULL) AS pv_com_categoria, count(*) AS pv_total FROM analytics_events WHERE type='pageview' AND is_internal=false AND ts >= now() - interval '30 days';"
```

```bash
# SQL-4 (regra PRD 11): sessoes >= visitantes unicos
cd /opt/sp011
DBURL=$(grep -m1 '^SUPABASE_DATABASE_URL=' /opt/sp011/.env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "SELECT count(DISTINCT session_id) AS sessoes, count(DISTINCT visitor_id) AS visitantes FROM analytics_events WHERE type='pageview' AND is_internal=false AND ts >= now() - interval '30 days';"
```

```bash
# SQL-5 (RF-4/item 18): assinatura da dupla contagem — pares sessao+path+marco gravados COM e SEM article_id
# (0 linhas tambem e resultado valido — volume baixo nao e bug; linhas aqui quantificam o sobre-contado pre-fix)
cd /opt/sp011
DBURL=$(grep -m1 '^SUPABASE_DATABASE_URL=' /opt/sp011/.env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "SELECT session_id, path, scroll_depth, count(*) AS eventos, count(*) FILTER (WHERE article_id IS NULL) AS sem_article_id, count(*) FILTER (WHERE article_id IS NOT NULL) AS com_article_id FROM analytics_events WHERE type='scroll' AND ts >= now() - interval '30 days' GROUP BY 1,2,3 HAVING count(*) FILTER (WHERE article_id IS NULL) > 0 AND count(*) FILTER (WHERE article_id IS NOT NULL) > 0 ORDER BY eventos DESC LIMIT 50;"
```

```bash
# SQL-1..5 num blog REPLICADO (mesmas 5 queries; troque APENAS a variavel BLOG)
BLOG='resenhavip'
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d "$BLOG" -v ON_ERROR_STOP=1 -c "WITH win_visitors AS (SELECT DISTINCT visitor_id AS vid FROM analytics_events WHERE type='pageview' AND is_internal=false AND visitor_id IS NOT NULL AND ts >= now() - interval '30 days') SELECT count(*) AS unicos, count(*) FILTER (WHERE EXISTS (SELECT 1 FROM analytics_events e WHERE e.visitor_id = w.vid AND e.ts < now() - interval '30 days')) AS recorrentes_regra_antiga, count(*) FILTER (WHERE EXISTS (SELECT 1 FROM analytics_events e WHERE e.visitor_id = w.vid AND e.ts < now() - interval '30 days' AND e.is_internal = false AND e.type = 'pageview')) AS recorrentes_regra_nova FROM win_visitors w;"
docker compose exec -T pg-blogs psql -U postgres -d "$BLOG" -v ON_ERROR_STOP=1 -c "SELECT category, count(*) FILTER (WHERE type='pageview') AS views, count(*) FILTER (WHERE type='category') AS clicks FROM analytics_events WHERE is_internal = false AND category IS NOT NULL AND ts >= now() - interval '30 days' GROUP BY 1 ORDER BY (count(*) FILTER (WHERE type='pageview')) + (count(*) FILTER (WHERE type='category')) DESC, 1;"
docker compose exec -T pg-blogs psql -U postgres -d "$BLOG" -v ON_ERROR_STOP=1 -c "SELECT count(*) FILTER (WHERE category IS NOT NULL) AS pv_com_categoria, count(*) AS pv_total FROM analytics_events WHERE type='pageview' AND is_internal=false AND ts >= now() - interval '30 days';"
docker compose exec -T pg-blogs psql -U postgres -d "$BLOG" -v ON_ERROR_STOP=1 -c "SELECT count(DISTINCT session_id) AS sessoes, count(DISTINCT visitor_id) AS visitantes FROM analytics_events WHERE type='pageview' AND is_internal=false AND ts >= now() - interval '30 days';"
docker compose exec -T pg-blogs psql -U postgres -d "$BLOG" -v ON_ERROR_STOP=1 -c "SELECT session_id, path, scroll_depth, count(*) AS eventos, count(*) FILTER (WHERE article_id IS NULL) AS sem_article_id, count(*) FILTER (WHERE article_id IS NOT NULL) AS com_article_id FROM analytics_events WHERE type='scroll' AND ts >= now() - interval '30 days' GROUP BY 1,2,3 HAVING count(*) FILTER (WHERE article_id IS NULL) > 0 AND count(*) FILTER (WHERE article_id IS NOT NULL) > 0 ORDER BY eventos DESC LIMIT 50;"
```

---

## 9. Critérios de aceite

Cada critério é verificável por comando do §8 ou observação objetiva — nunca por
julgamento subjetivo. Mapeamento: item da checklist do doc v2 + regra do PRD 11
(validação cross-metric) quando aplicável.

| # | Critério | Item / regra PRD 11 | Verificação | Status de execução |
|---|---|---|---|---|
| CA-1 | Em dados sintéticos, categoria com `clicks+views > 0` nunca ordena abaixo de categoria com `clicks+views = 0`, qualquer que seja o nº de artigos; desempates por artigos e nome funcionam | Item 3/14 | §8.2 (teste de `compareTopCategories`) + §8.4 (sort antigo ausente) | executável local |
| CA-2 | O predicado do EXISTS de recorrentes contém `is_internal = false` e `type = 'pageview'` | Item 6 | §8.5 | executável local |
| CA-3 | No banco real, o card "recorrentes" pós-fix corresponde a `recorrentes_regra_nova` (± borda de dia BRT), e `recorrentes_regra_nova <= recorrentes_regra_antiga` | Item 6 | SQL-1 + observação do card | **pendente de execução** (query no banco via VPS; MCP Supabase não conectado) |
| CA-4 | `dowOccurrences` devolve, para janela de 30 dias, dois dias com 5 e cinco com 4; `pickPeakDow` elege o dia de maior média e não o de maior soma quando divergem; empates seguem RF-3 | Item 17 | §8.2 (testes dos helpers) | executável local |
| CA-5 | O payload real traz `occurrences`/`avg` em cada entrada de `dayOfWeekChart` e `visitors.new + visitors.returning == visitors.unique` | Itens 17, 6; PRD 11 "novos+recorrentes=únicos" | curl do §8 (VPS) | **pendente de execução** (pós-rollout na VPS) |
| CA-6 | Dois eventos scroll do mesmo `sessionId` e mesmo `path` — um sem `articleId`, outro com — contam UMA vez no marco; reenvio idêntico continua contando uma vez | Item 18 | §8.2 (teste do reducer) + §8.6 (chaves alinhadas) | executável local |
| CA-7 | Suite completa do api-server passa sem alteração nos testes pré-existentes de período/canal/UA/validação (regressão dos itens 1, 2, 5, 7, 8, 9, 10, 12, 15-agregação, 16) | Itens 1, 2, 5, 7-10, 12, 15, 16 | §8.3 | executável local |
| CA-8 | `sessoes >= visitantes` na janela, em produção | PRD 11 "sessões ≥ visitantes únicos" | SQL-4 | **pendente de execução** |
| CA-9 | `pv_com_categoria <= pv_total` na janela, em produção (estrutural: cada pageview tem no máximo 1 categoria) | PRD 11 "soma de views por categoria ≤ pageviews não-internos" | SQL-3 + teste sintético no §12 | **pendente de execução** (parte SQL) |
| CA-10 | Bloco de totais fixos ao agora não alterado pelo commit; `totals.today/week/month/allTime` continuam relativos ao agora em qualquer `period=` | Invariante §17 "totals.* fixos ao agora" | §8.7 + §8.8 | executável local |
| CA-11 | Commit não toca `lib/db`, `ensureSchema.ts`, `routes/ads.ts` nem `brasilia-agora` (fronteiras 01/04/02/10 respeitadas) | FRONTEIRAS (STATUS.md) | §8.7 | executável local |
| CA-12 | Pós-rollout, os cards da lista do §15 revalidados no canário resenhavip e depois nos demais blogs (sp011, ksports, esporteagora, oleysports, beeesportes, pontofarma*, creditovc*) — *se já provisionados | Multi-blog (doc v2) | observação dos cards por blog (§15) | **pendente de execução** (pós-rollout) |
| CA-13 | SQL-5 executado antes e depois do fix: os pares listados deixam de contar 2x no card (a query continua listando as LINHAS históricas — o fix é de agregação, não reescreve banco) | Item 18; invariante "linhas históricas nunca reescritas" | SQL-5 + observação do card | **pendente de execução** |

---

## 10. Invariantes do CLAUDE.md §17 preservadas por este PRD

1. **Heartbeat cumulativo agregado por MAX** — intocado: `readMax`/`articleReadMax`
   (`analyticsShared.ts:319-327`) e a SQL da janela anterior (`analytics.ts:433-442`)
   não são alterados; nenhum MAX vira SUM; reenvio de heartbeat continua idempotente.
   RF-4 muda SÓ a chave do scroll (`:330`), não a do read (`:321`).
2. **Tráfego interno marcado `is_internal`, nunca dropado** — intocado no ingest;
   RF-2 apenas aplica na LEITURA o mesmo filtro que todas as queries vizinhas do
   `/stats` já aplicam (`:408, :420, :429, :438-439, :448, :458, :465, :474-475`).
   Nenhum evento passa a ser dropado.
3. **`totals.*` do `/stats` fixos ao agora** — intocado (CA-10): as janelas fixas
   (`:374-381`) e a query de totais (`:410-421`) não mudam; nenhuma correção reindexa
   os totais ao período selecionado.
4. **Canal classificado no servidor** — não tocado: `classifyChannel`/`channelMap`/
   `referrerChart` são FRONTEIRA do PRD 05; este PRD não altera classificação nem o
   remap `normalizeLegacyChannel`.
5. **Migrações via Drizzle schema E ensureSchema** — não acionada (nenhuma coluna
   nova, §6); registrada como obrigatória se o escopo mudar.
6. **Linhas históricas nunca reescritas** — todas as correções são de agregação
   on-read; zero UPDATE em `analytics_events` (CA-13).
7. **SSR/perf (HTML `no-cache`, sanitize isomórfico, allowlist de imagem)** — fora do
   raio deste PRD; nenhum arquivo de front ou de SSR é tocado (CA-11).

---

## 11. Casos de borda

- **Janela menor que 7 dias** (today/yesterday/custom curto): alguns dias da semana
  têm `occurrences = 0` → `avg = null` e o dia não concorre ao pico; `views = 0`
  segue no chart (zero-init).
- **Janela 7d exata**: `occurrences = 1` para todos — média == soma; `peakDay`
  idêntico ao comportamento atual (sem regressão).
- **Empate de média no pico** (comum em volume baixo, ex.: 1 view em cada um de dois
  dias): desempate determinístico do RF-3 — maior soma bruta, depois menor índice.
- **Todas as categorias com 0 acessos** (blog recém-provisionado sem tráfego): lista
  ordenada por nº de artigos DESC e nome ASC — estado legítimo, não bug; o card
  continua rotulado "por acessos" e o front pode mostrar estado vazio (PRD 10).
- **Mais de 10 categorias**: `slice(0, 10)` mantido; categorias de acesso baixo podem
  ficar de fora — comportamento atual preservado.
- **Mesmo artigo acessado por dois paths distintos na mesma sessão** (ex.: slug
  alterado entre visitas): com a chave path-first do RF-4 conta 2 pares — tradeoff
  aceito pela consistência com o read (`:321`); cenário raro, registrado.
- **Scroll sem path e sem articleId**: impossível em dados gravados (path é
  obrigatório no ingest, `analytics.ts:214-273`); o fallback `?? ""` permanece por
  defesa no reducer (que também recebe o buffer).
- **Visitante com histórico pré-janela só interno** (operador que deslogou; IP saiu
  da lista interna): pela regra nova é "novo" na primeira janela pública — decisão
  semântica deliberada do RF-2 (consistente com o `uniq`), documentar no código.
- **`visitor_id` NULL** (sem consentimento): já excluído do `uniq` e, com RF-2,
  também nunca vira recorrente.
- **Defasagem buffer vs SQL no card de visitantes** (auditoria §4.2):
  `visitors.unique` não inclui o buffer (~30s até o flush), enquanto
  `totals.window`/`uniqueSessions` incluem — borda DOCUMENTADA e mantida (corrigir
  exigiria distinct de visitor no buffer; sem valor prático no volume atual). Não é
  meta deste PRD; se promovida, vai para o PRD 09 (contrato) ou PRD 11 (tolerância da
  regra).
- **Título de topArticles** (fallback `persistedTitles` no route, `analytics.ts:566`,
  com o título já resolvido no reducer em `analyticsShared.ts:308,:310` — `a.title`
  chega sempre ao menos como `articleId`, então o `persistedTitles` nunca dispara):
  item 13 da auditoria (OK), inócuo, fora de escopo.
- **Fuso**: tudo em BRT UTC-3 fixo (`analyticsShared.ts:9-16`) — sem horário de verão;
  `dowOccurrences` herda a mesma aritmética de `byDay` (passo `DAY` a partir de
  `fromMs`, que é início de dia BRT).

---

## 12. Plano de testes (`node --test`, dados sintéticos, sem poluir dados reais)

Padrões do repo (CLAUDE.md §14): `node --test`, imports relativos com extensão `.ts`
explícita, testes puros em memória (nenhum evento é enviado a banco/endpoint — zero
risco de poluir dados reais).

**Estender `artifacts/api-server/test/analyticsShared.aggregate.test.ts`:**

1. *Scroll — troca de chave não duplica* (CA-6): eventos
   `{type:'scroll', sessionId:'s1', path:'/noticia/x', scrollDepth:50}` e
   `{type:'scroll', sessionId:'s1', path:'/noticia/x', articleId:'a1', scrollDepth:50}`
   → `scrollSessions[50].size === 1`.
2. *Scroll — conteúdos distintos contam separado*: mesma sessão, paths diferentes →
   size 2 (semântica sessão×conteúdo preservada).
3. *Scroll — marco 100 alimenta readCompletions uma vez* (par com o item 1, marco 100).
4. *Read — regressão*: chave do read inalterada (MAX por sessão+path; reenvio maior
   substitui, menor não).

**Novo arquivo `artifacts/api-server/test/analyticsShared.rollups.test.ts`** (ou
seções no aggregate.test, a critério da implementação — desde que os casos existam):

5. *compareTopCategories* (CA-1): `[{v:0,c:0,art:30}, {v:2,c:0,art:1}]` → a segunda
   lidera; empate de acessos → mais artigos primeiro; empate total → nome ASC;
   propriedade: para qualquer par, `acessos(a)>acessos(b) ⇒ a antes de b`.
6. *dowOccurrences — 30d* (CA-4): janela BRT de 30 dias conhecida (ex.:
   `fromMs = brtDayStartMs("2026-06-24")`, `toMs = brtDayStartMs("2026-07-23") + DAY`)
   → soma das ocorrências = 30, dois dias com 5, cinco com 4.
7. *dowOccurrences — 7d*: todos = 1. *— custom 10d*: três dias com 2, quatro com 1.
8. *pickPeakDow* (CA-4): `byDow` em que o dia de maior soma tem 5 ocorrências e um
   dia com 4 ocorrências tem média maior → elege o de maior média; tudo zero → null;
   empate de média → maior soma; empate persistindo → menor índice.
9. *Regra PRD 11 no reducer* (CA-9, parte sintética): com N pageviews (nem todos com
   categoria), `soma(catViewMap) <= windowPv`; `Object.keys(sessionPageviews).length
   >= nº de visitantes distintos` do fixture.
10. *Payload nulo-honesto*: janela sem eventos → `peakDay === null` via
    `pickPeakDow`, `avg === null` onde `occurrences === 0` (testado nos helpers).

**O que NÃO é testável por `node --test` aqui** (SQL do route): RF-2 — coberto pelos
comandos estáticos §8.5 e pelo SQL-1 em produção (**pendente de execução**). Staging
via MCP Supabase: quando o MCP estiver conectado (projeto "SP011",
ref `yfmyufqfepzwjtzblths` — CLAUDE.md §3), os SQLs do §8 podem rodar por lá em vez da
VPS — mesmo resultado esperado.

---

## 13. Plano de rollback

Sem migração de schema e sem reescrita de dados → rollback é SÓ de imagem (o mais
simples possível):

1. **Reverter o código:** `git revert <commit do PRD 06>` + push (ou, na emergência,
   apontar os blogs de volta para a tag anterior — as imagens antigas continuam na
   VPS).
2. **Rollback rápido por blog replicado** (sem rebuild — a tag anterior existe):

```bash
# Voltar um blog para a tag anterior (ex.: v23 -> v22); repita por blog afetado
PREV='v22'
cd /opt/blogs/resenhavip
sed -i "s|^BLOG_IMAGE_TAG=.*|BLOG_IMAGE_TAG=$PREV|" .env
docker compose up -d
curl -s https://resenhavip.midia.run/api/site | grep -o '"siteName":"[^"]*"'
```

```bash
# Voltar o sp011 (compose raiz)
PREV='v22'
cd /opt/sp011
sed -i "s|^BLOG_IMAGE_VERSION=.*|BLOG_IMAGE_VERSION=$PREV|" .env
docker compose up -d api web
```

3. **Efeito do rollback:** payload volta ao contrato antigo (sem `occurrences`/`avg`;
   `peakDay` por soma; sort antigo; EXISTS antigo; chave antiga do scroll). Nenhum
   dado precisa ser restaurado (nada foi escrito diferente no banco).
4. **Interação com o PRD 10:** se o front do PRD 10 (que exibe `avg`/`occurrences`)
   já tiver sido lançado, reverter SÓ o api deixa o card de dia-da-semana sem os
   campos novos — o front do PRD 10 deve tratar campo ausente (fallback para `views`);
   na dúvida, reverter api E web juntos para a mesma tag.

---

## 14. Riscos e dependências (FRONTEIRAS do STATUS.md — obrigatórias)

**Fronteiras que este PRD NÃO pode cruzar** (decididas antes da Fase 1,
`analytics-audit/STATUS.md`):

- **`adDailyChart` (sobrescrita em `analytics.ts:658-661`) e tudo de
  `ad_daily_stats`/upsert/UNIQUE → PRD 04.** Este PRD não toca `routes/ads.ts` nem as
  agregações de anúncio do `/stats` (`:616-681, :743-754`).
- **Exibição/normalização no front → PRD 10:** chips % do item 14
  (`Analytics.tsx:350, :793-795`), barra do Dashboard (`:343-344`), rótulo "sessões"
  do card de scroll, barras/rótulos do card de dia da semana. Este PRD entrega o DADO
  correto; o PRD 10 ajusta a exibição.
- **Totais não truncados de comportamento (buscas/cliques externos) → PRD 07:** não
  mexer em `topSearchTerms`/`topLinkDomains`/`behaviorStats`
  (`analytics.ts:683-710, :755-761`).
- **Classificação de canal → PRD 05:** não mexer em `classifyChannel`/`channelMap`/
  `referrerChart`/`topRefHosts`/`topCampaigns`.
- **Coluna `is_internal` em `behavior_events` → PRD 01 (schema) e PRD 03 (marcação);
  dedup do evento `category` no ingest (escapa do 15s — infla "cliques" de categoria
  no F5) → PRD 03.** Nota: enquanto o PRD 03 não sair, o `clicks` do item 14 pode
  vir inflado por F5 — a ORDENAÇÃO deste PRD já fica correta, mas o valor da célula
  depende do PRD 03.
- **Dedup client do scroll (troca `bee_scroll_p:<path>` → `bee_scroll_<id>` durante o
  load, `Artigo.tsx:130-131`) e cobertura de `link_click` → PRD 02.** O RF-4 fecha a
  dupla contagem server-side independentemente do client.
- **Geolocalização (provedor ip-api.com, termos free, cache negativo) → ingest
  (PRD 03/decisão registrada em `docs/ANALYTICS.md:116-120`).** A agregação de
  geografia deste PRD permanece como está.
- **Contadores de saúde/alertas → PRD 08; contratos por card → PRD 09; regras
  contínuas de sanidade → PRD 11** (este PRD entrega duas regras verificáveis:
  CA-8/CA-9).

**Dependências:**

- Nenhum PRD precisa sair ANTES deste — os 4 fixes são independentes de 04/05.
- O **PRD 10** depende do contrato novo do §7 (campos `occurrences`/`avg`, semântica
  de `peakDay` e do count de scroll) — implementar 06 antes de 10.
- O **PRD 11** herda CA-8/CA-9 como regras contínuas por blog.
- O **PRD 12** absorve os testes do §12 na estratégia geral.

**Riscos:**

1. *Janela transitória de exibição:* entre o rollout deste PRD e o do PRD 10, o card
   de dia da semana continua desenhando barras pela soma bruta (`views`) enquanto o
   `peakDay` já vem normalizado — o dia destacado pode não ser o da maior barra.
   Mitigação: é o comportamento CORRETO do dado; documentar no commit e priorizar o
   PRD 10 na sequência; alternativa consciente rejeitada (manter `peakDay` errado até
   o PRD 10 sair prolongaria o bug).
2. *Queda numérica visível:* "recorrentes" e "profundidade de leitura" podem DIMINUIR
   após o fix (estavam sobre-contados). Não é regressão — avisar o operador no resumo
   do deploy para não interpretar como perda de dados.
3. *Mesma imagem, 8 blogs:* erro no reducer quebra o dashboard da rede inteira —
   mitigado por canário resenhavip (§15) + suite de testes + rollback de tag (§13).
4. *Sort estável:* `Array.prototype.sort` é estável em Node moderno, mas o desempate
   por nome do RF-1 elimina qualquer dependência disso.

---

## 15. Rollout multi-blog (padrão CLAUDE.md §6) + cards a revalidar

Só `artifacts/api-server` muda → serviço afetado: `api` (mapeamento §5 do CLAUDE.md).
O rollout de blogs replicados usa o fluxo completo de imagem (§6): bump + build +
sp011 + canário + demais.

```bash
# 1) Bump de versao + build + sp011
cd /opt/sp011
git pull
V=$(grep -m1 '^BLOG_IMAGE_VERSION=' .env | cut -d= -f2); N="v$((${V#v}+1))"
sed -i "s|^BLOG_IMAGE_VERSION=.*|BLOG_IMAGE_VERSION=$N|" .env
grep '^BLOG_IMAGE_VERSION=' .env
docker compose build api web
docker compose up -d api web
```

```bash
# 2) Canario (resenhavip) — conferir o site E os cards antes de seguir
N=$(grep -m1 '^BLOG_IMAGE_VERSION=' /opt/sp011/.env | cut -d= -f2)
cd /opt/blogs/resenhavip
sed -i "s|^BLOG_IMAGE_TAG=.*|BLOG_IMAGE_TAG=$N|" .env
docker compose up -d
curl -s https://resenhavip.midia.run/api/site | grep -o '"siteName":"[^"]*"'
```

```bash
# 3) Demais blogs (pula os que ainda nao existem)
N=$(grep -m1 '^BLOG_IMAGE_VERSION=' /opt/sp011/.env | cut -d= -f2)
for b in ksports esporteagora oleysports beeesportes pontofarma creditovc; do
  [ -d "/opt/blogs/$b" ] || continue
  cd "/opt/blogs/$b"
  sed -i "s|^BLOG_IMAGE_TAG=.*|BLOG_IMAGE_TAG=$N|" .env
  docker compose up -d
done
cd /opt/sp011
```

**Cards do dashboard a revalidar POR BLOG após o rollout** (primeiro no canário
resenhavip; depois em sp011, ksports, esporteagora, oleysports, beeesportes e — se já
provisionados — pontofarma e creditovc). Login no `/admin` de cada blog:

| Card | O que conferir (observação objetiva) |
|---|---|
| Dashboard → Top categorias | O líder tem acessos > 0 sempre que alguma categoria tiver acesso; categorias 0-acesso aparecem depois |
| Analytics → Top categorias (detalhado) | Mesma ordem do Dashboard; valores de views/cliques inalterados por linha (só a ORDEM muda; chips % só mudam no PRD 10) |
| Analytics → Visitantes únicos | `novos + recorrentes = únicos`; recorrentes ≤ valor pré-rollout (nunca maior) |
| Analytics → Pico por dia da semana | `peakDay` coerente com a média por ocorrência (pode divergir da maior barra até o PRD 10 — esperado) |
| Analytics → Profundidade de leitura | Contagens ≤ valores pré-rollout (dupla contagem eliminada); funil monotônico não-crescente 25→100 continua |
| Dashboard → Views hoje / 7 dias; Analytics → 5 KPIs, Tráfego ao longo do tempo, Pico por hora, Dispositivos/Navegadores/Sistemas, Localização | REGRESSÃO: idênticos ao pré-rollout (nenhum destes é alterado por este PRD) |

Padrão pós-push (CLAUDE.md §18): a resposta do commit de implementação deve terminar
com os blocos acima prontos para colar.

---

## 16. Estimativa de esforço

**M.** Quatro pontos de código pequenos e localizados (1 sort → helper puro, 1
predicado SQL, 1 helper de ocorrências + eleição de pico, 1 troca de chave no
reducer), sem migração de dados/schema, mas com carga de teste relevante (10 casos
novos), contrato aditivo a documentar e rollout completo de imagem nos 8 blogs com
revalidação card a card.
