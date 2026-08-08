# 00 — Auditoria do sistema de analytics: estado atual (Fase 0.2)

> **O que é este documento.** Consolidação editorial da auditoria somente-leitura do
> sistema de analytics do blog engine (api-server + brasilia-agora + lib/db), feita em
> 2026-07-22 sobre o mapa `analytics-audit/00-inventario.md`. Reúne: a tabela de status
> dos 25 itens da checklist, a análise completa dos 2 problemas relatados pelo operador
> (impressões de anúncio desproporcionais; "Tráfego pago" sem campanha paga), os demais
> achados, as invariantes que qualquer correção precisa respeitar e os SQLs de validação
> com dados reais (Anexo A).
>
> **Taxonomia de confiança (todo julgamento carrega um rótulo):**
> - **Confirmado no código** — o trecho foi reaberto no arquivo real nesta sessão
>   (Read), a referência `arquivo:linha` confere e a lógica descrita é a que está lá.
> - **Confirmado com dados** — **INDISPONÍVEL nesta sessão** (ver lacuna abaixo).
> - **Hipótese** — depende de composição real dos dados de produção, de comportamento
>   de plataforma externa (ex.: Meta/fbclid) ou de estado de runtime; listada sempre com
>   o que falta verificar e, quando coberto, o SQL do Anexo A que responde.
>
> **Lacuna declarada (ATUALIZADA em 2026-07-23):** a auditoria foi escrita sem acesso a
> dados de produção (MCP Supabase não conectado) — por isso o corpo do documento rotula
> como Hipótese tudo que dependia deles. **O Anexo A FOI EXECUTADO na VPS em 2026-07-23**
> (sp011 + 5 blogs replicados) e os resultados estão na **§9**, que promove os claims
> centrais para **Confirmado com dados** — inclusive a validação exata do estimador de
> reparo do PRD 04 (65 = 65 no esporteagora) e a confirmação da hipótese c9 (110 sessões
> de Facebook orgânico classificadas como "pago" no ksports). Ao ler qualquer "Hipótese"
> nas §§2–3, confira antes a §9: vários já foram fechados.
>
> **Princípio aplicado:** volume baixo NÃO é bug — os blogs são novos. Bug é o que é
> logicamente incorreto ou inconsistente, independente do volume.
>
> **Verificação real:** todas as referências usadas nas conclusões passaram por dois
> passes (deep-dive + verificação adversarial cética, ambos com releitura dos arquivos)
> e o editor reabriu adicionalmente, nesta sessão, os arquivos que ancoram as conclusões
> centrais: `ads.ts`, `analytics.ts`, `analyticsShared.ts`, `trafficGuard.ts`,
> `ensureSchema.ts`, `admin.ts`, `app.ts` (api-server); `useAds.ts`, `useAnalytics.ts`,
> `analyticsClient.ts`, `LGPDConsent.tsx`, `AdBanner.tsx`, `Analytics.tsx`,
> `Dashboard.tsx`, `AdsManager.tsx` (brasilia-agora); `ad_daily_stats.ts` e
> `0000_init.sql` (lib/db). Divergências encontradas contra o inventário estão em §9.
>
> **Encurtamentos de caminho** (mesmos do inventário): `api = artifacts/api-server/src`,
> `web = artifacts/brasilia-agora/src`, `db = lib/db/src`.
> **Nenhum claim dos dois problemas foi refutado pelo passe cético** — houve apenas
> correções de precisão, já incorporadas ao texto abaixo (marcadas quando relevantes).

---

## 1. Tabela dos 25 itens da checklist

| Nº | Item | Status | Confiança | Rótulo | Evidência (arquivo:linha) | Etapa da cadeia que quebra |
|---|---|---|---|---|---|---|
| 1 | Views hoje vs ontem (Dashboard) | OK | Alta | Confirmado no código | `api/routes/analytics.ts:410-421,520-522,541`; `web/pages/admin/Dashboard.tsx:100,134-141,191-223` | nenhuma |
| 2 | Views 7 dias vs 7 anteriores (Dashboard) | OK | Alta | Confirmado no código | `api/routes/analytics.ts:414-415,523,542-543`; `Dashboard.tsx:101,142-150` | nenhuma |
| 3 | Top categorias "por acessos" (Dashboard) | **Bug** | Alta | Confirmado no código | `api/routes/analytics.ts:584-589` (sort `(b.clicks+b.views \|\| b.articles)`); `Dashboard.tsx:342-344` (escala pela 1ª linha) | endpoint (ordenação com fallback por nº de artigos) + UI (base da barra) — ver §5.1 |
| 4 | Propagandas resumo: Ativas/Impressões/Cliques/CTR | **Bug** | Alta | Confirmado no código | `api/routes/ads.ts:36-50`; `db/schema/ad_daily_stats.ts:9-12`; `lib/db/migrations/0000_init.sql:293-299,321-322`; `api/routes/analytics.ts:672-681,748-754` | ingest → tabela (upsert de `ad_daily_stats` não é upsert) — ver PROBLEMA 1, claim i |
| 5 | Visualizações de página vs período anterior (Analytics KPI 1) | OK | Alta | Confirmado no código | `api/lib/analyticsShared.ts:177-217`; `api/routes/analytics.ts:390-409,423-430,544,717`; `web/pages/admin/Analytics.tsx:370-382` | nenhuma |
| 6 | Visitantes únicos / novos vs recorrentes / "desde [data]" | Parcial | Alta | Confirmado no código | `api/routes/analytics.ts:470-482,719-724`; `Analytics.tsx:368,384-396` | agregação SQL: `EXISTS` de recorrentes (`:479-481`) sem `is_internal` e sem filtro de `type` — ver §5.2 |
| 7 | Sessões únicas (Analytics KPI 3) | OK | Alta | Confirmado no código | `web/hooks/useAnalytics.ts:21-32,108`; `api/lib/analyticsShared.ts:305`; `api/routes/analytics.ts:426,506,545,718` | nenhuma |
| 8 | Tempo médio por página (MAX cumulativo) | OK | Alta | Confirmado no código | `useAnalytics.ts:158-215`; `analyticsShared.ts:319-327`; `analytics.ts:267-270,433-442,507-510` | nenhuma |
| 9 | Taxa de rejeição | OK | Alta | Confirmado no código | `analyticsShared.ts:305`; `analytics.ts:231,443-452,511-512,549`; `Analytics.tsx:421-432` | nenhuma |
| 10 | Gráfico "Tráfego ao longo do tempo" (default 30d) | OK | Alta | Confirmado no código | `analyticsShared.ts:181-184,266,289-292`; `analytics.ts:726`; `Analytics.tsx:339-343,531-584` | nenhuma |
| 11 | Fontes de tráfego (Direto/Pago/Orgânico/Social/Referência) | **Bug** | Alta | Confirmado no código | `web/lib/analyticsClient.ts:23`; `api/lib/analyticsShared.ts:126,130-134`; `analytics.ts:252-265`; `Analytics.tsx:345-347,586-653` | classificação de canal (paidClick por presença de fbclid vence "social") — ver PROBLEMA 2 |
| 12 | Dispositivos (donut) + Navegadores + Sistemas | OK | Alta | Confirmado no código | `analyticsShared.ts:59-63,70-92,295`; `analytics.ts:275-276,288,462-468,605-613,735-737`; `Analytics.tsx:329-337,655-723` | nenhuma |
| 13 | Artigos com melhor desempenho (views + tempo médio) | OK | Alta | Confirmado no código | `web/pages/Artigo.tsx:155-160`; `analyticsShared.ts:307-311,319-326`; `analytics.ts:553-572`; `Analytics.tsx:729-772` | nenhuma |
| 14 | Top categorias detalhado (views, cliques, nº artigos, %) | **Bug** | Alta | Confirmado no código | `Analytics.tsx:350,793-795,813-814`; `analytics.ts:589`; semântica de "cliques": `web/pages/CategoryArchivePage.tsx:25-28` → `analyticsShared.ts:315-317` | UI (base de normalização do % pela 1ª linha), condicionada ao fallback do endpoint — ver §5.1 |
| 15 | Localização (Cidades/Estados) + fonte de geolocalização | Parcial | Alta | Confirmado no código | `api/routes/analytics.ts:151-203` (ip-api.com), `:278-282,455-461,593-602,733-734`; `Analytics.tsx:823-904` | geolocalização no ingest (provedor externo: HTTP-only, termos free proíbem uso comercial, cache negativo permanente, sem backoff 429) — ver §5.8 |
| 16 | Pico por hora | OK | Alta | Confirmado no código | `analyticsShared.ts:12-15,289-293`; `analytics.ts:712,727-728`; `Analytics.tsx:910-948` | nenhuma |
| 17 | Pico por dia da semana | Parcial | Alta | Confirmado no código | `analyticsShared.ts:16,294`; `analytics.ts:591,713,729-730`; `Analytics.tsx:950-984` | agregação (soma bruta sem normalizar pelo nº de ocorrências de cada dia da semana na janela) — ver §5.3 |
| 18 | Profundidade de leitura (25/50/75/100) | Parcial | Alta | Confirmado no código | `useAnalytics.ts:276-339`; `Artigo.tsx:130-131,746`; `analyticsShared.ts:329-331`; `analytics.ts:272-273,513,738`; `Analytics.tsx:986-1018` | UI (rótulo "sessões" para unidade sessão×conteúdo) + client (troca de chave de dedup `path`→`articleId` durante o load) — ver §5.4 |
| 19 | Propagandas detalhado na janela (seção de anúncios) | **Bug** | Alta | Confirmado no código | `analyticsShared.ts:177-215`; `analytics.ts:487-490`; `ads.ts:31-34`; `Analytics.tsx:1021-1030` | ingest → tabela (mesma raiz do item 4); a mecânica de janela em si está correta |
| 20 | Desempenho por anúncio: tabela | **Bug** | Alta | Confirmado no código | `analytics.ts:616-649`; `Analytics.tsx:1076-1141` | ingest → tabela (mesma raiz); `adWindowTotals` soma as linhas duplicadas |
| 21 | Gráfico Impressões top 3 | **Bug** | Alta | Confirmado no código | `analytics.ts:651-670` (atribuição com sobrescrita na `:658-661`); `Analytics.tsx:1144-1192` | agregação (sobrescrita de linhas duplicadas → valor de UMA linha arbitrária, inconsistente com a tabela ao lado) + gravação (mesma raiz) |
| 22 | Termos mais buscados | OK | Alta | Confirmado no código | `web/components/Header.tsx:296-302`; `web/components/blocks/HomeCustomBlocks.tsx:478-484`; `useAnalytics.ts:249-264`; `analytics.ts:314-343,689-692,702-705`; `Analytics.tsx:1206-1239` | nenhuma |
| 23 | Links externos clicados por domínio | Parcial | Alta | Confirmado no código | `Artigo.tsx:281-285,408-413`; `useAnalytics.ts:266-268`; `analytics.ts:693-698,707-710`; `Analytics.tsx:1242-1275` | evento client (cobertura só do corpo do artigo; delegação HTML sem filtro de esquema — `mailto:`/`tel:` viram domínio vazio) — ver §5.5 |
| 24 | Resumo de interações + caminho da newsletter no client | **Bug** | Alta | Confirmado no código | `Analytics.tsx:1297,1302` (soma sobre listas truncadas em `analytics.ts:702-705,707-710`); `web/components/Footer.tsx:62-76` e `blocks/HomeCustomBlocks.tsx:364-378` (fetch direto sem `getConsent()`/`internal`) | endpoint→UI ("Buscas"/"Cliques externos" = soma do top-N, não o total) + evento client da newsletter (sem gate LGPD e sem marcação interna) — ver §5.6 |
| 25 | Saúde da coleta | Parcial | Alta | Confirmado no código | `api/lib/analyticsHealth.ts:9-52`; `analytics.ts:208-284,351-363`; `Analytics.tsx:1336-1369` | cobertura restrita ao `/event` (bots/rate de `/behavior` e `/ads/:id/*` invisíveis) + buraco de reconciliação no flush degradado (`analytics.ts:109-111`) — ver §5.7 |

