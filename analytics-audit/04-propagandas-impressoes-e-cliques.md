# PRD 04 — Propagandas: impressões e cliques confiáveis (CRÍTICO)

> **O que é este documento.** PRD de implementação, escrito para ser consumido pelo
> Claude Code numa sessão futura SEM o contexto da auditoria — autocontido: dá para
> executar lendo só este arquivo. Fontes: `analytics-audit/00-auditoria-estado-atual.md`
> (Fase 0.2, achados com evidência), `analytics-audit/00-inventario.md` (mapa),
> `PRD_ANALYTICS_PLANEJAMENTO_v2.md` (template e descrição do módulo), `docs/ANALYTICS.md`
> (dicionário de métricas) e CLAUDE.md §§5, 6, 14, 17. As evidências `arquivo:linha`
> abaixo foram REABERTAS nos arquivos reais na sessão de escrita deste PRD (2026-07-23),
> exceto onde marcado "(cf. auditoria)" — nesses casos a fonte é a Fase 0.2, que também
> reabriu os arquivos.
>
> **DADOS REAIS (2026-07-23):** o **Anexo A da auditoria FOI EXECUTADO** na VPS (sp011 +
> ksports, esporteagora, resenhavip, oleysports, beeesportes) e os resultados estão na
> **§9 de `analytics-audit/00-auditoria-estado-atual.md`**. Este PRD foi atualizado com
> eles no lugar de cada requisito: o que a §9 fechou virou **Confirmado com dados** (com
> os números medidos); o que ela NÃO responde continua **Hipótese** ou **⚠️ pendente de
> execução** — nada foi promovido por otimismo. Taxonomia usada no documento inteiro:
> *Confirmado no código* (arquivo reaberto) / *Confirmado com dados* (query rodada em
> produção, §9 da auditoria) / *Hipótese*. Destaque: o **estimador de reparo do RF2 já
> está validado contra produção** (§RF2 — 65 = 65 no esporteagora), antes de uma linha
> ser implementada.
>
> **Princípio obrigatório:** volume baixo NÃO é bug — os blogs são novos. Bug é o que é
> logicamente incorreto ou inconsistente, independente do volume. Este PRD não existe
> para "fazer os números subirem": existe para que impressão/clique/CTR de anúncio
> reflitam a realidade (é a métrica reportada a anunciantes na rede inteira).
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

Tornar confiável a contagem de impressões e cliques de anúncio em todos os blogs da
rede, nesta ordem:

1. Eliminar a **causa nuclear** da inflação (upsert de `ad_daily_stats` sem constraint
   UNIQUE — inflação ~quadrática) com constraint `UNIQUE (ad_id, date)` + upsert
   atômico `ON CONFLICT`. *(Confirmado com dados — auditoria §9.1: fator medido de
   ~2,8× a ~15× por blog, 16,2× num anúncio clássico e 27× no pior dia da rede.)*
2. **Reparar os dados históricos inflados** (com backup prévio, rollback documentado e
   marcador "dados confiáveis desde" para anúncios). *(Estimador do reparo já validado
   contra o contador all-time independente em produção — §RF2.)*
3. **Marcar tráfego interno server-side** nas rotas `/api/ads/:id/*` (hoje não marcam
   nada), estendendo a invariante "marcado, nunca dropado" do CLAUDE.md §17.
4. **Dedup server-side por sessão/anúncio** (hoje o único dedup é client-side, por aba).
5. Corrigir o **`adDailyChart`** (sobrescrita de linhas duplicadas → gráfico mostra o
   valor de UMA linha arbitrária, inconsistente com a tabela ao lado).
6. Definir a **invariante de sanidade** "impressões ≤ pageviews não-internos × slots ×
   margem" (fórmula + helper puro + SQL), que alimenta o PRD 11.
7. **SÓ DEPOIS da base confiável:** validar a instrumentação de cliques e o CTR
   (critérios de cliques/CTR são condicionados à aceitação dos itens 1–5).

Itens da checklist do doc v2 cobertos: **4** (Propagandas resumo no Dashboard),
**19** (Propagandas detalhado na janela), **20** (Desempenho por anúncio),
**21** (gráfico Impressões top-3) e a parte de "dados confiáveis desde" de anúncios do
**25** (Saúde da coleta).

---

## 2. Contexto / estado atual (achados da auditoria, com evidência)

### 2.1 A cadeia hoje (Confirmado no código)

- **Client** — os componentes de anúncio montam `useAdImpression`
  (`web/components/ads/useAds.ts:144-175`): impressão "viewável" = ≥50% visível
  (IntersectionObserver, threshold 0.5) por 1s contínuo (`IMPRESSION_DWELL_MS=1000`,
  `:128`), dedupada SÓ no client, por ABA, via `sessionStorage bee_adimp_<id>`
  (`:130-135`) + `Set` por instância do hook (`:145`). O envio (`trackImpression`,
  `useAds.ts:121-124`; `trackClick` `:116-119`) é um `fetch POST` **sem body** e o
  único filtro é `isInternalTraffic()` (`:107-114` — `import.meta.env.DEV` ou
  `localStorage.admin_token`): admin logado **suprime** o envio (não marca — ao
  contrário do SDK de pageview, que envia com `internal:true`, `useAnalytics.ts:111`,
  cf. auditoria). Não há checagem de consentimento LGPD em impressão/clique (assimetria
  com pageview — auditoria, claim j).
- **Servidor** — `POST /api/ads/:id/impression` (`api/routes/ads.ts:184-220`) e
  `POST /api/ads/:id/click` (`:141-181`): únicos portões são `isBotRequest`
  (`api/lib/trafficGuard.ts:14-20` — mesmo filtro do `/event`) e
  `overRateLimit('adimp:'+ip, 60)` / `('adclick:'+ip, 30)` (`ads.ts:187`, `:145`).
  O arquivo `ads.ts` **não contém** `internal`/`isPrivateIp`/`internalIpSet` nem dedup
  por sessão. Blocos `block:<id>` são validados contra as settings (`findAdBlock`,
  `ads.ts:17-29`; `BLOCK_PREFIX` `:15`); anúncio clássico exige ativo/não-expirado
  (`:200-210`) e incrementa o all-time `adsTable.impressions/clicks` (`:212-215`,
  `:173-176` — contadores CORRETOS, +1 por chamada aceita).
- **Gravação (o defeito central)** — `upsertDailyStat` (`ads.ts:36-50`), dia BRT via
  `todayStr` (`:31-34`):

  ```ts
  async function upsertDailyStat(adId: string, field: "impressions" | "clicks") {
    const date = todayStr();
    await db
      .insert(adDailyStatsTable)
      .values({ adId, date, impressions: field === "impressions" ? 1 : 0, clicks: field === "clicks" ? 1 : 0 })
      .onConflictDoNothing();
    await db
      .update(adDailyStatsTable)
      .set(
        field === "impressions"
          ? { impressions: sql`${adDailyStatsTable.impressions} + 1` }
          : { clicks: sql`${adDailyStatsTable.clicks} + 1` }
      )
      .where(and(eq(adDailyStatsTable.adId, adId), eq(adDailyStatsTable.date, date)));
  }
  ```

  `ad_daily_stats` **não tem UNIQUE em (ad_id, date)** em nenhuma fonte de schema:
  o Drizzle usa `index()` comum (`db/schema/ad_daily_stats.ts:9-12`), a migração cria
  só `CREATE INDEX` (`lib/db/migrations/0000_init.sql:293-299,321-322`) e o
  `ensureSchema.ts:24-75` não tem statement algum para a tabela. Logo o
  `.onConflictDoNothing()` nunca conflita (único constraint é o PK serial): **cada
  chamada insere linha NOVA** e o UPDATE incrementa **todas** as linhas do par.
  N eventos serializados geram linhas {N+1, N, …, 2}, soma **(N²+3N)/2** — 2 eventos
  reais viram 5, 4 viram 14, 7 viram 35, 12 viram 90. E mesmo com UNIQUE, a 1ª chamada
  do dia contaria 2 (INSERT 1 + UPDATE +1) — o dobro-erro é do próprio par de
  statements (auditoria, claim i).

  **CONFIRMADO COM DADOS** (Anexo A executado na VPS em 2026-07-23 — auditoria §9.1):
  o padrão previsto aparece LITERALMENTE no banco. sp011, par
  (`block:header-banner`, `2026-07-17`) — **17 linhas do mesmo par**, com os valores:

  ```
  18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2
  ```

  Soma armazenada = **170**; `(N²+3N)/2` com N=17 → **170 exato** (17 impressões
  reais viraram 170). Mesmo padrão em 07-16 e 07-15 (`9..2`, soma 44, N=8) e em
  07-14 (`5..2`, soma 14, N=4). Um par MISTO real (esporteagora 07-17, anúncio
  "Start") traz as linhas `2 imp/1 clk` e `0 imp/2 clk` — exatamente o que o
  escritor legado produz para a sequência [1 impressão, depois 1 clique]
  (INSERT da impressão vira 2 no próprio UPDATE; INSERT do clique vira 2 e a linha
  antiga vira 1). Nenhum dos **6 bancos consultados** tem UNIQUE em (ad_id, date):
  a query `pg_indexes` não foi rodada, mas a existência de pares duplicados nos 6
  prova a ausência (auditoria §9.7).

  **Fatores de inflação medidos por blog** (impressões da janela de 30 dias —
  armazenado no `ad_daily_stats` → real estimado pelo `MAX−1`; auditoria §9.1):

  | Blog | Armazenado | Real estimado | Fator |
  |---|---|---|---|
  | sp011 | 300 | ~49 | ~6× no total; **7,2×** no `block:header-banner` |
  | ksports | 1069 | ~150 | ~7× |
  | esporteagora | 1310 | ~90 | ~15× (anúncio "Start" isolado: **16,2×**) |
  | resenhavip | 1801 | ~120 | ~15× — pior dia da rede: 07-22 com **1377 armazenadas para 51 reais (27×)** |
  | oleysports | 1253 | ~90 | ~14× |
  | beeesportes | 168 | ~60 | ~2,8× |

  (Os valores "armazenado" e "real estimado" são os da §9.1; a coluna "fator" é a
  divisão direta desses dois números — a §9.1 declara explicitamente apenas 7,2×
  no header-banner do sp011, 16,2× no anúncio "Start" do esporteagora e 27× no pior
  dia do resenhavip. Quanto MAIS eventos num mesmo dia, maior o fator — a inflação é
  quadrática, então o fator NÃO é constante e não serve para "descontar" nada por
  regra de três: só o `MAX−1` por par recupera o valor.)

  **Ressalva de leitura** (auditoria §9.1): na query A1 do Anexo A a coluna
  `dias_com_registro` é `count(*)` — conta LINHAS, não dias distintos (os "38 dias" do
  header-banner do sp011 são 38 linhas em 5 dias). A V1 do §8.2 deste PRD já usa a
  forma correta (`GROUP BY ad_id, date HAVING count(*) > 1`).