Resumo: **8 Bug** (3, 4, 11, 14, 19, 20, 21, 24), **6 Parcial** (6, 15, 17, 18, 23, 25),
**11 OK**. Nenhum item "Ausente": todas as cadeias existem de ponta a ponta.

---

## 2. PROBLEMA 1 — Impressões de anúncio desproporcionais aos pageviews (ex.: "91 vs 3")

### 2.1 A cadeia completa (Confirmado no código)

**Medição no client.** Os componentes de anúncio montam `useAdImpression`:
`web/components/ads/AdBanner.tsx:73` (carrossel: observa `items[index]?.id`;
auto-rotação a cada 5s em `:55-65`), `AdSlot.tsx:22`, `AdSidebar.tsx:24`,
`AdInFeed.tsx:29`, `AdCentral.tsx:7`, `DestaquesListaBadge.tsx:90`,
`Header.tsx:362` (chave fixa `block:header-banner`) e
`web/components/blocks/HomeCustomBlocks.tsx:93-94/:147` (ImageBlock isAd) e
`:243-244/:253` (HtmlBlock isAd), ambos com chave `block:<id>`. O hook
(`useAds.ts:144-175`) exige ≥50% visível (IntersectionObserver, threshold 0.5,
`:152-155`; sem IntersectionObserver, `visible=true` direto, `:151` — o dwell de 1s
ainda se aplica) por 1s contínuo (`IMPRESSION_DWELL_MS=1000`, `:128`) e dedupa SÓ no
client, por aba, via `sessionStorage bee_adimp_<id>` (`:130-135`) + Set por instância
do hook (`:145,:162-167`).

**Envio.** `trackImpression` (`useAds.ts:121-124`): o único filtro client é
`isInternalTraffic()` (`:107-114` — `import.meta.env.DEV` ou `localStorage.admin_token`,
gravado apenas por `web/pages/admin/Login.tsx:70` e `:100`, os dois caminhos de login).
**Não há checagem de consentimento LGPD.**

**Servidor.** `POST /api/ads/:id/impression` (`api/routes/ads.ts:184-220`): filtros =
`isBotRequest` (`api/lib/trafficGuard.ts:14-20`) + `overRateLimit('adimp:'+ip, 60)`
(`ads.ts:187`; janela de 1 min em memória, `trafficGuard.ts:51-60`; `req.ip` real via
`app.set("trust proxy", 1)`, `api/app.ts:106`). O arquivo `ads.ts` inteiro **não contém**
`internal`/`isPrivateIp`/`internalIpSet` nem dedup por sessão. Chave `block:<id>` é
validada contra as settings (`findAdBlock`, `ads.ts:17-29`; upsert em `:193-198`);
anúncio clássico exige ativo e não-expirado (`:200-210`), incrementa
`adsTable.impressions+1` (`:212-215`) e chama `upsertDailyStat` (`:217`).

**Gravação (o defeito central).** `upsertDailyStat` (`ads.ts:36-50`): INSERT com valor
1 + `.onConflictDoNothing()` seguido de UPDATE incondicional `+1 WHERE ad_id AND date`
(dia BRT via `todayStr`, `:31-34`). Porém `ad_daily_stats` **não tem constraint UNIQUE
em (ad_id, date)** em nenhuma fonte de schema do repo: o Drizzle usa `index()` comum
(`db/schema/ad_daily_stats.ts:9-12`), a migração cria só `CREATE INDEX`
(`lib/db/migrations/0000_init.sql:293-299,321-322`) e o `ensureSchema.ts:24-75` não tem
statement algum para a tabela. Logo o INSERT nunca conflita (único constraint é o PK
serial) — **cria linha NOVA a cada chamada** — e o UPDATE incrementa **todas** as
linhas do par. Ver claim i.

**Clique.** `onClick` do `<a>` chama `trackClick` (`useAds.ts:116-119`, mesmo filtro de
`admin_token`, também sem consentimento; call-sites em `AdBanner.tsx:114`,
`AdSlot.tsx:30`, `AdSidebar.tsx:33`, `AdInFeed.tsx:37`, `AdCentral.tsx:27`,
`DestaquesListaBadge.tsx:100`, `Header.tsx:374`, `HomeCustomBlocks.tsx:139` e
`:255-258`) → `POST /:id/click` (`ads.ts:141-181`: bot + `adclick:ip` 30/min `:145`;
`clicks+1` `:173-176`; diário `:178` com o mesmo upsert defeituoso). Cliques nem têm
dedup no client.

**Leitura.** `GET /api/analytics/stats` (`analytics.ts:366`) lê `ad_daily_stats` da
janela por `date` (`:487-490`), `adWindowTotals` soma TODAS as linhas (`:616-621` —
herdando a inflação), `buildAdStat`/`adStats` junta anúncios da tabela `ads` + blocos
isAd das settings (`:624-649`), `adDailyChart` top-3 (`:651-670`), `adKpis`
(`:672-681,:748-754`). UI: KPIs `Analytics.tsx:1033-1071`, tabela `:1076-1141`
(`hasData` distingue sem-registro de zero, `:1108-1112`), gráfico `:1144+`. All-time:
`AdsManager.tsx:624-636` soma `adsTable.impressions/clicks` (corretos, 1 por chamada
aceita) + block-stats (`api/routes/admin.ts:989-1004` — SUM de `ad_daily_stats
block:%`, inflado); `Dashboard.tsx:387-403` usa só `getAds` (adsTable).

**Comparação com pageview (a outra ponta dos "3").** Pageview só é enviado com
consentimento `accepted` (`useAnalytics.ts:106-107`; `LGPDConsent.tsx:9-15`, default
`null`), é marcado `internal:true` com admin_token/DEV (`useAnalytics.ts:54-61,:111`),
e no servidor recebe `is_internal` por flag OU `internalIpSet()` OU `isPrivateIp`
(`analytics.ts:239-243`); o `/stats` mantém apenas linhas `is_internal=false` em todas
as queries de pageview (`:408,:420,:429,:438-439,:448,:458,:465,:474-475`) e no buffer
(`:501,:520`). **Impressão de anúncio não passa por NENHUM desses três filtros**
(consentimento, flag internal, `is_internal` na leitura) e ainda é inflada no upsert —
a comparação "91 vs 3" no mesmo painel compara séries com regras de admissão
completamente diferentes.

### 2.2 Claims verificados (nenhum refutado pelo passe cético)

**(a) Rotas de anúncio sem checagem de tráfego interno no servidor — Confirmado no
código.** `POST /api/ads/:id/impression` e `/click` têm como único portão
`isBotRequest` + `overRateLimit` (`ads.ts:145,:187`); grep no arquivo por
`internal|isPrivateIp|internalIp` devolve zero. Enquanto isso o `/event` marca
`is_internal` (`analytics.ts:239-243`) e o `/stats` mantém só `is_internal=false` nos
pageviews. `ad_daily_stats` não tem coluna de marcação interna
(`db/schema/ad_daily_stats.ts:3-12`) — retro-filtragem impossível. O painel compara,
lado a lado, pageviews filtrados com impressões não filtradas. *Correção do cético
(redação):* o `/stats` "mantém apenas linhas `is_internal=false`" (exclui as marcadas
internas), não o contrário. Quanto do total real veio de tráfego interno é
**indeterminável até pelo banco** (a tabela não guarda sessão/IP/UA).