- **Leitura** — `GET /api/analytics/stats` lê as linhas da janela (`api/routes/
  analytics.ts:487-490`), `adWindowTotals` SOMA todas as linhas (`:616-621` — herda a
  inflação), `buildAdStat`/`adStats` calcula CTR sobre essa base (`:635-649`), KPIs em
  `:672-681` e payload `adKpis` em `:748-754`. O `adDailyChart` (`:651-670`) tem defeito
  próprio: **atribuição com sobrescrita** —

  ```ts
  for (const row of adDailyRows) {
    if (top3AdIds.includes(row.adId) && adDailyByDate[row.date]) {
      adDailyByDate[row.date]![row.adId] = { impressions: row.impressions, clicks: row.clicks };
    }
  }
  ```

  (`:658-661`) — com linhas duplicadas do par, o gráfico mostra o valor de UMA linha
  arbitrária (a query `:487-490` não tem ORDER BY), inconsistente com a tabela ao lado
  (pode até SUBnotificar). All-time de blocos: `GET /api/admin/ads/block-stats`
  (`api/routes/admin.ts:989-1004`, cf. auditoria) soma `ad_daily_stats` de `block:%` —
  também inflado. `Dashboard.tsx:387-403` e `AdsManager.tsx:624-636` (cf. auditoria)
  consomem o all-time de `adsTable` (correto) + block-stats (inflado).
- **Comparação com pageview** — pageview passa por consentimento LGPD no client,
  marcação `is_internal` no servidor (`analytics.ts:239-243`: flag do body OU
  `internalIpSet()` OU `isPrivateIp`) e exclusão `is_internal=false` na leitura.
  Impressão de anúncio não passa por NENHUM desses três filtros. O painel compara,
  lado a lado, séries com regras de admissão completamente diferentes ("91 vs 3").
- **Documentação existente** — `docs/ANALYTICS.md:87-92` descreve o dicionário das
  métricas de anúncio; a linha 87 afirma dedup "1× por anúncio por sessão", mas o
  mecanismo real é 1× por ABA e só no client (correção registrada no inventário §8).

### 2.2 Síntese da auditoria (Problema 1)

Quatro mecanismos independentes, todos confirmados no código, empurram
impressões/pageviews para cima: (1) **inflação aritmética na gravação** (o único que
corrompe o dado armazenado — este PRD, RF1/RF2); (2) assimetria de admissão
consentimento/interno (RF3 aqui para o lado servidor; consentimento é PRD 02);
(3) multiplicidade legítima por página/carrossel (comportamento deliberado, padrão IAB
por criativo — não é bug; fica limitado pelo dedup do RF4); (4) ausência de
dedup/observabilidade server-side (RF4 aqui; contadores → PRD 03; alertas → PRD 08).

**Status de cada mecanismo depois do Anexo A (2026-07-23):**

1. **Inflação aritmética na gravação → Confirmado com dados** (§9.1; números e padrão
   literal de linhas no §2.1 acima). É o mecanismo DOMINANTE: sozinho explica de ~3×
   a ~27× dos números exibidos hoje.
2. **Assimetria de admissão (consentimento/interno) → fortemente sustentada com
   dados** (§9.3): 4 blog-dias com **ZERO pageview não-interno** e impressões REAIS
   (já descontada a inflação) em dois dígitos — sp011 07-17 (0 pv, 177 → ~20 imp),
   esporteagora 07-23 (0 pv, 299 → ~23), oleysports 07-21 (0 pv, 28 → ~11),
   resenhavip 07-10 (0 pv, 23 → ~10). Impressão exige humano com a página aberta ≥1s,
   logo há tráfego que gera impressão e não gera pageview. **A AUTORIA continua
   Hipótese** (visitante sem consentimento LGPD × bot com JS × operador sem
   `admin_token`): `ad_daily_stats` não guarda sessão, IP, UA nem timestamp por
   evento, então é indeterminável até pelo banco (§9.7). A própria §9.7 registra que
   **só este PRD** (dimensão interna do RF3 + dedup por sessão do RF4) torna isso
   observável daqui para frente.
3. e 4. **Continuam Confirmados no código** — a §9 não os mede diretamente (o dado
   agregado não distingue carrossel nem sessão).

A decomposição numérica exata do "91 vs 3" do relato original **não** foi feita pela §9
(o Anexo A mediu a janela de 30 dias de cada blog, não o print daquele dia) — no detalhe
continua **Hipótese**; o mecanismo dominante, porém, está provado com dados.

---

## 3. Problema a resolver

1. **Dado armazenado corrompido**: `ad_daily_stats` acumula linhas duplicadas por
   (ad_id, date) com valores inflados ~quadraticamente; toda leitura de janela
   (KPIs, tabela, CTR, block-stats all-time) herda a inflação. CTR reportado a
   anunciante não tem valor. **Medido (§9.1)**: os 6 bancos consultados têm pares
   duplicados; um único anúncio clássico mostra **1052 impressões armazenadas para 65
   reais** e o pior dia da rede tem **1377 armazenadas para 51 reais**.
2. **Sem marcação interna server-side**: operador/admin em navegador sem
   `admin_token` (celular, aba anônima) conta impressão como pública; a invariante
   "marcado, nunca dropado" não alcança as rotas de ads (não há coluna nem lógica).
3. **Sem dedup server-side**: aba nova reconta tudo; storage bloqueado degrada para
   Set por instância; um script com UA de navegador conta até 60 impressões/min/IP
   sem resistência além do rate limit (não é dedup).
4. **Gráfico top-3 inconsistente com a tabela** (sobrescrita de linhas duplicadas).
5. **Nenhuma regra de sanidade automatizável** liga impressões a pageviews — o
   "91 vs 3" só foi percebido a olho.
6. Cliques: instrumentação client existe (`onClick` nos 9 call-sites, cf. inventário
   §3), mas sem dedup algum e sobre a mesma gravação defeituosa; CTR sobre base
   corrompida. "Cliques sempre 0" pode ser real (volume baixo não é bug). **Dado
   (§9.1/§9.6)**: cliques REAIS existem na rede, em volume mínimo — 1 clique real no
   esporteagora (3 armazenados; all-time correto = 1) e 1 no `block:html-ksports-ad-box`
   do ksports (linhas `2/1` + `0/2`). Ou seja: a instrumentação de clique DISPARA — o
   que está errado é o número gravado, não o gatilho.

---

## 4. Requisitos funcionais

Ordem de implementação obrigatória: RF1 → RF2 → RF3/RF4/RF5 (mesma imagem) → RF6 →
RF7. Os critérios de aceite de RF7 (cliques/CTR) só podem ser marcados após os de
RF1–RF5 passarem.