**(b) Supressão interna 100% client-side, dependente do admin_token no MESMO navegador
— Confirmado no código (versão precisa pós-verificação).** A supressão vive em
`useAds.ts:107-114` (`isInternalTraffic`) com early-return em `trackClick` (`:117`) e
`trackImpression` (`:122`). O `admin_token` é gravado apenas nos dois caminhos de login
do `/admin` (`Login.tsx:70` senha; `:100` 2FA) e removido no logout
(`web/pages/Admin.tsx:23`) e no 401 automático (`web/lib/adminApi.ts:27`). Celular,
outro navegador, aba anônima ou navegador sem token contam impressões/cliques
normalmente — **inclusive sem consentimento LGPD** (trackImpression/trackClick não
checam `getConsent()`). Já os pageviews desses mesmos acessos podem não entrar nas
métricas "reais" por dois mecanismos confirmados: consentimento não-aceito bloqueia o
envio no client (`useAnalytics.ts:106-107`) e IP cadastrado/privado marca
`is_internal=true` no servidor (`analytics.ts:239-243`). A quantificação ("os 3
reais") é **Hipótese** — depende dos dados (Anexo A2/A5). *Achado adicional do cético:*
`adminApi.ts:90` tem um `trackAdClick` sem guard, porém sem uso (código morto).

**(c) Dedup de impressão só no client e por ABA; servidor sem dedup — Confirmado no
código.** Servidor: handler completo `ads.ts:184-220`, único freio 60/min/IP; o
`isRecentDuplicate` de `trafficGuard.ts:43-48` existe mas **não é usado** em `ads.ts`
(imports na `:5`). Client: `sessionStorage bee_adimp_<id>` é por aba — aba nova reconta
todos os anúncios; com storage bloqueado o fallback é `useRef<Set>` **por instância do
hook** (`useAds.ts:145`) — o mesmo anúncio em 2 componentes conta 2×. Um curl/script
com UA de navegador não encontra resistência server-side além do rate limit (o CORS do
`app.ts` aceita request sem header Origin). *Precisões do cético:* nas linhas
`:200-210` há validação de legitimidade (ativo/não-expirado) — resistência contra IDs
inválidos, mas não dedup; sem IntersectionObserver o dwell de 1s ainda vale (`:165-170`)
— "sem viewability" significa sem checagem de estar na tela, não instantâneo. O
"1×/anúncio por sessão" de `docs/ANALYTICS.md:87` é na prática 1×/aba e só no client.

**(d) Bots descartados em silêncio fora do `/event`; BOT_RE só pega UA conhecido —
Confirmado no código.** `ads.ts:144-148` e `:187-190` descartam bot/flood com
`res.json({ok:true})` sem `bumpHealth`; `analyticsHealth` nem é importado no arquivo.
`bumpHealth("droppedBot")` existe só no `/event` (`analytics.ts:208`); o `/behavior`
(`:316-318`) também descarta sem contador. O `filters[]` do `GET /health`
(`:355-361`) descreve apenas os filtros do `/event`. Consequência: o card Saúde da
coleta (`Analytics.tsx:1348`) pode mostrar 0 bots filtrados enquanto as rotas de
anúncio descartam (ou deixam passar) volume invisível — o valor atual do contador é
**Hipótese** (memória, zera no restart). `BOT_RE` (`trafficGuard.ts:14-15`) só casa
tokens conhecidos: um headless com UA normal que execute JS e mantenha o anúncio ≥50%
visível por 1s gera impressão, mas nunca pageview (não aceita o banner de
consentimento).

**(e) Carrossel multiplica impressões por anúncio da rotação — Confirmado no código.**
Com 2+ anúncios na mesma `position` (`AdBanner.tsx:37` + `useAds.ts:95-97`), o
`AdBanner` roda `setInterval` de 5s (`:55-65`) e o `useAdImpression` observa
`items[index]?.id` (`:73`); a troca de `adId` reinicia o dwell (`useAds.ts:160-172`) e,
como 5s > 1s, cada anúncio da rotação conta. Um único visitante parado diante de UM
slot gera 1 impressão POR ANÚNCIO da rotação, com zero pageview adicional. *Correção do
cético (incorporada):* é comportamento **deliberado e documentado** no próprio código
(`AdBanner.tsx:71-72`; docstring `useAds.ts:137-142` — viewability por criativo, padrão
IAB), e vale só na PRIMEIRA volta (depois o dedup por aba bloqueia): teto = 1 impressão
× nº de anúncios na rotação, por aba. A pré-condição (2+ anúncios na mesma position no
sp011) é **Hipótese** — Anexo A7 responde; a distribuição desigual relatada (62/24/5)
sugere que carrossel puro não é a única causa.

**(f) Prévia do admin (iframe) não suprime tracking pela flag — Confirmado no
código.** `HomeBlocksManager.tsx:3013-3016` carrega o site real com
`?adminPreview=1`; grep repo-wide: a flag só existe em `Home.tsx:756` e no próprio
iframe — nenhum código de tracking a lê. A prévia não conta impressões SOMENTE porque o
iframe é same-origin (sem `sandbox`) e enxerga o `admin_token` do localStorage. A mesma
URL aberta em navegador sem token conta impressões normalmente (e pageviews, se houver
consentimento e IP não-interno). *Precisões do cético:* `isAdminPreview` também troca a
fonte dos blocos e desliga otimizações (`Home.tsx:821,:898-905,:989`) — nada de
tracking; pageview/read/scroll do preview com token SÃO enviados com `internal:true`
(gravados `is_internal=true`, excluídos das métricas) — a supressão total (não-envio) é
só de impressão/clique de anúncio.

**(g) Múltiplas unidades medidas por página: M impressões por 1 (ou 0) pageview —
Confirmado no código.** A home injeta `AdSlotBand` nos slots 08/01/02/03/04
(`Home.tsx:884-888`, fluxo clássico) e slot_09 (`:1028`, sempre); o artigo injeta
slot_10 (`Artigo.tsx:742`), slot_06 (`:808`) e blocos advertising da sidebar (`:87`,
default slot_07); cada bloco isAd e o `block:header-banner` (`Header.tsx:362`,
validado no servidor em `ads.ts:21-23`) têm chave própria. Cada chave distinta vista
≥50% por 1s conta 1 impressão por aba. Um pageview consentido pode legitimamente gerar
M impressões; um acesso NÃO consentido gera as mesmas M impressões com **zero**
pageview. *Correção do cético (incorporada):* M = "chaves distintas vistas", não
"unidades" — duas unidades com o MESMO anúncio contam 1; um slot-carrossel com K
anúncios pode contar K (M pode exceder o nº de unidades).

**(h) Único freio server-side de volume: rate limit em memória — Confirmado no
código.** 60 impressões/min e 30 cliques/min por IP (`ads.ts:187,:145`), janela de 60s
em `Map` em memória (`trafficGuard.ts:24,:51-60` — a declaração do Map está na `:24`),
zerada no restart, sem persistência; `req.ip` é o IP real (`app.ts:106`). Teto teórico:
86.400 impressões/dia aceitas por IP (agregado do IP, não por anúncio), cada uma ainda
amplificada pelo upsert defeituoso. O `endpointRateLimit` DB-backed do api-server não é
aplicado às rotas `/ads`. Não é dedup: é anti-flood grosseiro, inútil contra contagem
orgânica assimétrica.

**(i) `upsertDailyStat` sem UNIQUE → inflação ~quadrática — Confirmado no código
(núcleo); explicação do "91" é Hipótese.** O par INSERT(valor 1) +
`.onConflictDoNothing()` **sem target** + UPDATE incondicional `+1 WHERE (ad_id,date)`
(`ads.ts:36-50`), combinado com a ausência de UNIQUE em todas as fontes de schema
(`ad_daily_stats.ts:9-12` = `index()`; `0000_init.sql:293-299,321-322`;
`ensureSchema.ts:24-75`; snapshot `meta/0000_snapshot.json` com `isUnique:false`),
faz cada chamada inserir linha nova e incrementar todas as linhas do par — N eventos
serializados geram linhas {N+1, N, …, 2}, soma **(N²+3N)/2**: 2 eventos reais viram 5,
4 viram 14, 7 viram 35. A leitura da janela soma todas as linhas (`analytics.ts:
616-621`), inflando `adKpis`, tabela e CTR (denominador), e o all-time dos blocos
(`admin.ts:989-1004`). Mesmo que a UNIQUE existisse, a 1ª chamada do dia contaria 2
(INSERT 1 + UPDATE +1). *Correções do cético (incorporadas):* (1) o `adDailyChart`
NÃO soma — `analytics.ts:658-661` usa **atribuição com sobrescrita**
(`adDailyByDate[date][adId] = {…}`): o gráfico mostra o valor de UMA linha arbitrária
do par (a query `:487-490` não tem ORDER BY), ficando inconsistente com a tabela ao
lado — sintoma distinto, não inflação igual (pode até SUBnotificar); (2) a fórmula é
exata sob execução serializada (concorrência desvia levemente, sempre superlinear);
(3) "melhor explica 91 com ~3 pageviews" é **Hipótese** (ex.: 12 eventos reais num par
→ 90) — Anexo A1/A7 prova ou refuta (linhas duplicadas + razão diário vs all-time).
Contadores `adsTable.impressions/clicks` (all-time) são corretos: +1 por chamada aceita
(`ads.ts:212-215,:173-176`).

**(j) Assimetria de consentimento LGPD — Confirmado no código.** Todo pageview/read/
scroll passa pelo gate `getConsent() !== "accepted" → return` (`useAnalytics.ts:
106-107`; default `null`, `LGPDConsent.tsx:9-15`); `trackImpression`/`trackClick`
NUNCA consultam `getConsent` (grep: nenhum componente de anúncio importa consentimento;
`SEOHead.tsx:8-11` gateia só scripts de terceiros). Visitante que ignora ou rejeita o
banner gera todas as impressões viewáveis e **zero** pageviews. O painel de opções do
banner é decorativo: os toggles não-locked são divs estáticas sem onClick
(`LGPDConsent.tsx:79-99`) e `accept()/reject()` gravam uma única chave binária
(`:30-39`). Essa assimetria estrutural produz o padrão impressões >> pageviews mesmo
com tráfego 100% orgânico e honesto — que ela explique o caso concreto observado é
**Hipótese** (Anexo A3: razão impressões/pageviews por dia).

### 2.3 Síntese do Problema 1

Quatro mecanismos independentes, todos confirmados no código, empurram a razão
impressões/pageviews para cima: (1) inflação aritmética na gravação (claim i — o único
que corrompe o dado armazenado); (2) assimetria de admissão consentimento/interno/
is_internal (claims a, b, j); (3) multiplicidade legítima por página e por carrossel
(claims e, g); (4) ausência de dedup/observabilidade server-side (claims c, d, h).
A **composição** exata de qualquer número de produção é indeterminável sem os SQLs do
Anexo A — e, mesmo com eles, a AUTORIA das impressões (operador, bot-JS, visitante sem
consentimento) é **indeterminável em definitivo**: `ad_daily_stats` não guarda sessão,
IP, UA nem timestamp por evento. Só é possível provar a inflação aritmética (linhas
duplicadas) e correlacionar dias/quantidades.

---

## 3. PROBLEMA 2 — "Tráfego pago" (ex.: 33,3%) sem nenhuma campanha paga

### 3.1 A cadeia completa (Confirmado no código)

Entrada com query string → **client**: `captureUtmOnce` (`useAnalytics.ts:66-71`)
grava 1× por aba em `sessionStorage bee_utm` o resultado de `parseUtm`
(`web/lib/analyticsClient.ts:16-34`), onde **`paidClick = p.has("gclid") ||
p.has("fbclid")`** (`:23` — só a presença; o comentário `:12` confirma que o valor
nunca é enviado). No 1º pageview da sessão, `sendPageview` (`useAnalytics.ts:130-134`)
chama `takeFirstTouch` (`:80-99`): anexa `firstTouch:true`, `refHost` (descartando
auto-referência, `:85-87`), `utm_*` e `paidClick` (`:92-95`); após envio com
consentimento, `markReferrerDone` grava `bee_ref_done` (`:101-103`) e nenhum pageview
posterior da sessão reenvia origem. → **servidor** (`api/routes/analytics.ts`):
guards `:208-231`; sinais crus `:252-257` com **`paidClick = b["paidClick"] === true`**
(`:256`, confiança direta no body); `firstTouch` por flag OU presença de qualquer sinal
(`:261-262`, paidClick sozinho basta); `referrer = classifyChannel({...})` (`:263-265`;
interno vira `"interno"`). **`classifyChannel`** (`api/lib/analyticsShared.ts:121-141`):
a PRIMEIRA regra (`:126`) retorna `"pago"` se `sig.paidClick` OU `utm_medium` casa
`^(cpc|ppc|paid|display|cpm|banner|retargeting)$` — antes de email (`:127`), social/
busca por medium (`:128-129`) e hosts (`:130-134`; `SOCIAL_HOST_RE` `:102-103` inclui
facebook.com/instagram.com — portanto **fbclid orgânico do Facebook vence "social"**).
É o único produtor do valor `"pago"` no api-server. → **gravação**: `toRow` grava o
CANAL CLASSIFICADO na coluna `referrer` (`analytics.ts:68`) e **não persiste
paidClick** (sem coluna: `db/schema/analytics.ts:10-46`). → **leitura**: `/stats`
projeta `referrer` (`:400`) com `is_internal=false` (`:405-409`) + buffer não-interno
(`:499-502`) → `buildWindowAggregates` (`analyticsShared.ts:264-343`): `channelMap`
zero-init com `pago:0` (`:271-273`); cada pageview de entrada incrementa 1 via
`normalizeLegacyChannel` (`:144-147` — remap de rótulos legados, nunca reclassifica)
(`:298-301`) → `referrerChart` (`analytics.ts:739`). → **UI** (`Analytics.tsx`):
`referrers = referrerChart.filter(value>0)` (`:345`), `totalRef` (`:347`),
card Fontes de Tráfego (`:586-653`) com `pct = value/totalRef` (`:602`) e rótulo
"Tráfego pago" (`REFERRER_TKEYS` → `web/lib/adminI18n.ts:200`).

**Logo:** 1 única sessão entrando com fbclid (ex.: clique orgânico em post do próprio
blog no Facebook) grava 1 linha `pago` permanente; com 3 sessões classificadas na
janela, o card exibe 33,3% de "Tráfego pago".

### 3.2 Claims verificados (nenhum refutado pelo passe cético)

**(c1) paidClick por mera PRESENÇA de gclid/fbclid — Confirmado no código.**
`analyticsClient.ts:23` (`p.has(...)` — até valor vazio conta), sem olhar valor, origem
ou contexto de campanha. Como o Facebook/Instagram anexa fbclid também a cliques em
posts ORGÂNICOS (comportamento externo da plataforma Meta — notório e estável, mas não
demonstrável dentro do repo), todo clique vindo do Meta com fbclid entra no funil como
"clique pago" — o código não tem como distinguir. O teste do próprio repo documenta o
comportamento (`analyticsClient.test.ts:12-13`). Escopo: só na URL de ENTRADA
(1×/sessão), só após consentimento, e vale para o first-touch da sessão inteira.

**(c2) "pago" vence "social" — Confirmado no código.** `analyticsShared.ts:126` é o
primeiro `return` de `classifyChannel`, antes do teste de `SOCIAL_HOST_RE` (`:132`).
O teste do repo (`api/test/analyticsShared.channel.test.ts:5-9`) documenta: "gclid/
fbclid ou utm_medium pago **vencem qualquer outro sinal**". Nem `utm_medium=social`
(`:128`) reverteria o paidClick. Clique orgânico de facebook.com com fbclid é
classificado "pago", nunca "social". A frequência real em produção é **Hipótese**
(Anexo A4).

**(c3) Segundo (e único outro) gatilho: regex sobre utm_medium — Confirmado no
código.** `^(cpc|ppc|paid|display|cpm|banner|retargeting)$` aplicado após
`.toLowerCase().trim()` (`analyticsShared.ts:122,:126` — efetivamente
case-insensitive: `utm_medium=CPC` também dispara). Qualquer visitante externo
não-interno com consentimento aceito que entre por URL com `utm_medium=cpc` (link
antigo, teste manual, UTM de terceiro) é classificado "pago" sem existir campanha.
Exceções de borda: sem aceite LGPD nada é enviado; interno vira "interno"; bots/rate
são descartados; navegação com UTM no MEIO de sessão já iniciada não reclassifica
(`bee_ref_done`).

**(c4) Nenhum cadastro/validação de campanha em lugar nenhum — Confirmado no código
(por ausência).** `ChannelSignals` (`analyticsShared.ts:107-113`) só tem sinais de
URL/referrer; grep repo-wide por campaign/campanha: apenas o próprio pipeline
(`utm_campaign` agregado como string livre — `analyticsShared.ts:303`,
`analytics.ts:741` `topCampaigns`), docs, testes e rótulo de UI; nenhum schema em
`db/schema/` representa campanhas; a tabela `ads` é inventário de banners internos e
`routes/ads.ts` tem zero ligação com classificação de canal.

**(c5) First-touch persistido para sempre na coluna `referrer` — Confirmado no
código.** Captura 1×/aba (`useAnalytics.ts:66-71`), consumo 1×/sessão (`:80-83,
:101-103,:130-134`); o servidor grava o resultado de `classifyChannel` via `toRow`
(`analytics.ts:68`); a agregação lê o valor gravado e nunca reclassifica — comentário
literal em `analyticsShared.ts:143`: "Remap SÓ na agregação — linhas históricas nunca
são reescritas no banco" (`:144-147,:298-301`; zero UPDATEs em `analytics_events`;
`dataRetention.ts` não expurga a tabela). Uma sessão classificada "pago" conta como
"pago" em toda janela que contiver aquele pageview, mesmo que a regra seja corrigida
depois (correção só vale para ingests futuros). Bordas anotadas pelo cético (não
refutam): first-touch pode ser PERDIDO (dedup de 15s no servidor após `bee_ref_done`
já marcado) — perda de atribuição, não reclassificação.

**(c6) Servidor confia cegamente no booleano do body — Confirmado no código.**
`paidClick = b["paidClick"] === true` (`analytics.ts:256`) sem verificação cruzada;
paidClick sozinho torna o evento first-touch (`:261-262`) e produz linha `referrer=
'pago'` que entra no dashboard. Endpoint público sem autenticação por design
(sendBeacon; CORS aceita request sem Origin). *Correção do cético (incorporada):* o
POST forjado precisa de User-Agent plausível (UA vazio/`curl/`/`python`/etc. cai no
`BOT_RE`, `trafficGuard.ts:14-19`), fica limitado a 120 eventos/min/IP
(`analytics.ts:212`) e, de IP privado/interno, viraria "interno". Que isso explique
linhas reais de produção é **Hipótese** (Anexo A4: UA/padrões de session_id).

**(c7) paidClick NÃO é persistido — forense retroativa limitada — Confirmado no
código.** `toRow` (`analytics.ts:56-82`) não tem o campo; a tabela não tem coluna
(`db/schema/analytics.ts:10-46`); o valor de gclid/fbclid nunca sai do navegador
(`analyticsClient.ts:12,:23`) e o `path` gravado não carrega query string. Numa linha
`referrer='pago'` cujo `utm_medium` não casa a regex, sabe-se por eliminação que veio
de gclid/fbclid (único outro gatilho, `analyticsShared.ts:126`); QUAL dos dois é
irrecuperável — e seria mesmo se o flag fosse persistido, pois o client já funde os
dois num único boolean. Resta inferir por `ref_host` (facebook.com/instagram.com e
subdomínios sugerem fbclid; NULL é comum no in-app browser do Meta). *Precisão do
cético:* a eliminação forense deve testar a regex sobre `lower(trim(utm_medium))`
(o `cleanStr` grava cru; o classificador normaliza antes — `analyticsShared.ts:122`).

**(c8) O 33,3% é aritmética sobre pouquíssimas sessões classificadas — Confirmado no
código.** Cada unidade do card é UM pageview de entrada de sessão (só o first-touch
carrega canal — `analyticsShared.ts:297-301`); o card filtra `value>0` e calcula
`value/totalRef` (`Analytics.tsx:345-347,:601-611`). 33,3% = exatamente 1 sessão
"pago" em 3 classificadas (ou 2/6 etc.) — não exige tráfego pago em volume, exige UMA
entrada com fbclid/gclid/utm_medium pago. O zero-init `pago:0` não gera pago fantasma
(filtro `value>0`). Nuances: `totalRef` inclui sessões "direto" (todas as entradas da
janela); o card exibe o valor bruto entre parênteses (`:612`) — o admin vê a contagem
pequena real; render usa ponto decimal ("33.3%"). Que o 33,3% de produção seja 1/3 é
**Hipótese** (Anexo A4, 2ª query).

### 3.3 Hipótese principal (c9) — origem provável do "pago" em produção

**Hipótese** (mecanismo confirmado; composição real só com dados): a causa mais
provável do "pago" em todos os blogs da rede são **cliques orgânicos vindos do Meta com
fbclid** — a rede publica ativamente no Facebook/Instagram via automação social própria
(fila `social_publication_queue`, CLAUDE.md §16), e todo clique nesses posts orgânicos
chega com fbclid e vira "pago" pela cadeia c1+c2. Mesma imagem/código em todos os blogs
+ mesma estratégia de divulgação Meta = mesmo sintoma em todos. Causas secundárias
possíveis: URLs com gclid/fbclid ou `utm_medium` pago copiadas/recompartilhadas (c3) e
POST forjado (c6). Não existe campanha cadastrada no sistema (c4). **O que falta
verificar:** Anexo A4 (sinais crus das linhas "pago": `ref_host` facebook/instagram ou
NULL confirmaria fbclid orgânico; google.com com gclid indicaria Google Ads real) e
correlação temporal com os horários de publicação da automação social (fora do Anexo —
exige `social_publication_queue`). Nota: este comportamento **não está** entre as 8
limitações admitidas de `docs/ANALYTICS.md:114-135` — é regressão de expectativa, não
decisão registrada. `gclid ⇒ pago` está correto (parâmetro exclusivo de Google Ads).

---

## 4. Demais achados relevantes (fora dos 2 problemas)

### 4.1 Itens 3 e 14 — Top categorias: ordenação "por acessos" com fallback por nº de artigos + normalização estourada (Bug, Confirmado no código)
O sort do endpoint é `(b.clicks + b.views || b.articles)` (`analytics.ts:589`):
categoria com ZERO acessos e muitos artigos publicados pode liderar um card rotulado
"por acessos". No Dashboard, a barra é escalada pelo `views` da 1ª linha
(`Dashboard.tsx:343-344`) — itens seguintes podem exceder 100%. No Analytics detalhado,
`maxCatViews = (topCats[0].clicks+views) || 1` (`Analytics.tsx:350`) — quando o líder
vem do fallback com atividade 0, a base vira 1 e o chip "%" exibe 300%/1500%
(`:793-795,:813-814`). Semânticas conferidas: "cliques" = visitas à página de listagem
da categoria (`CategoryArchivePage.tsx:25-28` → `catClickMap`), não cliques em
artigos/anúncios; "views" = pageviews de artigo da categoria; "nº artigos" = all-time
atual; "%" = participação relativa ao líder. Assimetria adicional: o evento `category`
não passa pelo dedup de 15s (`analytics.ts:231` só cobre pageview) — F5 infla "cliques"
mas não "views". Cenário gatilho (líder por fallback) ativo hoje = **Hipótese**
(provável em blogs recém-backfillados: muitos artigos, quase zero tráfego).

### 4.2 Item 6 — Visitantes recorrentes: EXISTS sem `is_internal` e sem filtro de `type` (Parcial, Confirmado no código)
A subquery de recorrentes (`analytics.ts:479-481`) filtra apenas `visitor_id` e
`ts < winFrom`, enquanto o `uniq` da mesma CTE conta só pageviews públicos: visitante
cujo histórico pré-janela é 100% interno (ex.: deslogou, ou IP saiu da lista) vira
"recorrente" e deixa de ser "novo" — inconsistente com a definição do próprio `uniq`.
Além disso `visitors.unique` vem só do SQL (sem buffer), enquanto `totals.window` e
`uniqueSessions` do MESMO payload incluem buffer — defasagem de até ~30s entre KPIs
vizinhos. O "desde 2026-07-08" está correto (`ANALYTICS_V2_SINCE`).

### 4.3 Item 17 — Pico por dia da semana: viés estrutural de janela (Parcial, Confirmado no código)
`byDow` é soma bruta (`analyticsShared.ts:294`). Em janelas não múltiplas de 7 (a
default é 30d), dois dias da semana ocorrem 5× e cinco ocorrem 4× — até ~25% de
vantagem inerente na eleição do "pico". Propriedade matemática do código, independe de
dados. Período "7d" exato não tem viés.