### RF1 — Constraint UNIQUE + upsert atômico (causa nuclear)

- `ad_daily_stats` passa a ter **índice único `ad_daily_ad_date_uniq` em
  `(ad_id, date)`** — no schema Drizzle E no `ensureSchema.ts` (ver §6). O índice
  comum `ad_daily_ad_date_idx` é removido (redundante com o único).
- `upsertDailyStat` (`api/routes/ads.ts:36-50`) vira **um único statement atômico**:

  ```ts
  async function upsertDailyStat(adId: string, field: "impressions" | "clicks", internal: boolean) {
    const date = todayStr();
    const col = internal
      ? (field === "impressions" ? "internalImpressions" : "internalClicks")
      : field;
    try {
      await db
        .insert(adDailyStatsTable)
        .values({
          adId, date,
          impressions:         col === "impressions"         ? 1 : 0,
          clicks:              col === "clicks"              ? 1 : 0,
          internalImpressions: col === "internalImpressions" ? 1 : 0,
          internalClicks:      col === "internalClicks"      ? 1 : 0,
        })
        .onConflictDoUpdate({
          target: [adDailyStatsTable.adId, adDailyStatsTable.date],
          set: { [col]: sql`${adDailyStatsTable[col]} + 1` },
        });
    } catch (err) {
      logger.warn({ err, adId }, "ads: falha ao gravar stat diário (não-fatal)");
    }
  }
  ```

  Semântica: 1º evento do dia = 1 (não 2); demais = +1; concorrência resolvida pelo
  banco. O try/catch preserva o comportamento fire-and-forget atual (`void
  upsertDailyStat(...)`, `ads.ts:157,:178,:195,:217`) sem risco de unhandled
  rejection — se o índice único ainda não existir (reparo falhou naquele boot), o
  `ON CONFLICT (ad_id,date)` erra, é logado e o all-time de `adsTable` continua
  correto; o próximo boot reexecuta o reparo.

### RF2 — Reparo automático dos dados históricos (com backup e marcador)

> **O ESTIMADOR DESTE RF JÁ FOI VALIDADO CONTRA PRODUÇÃO — Confirmado com dados**
> (Anexo A executado em 2026-07-23; auditoria §9.1). Ver "Validação prévia" logo abaixo
> do algoritmo: no esporteagora o estimador `MAX−1` somado dia a dia reproduz
> **exatamente** o contador all-time independente do anúncio (**65 = 65**), contra 1052
> armazenadas nas linhas infladas. Não é mais um algoritmo "esperado correto": é um
> algoritmo que acertou o número certo em dados reais antes de ser implementado.

Executado **no boot** (dentro do fluxo do `ensureSchema` — CLAUDE.md §17: "colunas
novas do blog se autocriam no boot", nada de migração manual por blog; alcança o
sp011/Supabase e todos os blogs do pg-blogs na mesma imagem). Nova função exportada
`ensureAdDailyStatsIntegrity(target)` em `api/lib/ensureSchema.ts`, chamada ao final
de `ensureSchema()`:

1. **Guarda de idempotência**: só roda se o índice `ad_daily_ad_date_uniq` NÃO existe
   (`SELECT 1 FROM pg_indexes WHERE tablename='ad_daily_stats' AND
   indexname='ad_daily_ad_date_uniq'`). Depois que o índice existe, nunca mais
   reexecuta (o estimador NÃO é idempotente sobre dados já reparados — ver §11).
   *(Confirmado com dados, §9.7: nenhum dos 6 bancos consultados — sp011, ksports,
   esporteagora, resenhavip, oleysports, beeesportes — tem o índice único; a query
   `pg_indexes` não foi rodada, mas os pares duplicados encontrados em todos eles
   provam a ausência. Logo o reparo VAI executar no 1º boot em todos os 6. Em
   pontofarma/creditovc, que ainda não subiram, a tabela nasce vazia: reparo no-op +
   criação do índice.)*
2. **Transação única** (tudo-ou-nada; se qualquer passo falhar, rollback e retry no
   próximo boot):
   a. **Backup**: `CREATE TABLE IF NOT EXISTS ad_daily_stats_backup_prd04 AS SELECT *
      FROM ad_daily_stats` (uma vez; preserva o estado ORIGINAL pré-reparo; fora do
      schema Drizzle — tabela operacional, descartável após validação).
   b. **Reparo por par** (estimador — dedução no §11): para cada `(ad_id, date)`,
      manter a linha de menor `id` com
      `impressions = CASE WHEN max=0 THEN 0 ELSE max-1 END` (idem `clicks`, cada um
      com o próprio MAX do par) e deletar as demais:

      ```sql
      WITH rep AS (
        SELECT ad_id, date, min(id) AS keep_id,
               CASE WHEN max(impressions) = 0 THEN 0 ELSE max(impressions) - 1 END AS imp_fix,
               CASE WHEN max(clicks)      = 0 THEN 0 ELSE max(clicks)      - 1 END AS clk_fix
        FROM ad_daily_stats GROUP BY ad_id, date
      )
      UPDATE ad_daily_stats s SET impressions = rep.imp_fix, clicks = rep.clk_fix
      FROM rep WHERE s.id = rep.keep_id;
      -- e depois:
      DELETE FROM ad_daily_stats s USING rep
      WHERE s.ad_id = rep.ad_id AND s.date = rep.date AND s.id <> rep.keep_id;
      ```

      (o CTE se repete no DELETE ou usa tabela temporária — detalhe de implementação;
      o par UPDATE+DELETE roda dentro da MESMA transação do passo 2).
      **Importante**: o reparo se aplica a TODOS os pares, inclusive os de linha
      única — 1 evento real gera valor 2 no código velho (INSERT 1 + UPDATE +1).
   c. **Índice**: `CREATE UNIQUE INDEX ad_daily_ad_date_uniq ON ad_daily_stats
      (ad_id, date)` + `DROP INDEX IF EXISTS ad_daily_ad_date_idx` — dentro da
      transação (CREATE INDEX não-concorrente é transacional no Postgres; se colidir
      com escrita legada residual, tudo reverte e o boot seguinte repete).
   d. **Marcador "dados confiáveis desde"**: `INSERT INTO settings (key, value)
      SELECT 'ads_reliable_since', to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date,
      'YYYY-MM-DD') WHERE NOT EXISTS (SELECT 1 FROM settings WHERE
      key='ads_reliable_since')` (`settings` é KV com `key` PK,
      `db/schema/settings.ts:3-7`). Semântica: datas ANTERIORES ao marcador contêm
      valores REPARADOS POR ESTIMATIVA; datas a partir dele são contagem exata do
      código novo.
- O reparo NÃO toca `adsTable.impressions/clicks` (all-time corretos — auditoria,
  claim i) nem `analytics_events`.

**Validação prévia do estimador contra produção — CONFIRMADO COM DADOS**
(Anexo A na VPS, 2026-07-23; auditoria §9.1)

O estimador `MAX−1` foi conferido contra a única fonte de verdade INDEPENDENTE que
existe hoje: o contador all-time `ads.impressions/clicks`, incrementado +1 por chamada
aceita (`ads.ts:212-215` impressão, `:173-176` clique — reabertos e conferidos) e que
NÃO passa pelo upsert defeituoso. O **esporteagora** é o único blog com anúncio
CLÁSSICO com histórico (anúncio `bc744067-…`, "Start") — blocos `block:%` não têm linha
em `ads`, logo não têm contraprova:

| Fonte | Impressões | Cliques |
|---|---|---|
| `ad_daily_stats` — soma das linhas infladas (o que o painel mostra HOJE) | **1052** | 3 |
| `ads.impressions/clicks` all-time (contador correto e independente) | **65** | 1 |
| **Estimador `MAX−1` por par, somado dia a dia (o que o RF2 vai gravar)** | **65** ✅ | **1** ✅ |

Cálculo dia a dia: 07-23 MAX 24 → 23; 07-22 MAX 38 → 37; 07-17 MAX 2 → 1; 07-15 MAX 4
→ 3; 07-13 MAX 2 → 1. Total **65 = all-time 65**. Fator de inflação desse anúncio:
**16,2×**.

Como ler esse resultado:

- **(a) O algoritmo de reparo recupera o número CERTO, não uma aproximação** — provado
  em dados reais de produção, antes de qualquer linha de código ser escrita. É a
  evidência mais forte disponível a favor do RF2 e o motivo pelo qual o reparo pode
  rodar automaticamente no boot da rede inteira.
- **(b) O desvio por concorrência é ZERO no volume atual** — a dedução do §11 assume
  execução serializada do escritor legado; o acerto exato (e não "próximo") mostra que
  a premissa se sustenta com os volumes de hoje. Continua valendo a ressalva do §11
  para volumes maiores, mitigada pelo backup (CA5) e pelo marcador `ads_reliable_since`.
- **(c) A comparação só é interpretável porque as linhas diárias cobrem toda a vida do
  anúncio** (07-13 a 07-23, dentro da janela consultada). Para anúncios mais antigos
  que a janela, o esperado é `diário ≤ all-time` — é assim que a V6 do §8.2 deve ser
  lida.
- **(d) Expectativa pós-reparo, verificável**: esse mesmo anúncio deve passar a marcar
  **65/65** (diário = all-time) em vez de 1052/65 — critério dirigido **CA13** (§9).
  A partir do reparo a igualdade se MANTÉM por construção: evento público incrementa os
  dois contadores em +1, e evento interno (RF3) não incrementa nenhum dos dois.
- **(e) Limite da validação**: ela cobre um anúncio clássico. Para blocos `block:%` não
  há contador independente — o que a valida é o mecanismo, idêntico (o reparo opera por
  `ad_id` textual, sem distinguir tipo).

### RF3 — Tráfego interno server-side nas rotas de ads (extensão da invariante §17)

**Declaração explícita de como este PRD estende "tráfego interno marcado
`is_internal`, nunca dropado"** (CLAUDE.md §17; auditoria §5, invariante 2): como
`ad_daily_stats` é agregada por dia (não guarda evento a evento), a marcação vira
**dimensão de colunas**: eventos internos são CONTADOS em `internal_impressions`/
`internal_clicks` na MESMA linha do par — gravados e auditáveis (nunca dropados no
servidor), e excluídos das métricas públicas na leitura sem mudar nenhum leitor
(os leitores atuais somam só `impressions`/`clicks`: `analytics.ts:616-621`,
`admin.ts:989-1004` — passam a enxergar só o público automaticamente).

**Por que este RF é necessário AGORA (Confirmado com dados)**: a §9.3 da auditoria
mostra 4 blog-dias com zero pageview não-interno e 10–23 impressões REAIS (§2.2 acima),
e a §9.7 declara que a AUTORIA dessas impressões é **indeterminável até pelo banco** com
o schema atual, apontando esta dimensão interna (+ o dedup do RF4) como a única forma de
tornar isso observável daqui para frente. Corolário honesto: as colunas `internal_*`
**não** explicam retroativamente nada — o histórico reparado continua sem separação
interno/público (auditoria, claim a: retro-filtragem impossível). A separação começa na
data do marcador `ads_reliable_since`.

- **Decisão de interno** (mesma tripla do `/event`, `analytics.ts:239-243`):
  `body.internal === true` OU `internalIpSet().has(ip)` OU `isPrivateIp(ip)`.
  Extrair/reutilizar os helpers existentes (`internalIpSet` em `analytics.ts:142-149`;
  `isPrivateIp`/`parseInternalIps` em `api/lib/analyticsShared.ts:40-56`) — mover a
  memoização de `internalIpSet` para um módulo compartilhável se necessário (sem
  duplicar lógica).
- Evento interno: **não incrementa** `adsTable.impressions/clicks` (all-time) nem
  `impressions`/`clicks` públicos — apenas `internal_*`. Isso PRESERVA a semântica
  atual dos números públicos e do all-time (hoje o interno com token nem chega ao
  servidor; o que muda é que passa a chegar e ficar registrado).
- **Client (mudança mínima, escopo deste PRD)**: `trackImpression`/`trackClick`
  (`web/components/ads/useAds.ts:116-124`) deixam de SUPRIMIR quando
  `isInternalTraffic()` e passam a ENVIAR com flag, alinhados ao SDK de pageview:

  ```ts
  export function trackImpression(adId: string) {
    return fetch(`/api/ads/${adId}/impression`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: getSessionId(),                 // MESMO id do SDK (bee_session_id)
        path: location.pathname,
        internal: isInternalTraffic() || undefined,
      }),
    }).catch(() => {});
  }
  ```

  Reutilizar a MESMA fonte de id de sessão do SDK de analytics (chave
  `bee_session_id`, `getSessionId` em `web/hooks/useAnalytics.ts:21-32` — extrair o
  helper para import, não duplicar a chave em string). Nada além disso muda no client
  (viewability, dwell, dedup por aba, consentimento: **PRD 02** — ver §14).

### RF4 — Dedup server-side por sessão/anúncio

- **Impressão**: chave `adimp:<adId>:<sessionId>` (fallback sem body/sessionId:
  `adimp:<adId>:ip:<ip>`), janela **30 minutos** — segunda impressão da mesma chave na
  janela responde `{ok:true}` sem gravar. Racional: o client já promete 1×/aba; o
  servidor passa a garantir ~1×/sessão/anúncio mesmo com N abas, storage bloqueado ou
  script direto. NÃO usar `isRecentDuplicate` do `trafficGuard` — o sweeper dele
  descarta entradas com mais de 60s (`api/lib/trafficGuard.ts:32-34`), incompatível
  com janela de 30 min. Implementar `Map` próprio em `ads.ts` (ou helper novo em
  `trafficGuard.ts` com retenção configurável), com varredura periódica e **teto de
  50.000 chaves** (ao exceder, descartar as mais antigas — proteção de memória).
- **Clique**: mesma mecânica com chave `adclick:<adId>:<sessionId>` e janela **10
  segundos** — mata double-fire/duplo clique sem impedir clique legítimo repetido na
  mesma sessão.
- Dedup descarta DUPLICATA (mesmo precedente do `pv:` 15s do `/event`,
  `analytics.ts:231`) — não é drop de tráfego interno; a invariante do RF3 não é
  afetada. Contadores de observabilidade dos descartes (bot/rate/dup das rotas de
  ads): **PRD 03** (incremento) e **PRD 08** (exposição/alerta) — este PRD apenas
  deixa os pontos de descarte claramente identificáveis no código (um comentário
  `// PRD 03: bumpHealth aqui` em cada caminho de descarte).

### RF5 — Correção do `adDailyChart`

Em `api/routes/analytics.ts:658-661`, trocar a atribuição por **acúmulo**:

```ts
for (const row of adDailyRows) {
  const slot = adDailyByDate[row.date]?.[row.adId];
  if (slot) { slot.impressions += row.impressions; slot.clicks += row.clicks; }
}
```

Pós-RF1/RF2 há 1 linha por par e `=` e `+=` coincidem — o acúmulo torna o gráfico
consistente com `adWindowTotals` por construção, inclusive durante qualquer estado
transitório (defesa em profundidade). Shape do payload não muda.

### RF6 — Invariante de sanidade (alimenta o PRD 11)

- **Regra oficial** (por blog, por dia BRT `D`, por anúncio/bloco `A`):

  `impressions_publicas(A, D) ≤ max(pageviews_nao_internos(D), 1) × S(A) × M`

  onde `S(A)` = nº de chaves de exibição do anúncio (anúncio clássico e bloco: 1 —
  cada chave conta no máximo 1 impressão por sessão pós-RF4) e `M` = margem:
  **M = 3 enquanto a assimetria de consentimento existir** (impressão não passa por
  gate LGPD; pageview passa — visitante sem aceite gera impressões com zero pageview,
  auditoria claim j), reduzir para **M = 1.5 depois que o PRD 02 alinhar a admissão**.
  Severidade: `warning` até o PRD 02; `violation` depois.
- **Calibração da margem com dados reais (§9.3) — leia antes de definir o aceite**:
  com `S=1` e `M=3`, um dia com ZERO pageview não-interno tem limite `max(0,1)×1×3 = 3`.
  A rede tem HOJE 4 blog-dias exatamente assim, com **10 a 23 impressões REAIS** (já
  descontada a inflação): sp011 07-17, esporteagora 07-23, oleysports 07-21,
  resenhavip 07-10. Ou seja: **mesmo com a base 100% reparada, esses dias continuarão
  acusando estouro de 3× a 8×** enquanto a assimetria de consentimento existir — e isso
  é o comportamento CORRETO da regra (é a assimetria que está errada, não a fórmula).
  Consequências: (i) não inflar M nem remover o piso `max(pv,1)` para "zerar" o alerta —
  seria esconder o achado da §9.3; (ii) severidade `warning` até o PRD 02 é obrigatória,
  senão a rede nasce com violação permanente; (iii) o critério de aceite **CA10 não pode
  exigir zero estouro em dias com `pv = 0`** (já corrigido no §9).
- **Regra irmã (sempre)**: `clicks_publicos(A, D) ≤ impressions_publicas(A, D) + 1`
  (o `+1` cobre o clique rápido legítimo antes do dwell de 1s — ver §11; o PRD 11
  decide se aperta para `≤` estrito quando o PRD 02 disparar impressão no clique).