### 4.4 Item 18 — Scroll depth: rótulo e janela de dupla contagem (Parcial, Confirmado no código)
O card rotula a contagem como "sessões" (`Analytics.tsx:1005`), mas a unidade real é o
par sessão×conteúdo (`${sessionId}|${articleId ?? path ?? ""}`,
`analyticsShared.ts:330`) — 1 sessão que lê N artigos conta N vezes por marco
(internamente consistente; rótulo impreciso). E o `useScrollDepth` roda com
`articleId` undefined durante o load do artigo (`Artigo.tsx:131` usa `article?.id`),
dedupando por `bee_scroll_p:<path>`, e re-roda com `bee_scroll_<id>` após o load:
rolar durante o skeleton pode disparar o mesmo marco 2× (chaves `path` vs `articleId`
distintas no servidor). Cenário raro; frequência real = **Hipótese**.

### 4.5 Item 23 — Links externos: cobertura e esquema (Parcial, Confirmado no código)
Só cliques no corpo do artigo são instrumentados (`Artigo.tsx:281-285,:408-413`) —
links externos de rodapé/menu/blocos da home não contam, embora o card se apresente
como "Links externos" do site. No caminho de delegação HTML (`:408-413`) não há filtro
de esquema: `mailto:`/`tel:` passam e `new URL('mailto:...').hostname` = `""` — domínio
vazio contado e renderizado como barra sem rótulo (`analytics.ts:695`). A exclusão por
`startsWith(origin)` é comparação de prefixo de string, não de origin real (caso raro).

### 4.6 Item 24 — Resumo de interações: somas sobre listas truncadas + newsletter fora do padrão (Bug, Confirmado no código)
"Buscas realizadas" e "Cliques externos" do card somam `topSearchTerms`/
`topLinkDomains` (`Analytics.tsx:1297,:1302`), que o servidor trunca em 15/10 itens
ANTES de enviar (`analytics.ts:702-705,:707-710`) — subcontam sempre que houver >15
termos ou >10 domínios distintos na janela (lógica incorreta independente de volume; se
já se manifesta é **Hipótese**). E os dois formulários de newsletter (`Footer.tsx:
62-76`; `blocks/HomeCustomBlocks.tsx:364-378`) fazem `fetch` direto a
`/api/analytics/behavior` **sem `getConsent()` e sem flag `internal`** — ao contrário
do `sendBehavior` padrão (`useAnalytics.ts:249-259`); o servidor só descarta interno
por flag ou IP cadastrado (`analytics.ts:330`, sem a perna `isPrivateIp` do `/event`):
inscrição feita por admin/dev conta como signup real, e o e-mail vai para
`behavior_events.value` ignorando o gate LGPD usado por todo o resto do tracking.
Corretos no mesmo card: `totalEvents`, `newsletterSignups` (janela completa),
compartilhamentos, leitura 100%.

### 4.7 Item 25 — Saúde da coleta: cobertura restrita e reconciliação furada (Parcial, Confirmado no código)
Os contadores cobrem SÓ o `/event`; descartes de bot/rate do `/behavior`
(`analytics.ts:316,:318`) e das rotas `/ads/:id/*` não incrementam nada (ver claim d).
Tudo em memória (limitação divulgada na própria UI). Buraco no flush degradado: com
banco fora e re-enfileiramento excedendo `BUFFER_MAX` (500), o excedente é descartado
sem `flushFailed` (`analytics.ts:109-111`), quebrando "Aceitos = Gravados + Falhas +
buffer"; em falha total, `noteFlush` não roda e `lastFlushAt` estagna.

### 4.8 Item 15 — Geolocalização por ip-api.com free (Parcial, Confirmado no código; decisão registrada)
`lookupGeoAsync` (`analytics.ts:176-203`): HTTP-only (IP do visitante em claro a
terceiro) e os termos do free tier **proíbem uso comercial** — blogs monetizados por
anúncios estão em desacordo com o provedor; cache negativo permanente (falha grava
`null` e o IP nunca é reconsultado até restart); 1º pageview de IP novo pode ficar
"Não identificado" para sempre (retrofill só alcança o buffer); sem backoff para o
rate limit de 45 req/min; `lang=pt-BR` fixo. A cadeia em si funciona e o comentário
`analytics.ts:151-154` + `docs/ANALYTICS.md:116-120` registram a decisão.

### 4.9 Achados menores (Confirmado no código)
- **Cadeia morta:** `realtime-stats.ts:46-53,:104` devolve `topCategoryViews` (tabela
  `category_views` via `store.trackCategoryView`) sem nenhum consumidor no client
  (grep zero) — all-time de categorias termina sem UI.
- **Código morto:** `web/lib/adminApi.ts:90` `trackAdClick` sem guard e sem uso.
- **Título de topArticles:** `analyticsShared.ts:308` inicializa
  `title: ev.title ?? ev.articleId` (string truthy) — o fallback `persistedTitles`
  (`analytics.ts:566`) nunca corrige depois; inócuo porque `trackArticle` sempre envia
  título.
- **Nomes de anúncio como dataKey do gráfico top-3** (`analytics.ts:663-670`;
  `Analytics.tsx:1168-1178`): dois anúncios homônimos colidem na série.
- **Históricos órfãos invisíveis:** anúncio deletado/bloco desmarcado somem da tabela
  do Analytics mesmo com linhas na janela (`analytics.ts:645-649`); blocos órfãos
  continuam somando nos cards do AdsManager (`AdsManager.tsx:628-631`) sem aparecer em
  tabela alguma; o card do Dashboard não inclui blocos (só `getAds`) — três recortes
  all-time diferentes entre si por construção.
- **Buscas via URL direta** (`/arquivo?q=`) não são rastreadas (só o submit dos forms).

---

## 5. Invariantes do CLAUDE.md §17 que qualquer correção precisa respeitar

1. **"Heartbeat cumulativo agregado por MAX"** — hoje respeitada (itens 8/13:
   `analyticsShared.ts:319-327`, `analytics.ts:433-442`). Nenhuma correção pode trocar
   MAX por SUM nem quebrar a idempotência de reenvio dos heartbeats. Não é tocada pelos
   achados de anúncio, mas qualquer refactor do reducer passa por ela.
2. **"Tráfego interno marcado `is_internal`, nunca dropado"** — toca diretamente os
   claims a/b (Problema 1) e o item 24: a correção correta para as rotas
   `/ads/:id/*` é MARCAR (o que exige coluna/dimensão nova em `ad_daily_stats` ou
   registro por evento) e excluir na leitura — não dropar no ingest. Atenção à
   inconsistência pré-existente e documentada no código: o `/behavior` DROPA interno
   (`analytics.ts:328-330`) porque a tabela não tem coluna — qualquer correção do item
   24 deve decidir explicitamente se alinha o `/behavior` à invariante (coluna nova)
   ou mantém a exceção documentada.
3. **"`totals.*` do /stats fixos ao agora"** — hoje respeitada (contrato do Dashboard,
   `analytics.ts:374-381`). Correções nos KPIs de janela (itens 5/7) não podem
   reindexar os totais fixos ao período selecionado.
4. **"Canal classificado no servidor"** — toca o Problema 2 inteiro: a correção do
   fbclid (ex.: rebaixar a precedência de `paidClick` quando `refHost` é social, ou
   separar fbclid de gclid) deve viver em `classifyChannel`/ingest
   (`analyticsShared.ts:121-141`, `analytics.ts:263-265`), nunca no client (que envia
   só sinais crus). E linhas históricas nunca são reescritas — o mecanismo sancionado
   para reinterpretar histórico é o remap SÓ na agregação (`normalizeLegacyChannel`,
   `analyticsShared.ts:143-147`), precedente direto para tratar o "pago" legado sem
   UPDATE no banco.
5. **"Migrações de coluna via Drizzle schema E ensureSchema"** — toca o claim i: a
   correção do UNIQUE de `(ad_id, date)` precisa ir aos DOIS lugares
   (`uniqueIndex()` em `db/schema/ad_daily_stats.ts` + statement idempotente em
   `api/lib/ensureSchema.ts`), precedida de dedup/merge das linhas duplicadas
   existentes (senão o `CREATE UNIQUE INDEX` falha) — e o mesmo vale para eventual
   coluna de marcação interna em `ad_daily_stats`/`behavior_events`. Lembrete do
   inventário §5: `ensureSchema` hoje não cria NADA de `ad_daily_stats` — o schema-base
   vem de `drizzle-kit push` manual; a correção precisa alcançar o sp011 (Supabase) e
   todos os blogs do `pg-blogs`.
6. **"Colunas novas do blog se autocriam no boot"** (§17 último bullet) — corolário do
   item 5: nada de migração manual por blog; o rollout é a imagem compartilhada + boot.
7. **Isolamento entre blogs / nunca hardcodar conteúdo por blog na imagem** (§13,
   reforça §17) — os defeitos são da imagem compartilhada e a correção vale para TODOS
   os blogs de uma vez (rollout §6 do CLAUDE.md); nenhum fix pode ser condicionado a
   BLOG_ID.
8. **SSR/perf: "HTML com `no-cache`, nunca `no-store`" e demais invariantes de §17** —
   não são tocadas pelos achados desta auditoria; listadas aqui apenas para o registro
   de que os fixes de client (useAds/useAnalytics) não devem alterar cache/SSR.

---

## 6. Perguntas que SÓ dados reais respondem (→ Anexo A)

União dos pontos em aberto dos dois problemas. MCP Supabase não conectado nesta
sessão: **nada abaixo foi confirmado com dados**.

| # | Pergunta | SQL do Anexo A |
|---|---|---|
| 1 | Composição exata das impressões (quais anúncios/blocos `block:*` e quais dias somam o total exibido — ex.: 62+24+5) | **A1** (as duas queries) |
| 2 | Prova do bug do upsert (claim i): existem pares (ad_id, date) com mais de 1 linha? | **A1** (2ª query: pares `(dia, ad_id)` repetidos no detalhe diário). Complemento fora do Anexo: `SELECT ad_id, date, count(*), sum(impressions) FROM ad_daily_stats GROUP BY 1,2 HAVING count(*)>1;` |
| 3 | Fator real de inflação: `SUM(ad_daily_stats)` por anúncio vs `ads.impressions/clicks` (all-time correto) — diário >> all-time = bug ativo e quantificado | **A7 × A1** (comparar as colunas por id) |
| 4 | Existe UNIQUE em (ad_id, date) criada manualmente em produção, fora do repo? | — (sem bloco no Anexo; conferir com `\d ad_daily_stats` / `pg_indexes` no Supabase do sp011 e no pg-blogs) |
| 5 | `position` dos anúncios do sp011 — 2+ na mesma position confirma a pré-condição do carrossel (claim e) | **A7** (coluna `position`) |
| 6 | Quanto do total vem de chaves `block:%` vs anúncios clássicos | **A1** (coluna `nome`/"(bloco da home/lateral)") |
| 7 | Do lado dos pageviews: quantos foram marcados internos por tipo (a marcação está pegando?) | **A5** (+ **A2** para a série não-interna por dia) |
| 8 | Razão impressões/pageviews por dia — dia com impressão e ZERO pageview é a anomalia-assinatura das assimetrias dos claims b/g/j | **A3** |
| 9 | `settings.internalIps` cobre os dispositivos/IPs do operador? | — (sem bloco no Anexo; `SELECT value FROM settings WHERE key='site_settings'` no banco do blog, campo internalIps) |
| 10 | Composição das linhas "pago": sinais crus (utm_*, ref_host, ua) — se `lower(trim(utm_medium))` não casa a regex paga, veio de gclid/fbclid por eliminação (c7) | **A4** (1ª query) |
| 11 | `ref_host` das sessões "pago": facebook/instagram/NULL (in-app Meta) ⇒ fbclid orgânico (c9); google.com ⇒ gclid/Google Ads real | **A4** |
| 12 | Volumes absolutos por canal na janela (33,3% = 1/3? 2/6?) | **A4** (2ª query cobre só "pago"). Complemento fora do Anexo: `SELECT referrer, count(*) FROM analytics_events WHERE type='pageview' AND is_internal=false AND referrer IS NOT NULL AND ts >= now()-interval '30 days' GROUP BY 1;` |
| 13 | Correlação temporal entre entradas "pago" e as publicações da automação social no Meta (reforço de c9) | **A4** (coluna `ts`) × horários da `social_publication_queue` (fora do Anexo — banco do blog) |
| 14 | Assinaturas de POST forjado (c6): UA repetitivo, session_id padronizado, linhas "pago" sem nenhum utm_* e sem ref_host | **A4** (1ª query) |
| 15 | Linhas "pago" anteriores a `ANALYTICS_V2_SINCE` (2026-07-08) — não deveriam existir (o caminho legado nunca produz "pago") | **A4** (coluna `ts`; a janela de 30 dias cobre o período) |
| 16 | O que existe em `behavior_events` (newsletter/busca/link_click — tabela SEM marcação interna: interno vem misturado) | **A6** |
| — | **Limitação definitiva** (não é pergunta respondível): a AUTORIA das impressões (operador, bot-JS, visitante sem consentimento) é indeterminável mesmo com acesso total — `ad_daily_stats` não guarda sessão, IP, UA nem timestamp por evento. Só a inflação aritmética é provável/quantificável. | — |