- **A regra irmã já pega inconsistência real — Confirmado com dados (§9.6)**: existem
  hoje 2 pares com `clicks > impressions` no dado bruto — **esporteagora 2026-07-17**
  (anúncio "Start": linhas `2 imp/1 clk` e `0 imp/2 clk`) e **ksports 2026-07-22**
  (`block:html-ksports-ad-box`: `2/1` e `0/2`). Três leituras que o PRD 11 herda:
  1. **A regra é avaliada sobre o par AGREGADO** (`SUM` por `ad_id,date`; pós-RF1 há
     1 linha por par e a distinção some). Por LINHA, `0 imp / 2 clk` viola de forma
     estrita; agregado, os dois casos caem em `clicks = impressions + 1` — encostados
     na folga.
  2. Os dois casos são **artefato da inflação, não clique rápido**: o `MAX−1` por campo
     devolve `1 imp / 1 clk` e eles desaparecem (§9.6). Isso prova que a regra detecta
     inconsistência REAL — não é regra teórica — e dá dois casos de regressão dirigida
     para o pós-reparo (CA11/CA13).
  3. **A folga `+1` segue SEM evidência empírica**: nenhum caso observado na rede é
     clique-antes-do-dwell — os únicos candidatos eram artefato do bug. Mantê-la aqui é
     defesa teórica (**Hipótese**, §11); apertar para `≤` estrito é decisão do PRD 11
     APÓS o reparo, medindo com a V7 do §8.2. Não apertar neste PRD.
- **Entregáveis deste PRD**: (a) função pura `checkAdSanity(impressions, pageviews,
  slots, margin)` e `checkClicksVsImpressions(clicks, impressions)` em
  `api/lib/analyticsShared.ts` (retornam `{ok, ratio, limit}`), com testes `node
  --test`; (b) SQL de verificação (§8, V5). O motor contínuo que roda a regra por
  blog e o alerta são **PRD 11** e **PRD 08** (fronteiras do STATUS.md) — este PRD
  define fórmula, fonte de dados e helper.

### RF7 — Cliques e CTR (somente após base confiável)

- A instrumentação client de clique EXISTE (call-sites em `AdBanner.tsx:114`,
  `AdSlot.tsx:30`, `AdSidebar.tsx:33`, `AdInFeed.tsx:37`, `AdCentral.tsx:27`,
  `DestaquesListaBadge.tsx:100`, `Header.tsx:374`, `HomeCustomBlocks.tsx:139,:255-258`
  — cf. inventário §3): não recriar; validar que segue funcionando com o novo payload.
- CTR não muda de fórmula (`analytics.ts:641`: `clicks/impressions × 100`) — passa a
  ser calculado sobre base reparada + gravação exata automaticamente.
- **"Cliques = 0" não é bug** em blog novo: o critério de aceite de cliques é de
  CONSISTÊNCIA (clique de teste marcado interno aparece em `internal_clicks`; CTR
  exibido = clicks/impressions das mesmas linhas), nunca de volume.
- Código morto `trackAdClick` em `web/lib/adminApi.ts:90` (sem guard, sem uso —
  auditoria §4.9): remover.

---

## 5. Requisitos não-funcionais

- **Performance**: o upsert atômico troca 2 round-trips por 1; o índice único acelera
  o lookup do par. O dedup em memória é O(1) por hit com teto de 50k chaves
  (~alguns MB no pior caso). Nenhuma query nova no caminho quente de leitura.
- **LGPD**: nada novo de dado pessoal é persistido — `ad_daily_stats` continua sem
  sessão/IP/UA (o `sessionId` do dedup vive só em memória; o `path` do body não é
  gravado nesta fase). A decisão de gate de consentimento para impressão/clique é do
  **PRD 02**; este PRD não a antecipa nem a bloqueia. Parte da rede opera conteúdo
  político-adjacente — não introduzir rastreio novo é requisito, não omissão.
- **Confiabilidade**: reparo transacional idempotente-por-guarda (boot repete até
  convergir; falha é logada e não derruba o boot — padrão try/catch não-fatal do
  `ensureSchema.ts:76-82`); gravação diária permanece fire-and-forget sem unhandled
  rejection; all-time de `adsTable` continua sendo contador independente (redundância
  que permite auditoria cruzada).
- **Multi-blog**: mesma imagem para os 8 blogs; o reparo roda em CADA banco no boot
  (sp011/Supabase via `SUPABASE_DATABASE_URL`; replicados no `pg-blogs` via
  `db-config.enc`). Nenhum passo manual por blog. Rollout §6 do CLAUDE.md obrigatório
  (bloco pronto no §8.4). Validação pós-rollout por blog no §9 (CA9).
- **Windows/dev** (CLAUDE.md §14): typecheck por pacote; `pnpm exec tsc -b` em
  `lib/db` após mexer no schema (composite, dist gitignored); testes só `node --test`
  com imports `.ts` explícitos; nada de unicode literal em regex; build real na VPS.

---

## 6. Modelo de dados

Colunas/índices novos SEMPRE nos DOIS lugares (CLAUDE.md §17 — deploy NÃO roda
`drizzle-kit push`):

### 6.1 Schema Drizzle — `db/schema/ad_daily_stats.ts`

```ts
import { pgTable, serial, text, integer, index, uniqueIndex } from "drizzle-orm/pg-core";

export const adDailyStatsTable = pgTable("ad_daily_stats", {
  id:                  serial("id").primaryKey(),
  adId:                text("ad_id").notNull(),
  date:                text("date").notNull(),      // YYYY-MM-DD (dia BRT)
  impressions:         integer("impressions").notNull().default(0),          // público
  clicks:              integer("clicks").notNull().default(0),               // público
  internalImpressions: integer("internal_impressions").notNull().default(0), // interno (RF3)
  internalClicks:      integer("internal_clicks").notNull().default(0),      // interno (RF3)
}, (t) => [
  uniqueIndex("ad_daily_ad_date_uniq").on(t.adId, t.date),
  index("ad_daily_date_idx").on(t.date),
]);
```

Após editar: `cd lib/db && pnpm exec tsc -b` antes de typecheckar o api-server.

### 6.2 `ensureSchema.ts` — statements novos (array `statements`, idempotentes)

```ts
// PRD 04 — dimensão interna de ad_daily_stats (marcado, nunca dropado — §17)
sql`ALTER TABLE ad_daily_stats ADD COLUMN IF NOT EXISTS internal_impressions integer NOT NULL DEFAULT 0`,
sql`ALTER TABLE ad_daily_stats ADD COLUMN IF NOT EXISTS internal_clicks integer NOT NULL DEFAULT 0`,
```

E ao final de `ensureSchema()`, chamada a `ensureAdDailyStatsIntegrity(target)` (RF2:
guarda por `pg_indexes` + transação backup→reparo→índice único→drop índice
comum→marcador `settings.ads_reliable_since`).

**Fronteira com o PRD 01**: o padrão de migração e a definição canônica da dimensão
interna de eventos pertencem ao PRD 01 (STATUS.md, fronteiras). Os statements acima
são idempotentes — se o PRD 01 já os tiver aplicado, viram no-op; se o PRD 01 definir
nomes diferentes para a dimensão interna, o PRD 01 MANDA e este PRD deve ser ajustado
antes de implementar. Tabelas/keys fora do Drizzle por design: backup
`ad_daily_stats_backup_prd04` (operacional, temporária) e a key
`ads_reliable_since` na tabela `settings` existente (`db/schema/settings.ts:3-7`).

---

## 7. Contrato de API

### 7.1 `POST /api/ads/:id/impression` (público — mudança compatível)

- **Request**: body JSON OPCIONAL `{ sessionId?: string(≤100), path?: string(≤500),
  internal?: boolean }`. Sem body (client antigo em cache durante o rollout):
  comportamento degradado — dedup por IP, interno só por IP.
- **Pipeline** (ordem): bot → rate limit 60/min/IP (inalterados; `ads.ts:187`) →
  dedup RF4 (`adimp:<id>:<sessão|ip>`, 30 min) → validação de bloco/anúncio
  (inalterada: `:193-198`, `:200-210`) → decisão interna RF3 → gravação:
  não-interno = `adsTable.impressions+1` (só clássico) + upsert atômico em
  `impressions`; interno = upsert atômico em `internal_impressions` APENAS.
- **Response**: `200 {ok:true}` em todos os caminhos aceito/bot/rate/dedupado/
  inativo (contrato atual preservado — descarte silencioso).

### 7.2 `POST /api/ads/:id/click` (público — mudança compatível)

Mesmo body e pipeline com rate 30/min (`ads.ts:145`), dedup `adclick:` 10s, e
validações atuais preservadas (bloco/anúncio inexistente ou inativo: `404` como hoje,
`:154,:169`). Interno → `internal_clicks` apenas; não-interno → `adsTable.clicks+1`
(clássico) + `clicks` diário.

### 7.3 `GET /api/analytics/health` (autenticado)

Resposta ganha o campo **`adsReliableSince: string | null`** — valor da key
`settings.ads_reliable_since` (`'YYYY-MM-DD'`; `null` = reparo ainda não executado).
Leitura direta com try/catch (endpoint de baixo tráfego). Exibição no card Saúde da
coleta: **PRD 08** (este PRD entrega só o campo).

### 7.4 `GET /api/analytics/stats` (autenticado)

Sem mudança de shape. Mudanças de VALOR: `adStats`/`adKpis`/`adDailyChart` passam a
refletir base reparada e só tráfego público; `adDailyChart` fica consistente com
`adStats` na mesma janela (RF5). `GET /api/admin/ads/block-stats` idem (sem mudança
de código — a soma passa a operar sobre linhas únicas).

### 7.5 Client — `trackImpression`/`trackClick` (`web/components/ads/useAds.ts`)

Passam a enviar o body do §7.1/7.2 com o MESMO `sessionId` do SDK de analytics e
`internal` em vez de supressão (RF3). Nenhuma outra mudança de comportamento client
neste PRD.

---

## 8. Comandos de verificação (rodar exatamente estes)

### 8.1 Local (Windows, antes do commit)

```powershell
cd "c:\Users\Usuario(a) Master\sp011\lib\db"
pnpm exec tsc -b
cd "c:\Users\Usuario(a) Master\sp011\artifacts\api-server"
pnpm run typecheck
node --test "test/**/*.test.ts"
cd "c:\Users\Usuario(a) Master\sp011\artifacts\brasilia-agora"
pnpm run typecheck
```

Resultado esperado: typechecks com exit 0; TODOS os testes passam, incluindo o novo
`test/adsDaily.test.ts` (§12). (`vite build` não roda no Windows — CLAUDE.md §14;
build real acontece na VPS no rollout.)

### 8.2 VPS — estado do banco após o boot da imagem nova ⚠️ pendente de execução

Cada bloco é completo para colar (padrão CLAUDE.md §12). **sp011** (Supabase):

```bash
cd /opt/sp011
DBURL=$(grep -m1 '^SUPABASE_DATABASE_URL=' /opt/sp011/.env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
# V1 — zero pares duplicados (esperado: 0 linhas)
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "SELECT ad_id, date, count(*) FROM ad_daily_stats GROUP BY 1,2 HAVING count(*) > 1;"
# V2 — índice único presente e comum ausente (esperado: só ad_daily_ad_date_uniq e ad_daily_date_idx)
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "SELECT indexname, indexdef FROM pg_indexes WHERE tablename='ad_daily_stats' ORDER BY 1;"
# V3 — backup preservou o original (esperado: linhas_backup >= linhas_atuais e soma_backup >= soma_atual)
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "SELECT (SELECT count(*) FROM ad_daily_stats_backup_prd04) AS linhas_backup, (SELECT count(*) FROM ad_daily_stats) AS linhas_atuais, (SELECT COALESCE(sum(impressions),0) FROM ad_daily_stats_backup_prd04) AS soma_backup, (SELECT COALESCE(sum(impressions),0) FROM ad_daily_stats) AS soma_atual;"
# V4 — marcador de confiabilidade (esperado: 1 linha com a data do 1º boot pós-fix)
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "SELECT key, value FROM settings WHERE key='ads_reliable_since';"
# V5 — sanidade impressões×pageviews (regra do RF6/PRD 11; esperado: 0 linhas com estouro=true; dias antigos reparados podem aparecer — ler com o marcador V4 em mãos)
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "WITH pv AS (SELECT (ts AT TIME ZONE 'America/Sao_Paulo')::date::text AS dia, count(*) AS pageviews FROM analytics_events WHERE type='pageview' AND is_internal=false GROUP BY 1) SELECT s.date, s.ad_id, s.impressions, COALESCE(pv.pageviews,0) AS pageviews, (s.impressions > GREATEST(COALESCE(pv.pageviews,0),1) * 1 * 3) AS estouro FROM ad_daily_stats s LEFT JOIN pv ON pv.dia = s.date WHERE s.impressions > 0 ORDER BY s.date DESC;"
# V6 — coerência diário reparado × all-time correto (clássicos; esperado: diario <= alltime, idealmente igual quando o diário cobre a vida toda do anúncio)
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "SELECT a.id, a.name, a.impressions AS alltime_imp, COALESCE(sum(s.impressions),0) AS diario_imp, a.clicks AS alltime_clk, COALESCE(sum(s.clicks),0) AS diario_clk FROM ads a LEFT JOIN ad_daily_stats s ON s.ad_id = a.id GROUP BY a.id, a.name, a.impressions, a.clicks ORDER BY a.impressions DESC;"
```

**Blogs replicados** (repetir por blog trocando só a 1ª linha; bancos locais no
pg-blogs têm o nome do BLOG_ID):

```bash
BLOG='resenhavip'
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d "$BLOG" -v ON_ERROR_STOP=1 -c "SELECT ad_id, date, count(*) FROM ad_daily_stats GROUP BY 1,2 HAVING count(*) > 1;"
docker compose exec -T pg-blogs psql -U postgres -d "$BLOG" -v ON_ERROR_STOP=1 -c "SELECT indexname FROM pg_indexes WHERE tablename='ad_daily_stats' ORDER BY 1;"
docker compose exec -T pg-blogs psql -U postgres -d "$BLOG" -v ON_ERROR_STOP=1 -c "SELECT key, value FROM settings WHERE key='ads_reliable_since';"
```

### 8.3 VPS — comportamento das rotas ⚠️ pendente de execução

Teste ativo SEGURO de marcação interna (usa `internal:true` — não polui métrica
pública; UA de navegador porque `curl/` cai no BOT_RE, `trafficGuard.ts:14-19`):

```bash
DOM='https://resenhavip.midia.run'
AD='block:header-banner'
cd /opt/sp011
# estado antes
docker compose exec -T pg-blogs psql -U postgres -d resenhavip -c "SELECT ad_id, date, impressions, internal_impressions FROM ad_daily_stats WHERE ad_id='block:header-banner' ORDER BY date DESC LIMIT 3;"
# 2 POSTs internos com a MESMA sessão (o 2º deve ser dedupado pelo RF4)
curl -s -X POST "$DOM/api/ads/$AD/impression" -A "Mozilla/5.0 (verificacao PRD04)" -H 'Content-Type: application/json' -d '{"sessionId":"prd04-verif","internal":true}'
curl -s -X POST "$DOM/api/ads/$AD/impression" -A "Mozilla/5.0 (verificacao PRD04)" -H 'Content-Type: application/json' -d '{"sessionId":"prd04-verif","internal":true}'
# estado depois — esperado: internal_impressions +1 (UM só, dedup pegou o 2º); impressions INALTERADO
docker compose exec -T pg-blogs psql -U postgres -d resenhavip -c "SELECT ad_id, date, impressions, internal_impressions FROM ad_daily_stats WHERE ad_id='block:header-banner' ORDER BY date DESC LIMIT 3;"
```

(Pré-condição: o blog tem `headerBannerHtml` configurado — senão `findAdBlock`
devolve null e nada grava, `ads.ts:21-23`; nesse caso usar o id de um anúncio ativo.)
Campo novo do /health (token de admin do blog em ADMIN_TOKEN):

```bash
DOM='https://resenhavip.midia.run'
ADMIN_TOKEN='COLE_AQUI'
curl -s "$DOM/api/analytics/health" -H "Authorization: Bearer $ADMIN_TOKEN" | grep -o '"adsReliableSince":"[^"]*"'
```

Esperado: `"adsReliableSince":"2026-MM-DD"` (data do 1º boot pós-fix).

### 8.4 Rollout multi-blog (CLAUDE.md §6 — obrigatório)

Arquivos tocados → serviços (§5): `artifacts/api-server` + `lib/db` → `api`;
`artifacts/brasilia-agora` → `web`. Bump + build + sp011:

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
# canário (resenhavip) — conferir V1/V2 do §8.2 e os cards do §9/CA9 ANTES de seguir
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

---

## 9. Critérios de aceite

Mapeamento: itens **4, 19, 20, 21, 25(parcial)** da checklist do doc v2; regras do
PRD 11: "cliques ≤ impressões" e "impressões ≤ pageviews não-internos × slots ×
margem". Nenhum critério é subjetivo; os que exigem banco/produção estão marcados
**⚠️ pendente de execução** (MCP Supabase não conectado na escrita deste PRD — a
execução é do implementador/operador na VPS, nunca marcar como atendido sem rodar).