---

## 7. ANEXO A — SQLs de validação com dados reais (auditoria do sistema de analytics)

> **Como usar:** cada bloco é completo e auto-suficiente — cole na VPS exatamente como está
> (padrão do CLAUDE.md §12: `docker compose exec -T pg-blogs psql`). Nenhum bloco altera dados
> (só `SELECT`). Sem heredoc; cada `psql -c` é de linha única.
>
> **Princípio de leitura dos resultados:** volume baixo NÃO é bug — os blogs são novos.
> O que se procura aqui é composição/consistência lógica (quem gera as impressões, se a
> marcação `is_internal` funciona, de onde vêm as sessões "pago"), não o tamanho dos números.
>
> **Notas técnicas (verificadas no código nesta sessão):**
> 1. A coluna `analytics_events.referrer` guarda o **canal classificado** (`pago`, `direto`,
>    `busca`, `social`, `referencia`, `email`, `interno`, `desconhecido`) e SÓ é preenchida no
>    pageview de entrada da sessão (first-touch) — navegações internas gravam NULL
>    (`api-server/src/routes/analytics.ts:259-265`). Por isso as queries de canal filtram
>    `referrer='pago'` e contam sessões por `DISTINCT session_id`.
> 2. O sinal `paidClick` (gclid/fbclid na URL de entrada) **não é persistido em coluna** — se uma
>    linha "pago" aparecer com `utm_medium` fora de `cpc|ppc|paid|display|cpm|banner|retargeting`,
>    a classificação só pode ter vindo do `paidClick` enviado pelo cliente
>    (`api-server/src/lib/analyticsShared.ts:126`).
> 3. `ad_daily_stats.date` é texto `YYYY-MM-DD` no dia calendário de Brasília (UTC-3 fixo,
>    `api-server/src/routes/ads.ts:31-34`). Para comparar com `analytics_events.ts`
>    (timestamptz), as queries convertem com `AT TIME ZONE 'America/Sao_Paulo'` (equivalente a
>    UTC-3 desde 2019).
> 4. Ids de `ad_daily_stats` com prefixo `block:` são blocos da home/lateral marcados
>    "É uma propaganda" (inclusive o pseudo-bloco `block:header-banner`) — eles **não têm linha
>    na tabela `ads`**, por isso o `LEFT JOIN` (`api-server/src/routes/ads.ts:15-29`).
> 5. `behavior_events` **não tem** coluna de marcação interna (schema
>    `lib/db/src/schema/behavior_events.ts`) — a query 6 não tem como separar interno/externo;
>    interprete com isso em mente.

### A. Blog sp011 (banco Supabase, via `SUPABASE_DATABASE_URL` do `.env` raiz)

#### A1 — Pergunta: quais anúncios/blocos compõem as impressões dos últimos 30 dias? (por anúncio e por dia)

```bash
# (1) Composicao das impressoes dos ultimos 30 dias — total por anuncio/bloco e detalhe por dia.
#     ad_daily_stats LEFT JOIN ads (blocos "block:<id>" nao tem linha em ads — aparecem como bloco).
cd /opt/sp011
DBURL=$(grep -m1 '^SUPABASE_DATABASE_URL=' /opt/sp011/.env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "SELECT s.ad_id, CASE WHEN s.ad_id LIKE 'block:%' THEN '(bloco da home/lateral)' ELSE COALESCE(a.name, '(id sem linha em ads)') END AS nome, sum(s.impressions) AS impressoes, sum(s.clicks) AS cliques, count(*) AS dias_com_registro, min(s.date) AS primeiro_dia, max(s.date) AS ultimo_dia FROM ad_daily_stats s LEFT JOIN ads a ON a.id = s.ad_id WHERE s.date >= to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date - 29, 'YYYY-MM-DD') GROUP BY s.ad_id, a.name ORDER BY impressoes DESC;"
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "SELECT s.date AS dia, s.ad_id, CASE WHEN s.ad_id LIKE 'block:%' THEN '(bloco da home/lateral)' ELSE COALESCE(a.name, '(id sem linha em ads)') END AS nome, s.impressions AS impressoes, s.clicks AS cliques FROM ad_daily_stats s LEFT JOIN ads a ON a.id = s.ad_id WHERE s.date >= to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date - 29, 'YYYY-MM-DD') ORDER BY s.date DESC, s.impressions DESC;"
```

#### A2 — Pergunta: quantos pageviews NÃO-internos houve por dia no mesmo período?

```bash
# (2) Pageviews nao-internos por dia (dia calendario de Brasilia, mesmo criterio do dashboard:
#     type='pageview' AND is_internal=false).
cd /opt/sp011
DBURL=$(grep -m1 '^SUPABASE_DATABASE_URL=' /opt/sp011/.env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "SELECT (ts AT TIME ZONE 'America/Sao_Paulo')::date AS dia, count(*) AS pageviews, count(DISTINCT session_id) AS sessoes FROM analytics_events WHERE type = 'pageview' AND is_internal = false AND (ts AT TIME ZONE 'America/Sao_Paulo')::date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - 29 GROUP BY 1 ORDER BY 1;"
```

#### A3 — Pergunta: qual a razão impressões/pageviews por dia? (impressão de anúncio deveria acompanhar a audiência real)

```bash
# (3) Razao impressoes de anuncio / pageviews nao-internos, dia a dia (FULL JOIN: dia com
#     impressao e SEM pageview aparece com pageviews=0 e razao NULL — anomalia a investigar,
#     ja que impressao exige um humano com a pagina aberta).
cd /opt/sp011
DBURL=$(grep -m1 '^SUPABASE_DATABASE_URL=' /opt/sp011/.env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "WITH pv AS (SELECT (ts AT TIME ZONE 'America/Sao_Paulo')::date AS dia, count(*) AS pageviews FROM analytics_events WHERE type = 'pageview' AND is_internal = false AND (ts AT TIME ZONE 'America/Sao_Paulo')::date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - 29 GROUP BY 1), imp AS (SELECT date::date AS dia, sum(impressions) AS impressoes FROM ad_daily_stats WHERE date >= to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date - 29, 'YYYY-MM-DD') GROUP BY 1) SELECT COALESCE(pv.dia, imp.dia) AS dia, COALESCE(pv.pageviews, 0) AS pageviews, COALESCE(imp.impressoes, 0) AS impressoes, round(COALESCE(imp.impressoes, 0)::numeric / NULLIF(pv.pageviews, 0), 2) AS impressoes_por_pageview FROM pv FULL JOIN imp ON imp.dia = pv.dia ORDER BY 1;"
```

#### A4 — Pergunta: de onde vêm as sessões classificadas como canal "pago"? (sinais crus)

```bash
# (4) Sessoes com canal pago: linhas first-touch cruas (utm_source, utm_medium, utm_campaign,
#     ref_host, ua) + resumo por combinacao de sinais. Filtro: coluna referrer = 'pago'.
#     LEITURA: se utm_medium NAO for cpc/ppc/paid/display/cpm/banner/retargeting e os demais
#     sinais forem NULL, a classificacao veio do paidClick (gclid/fbclid) — que nao e persistido.
cd /opt/sp011
DBURL=$(grep -m1 '^SUPABASE_DATABASE_URL=' /opt/sp011/.env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "SELECT ts, session_id, path, utm_source, utm_medium, utm_campaign, ref_host, is_internal, left(ua, 120) AS ua FROM analytics_events WHERE referrer = 'pago' AND ts >= now() - interval '30 days' ORDER BY ts DESC LIMIT 100;"
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "SELECT COALESCE(utm_source, '(null)') AS utm_source, COALESCE(utm_medium, '(null)') AS utm_medium, COALESCE(utm_campaign, '(null)') AS utm_campaign, COALESCE(ref_host, '(null)') AS ref_host, count(*) AS eventos, count(DISTINCT session_id) AS sessoes FROM analytics_events WHERE referrer = 'pago' AND ts >= now() - interval '30 days' GROUP BY 1, 2, 3, 4 ORDER BY eventos DESC;"
```

#### A5 — Pergunta: a marcação de tráfego interno está funcionando? (proporção interno × não-interno por tipo)

```bash
# (5) Proporcao interno vs nao-interno por tipo de evento, ultimos 30 dias.
#     Se pct_interno for ~0 mesmo com uso diario do admin, a deteccao interna nao esta pegando;
#     se for ~100 no blog inteiro, o dashboard publico esta enxergando quase nada.
cd /opt/sp011
DBURL=$(grep -m1 '^SUPABASE_DATABASE_URL=' /opt/sp011/.env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "SELECT type, count(*) AS total, count(*) FILTER (WHERE is_internal) AS internos, count(*) FILTER (WHERE NOT is_internal) AS nao_internos, round(100.0 * count(*) FILTER (WHERE is_internal) / count(*), 1) AS pct_interno FROM analytics_events WHERE ts >= now() - interval '30 days' GROUP BY type ORDER BY total DESC;"
```

#### A6 — Pergunta: o que existe em behavior_events? (busca/link_click/newsletter — tabela SEM marcação interna)