| # | Critério | Verificação | Status na escrita |
|---|---|---|---|
| CA1 | Typecheck dos 3 pacotes tocados passa; `node --test` do api-server passa incluindo `test/adsDaily.test.ts` | §8.1, exit 0 / todos os testes ok | a executar no dev |
| CA2 | Estimador do reparo correto sobre dados sintéticos que reproduzem o escritor legado (INSERT-sempre + UPDATE-todas): recupera N exato para N eventos serializados, mono e misto impressão/clique, incl. par de linha única (1 evento → valor 2 → repara para 1) | teste do §12 em `adsDaily.test.ts` | a executar no dev |
| CA3 | Zero pares (ad_id,date) duplicados em CADA banco da rede após o boot | §8.2 V1 (sp011 + loop dos replicados) → 0 linhas | ⚠️ pendente de execução |
| CA4 | Índice único `ad_daily_ad_date_uniq` existe e `ad_daily_ad_date_idx` não existe, em cada banco | §8.2 V2 | ⚠️ pendente de execução |
| CA5 | Backup `ad_daily_stats_backup_prd04` existe e preserva o estado pré-reparo (linhas_backup ≥ linhas_atuais; soma_backup ≥ soma_atual) | §8.2 V3 | ⚠️ pendente de execução |
| CA6 | Marcador `ads_reliable_since` gravado (settings) e exposto em `GET /api/analytics/health` (item 25 — parte de anúncios) | §8.2 V4 + §8.3 curl do /health | ⚠️ pendente de execução |
| CA7 | Marcação interna server-side: POST com `internal:true` incrementa `internal_impressions` e NÃO altera `impressions` nem `adsTable.impressions` (invariante §17 estendida — RF3) | §8.3 (antes/depois) | ⚠️ pendente de execução |
| CA8 | Dedup server-side: 2º POST da mesma (sessão, anúncio) em 30 min não incrementa nada | §8.3 (os 2 curls geram +1, não +2) | ⚠️ pendente de execução |
| CA9 | Cards revalidados POR BLOG após rollout (lista abaixo): valores exibidos = valores das queries V5/V6 do mesmo banco; gráfico top-3 consistente com a tabela (soma da série do anúncio na janela = coluna impressões da tabela — itens 4, 19, 20, 21) | observação objetiva no admin de cada blog + V5/V6 | ⚠️ pendente de execução |
| CA10 | 48h após rollout: V1 continua devolvendo 0 linhas (nenhuma duplicata nova) e nenhum `estouro=true` em V5 para datas ≥ `ads_reliable_since` | §8.2 V1+V5 re-rodados | ⚠️ pendente de execução |
| CA11 | Cliques/CTR (RF7 — só após CA3–CA9): clique de teste interno aparece em `internal_clicks`; CTR exibido = `round(clicks/impressions×100, 2)` das mesmas linhas do banco; regra `clicks ≤ impressions + 1` sem violação | variante de clique do §8.3 + V6 + card do admin | ⚠️ pendente de execução |
| CA12 | `trackAdClick` morto removido de `web/lib/adminApi.ts` | `grep -rn "trackAdClick" artifacts/brasilia-agora/src` → 0 resultados | a executar no dev |

**Cards a revalidar por blog (CA9)** — em sp011.com.br, ksports.bebee.me,
esporteagora.midia.run, resenhavip.midia.run, oleysports.midia.run,
beeesportes.midia.run (+ pontofarma e creditovc quando no ar; blogs ainda sem
go-live validam no primeiro boot da imagem nova):

1. Dashboard → card "Propagandas" (Ativas/Impressões/Cliques/CTR — item 4).
2. Analytics → KPIs de Propagandas da janela (impressões, cliques, CTR médio, melhor
   anúncio — item 19).
3. Analytics → tabela "Desempenho por anúncio" (item 20) — sem valores absurdos vs
   pageviews do mesmo período.
4. Analytics → gráfico "Impressões — top 3" (item 21) — consistente com a tabela.
5. AdsManager → stat cards all-time + tabela de blocos (block-stats agora sobre
   linhas únicas).
6. `GET /api/analytics/health` → `adsReliableSince` presente (item 25; UI é PRD 08).

---

## 10. Invariantes do §17 preservadas por este PRD

1. **"Tráfego interno marcado `is_internal`, nunca dropado"** — ESTENDIDA às rotas de
   ads (RF3): interno vira contagem em `internal_impressions`/`internal_clicks`
   (gravado, auditável), excluído da leitura pública por construção. Nada é dropado
   no servidor por ser interno; dedup (RF4) dropa DUPLICATA, mesmo precedente do
   `pv:` 15s do `/event` (`analytics.ts:231`). O client troca supressão por flag —
   fica MAIS aderente à invariante que hoje.
2. **"Migrações de coluna via Drizzle schema E ensureSchema"** — cumprida no §6 (os
   dois lugares), com o corolário "colunas se autocriam no boot": reparo e índice
   também no boot, zero migração manual por blog.