```bash
# (6) Contagens de behavior_events por event_type (all-time, com primeiro/ultimo registro).
#     ATENCAO na leitura: esta tabela nao tem coluna is_internal — todo uso interno/admin
#     entra misturado aqui (limitacao estrutural, nao da para separar via SQL).
cd /opt/sp011
DBURL=$(grep -m1 '^SUPABASE_DATABASE_URL=' /opt/sp011/.env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "SELECT event_type, count(*) AS total, count(DISTINCT session_id) AS sessoes, min(ts) AS primeiro, max(ts) AS ultimo FROM behavior_events GROUP BY 1 ORDER BY total DESC;"
```

#### A7 — Pergunta: o que dizem os contadores ALL-TIME da tabela ads? (os que o AdsManager/Dashboard exibem)

```bash
# (7) Contadores all-time de ads (colunas impressions/clicks incrementadas a cada hit —
#     devem ser >= a soma de ad_daily_stats do mesmo id; blocos block:* NAO aparecem aqui).
cd /opt/sp011
DBURL=$(grep -m1 '^SUPABASE_DATABASE_URL=' /opt/sp011/.env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "SELECT id, name, position, active, impressions AS impressoes_alltime, clicks AS cliques_alltime, target_devices, expires_at, created_at FROM ads ORDER BY impressions DESC;"
```

### B. Bloco idêntico parametrizado — rodar num blog REPLICADO (pg-blogs local)

```bash
# (1-7) Mesmas 7 validacoes num blog replicado. Troque APENAS a variavel BLOG na 1a linha
#       (banco local no pg-blogs tem o mesmo nome do BLOG_ID: ksports, esporteagora,
#       resenhavip, oleysports, beeesportes...). Acesso: superusuario local, padrao §12.
BLOG='beeesportes'
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d "$BLOG" -v ON_ERROR_STOP=1 -c "SELECT s.ad_id, CASE WHEN s.ad_id LIKE 'block:%' THEN '(bloco da home/lateral)' ELSE COALESCE(a.name, '(id sem linha em ads)') END AS nome, sum(s.impressions) AS impressoes, sum(s.clicks) AS cliques, count(*) AS dias_com_registro, min(s.date) AS primeiro_dia, max(s.date) AS ultimo_dia FROM ad_daily_stats s LEFT JOIN ads a ON a.id = s.ad_id WHERE s.date >= to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date - 29, 'YYYY-MM-DD') GROUP BY s.ad_id, a.name ORDER BY impressoes DESC;"
docker compose exec -T pg-blogs psql -U postgres -d "$BLOG" -v ON_ERROR_STOP=1 -c "SELECT s.date AS dia, s.ad_id, CASE WHEN s.ad_id LIKE 'block:%' THEN '(bloco da home/lateral)' ELSE COALESCE(a.name, '(id sem linha em ads)') END AS nome, s.impressions AS impressoes, s.clicks AS cliques FROM ad_daily_stats s LEFT JOIN ads a ON a.id = s.ad_id WHERE s.date >= to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date - 29, 'YYYY-MM-DD') ORDER BY s.date DESC, s.impressions DESC;"
docker compose exec -T pg-blogs psql -U postgres -d "$BLOG" -v ON_ERROR_STOP=1 -c "SELECT (ts AT TIME ZONE 'America/Sao_Paulo')::date AS dia, count(*) AS pageviews, count(DISTINCT session_id) AS sessoes FROM analytics_events WHERE type = 'pageview' AND is_internal = false AND (ts AT TIME ZONE 'America/Sao_Paulo')::date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - 29 GROUP BY 1 ORDER BY 1;"
docker compose exec -T pg-blogs psql -U postgres -d "$BLOG" -v ON_ERROR_STOP=1 -c "WITH pv AS (SELECT (ts AT TIME ZONE 'America/Sao_Paulo')::date AS dia, count(*) AS pageviews FROM analytics_events WHERE type = 'pageview' AND is_internal = false AND (ts AT TIME ZONE 'America/Sao_Paulo')::date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - 29 GROUP BY 1), imp AS (SELECT date::date AS dia, sum(impressions) AS impressoes FROM ad_daily_stats WHERE date >= to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date - 29, 'YYYY-MM-DD') GROUP BY 1) SELECT COALESCE(pv.dia, imp.dia) AS dia, COALESCE(pv.pageviews, 0) AS pageviews, COALESCE(imp.impressoes, 0) AS impressoes, round(COALESCE(imp.impressoes, 0)::numeric / NULLIF(pv.pageviews, 0), 2) AS impressoes_por_pageview FROM pv FULL JOIN imp ON imp.dia = pv.dia ORDER BY 1;"
docker compose exec -T pg-blogs psql -U postgres -d "$BLOG" -v ON_ERROR_STOP=1 -c "SELECT ts, session_id, path, utm_source, utm_medium, utm_campaign, ref_host, is_internal, left(ua, 120) AS ua FROM analytics_events WHERE referrer = 'pago' AND ts >= now() - interval '30 days' ORDER BY ts DESC LIMIT 100;"
docker compose exec -T pg-blogs psql -U postgres -d "$BLOG" -v ON_ERROR_STOP=1 -c "SELECT COALESCE(utm_source, '(null)') AS utm_source, COALESCE(utm_medium, '(null)') AS utm_medium, COALESCE(utm_campaign, '(null)') AS utm_campaign, COALESCE(ref_host, '(null)') AS ref_host, count(*) AS eventos, count(DISTINCT session_id) AS sessoes FROM analytics_events WHERE referrer = 'pago' AND ts >= now() - interval '30 days' GROUP BY 1, 2, 3, 4 ORDER BY eventos DESC;"
docker compose exec -T pg-blogs psql -U postgres -d "$BLOG" -v ON_ERROR_STOP=1 -c "SELECT type, count(*) AS total, count(*) FILTER (WHERE is_internal) AS internos, count(*) FILTER (WHERE NOT is_internal) AS nao_internos, round(100.0 * count(*) FILTER (WHERE is_internal) / count(*), 1) AS pct_interno FROM analytics_events WHERE ts >= now() - interval '30 days' GROUP BY type ORDER BY total DESC;"
docker compose exec -T pg-blogs psql -U postgres -d "$BLOG" -v ON_ERROR_STOP=1 -c "SELECT event_type, count(*) AS total, count(DISTINCT session_id) AS sessoes, min(ts) AS primeiro, max(ts) AS ultimo FROM behavior_events GROUP BY 1 ORDER BY total DESC;"
docker compose exec -T pg-blogs psql -U postgres -d "$BLOG" -v ON_ERROR_STOP=1 -c "SELECT id, name, position, active, impressions AS impressoes_alltime, clicks AS cliques_alltime, target_devices, expires_at, created_at FROM ads ORDER BY impressions DESC;"
```

### Verificação das referências usadas pelo Anexo (regra da auditoria)

Todas as referências arquivo:linha de que estas SQLs dependem foram reabertas no
arquivo real nesta sessão:

| Referência | Status |
|---|---|
| `lib/db/src/schema/analytics.ts:10-46` (`analytics_events`: `type`, `session_id`, `ts`, `ua`, `referrer`, `utm_*` :30-32, `ref_host` :33, `is_internal` :36) | Confere |
| `lib/db/src/schema/ads.ts:13-27` (`ads.impressions/clicks` all-time) | Confere |
| `lib/db/src/schema/ad_daily_stats.ts:3-12` (`ad_id`, `date` texto YYYY-MM-DD, `impressions`, `clicks`) | Confere |
| `lib/db/src/schema/behavior_events.ts:3-15` (sem coluna de marcação interna) | Confere |
| `analyticsShared.ts:97` (`CHANNELS` inclui `"pago"`) e `:126` (regra pago: `paidClick` OU medium cpc/ppc/paid/display/cpm/banner/retargeting) | Confere |
| `routes/ads.ts:15` (`BLOCK_PREFIX="block:"`), `:31-34` (`todayStr` BRT UTC-3), `:36-50` (`upsertDailyStat`) | Confere. Divergência menor de faixa no inventário: citava `BLOCK_PREFIX :15-29`; o trecho real (`BLOCK_PREFIX`+`findAdBlock`+`todayStr`) ocupa `:15-34` |
| `routes/analytics.ts:239-243` (decisão `isInternal`), `:252-257` (sinais crus), `:259-265` (canal em `referrer` só no first-touch), `:78` (`isInternal` no `toRow`) | Confere. Divergência menor: inventário citava geo em `:279-282`; o `cachedGeo` está em `:278` (faixa real `:278-282`) — sem impacto nas SQLs |

**Hipóteses que dependem de dados reais** (MCP Supabase não conectado nesta sessão —
nada foi confirmado com dados): a composição real das impressões (quanto vem de
`block:*` vs anúncios clássicos), a origem das sessões "pago" (paidClick de
gclid/fbclid vs utm_medium) e a proporção interno/externo só serão conhecidas quando
os blocos acima rodarem na VPS.

---

## 8. Correções ao inventário (discrepâncias encontradas na verificação real)

União de TODAS as divergências reportadas pelos passes de verificação (deep-dives,
cético e os 6 grupos da checklist), consolidada e deduplicada. Nenhuma invalida a
estrutura do inventário; as materiais estão em negrito.

1. **Semântica do `upsertDailyStat` (inventário §4, `00-inventario.md:271`):** descrito
   como upsert com "(chave adId+date BRT)" — a chave NÃO é imposta por nenhuma
   constraint (`db/schema/ad_daily_stats.ts:9-12` usa `index()` comum;
   `0000_init.sql:293-322` não cria UNIQUE; `ensureSchema.ts` não toca na tabela;
   snapshot Drizzle `isUnique:false`). Semântica real: INSERT-sempre + UPDATE em todas
   as linhas do par (inflação ~quadrática — claim i). Histórico git: o índice nasceu
   não-único (commit `9e9d35d`) e nunca mudou.