3. **"Linhas históricas nunca são reescritas"** (precedente do canal,
   `analyticsShared.ts:143-147`) — vale para `analytics_events`, que este PRD NÃO
   toca. O reparo de `ad_daily_stats` é a exceção SANCIONADA pela auditoria (§5,
   invariante 5: "precedida de dedup/merge das linhas duplicadas existentes, senão o
   CREATE UNIQUE INDEX falha"), executada com backup prévio (CA5) e marcador de
   confiabilidade (CA6) — o dado original permanece recuperável.
4. **"Heartbeat cumulativo agregado por MAX"** — não tocado (nenhuma mudança em
   `read`/reducer; `analyticsShared.ts:319-327` intacto).
5. **"`totals.*` do /stats fixos ao agora"** — não tocado (mudanças limitadas ao
   sub-bloco de ads do payload; `analytics.ts:374-381` intacto).
6. **"Canal classificado no servidor"** — não tocado (Problema 2 é PRD 05).
7. **SSR/perf (`no-cache` nunca `no-store`, sanitize isomórfico, proxy de imagem)** —
   não tocados; a mudança client é restrita a `trackImpression`/`trackClick`.
8. **Isolamento entre blogs / nada hardcodado por blog na imagem** — o fix é 100%
   genérico; nenhuma referência a BLOG_ID.

---

## 11. Casos de borda

- **Dedução do estimador do reparo (RF2)** — sob execução serializada do escritor
  legado: a linha inserida pelo PRIMEIRO evento de um campo no par recebe valor
  inicial 1, +1 do próprio UPDATE, +1 de cada um dos (N−1) eventos seguintes do mesmo
  campo → vale N+1; toda outra linha do par vale ≤ N. Logo
  `MAX(campo) = N+1` quando N ≥ 1, e 0 quando N = 0 →
  `N = CASE WHEN MAX=0 THEN 0 ELSE MAX-1 END`. Vale por campo (impressions e clicks
  têm MAX próprios) e para pares mistos. **Concorrência** real desvia levemente
  (auditoria: sempre superlinear) — com o volume atual (blogs novos) o desvio é ≈0;
  o backup (CA5) preserva o original para re-derivação se necessário, e o marcador
  `ads_reliable_since` declara a fronteira estimado/exato.
- **Estimador NÃO idempotente**: reexecutar sobre dados já reparados decrementaria de
  novo. Por isso a guarda é a EXISTÊNCIA do índice único e o reparo+índice são a
  MESMA transação — não existe estado "reparado sem índice" persistido.
- **Rollout misto (janela de minutos)**: web novo + api velho → api ignora o body
  (inofensivo); web velho (JS em cache) + api novo → POST sem body → dedup degrada
  para IP e interno só por IP (aceitável, transitório).
- **Api velho + índice novo** (rollback de imagem sem restaurar dados): o upsert
  legado passa a conflitar no INSERT (`onConflictDoNothing` segura) e o UPDATE
  incrementa a linha única → 1º evento do dia conta 2, demais +1. Estável, sem
  explosão quadrática — rollback de imagem é seguro mesmo sem rollback de dados (§13).
- **Clique mais rápido que o dwell**: o client só dispara impressão após 1s visível
  (`useAds.ts:128,:165-170`); clique em <1s gera clique sem impressão →
  `clicks ≤ impressions` estrito pode falhar legitimamente em volumes mínimos. Por
  isso a regra irmã do RF6 usa `+1` de folga; o PRD 02 pode disparar impressão
  no clique (dedup do RF4 torna isso seguro) e aí o PRD 11 aperta a regra.
- **Carrossel** (2+ anúncios na mesma position, `AdBanner.tsx:55-65,:73`): cada
  criativo da rotação conta a própria impressão viewável (deliberado, padrão IAB —
  auditoria claim e). O RF4 limita a 1×/sessão/anúncio server-side; a régua do RF6
  usa S(A)=1 por anúncio, então carrossel não estoura a regra.
- **`sessionStorage` bloqueado no client**: `getSessionId` pode não persistir →
  sessionId novo por página; dedup server degrada parcialmente (chave muda) mas o
  fallback por IP segura scripts; nada quebra.
- **Restart do api**: mapa de dedup em memória zera (mesma limitação declarada do
  rate limit, `trafficGuard.ts:8-9`) — dupla contagem possível na janela pós-restart;
  aceito (consistente com o resto da coleta; observabilidade → PRD 08).
- **Anúncios homônimos** no gráfico top-3 (dataKey por nome, `analytics.ts:663-670`):
  defeito menor pré-existente, NÃO tratado aqui (shape do payload é contrato do
  PRD 09/10) — registrado para lá.
- **Blocos `block:%` sem linha em `ads`**: continuam sem all-time próprio (só
  diário); o reparo cobre os dois tipos igualmente (opera por `ad_id` textual).
- **Fuso**: `todayStr()` é UTC-3 fixo (`ads.ts:31-34`); as queries de verificação
  usam `America/Sao_Paulo` (equivalente desde 2019 — nota técnica 3 do Anexo A da
  auditoria). Não mudar o fuso neste PRD.

---

## 12. Plano de testes (`node --test`, CLAUDE.md §14)

Arquivo novo `artifacts/api-server/test/adsDaily.test.ts` (imports relativos com
extensão `.ts` explícita; sem unicode literal em regex; padrão dos testes existentes
`test/analyticsShared.*.test.ts`):

1. **Simulador do escritor legado** (função pura local no teste): dado um array de
   eventos `("imp"|"clk")[]`, reproduz INSERT-sempre + UPDATE-em-todas-as-linhas e
   devolve as linhas finais. Casos: N=1 (linha única com valor 2), N=2/4/7/12 puros
   (somas 5/14/35/90 — batem com a fórmula (N²+3N)/2 da auditoria), mistos em várias
   ordens (imp-clk-imp, clk-imp-imp, etc.).
2. **Estimador do reparo** (extraído para função pura exportada, ex.
   `estimateRealCount(maxValue: number): number` + `repairPair(rows)` em
   `api/lib/adsDaily.ts` ou no próprio `ensureSchema.ts`): aplicado às linhas do
   simulador, recupera EXATAMENTE o nº real de impressões e cliques de cada caso;
   par vazio → 0; identidade `linhas do par = imp_reais + clk_reais` verificada.
3. **Helpers de sanidade (RF6)**: `checkAdSanity` — casos: dentro do limite,
   estouro, pageviews=0 com impressão ≤ S×M (piso `max(pv,1)`), margens 3 e 1.5;
   `checkClicksVsImpressions` — 0/0 ok, clicks=impressions+1 ok (folga do clique
   rápido), clicks=impressions+2 viola.
4. **Dedup (RF4)**: lógica pura com relógio injetado — mesma chave dentro da janela
   → duplicata; após a janela → aceita; teto de chaves descarta as mais antigas;
   chaves de impressão (30 min) e clique (10 s) independentes.
5. **Validação de payload**: clamps de `sessionId` (≤100) e `path` (≤500); body
   ausente/malformado não lança (cai no caminho degradado por IP).
6. **Suites existentes continuam passando**: `node --test "test/**/*.test.ts"`.

Dados sintéticos apenas — nenhum teste toca banco real. Validação com dados reais é
exclusivamente via §8.2/§8.3 na VPS (pendente de execução) — nunca poluir dados de
produção com eventos não-internos.

---

## 13. Plano de rollback

Cenário A — **bug de código sem corrupção de dados** (ex.: rota erra resposta):
rollback de imagem por blog, mantendo o índice único (seguro — ver §11 "api velho +
índice novo"):

```bash
# sp011 (raiz): voltar BLOG_IMAGE_VERSION para a tag anterior e recriar
cd /opt/sp011
sed -i "s|^BLOG_IMAGE_VERSION=.*|BLOG_IMAGE_VERSION=vANTERIOR|" .env
docker compose up -d api web
# cada blog replicado:
cd /opt/blogs/<id>
sed -i "s|^BLOG_IMAGE_TAG=.*|BLOG_IMAGE_TAG=vANTERIOR|" .env
docker compose up -d
```

NÃO dropar o índice único no rollback (restauraria a inflação quadrática).

Cenário B — **reparo considerado incorreto** (dados): restaurar o backup APÓS voltar
a imagem (senão o boot da imagem nova repara de novo). Por banco:

```bash
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d <blog> -v ON_ERROR_STOP=1 -c "BEGIN; DROP INDEX IF EXISTS ad_daily_ad_date_uniq; TRUNCATE ad_daily_stats; INSERT INTO ad_daily_stats (id, ad_id, date, impressions, clicks) SELECT id, ad_id, date, impressions, clicks FROM ad_daily_stats_backup_prd04; SELECT setval(pg_get_serial_sequence('ad_daily_stats','id'), (SELECT COALESCE(max(id),1) FROM ad_daily_stats)); DELETE FROM settings WHERE key='ads_reliable_since'; COMMIT;"
```

(Para o sp011, usar o padrão `DBURL` do §8.2. O DROP INDEX é necessário porque o
backup contém as duplicatas originais.) O backup só pode ser descartado
(`DROP TABLE ad_daily_stats_backup_prd04`) depois de CA9/CA10 aceitos e do operador
confirmar os números — recomendação: manter ≥30 dias.

Cenário C — **um blog isolado com problema**: cada blog fixa a própria
`BLOG_IMAGE_TAG` — rollback pontual sem afetar os irmãos (canário resenhavip existe
exatamente para pegar isso antes da rede).

---

## 14. Riscos e dependências de outros PRDs (FRONTEIRAS do STATUS.md)

| PRD | Fronteira/dependência |
|---|---|
| **PRD 01** (modelo de dados) | Define o PADRÃO de migração Drizzle+ensureSchema e a dimensão interna canônica. Os statements do §6 são idempotentes e convergem com o PRD 01; em conflito de nomes, o PRD 01 manda (ajustar este PRD antes de implementar). |
| **PRD 02** (tracking client) | Dono da revisão do client de anúncio: consentimento LGPD, viewability/dwell, dedup client, disparo de impressão no clique. Este PRD antecipa SÓ o mínimo do contrato (§7.5: body + flag interna em vez de supressão) — declarado aqui para evitar dupla implementação. Enquanto o PRD 02 não alinhar a admissão, a regra RF6 fica com M=3 e severidade warning. |
| **PRD 03** (ingest/bots) | Dono dos CONTADORES de descarte (bot/rate/dup) das rotas de ads e behavior — este PRD só marca os pontos com comentário. O filtro de bots em si JÁ é idêntico ao do pageview (mesmo `isBotRequest`: `ads.ts:145,:187` = `analytics.ts:208`); o que falta é observabilidade, e é do 03. Dedup de impressão server-side é DESTE PRD (fronteira explícita). |
| **PRD 08** (saúde/alertas) | Exposição na UI do `adsReliableSince` e alertas da regra de sanidade (inclusive violações do RF6). Este PRD entrega o campo no /health e a fórmula. |
| **PRD 11** (validação cross-metric) | Consome as regras do RF6 (`clicks ≤ impressions + 1`; `impressions ≤ max(pv,1) × S × M`) e os helpers puros; roda POR BLOG, continuamente. |
| **PRD 09/10** (APIs/frontend do dashboard) | Exibição opcional dos contadores internos, dataKey homônimo do top-3, estados vazios. Nada aqui bloqueia esses PRDs. |

**Riscos técnicos**: (1) reparo com estimador em cenário concorrente raro →
mitigado por backup + marcador + volumes mínimos; (2) `ON CONFLICT` sem índice em
banco onde o reparo falhou → mitigado por try/catch + retry por boot + all-time
intacto; (3) janela de rollout com client/api de versões diferentes → degradação
documentada (§11), sem corrupção; (4) rede inteira na mesma imagem → canário
resenhavip obrigatório ANTES dos demais (§8.4). **Risco de produto**: números de
impressão VÃO CAIR após o reparo (para o valor honesto) — comunicar ao operador
antes do rollout; `docs/ANALYTICS.md:131` já tem precedente ("caíram após
08/07/2026 — é o número honesto"); atualizar `docs/ANALYTICS.md` (linhas 87-92) na
implementação para refletir dedup server-side e a dimensão interna.

---

## 15. Estimativa de esforço

**M** (médio). Código pequeno e localizado (1 função de upsert, 1 função de
integridade no ensureSchema, 2 rotas, 1 loop do chart, 2 helpers puros, payload do
client), mas com migração de dados transacional que precisa dos testes sintéticos do
§12 e do ciclo completo canário→rede do §8.4. Maior custo: verificação multi-blog
(8 bancos × V1–V6 + CA9 em cada admin).