2. **Doc histórico `auditoria_sistema_analytics.md:142`** ("upsert de ad_daily_stats
   correto") — CONTRADITO pelo código atual.
3. **`docs/ANALYTICS.md:87`** (dedup de impressão "1× por anúncio por sessão") — o
   mecanismo real é 1× por ABA (sessionStorage) e apenas client-side; o servidor aceita
   repetições até 60/min/IP.
4. **Caminho de `HomeCustomBlocks.tsx`:** o arquivo real é
   `web/components/blocks/HomeCustomBlocks.tsx` — o inventário (§1 e §3) o lista sem o
   subdiretório `blocks/` (leitura em `src/components/` falha). Todas as linhas citadas
   conferem no caminho real. Idem `PortalZoneBlocks.tsx` (fica em `blocks/`).
5. Off-by-one no §4 (is_internal): a cláusula `is_internal=false` da query de rejeição
   anterior está em `analytics.ts:448`, não `:449` (a `:449` é o filtro de ts).
6. §4 (Classificação): cobertura de `parseUtm` no teste é
   `analyticsClient.test.ts:5-17` (não 5-42; `:26-59` testam scroll/dwell);
   "First-touch (:259-265)" — código em `:261-265` (`:259-260` são comentário); a linha
   da gravação do canal na coluna `referrer` (`toRow`, `analytics.ts:68`) não estava
   anotada.
7. §4 (Dedup na agregação): chave de read é `sessionId|path ?? articleId`
   (`analyticsShared.ts:321` — fallback omitido; efeito nulo pois path é obrigatório);
   chave de scroll é `sessionId|articleId ?? path` (`:330` — fallback omitido, e é
   exatamente ele que abre a dupla contagem do item 18).
8. §4 (`EXISTS` de recorrentes, `analytics.ts:479-481`): o inventário nota a ausência
   de `is_internal`; falta também o filtro de `type` — base da ressalva do item 6.
9. §3: `trackArticle` — o useEffect ocupa `Artigo.tsx:155-160` (chamada na `:157`);
   inventário citava `:155-157`.
10. §6: o card "Top categorias" do Dashboard (`Dashboard.tsx:326-368`, via
    `getAnalyticsStats()` sem period → janela default 30d, `adminApi.ts:113-122`) não
    estava no mapa card→endpoint (só `Dashboard.tsx:374-403`).
11. §2 (lacunas preenchidas): handlers de `GET /api/admin/ads` = `admin.ts:979-982` e
    `GET /api/admin/ads/block-stats` = `admin.ts:989-1004`; implementação de
    `lookupGeoAsync`/`_geoCache` lida em `analytics.ts:151-203` (sem divergência com o
    que o inventário afirmava); `LGPDConsent.tsx` lido linha a linha (linhas dos claims
    conferem).
12. Cadeia sem consumidor: `realtime-stats.ts:46-53,:104` devolve `topCategoryViews`
    (via `store.trackCategoryView`, `store.ts:1034-1043`) mas nenhum componente do
    client a consome (grep zero) — complemento ao inventário.
13. `analyticsHealth.ts`: helpers ocupam `:29-52` (inventário: `:29-43`).
14. `Login.tsx`: `admin_token` é gravado em DOIS pontos do fluxo de login (`:70` senha
    e `:100` 2FA); o removeItem do logout fica em `Admin.tsx:23` (além do 401 em
    `adminApi.ts:27`). `adminApi.ts:90` tem `trackAdClick` sem guard — código morto.
15. Divergências triviais de 1-4 linhas (conteúdo confere): `useAds.ts`
    `isInternalTraffic` `:107-114` (inventário `:106-114`; `trackClick` `:116-119` /
    `trackImpression` `:121-124`); `BOT_RE` `trafficGuard.ts:14-15` (inventário `:14`);
    `_hits` Map na `trafficGuard.ts:24` (evidência de claim citava `:51-60`); iframe
    `HomeBlocksManager.tsx:3013-3016` com src na `:3014` (inventário `:3013-3014`);
    card top-3 abre em `Analytics.tsx:1144` (inventário `:1143-1192`);
    `BLOCK_PREFIX`+`todayStr` ocupam `ads.ts:15-34` (inventário `:15-29`); `cachedGeo`
    em `analytics.ts:278` (inventário `:279-282`); handler de impressão completo
    `ads.ts:184-220` (evidência de claim citava `:184-198`); teste de
    `SOCIAL_HOST_RE` na `analyticsShared.ts:132` (claim citava `:132-133`).
16. Nota de método: um resultado intermediário de Grep exibiu `adminApi.ts:120` como se
    a URL usasse barras invertidas — a releitura com Read confirmou a string correta
    `/api/analytics/stats?...`; artefato de exibição da ferramenta, não defeito.

---

## 9. VALIDAÇÃO COM DADOS REAIS — Anexo A executado em 2026-07-23

> **A lacuna declarada no cabeçalho está FECHADA para os pontos abaixo.** O operador
> rodou os 7 blocos do Anexo A na VPS (sp011 + ksports, esporteagora, resenhavip,
> oleysports, beeesportes). Os itens desta seção passam de **Hipótese** para
> **Confirmado com dados**. O que continua Hipótese está marcado.

### 9.1 Inflação do `upsertDailyStat` — CONFIRMADO COM DADOS (claim i)

O padrão previsto (`{N+1, N, …, 2}` linhas para o mesmo par) aparece literalmente.
sp011, `block:header-banner`, dia 2026-07-17 — 17 linhas do mesmo par:

```
18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2
```

Soma armazenada = 170; fórmula `(N²+3N)/2` com N=17 → **170 exato**. Idem 07-16 e
07-15 (`9..2`, soma 44, N=8) e 07-14 (`5..2`, soma 14, N=4).

**Validação definitiva do estimador de reparo (PRD 04 RF2)** — esporteagora é o único
blog com anúncio CLÁSSICO, que possui contador all-time independente e correto
(`ads.impressions`, +1 por chamada aceita):

| Fonte | Impressões | Cliques |
|---|---|---|
| `ad_daily_stats` (soma das linhas infladas) | **1052** | 3 |
| `ads.impressions/clicks` all-time (correto) | **65** | 1 |
| **Estimador `MAX−1` por par, somado dia a dia** | **65** ✅ | **1** ✅ |

Detalhe do cálculo (anúncio `bc744067-…`, "Start"): 07-23 max 24 → 23; 07-22 max 38 →
37; 07-17 max 2 → 1; 07-15 max 4 → 3; 07-13 max 2 → 1. Total **65 = all-time 65**.
O algoritmo de reparo do PRD 04 está validado contra produção ANTES de implementar.
Fator de inflação nesse anúncio: **16,2×**.

**Inflação por blog** (armazenado → real estimado, impressões): sp011 300 → ~49
(7,2× no header-banner) · ksports 1069 → ~150 · resenhavip 1801 → ~120 (caso extremo:
07-22 com **1377 armazenadas para 51 reais**, 27×) · oleysports 1253 → ~90 ·
esporteagora 1310 → ~90 · beeesportes 168 → ~60.

**Ressalva de leitura do A1:** a coluna `dias_com_registro` é `count(*)` — conta
LINHAS, não dias distintos (por causa das duplicatas). Os "38 dias" do header-banner
do sp011 são 38 linhas em 5 dias.

### 9.2 "Tráfego pago" — CONFIRMADO COM DADOS (claims c1, c2, c8, c9)

**ksports (A4)** — 110 sessões "pago", todas do Facebook, **sem nenhuma UTM**:

```
utm_source | utm_medium | utm_campaign | ref_host       | sessoes
(null)     | (null)     | (null)       | facebook.com   | 59
(null)     | (null)     | (null)       | m.facebook.com | 51
```

Como `utm_medium` é nulo (não casa a regex paga), por eliminação (c7) o único gatilho
possível é `paidClick` = `fbclid`. **Hipótese c9 → Confirmado com dados**: são cliques
ORGÂNICOS em posts do Facebook, classificados como pago.

**sp011 / oleysports / beeesportes** — agravante não previsto: as linhas "pago" trazem
`utm_source=ig`, `utm_medium=social`, `ref_host=l.instagram.com`. O próprio blog marca
o link como **social** (automação social da rede, CLAUDE.md §16) e o classificador
**sobrescreve para "pago"** por causa do `fbclid` que o Instagram anexa. É o claim c2
(precedência do pago sobre o social) na forma mais direta: nem a declaração explícita
do próprio sistema sobrevive à regra.

**c8 confirmado**: o sp011 tem exatamente **1 sessão "pago"** — coerente com os 33,3%
relatados (1 em 3 sessões classificadas).

**GATE DO PRD 05 LIBERADO**: nenhum tráfego Google Ads real no histórico (zero `gclid`
com `ref_host` google em qualquer blog). A premissa do remap total do legado (RF5)
está **validada** — pode implementar como escrito.

**AJUSTE NECESSÁRIO no PRD 05 RF5** (revelado pelos dados): a regra de remap manda
"sem `ref_host` → desconhecido", mas o oleysports tem linha `utm_medium=social` com
`ref_host` NULO — viraria "desconhecido" quando sabidamente é social. O remap do
legado deve consultar `utm_medium`/`utm_source` **antes** do fallback por host.

### 9.3 Assimetria de consentimento — FORTEMENTE SUSTENTADO (claim j)

Dias com impressões e **zero pageviews não-internos** (A3):

| Blog | Dia | Pageviews | Impressões (armazenadas → reais) |
|---|---|---|---|
| sp011 | 2026-07-17 | **0** | 177 → ~20 |
| esporteagora | 2026-07-23 | **0** | 299 → ~23 |
| oleysports | 2026-07-21 | **0** | 28 → ~11 |
| resenhavip | 2026-07-10 | **0** | 23 → ~10 |

Mesmo descontada a inflação, sobram dezenas de impressões REAIS em dias sem nenhum
pageview público. Impressão exige humano com a página aberta ≥1s: ou é visitante que
não aceitou o banner LGPD (impressão conta, pageview não — claim j), ou bot com JS que
renderiza e não aceita consentimento (claim d). **Qual dos dois predomina permanece
Hipótese** — `ad_daily_stats` não guarda sessão/IP/UA (limitação definitiva do §2.3).

### 9.4 Marcação interna (item 25) — CONFIRMADO FUNCIONANDO

A5, % de eventos internos: sp011 pageview 9,8% / read 40,4% · ksports 37,9% / 70,5% ·
resenhavip 81,8% / 85,0% · oleysports 84,0% / 77,0% · beeesportes 57,1% / 54,4%.
A detecção está pegando o tráfego do operador. Nenhum bug. (Categoria 100% interna em
ksports/oleysports: só o admin navega por categorias — coerente com volume baixo.)

### 9.5 Achado NOVO dos dados — `behavior_events` praticamente vazia em toda a rede

A6: sp011 = 1 evento (`search`, de 2026-06-30). ksports, esporteagora, resenhavip,
oleysports, beeesportes = **0 linhas**. Nenhum `link_click`, nenhum `newsletter`,
jamais, em nenhum blog — com ~2.000 pageviews de rede no período.

Zero clique externo em todo o histórico é sinal de que a instrumentação pode não estar
disparando (item 23 já era Parcial por cobrir só o corpo do artigo — `Artigo.tsx:
281-285,408-413`). **Rótulo: Hipótese** — pode ser apenas baixo engajamento real
(volume baixo não é bug). Verificação pertence ao **PRD 02** (teste manual de clique em
link externo dentro de artigo + conferência da linha em `behavior_events`).

### 9.6 Violações da regra R1 já presentes nos dados brutos (PRD 11)

Pares com `clicks > impressions` no dado atual: esporteagora 07-17
(`Start`: linhas `2 imp/1 clk` e `0 imp/2 clk` → soma 2 imp, 3 clk) e ksports 07-22
(`block:html-ksports-ad-box`: `2/1` e `0/2`). Desaparecem após o reparo do PRD 04
(MAX−1 devolve 1 imp / 1 clk), mas provam que a regra `clicks ≤ impressions` do PRD 11
detecta inconsistência real — não é regra teórica.

### 9.7 O que CONTINUA sem resposta (mesmo com os dados)

- **Autoria das impressões** (operador sem `admin_token` vs bot-JS vs visitante sem
  consentimento): indeterminável em definitivo — `ad_daily_stats` não guarda sessão,
  IP, UA nem timestamp por evento (§2.3). Só o PRD 04 (dimensão interna + dedup por
  sessão) torna isso observável daqui para frente.
- **Se existe UNIQUE criada manualmente em produção** fora do repo: não consultado
  (`\d ad_daily_stats` / `pg_indexes`) — mas os pares duplicados provam que NÃO existe
  em nenhum dos 6 bancos verificados.
- **`settings.internalIps`** cobre os dispositivos do operador: não consultado.
