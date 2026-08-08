# PRD 05 — Fontes de tráfego e classificação de canal (CRÍTICO)

> **Auditoria de precisão do Analytics — rede sp011 · Fase 1.** Documento
> autocontido: foi escrito para ser executado pelo Claude Code numa sessão futura
> SEM o contexto da auditoria — todas as evidências `arquivo:linha` citadas foram
> verificadas no código real em 2026-07-23 e estão reproduzidas aqui. Fontes:
> `analytics-audit/00-auditoria-estado-atual.md` (§3 — Problema 2),
> `analytics-audit/00-inventario.md` (§4 — Classificação de canal),
> `PRD_ANALYTICS_PLANEJAMENTO_v2.md` (módulo 05), `docs/ANALYTICS.md`.
>
> **DADOS REAIS (2026-07-23):** o **Anexo A da auditoria FOI EXECUTADO** (§9.2/§9.3 de
> `00-auditoria-estado-atual.md`). A causa do falso "pago" deixou de ser Hipótese e é
> **Confirmado com dados**: o ksports tem **110 sessões "pago" vindas de
> facebook.com/m.facebook.com SEM nenhuma UTM** — só o `fbclid` pode tê-las
> classificado; e sp011/oleysports/beeesportes têm sessões com `utm_medium=social`
> (marcado pela automação da rede) **sobrescritas para "pago"** pelo fbclid. Dois
> reflexos no PRD: **(1) GATE LIBERADO** — zero Google Ads real no histórico, o remap
> total do legado (RF-5) é seguro; **(2) ajuste no RF-5** — o remap consulta
> `utm_medium`/`utm_source` ANTES do host (há linha social com `ref_host` nulo).
>
> **Princípio obrigatório:** volume baixo NÃO é bug — os blogs são novos. Bug é o
> que for logicamente incorreto ou inconsistente, independente do volume. Este PRD
> não existe para "os números subirem": existe para "Tráfego pago" só aparecer
> quando existe tráfego pago.
>
> **Encurtamentos de caminho** (mesmos da auditoria):
> `api = artifacts/api-server/src` · `web = artifacts/brasilia-agora/src` ·
> `db = lib/db/src`.

---

## Objetivo

Fazer o canal **"pago"** do card Fontes de Tráfego refletir a realidade em todos
os blogs da rede:

1. **Regra nova de classificação**: "pago" passa a EXIGIR campanha ativa
   cadastrada no blog cujos identificadores casem com os sinais da visita.
   `fbclid`/`gclid` sozinhos (sem campanha) classificam pelo host do referrer
   (social/busca/referência) — nunca "pago".
2. **Cadastro leve de campanhas por blog** (settings + UI mínima no admin), para
   amarrar a decisão de "pago" a algo que o operador controla.
3. **Estratégia para as linhas históricas** já gravadas com `referrer='pago'`:
   remap SÓ na agregação (precedente `normalizeLegacyChannel`) — **nenhuma linha
   é reescrita no banco**.
4. **Teste de regressão obrigatório**: tráfego sintético sem campanha cadastrada
   NUNCA é classificado como pago, para qualquer combinação de sinais.
5. **Validação pós-rollout** nos demais blogs da rede onde o sintoma aparece
   (mesma imagem = mesmo bug = mesma correção).

## Contexto / estado atual (referenciar achados da auditoria e docs/ANALYTICS.md)

### A cadeia atual, ponta a ponta (Confirmado no código pela auditoria §3.1)

1. **Client** — `parseUtm` (`web/lib/analyticsClient.ts:16-34`) deriva
   **`paidClick = p.has("gclid") || p.has("fbclid")`** (`:23`) — mera PRESENÇA do
   parâmetro, até com valor vazio; o valor do id nunca sai do navegador
   (comentário `:12`). `captureUtmOnce` guarda 1×/aba em `sessionStorage bee_utm`
   (`web/hooks/useAnalytics.ts:66-71`); `takeFirstTouch` (`:80-99`) anexa
   `refHost`, `utm_*` e `paidClick` (`:92-95`) SÓ ao primeiro pageview da sessão;
   `markReferrerDone` (`:101-103`) impede reenvio (consumo em `sendPageview`
   `:130-134`).
2. **Servidor (ingest)** — `POST /api/analytics/event`
   (`api/routes/analytics.ts:206`): **`paidClick = b["paidClick"] === true`**
   (`:256` — confiança direta no booleano do body, sem verificação cruzada);
   `firstTouch` por flag ou presença de qualquer sinal (`:261-262` — paidClick
   sozinho basta); `referrer = classifyChannel({...})` (`:263-265`; interno vira
   `"interno"`).
3. **Classificador** — `classifyChannel` (`api/lib/analyticsShared.ts:121-141`),
   único produtor do valor `"pago"` no api-server. A PRIMEIRA regra (`:126`):
   `if (sig.paidClick || /^(cpc|ppc|paid|display|cpm|banner|retargeting)$/.test(medium)) return "pago";`
   — precedência MÁXIMA, antes de email (`:127`), social/busca por medium
   (`:128-129`) e hosts (`:130-134`). `SOCIAL_HOST_RE` (`:102-103`) inclui
   facebook.com/instagram.com — portanto **fbclid de clique orgânico do Facebook
   vence "social"**. O teste do repo documenta o comportamento:
   `api/test/analyticsShared.channel.test.ts:5-9` ("gclid/fbclid ou utm_medium
   pago vencem qualquer outro sinal").
4. **Gravação** — `toRow` grava o CANAL CLASSIFICADO na coluna
   `analytics_events.referrer` (`api/routes/analytics.ts:68`); `paidClick` NÃO é
   persistido (sem coluna — `db/schema/analytics.ts:10-46`) e o `path` gravado
   não carrega query string → forense retroativa limitada (auditoria c7).
5. **Leitura** — `/stats` projeta `referrer`/`refHost`/`utmCampaign`
   (`analytics.ts:400,403-404`) com `is_internal=false` (`:405-409`);
   `buildWindowAggregates` (`analyticsShared.ts:264-343`) incrementa o canal do
   pageview de entrada via `normalizeLegacyChannel` (`:143-147` — comentário
   literal: "Remap SÓ na agregação — linhas históricas nunca são reescritas no
   banco"; uso em `:298-301`; `channelMap` zero-init com `pago:0` em `:271-273`)
   → `referrerChart` (`analytics.ts:739`).
6. **UI** — `Analytics.tsx`: `referrers = referrerChart.filter(r.value>0)`
   (`:345`), `totalRef` (`:347`), card Fontes de Tráfego (`:586-653`) com
   `pct = value/totalRef` (`:602` na auditoria; render do rótulo em `:608` via
   `REFERRER_TKEYS` (`Analytics.tsx:97-105`, chave `pago:"an.refPago"` em `:103`
   → `web/lib/adminI18n.ts:200` "Tráfego pago").

**Logo:** 1 única sessão entrando com fbclid (ex.: clique orgânico em post do
próprio blog no Facebook) grava 1 linha `pago` permanente; com 3 sessões
classificadas na janela, o card exibe 33,3% de "Tráfego pago" (auditoria c8 — o
33,3% é aritmética sobre pouquíssimas sessões, não volume).

### Achados da auditoria que este PRD resolve (rótulos da auditoria §3.2)

| Claim | Resumo | Evidência |
|---|---|---|
| c1 | paidClick por mera PRESENÇA de gclid/fbclid | `analyticsClient.ts:23` |
| c2 | "pago" vence "social" (precedência máxima) | `analyticsShared.ts:126` antes de `:132` |
| c3 | Regex de `utm_medium` dispara "pago" sem campanha existir | `analyticsShared.ts:126` |
| c4 | NENHUM cadastro/validação de campanha existe no sistema | ausência confirmada por grep repo-wide (auditoria §3.2-c4); `ChannelSignals` só tem sinais de URL/referrer (`analyticsShared.ts:107-113`) |
| c5 | Canal persistido para sempre na coluna `referrer`; correção só vale para ingests futuros | `analytics.ts:68`; `analyticsShared.ts:143-147` |
| c6 | Servidor confia cegamente no booleano do body | `analytics.ts:256` |
| c7 | paidClick não persistido → não dá para distinguir gclid de fbclid no legado | sem coluna em `db/schema/analytics.ts:10-46` |
| c9 (**Confirmado com dados** — §9.2) | Origem do "pago" em produção: fbclid de cliques ORGÂNICOS do Meta vindos da automação social da própria rede (CLAUDE.md §16) — mesmo código + mesma divulgação = mesmo sintoma em todos os blogs. **Medido**: 110 sessões `pago` do ksports vindas de facebook.com SEM UTM; `utm_medium=social` sobrescrito para `pago` em sp011/oleysports/beeesportes | validado pelo Anexo A4 (executado 2026-07-23) |

Nota da auditoria (§3.3): este comportamento NÃO está entre as 8 limitações
admitidas de `docs/ANALYTICS.md:114-135` — é regressão de expectativa, não
decisão registrada. A auditoria também anota que "gclid ⇒ pago está correto"
enquanto semântica do parâmetro (exclusivo de Google Ads); ainda assim, a regra
deste PRD (mandato do doc v2 e do PRD 11: `paid > 0% exige campanha/UTM ativa
cadastrada`) faz gclid órfão NÃO virar pago — ver decisão D2 abaixo.

### Estado do cadastro hoje

Não existe. Nenhum schema em `db/schema/` representa campanhas; a tabela `ads` é
inventário de banners internos e `api/routes/ads.ts` tem zero ligação com
classificação de canal (auditoria c4).

### Precedentes no código que este PRD reusa

- **Campo de settings com redação no payload público**: `internalIps`
  (`api/lib/store.ts:186-189` na interface `SiteSettings`; `delete
  settings.internalIps` em `api/routes/site.ts:26`; UI em
  `web/pages/admin/Settings.tsx:604-610`; i18n `web/lib/adminI18n.ts:366-369`
  pt-BR e `:1194-1197` EN; tipagem do admin em `web/lib/adminApi.ts:325`).
- **Memoização de settings sem restart**: `internalIpSet()`
  (`api/routes/analytics.ts:140-149`) — recomputa quando o valor cru muda; o
  sync periódico de settings do store atualiza sem reboot.
- **Remap só na agregação**: `normalizeLegacyChannel`
  (`api/lib/analyticsShared.ts:143-147`) — precedente sancionado pela invariante
  §17 para reinterpretar histórico sem UPDATE.
- **Constante de corte temporal**: `ANALYTICS_V2_SINCE = "2026-07-08"`
  (`analyticsShared.ts:21`).
- **Colunas novas no boot**: bloco "Analytics rodada 2" do
  `api/lib/ensureSchema.ts:49-57` (`ADD COLUMN IF NOT EXISTS`).

## Problema a resolver

O card Fontes de Tráfego exibe "Tráfego pago" (ex.: 33,3% no sp011) **sem
existir qualquer campanha paga**, em vários blogs da rede. É dado logicamente
incorreto (não é questão de volume): a classe "pago" é atribuída pela mera
presença de `gclid`/`fbclid` na URL (c1) com precedência sobre "social" (c2),
sem nenhum conceito de campanha no sistema (c4), a partir de um booleano do body
em que o servidor confia sem validar (c6), e o rótulo errado fica **permanente**
na coluna `referrer` (c5). Como os 8 blogs rodam a mesma imagem
(`blog-api:vN`/`blog-web:vN`, CLAUDE.md §6), o sintoma é da rede inteira e a
correção também.

Consequências práticas: o operador acredita ter tráfego pago que não comprou; o
canal "social" é SUBnotificado exatamente onde a rede mais investe (automação
social do §16 do CLAUDE.md); qualquer análise de aquisição fica inutilizável.

## Requisitos funcionais

### RF-1 — Cadastro leve de campanhas pagas por blog (settings)

Novo campo `paidCampaigns` em `SiteSettings` (`api/lib/store.ts` — mesma
interface do `internalIps:186-189`), array de:

```ts
/** Campanha de tráfego pago cadastrada pelo operador (settings, por blog). */
export interface PaidCampaign {
  id: string;             // gerado no admin (crypto.randomUUID())
  name: string;           // rótulo livre para o operador
  active: boolean;        // desativar encerra a classificação, sem apagar histórico
  utmCampaign?: string;   // casa com lower(trim(utm_campaign)) da visita
  utmSource?: string;     // casam JUNTOS (par) com utm_source + utm_medium
  utmMedium?: string;
  acceptGclid?: boolean;  // true = cliques com gclid pertencem a esta campanha (Google Ads)
  acceptFbclid?: boolean; // true = cliques com fbclid pertencem a esta campanha (Meta Ads)
  startDay?: string;      // "YYYY-MM-DD" (dia BRT, inclusivo) — opcional
  endDay?: string;        // "YYYY-MM-DD" (dia BRT, inclusivo) — opcional
}
```

Regras do matcher (função pura em `api/lib/analyticsShared.ts` — arquivo com
contrato "zero imports", header `:1-7`):

- Campanha só participa se `active === true` e o dia BRT corrente
  (`brtDayKey`, `analyticsShared.ts:14`) estiver dentro de
  `[startDay, endDay]` (extremos inclusivos; ausentes = sem limite).
- Uma campanha CASA a visita se QUALQUER um dos seus identificadores definidos
  casar: (a) `utmCampaign` igual (comparação sobre `lower(trim(...))` dos dois
  lados); (b) `utmSource` E `utmMedium` definidos na campanha e ambos iguais aos
  da visita; (c) `acceptGclid` e sinal `gclid` presente; (d) `acceptFbclid` e
  sinal `fbclid` presente.
- **Campanha sem NENHUM identificador definido nunca casa nada** (proteção
  contra "campanha vazia" classificar tudo como pago).

### RF-2 — Nova regra de classificação (servidor, `classifyChannel`)

`classifyChannel` ganha segundo parâmetro `campaigns: PaidCampaign[] = []`
(vazio = comportamento sem campanha). Nova ordem de decisão (substitui
`analyticsShared.ts:126-140`):

1. **pago** ⇔ alguma campanha ativa casa os sinais (RF-1). É a ÚNICA porta de
   entrada do "pago". A regex de `utm_medium`
   (`^(cpc|ppc|paid|display|cpm|banner|retargeting)$`) e a presença de
   click-id **deixam de ser gatilhos autônomos**.
2. email — inalterado (`:127`).
3. medium `social|sm` → social; `organic|search` → busca — inalterado
   (`:128-129`).
4. host — inalterado (`:130-134`): busca / social / referência.
5. **NOVO (R5)** — click-id sem campanha e sem host: `fbclid` → `"social"`
   (fbclid só existe vindo de superfícies Meta — determinístico e documentado);
   `gclid` → `"busca"` (idem, superfícies Google). Só é alcançada quando não há
   `refHost` (in-app browsers do Meta frequentemente não mandam referrer —
   auditoria c7).
6. `medium || source ||` paidClick legado (booleano fundido de bundle antigo,
   sem plataforma identificável) → `"desconhecido"` (extensão da `:135`).
7. canal legado / direto — inalterado (`:137-140`).

O client passa a enviar os sinais crus **separados**: `parseUtm`
(`web/lib/analyticsClient.ts:16-34`) adiciona `gclid: p.has("gclid")` e
`fbclid: p.has("fbclid")` ao `UtmSignals`, mantendo `paidClick` por
retrocompatibilidade (bundles em cache); `takeFirstTouch`
(`useAnalytics.ts:80-99`) anexa `gclid`/`fbclid` como anexa `paidClick` hoje
(`:92-95`). O servidor lê `b["gclid"] === true` / `b["fbclid"] === true` com a
mesma disciplina estrita da `:256` e estende `ChannelSignals`
(`analyticsShared.ts:107-113`) com `utmCampaign?: string; gclid?: boolean;
fbclid?: boolean`. **O `utmCampaign` já é parseado no ingest
(`analytics.ts:254`) mas hoje NÃO é repassado ao classificador — o matcher
RF-1(a) (casar por `utm_campaign`) depende dele, então precisa entrar tanto no
`ChannelSignals` quanto na chamada da RF-3.** A janela de datas da campanha
(RF-1) é avaliada contra um `todayKey` BRT que o INGEST calcula e passa como 3º
argumento à `classifyChannel` (ver RF-3): `matchesPaidCampaign`/`classifyChannel`
permanecem funções puras/determinísticas — nenhum `Date.now()` roda dentro
delas, o que mantém os testes injetáveis. A condição de `firstTouch`
(`analytics.ts:261-262`) passa a incluir os dois sinais novos. **Quem classifica
continua sendo só o servidor** (invariante §17).

### RF-3 — Ingest usa campanhas das settings, com memoização

`api/routes/analytics.ts` ganha `activePaidCampaigns()` no padrão exato do
`internalIpSet()` (`:140-149`): lê `store.getSettings().paidCampaigns`,
memoiza por referência/valor cru e reconstrói quando as settings mudarem (o sync
periódico do store propaga sem restart). Como a memoização é por VALOR (igual ao
`internalIpSet`), a janela de datas NÃO pode ser filtrada aqui (ficaria congelada
até a próxima mudança de settings): `activePaidCampaigns()` devolve as campanhas
`active:true` e a decisão de data fica na `matchesPaidCampaign`, avaliada a cada
ingest com o `todayKey` do momento. A chamada em `:264` vira
`classifyChannel({ utmSource, utmMedium, utmCampaign, paidClick, gclid, fbclid,
refHost, legacyChannel }, activePaidCampaigns(), brtDayKey(Date.now()))` — o
`utmCampaign` (parseado em `:254`) passa a ser repassado e o 3º argumento
(`todayKey` BRT) alimenta a janela de datas das campanhas (RF-1).

### RF-4 — Persistência dos sinais crus `gclid`/`fbclid`

Duas colunas novas em `analytics_events` (ver Modelo de dados): gravadas
`true`/`false` **apenas na linha first-touch** (como `referrer` hoje —
`analytics.ts:68,263-265`); `NULL` nas demais linhas e em todo o histórico
anterior à regra. Elimina para o futuro a limitação forense do c7 e habilita as
checagens contínuas do PRD 11/08 ("linha pago sem campanha correspondente").
O VALOR dos ids continua nunca saindo do navegador (só booleanos de presença —
mantém `analyticsClient.ts:12`).

### RF-5 — Linhas históricas: remap SÓ na agregação (nunca UPDATE)

Nova constante `PAID_RULE_SINCE = "<YYYY-MM-DD>"` em
`api/lib/analyticsShared.ts` (ao lado de `ANALYTICS_V2_SINCE`, `:21`) — **definir
com a data do dia do rollout no commit; se o rollout atrasar para outro dia,
atualizar a constante ANTES do build** (linhas gravadas pela regra antiga depois
do corte seriam indevidamente confiadas).

Nova função pura `resolveStoredChannel(referrer, tsMs, refHost, utmMedium, utmSource)`
usada por `buildWindowAggregates` no lugar da chamada direta a `normalizeLegacyChannel`
(`analyticsShared.ts:298-301`). ⚠️ **A assinatura recebe `utmMedium`/`utmSource`
persistidos** — projetar as duas colunas no `EventLike` da agregação junto do `refHost`
(hoje `analytics.ts:403` projeta o host; adicionar `utm_medium`/`utm_source` na mesma
seleção). O motivo está na regra do legado abaixo (revelado pelos dados — §9.2).

- canal ≠ `"pago"` → delega a `normalizeLegacyChannel` (comportamento atual,
  incluindo `outro → referencia` e exclusão de `interno` na `:300`).
- canal `"pago"` com `tsMs >= brtDayStartMs(PAID_RULE_SINCE)` → mantém `"pago"`
  (linha nova, já validada por campanha no ingest).
- canal `"pago"` com `tsMs < brtDayStartMs(PAID_RULE_SINCE)` (legado) → remap para
  **"o que a classificação não-paga devolveria com estes sinais persistidos"**, na
  ordem (⚠️ **UTM ANTES do host** — 2026-07-23, §9.2):
  1. `lower(trim(utmMedium))` casa social (`social`, `facebook`, `instagram`, …) OU
     `utmSource` é rede social conhecida → `social`;
  2. `utmMedium`/`utmSource` indica e-mail/newsletter → `email`;
  3. senão, **fallback por host** (`ref_host`, já projetado — `analytics.ts:403`; uso
     em `analyticsShared.ts:302`): host de e-mail → `email`; `SEARCH_HOST_RE` →
     `busca`; `SOCIAL_HOST_RE` → `social`; outro host → `referencia`;
  4. sem UTM útil E sem host → `desconhecido` (não dá para distinguir gclid de fbclid
     no legado — c7; nunca inventar valor).

  **Por que UTM antes do host (dado real, §9.2)**: o oleysports tem linha `pago` legada
  com `utm_medium=social` e `ref_host` **NULO** — marcada pela própria automação social
  da rede. A regra antiga (só host) a mandaria para `desconhecido`, apagando um canal
  sabidamente `social`. Consultar `utmMedium`/`utmSource` primeiro recupera o `social`;
  o host vira fallback para quando não há UTM.

**GATE DO PRD 05 LIBERADO (§9.2 da auditoria).** O Anexo A4 FOI executado em 2026-07-23:
**zero tráfego Google Ads real no histórico** (nenhuma linha com gclid + `ref_host`
google; as sessões `pago` do ksports vêm de facebook.com sem UTM — só o fbclid as
classificou). Logo o remap TOTAL do legado é seguro e está **validado com dados** — não
é mais premissa pendente. (A ressalva antiga — "se o A4 revelar Google Ads real, manter
`pago` para linha legada com `utm_medium` pago E `utm_campaign` não-nulo" — fica
registrada apenas como contingência caso algum blog futuro apresente esse padrão; não se
aplica ao histórico atual.)

**Proibido por invariante §17**: qualquer `UPDATE` em `analytics_events`. O
mecanismo é 100% de leitura, como o precedente `normalizeLegacyChannel`
("linhas históricas nunca são reescritas no banco", `analyticsShared.ts:143`).

### RF-6 — UI mínima do cadastro (admin → Configurações)

No mesmo card/aba do `internalIps` (`web/pages/admin/Settings.tsx:604-610`),
novo bloco "Campanhas de tráfego pago (Analytics)":

- Lista de campanhas; cada linha: nome, `utm_campaign`, `utm_source`,
  `utm_medium`, checkboxes "Aceitar cliques do Google Ads (gclid)" e "Aceitar
  cliques do Meta Ads (fbclid)", datas início/fim (opcionais), toggle Ativa,
  botão remover. Botão "+ Nova campanha".
- Aviso inline quando a campanha não tem nenhum identificador ("esta campanha
  não classifica nada").
- Texto de ajuda: "Sem campanha cadastrada, nenhuma visita é classificada como
  Tráfego pago. Desativar uma campanha encerra novas classificações; o
  histórico já classificado permanece."
- Persistência pelo fluxo de settings existente (`setField` + salvar do
  `Settings.tsx`; tipagem em `web/lib/adminApi.ts` junto do `internalIps:325`).
- i18n: chaves novas `cfg.paidCampaigns*` nos DOIS blocos do
  `web/lib/adminI18n.ts` (pt-BR `:366-369` como vizinhança; EN `:1194-1197`).
- Sem tela nova, sem rota nova, sem redesign (fronteira com PRD 10).

### RF-7 — Redação no payload público

`GET /api/site` NÃO expõe `paidCampaigns`: `delete settings.paidCampaigns;` em
`api/routes/site.ts` ao lado do `delete settings.internalIps;` (`site.ts:26`).
Campanha é configuração interna do blog.

### RF-8 — Documentação

Atualizar `docs/ANALYTICS.md`: dicionário do canal "pago" (nova regra), o
cadastro de campanhas, a semântica de `PAID_RULE_SINCE` e o remap do legado —
a auditoria registrou que o comportamento antigo não constava das limitações
admitidas (`docs/ANALYTICS.md:114-135`).

## Requisitos não-funcionais (performance, LGPD, confiabilidade, multi-blog)

- **Performance**: o matcher roda no máximo 1×/sessão (só first-touch —
  `analytics.ts:261-265`) sobre um array pequeno (memoizado, RF-3); custo
  O(nº campanhas). `resolveStoredChannel` adiciona comparações O(1) por pageview
  na agregação (regex já existentes). Nenhuma query nova no `/stats`.
- **LGPD**: nenhum dado pessoal novo. `gclid`/`fbclid` persistidos como
  **booleanos de presença**, nunca o valor do id (o client já não envia o valor
  — `analyticsClient.ts:12`). O cadastro de campanhas não contém dado pessoal.
  Gate de consentimento do SDK intocado (`useAnalytics.ts:106-107`).
- **Confiabilidade**: reduz a superfície do c6 — um POST forjado com
  `gclid:true`/`paidClick:true` deixa de produzir "pago" sem campanha ativa
  casando (a validação genérica do ingest continua sendo fronteira do PRD 03).
  Settings ilegíveis/malformadas (`paidCampaigns` não-array, item sem `id`)
  degradam para "sem campanhas" — nunca lançar no caminho do ingest.
- **Multi-blog**: mesma imagem para os 8 blogs (sp011, ksports, esporteagora,
  resenhavip, oleysports, beeesportes, pontofarma, creditovc) — a correção nasce
  multi-blog por construção; o CADASTRO é por blog (settings no banco de cada
  blog). PROIBIDO condicionar qualquer comportamento a BLOG_ID na imagem
  compartilhada (CLAUDE.md §13/§17). Blogs sem campanha (estado inicial de
  todos) simplesmente nunca exibem "pago".
- **Limitações Windows (CLAUDE.md §14)**: typecheck por pacote (o filtro da raiz
  não casa no Windows); `vite build` do frontend só no Docker da VPS; testes com
  `node --test` (não vitest); NUNCA usar caracteres unicode literais em regex
  (usar `\uXXXX` — as regexes deste PRD são ASCII); scripts node com
  dollar-quote sempre via arquivo (PowerShell expande `$...$`).

## Modelo de dados (colunas novas via schema Drizzle + ensureSchema.ts)

**Colunas novas — SEMPRE nos DOIS lugares (CLAUDE.md §17: o deploy NÃO roda
`drizzle-kit push`; blogs criam coluna no boot via `ensureSchema`).**

1. `analytics_events.gclid boolean NULL` e `analytics_events.fbclid boolean
   NULL`:
   - **Drizzle** — `db/schema/analytics.ts`, junto dos sinais crus existentes
     (`utmSource/utmMedium/utmCampaign/refHost`, `:30-33`):
     ```ts
     // Presença de click-id na URL de entrada (só o booleano; o valor do id
     // nunca sai do navegador). NULL = anterior à regra / linha não-first-touch.
     gclid:  boolean("gclid"),
     fbclid: boolean("fbclid"),
     ```
   - **ensureSchema** — `api/lib/ensureSchema.ts`, no bloco de analytics
     (`:49-57`):
     ```ts
     sql`ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS gclid boolean`,
     sql`ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS fbclid boolean`,
     ```
   - Semântica: `NULL` = linha anterior à regra OU não-first-touch; `true/false`
     = coletado na linha first-touch pós-regra. Sem índice (não filtramos por
     elas em caminho quente).
   - `lib/db` é TypeScript composite: depois de mexer no schema, rodar
     `pnpm exec tsc -b` dentro de `lib/db` antes de typecheckar o api-server
     (CLAUDE.md §2/§14).
2. `paidCampaigns` é campo do JSON de `site_settings` (tabela `settings`
   key-value existente) — **nenhuma coluna nem tabela nova** para o cadastro;
   segue o padrão `internalIps` (`store.ts:186-189`).
3. **Fronteira (STATUS.md)**: o padrão de migração Drizzle+ensureSchema é
   definido no **PRD 01**. Se o PRD 01 consolidar convenções diferentes (nomes,
   posição no arquivo, catálogo de eventos), este PRD adere a elas; a decisão
   "settings, não tabela" para campanhas permanece deste PRD.
4. Sem mudança em `toRow` além dos dois campos novos (`analytics.ts:56-82`);
   interface `AnalyticsEvent` do route (`analytics.ts:22-49`) e `EventLike` da
   agregação ganham os campos opcionais.

## Contrato de API (endpoints, payloads)

Nenhum endpoint novo. Mudanças aditivas:

| Endpoint | Mudança |
|---|---|
| `POST /api/analytics/event` (`analytics.ts:206`) | Body aceita `gclid?: boolean` e `fbclid?: boolean` (lidos com `=== true`, como `paidClick` na `:256`). `paidClick` continua aceito (legado, bundles em cache). Resposta inalterada (`{ok:true}`). |
| `GET /api/analytics/stats` (`analytics.ts:366`) | **Shape inalterado** — `referrerChart` (`:739`), `topRefHosts` (`:740`), `topCampaigns` (`:741`) mantêm formato. Só os VALORES de `referrerChart` mudam (regra nova + remap do legado). Nenhum consumidor de UI precisa mudar. |
| `GET /api/site` (`site.ts:21-47`) | `paidCampaigns` **redigido** (delete), como `internalIps` (`:26`). |
| Settings do admin (fluxo existente de get/update settings; tipagem `adminApi.ts:325`) | Payload ganha `paidCampaigns?: PaidCampaign[]`. Sem endpoint novo. |

Assinaturas internas (não-HTTP):

```ts
// api/lib/analyticsShared.ts (funções puras, zero imports)
export interface PaidCampaign { /* RF-1 */ }
export function matchesPaidCampaign(sig: ChannelSignals, c: PaidCampaign, todayKey: string): boolean;
// todayKey (dia BRT) alimenta a janela de datas da campanha; o ingest passa
// brtDayKey(Date.now()), os testes injetam um valor fixo (determinismo).
export function classifyChannel(sig: ChannelSignals, campaigns?: PaidCampaign[], todayKey?: string): Channel; // defaults: [] e brtDayKey(Date.now())
export function resolveStoredChannel(referrer: string, tsMs: number, refHost?: string): Channel;
export const PAID_RULE_SINCE = "<YYYY-MM-DD do rollout>";
// ChannelSignals += { utmCampaign?: string; gclid?: boolean; fbclid?: boolean }
```

## Comandos de verificação (rodar exatamente estes, com resultado esperado)

### Local (Windows — CLAUDE.md §14: por pacote, sem vite build)

```powershell
cd "c:\Users\Usuario(a) Master\sp011\lib\db"
pnpm exec tsc -b
# esperado: compila sem erro (schema novo)

cd "c:\Users\Usuario(a) Master\sp011\artifacts\api-server"
pnpm run typecheck
# esperado: sem erros
pnpm run test
# esperado: TODOS os testes passam, incluindo os novos de canal/campanha/remap
# (script: node --test "test/**/*.test.ts" — package.json:11)

cd "c:\Users\Usuario(a) Master\sp011\artifacts\brasilia-agora"
pnpm run typecheck
# esperado: sem erros (parseUtm/takeFirstTouch/Settings tipados)
```

```powershell
cd "c:\Users\Usuario(a) Master\sp011"
git grep -n "update(analyticsEventsTable" -- artifacts/api-server
# esperado: NENHUM resultado (nenhum UPDATE em analytics_events — invariante §17)
```

### Rollout multi-blog (CLAUDE.md §6 — bump + build + sp011 + canário + demais)

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
# 2) Canário (resenhavip) — conferir o site e os cards ANTES de seguir
N=$(grep -m1 '^BLOG_IMAGE_VERSION=' /opt/sp011/.env | cut -d= -f2)
cd /opt/blogs/resenhavip
sed -i "s|^BLOG_IMAGE_TAG=.*|BLOG_IMAGE_TAG=$N|" .env
docker compose up -d
curl -s https://resenhavip.midia.run/api/site | grep -o '"siteName":"[^"]*"'
# esperado: "siteName":"Resenha VIP" (nome do próprio blog — sem mistura)
curl -s https://resenhavip.midia.run/api/site | grep -c paidCampaigns
# esperado: 0 (campo redigido do payload público)
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
for d in ksports.bebee.me esporteagora.midia.run oleysports.midia.run beeesportes.midia.run; do
  curl -s "https://$d/api/site" | grep -o '"siteName":"[^"]*"'
done
# esperado: cada domínio devolve o próprio nome
```

### Validação com dados (VPS) — **pendente de execução** (MCP Supabase não conectado)

```bash
# 4) Colunas novas criadas no boot (blog replicado; trocar BLOG)
BLOG='resenhavip'
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d "$BLOG" -v ON_ERROR_STOP=1 -c "SELECT column_name FROM information_schema.columns WHERE table_name='analytics_events' AND column_name IN ('gclid','fbclid') ORDER BY 1;"
# esperado: 2 linhas (fbclid, gclid)
```

```bash
# 5) Colunas novas no sp011 (Supabase do .env raiz)
cd /opt/sp011
DBURL=$(grep -m1 '^SUPABASE_DATABASE_URL=' /opt/sp011/.env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "SELECT column_name FROM information_schema.columns WHERE table_name='analytics_events' AND column_name IN ('gclid','fbclid') ORDER BY 1;"
# esperado: 2 linhas (fbclid, gclid)
```

```bash
# 6) REGRA CENTRAL: sem campanha cadastrada, ZERO linha nova 'pago' pós-corte
#    (trocar a data pela PAID_RULE_SINCE do commit; rodar por blog — sp011 via DBURL, replicados via -U postgres -d <blog>)
BLOG='resenhavip'
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d "$BLOG" -v ON_ERROR_STOP=1 -c "SELECT count(*) AS pago_pos_corte FROM analytics_events WHERE referrer='pago' AND ts >= '<PAID_RULE_SINCE> 03:00:00+00';"
# esperado: 0 enquanto settings.paidCampaigns estiver vazio no blog
```

```bash
# 7) Sinais crus das linhas 'pago' legadas (Anexo A4 da auditoria — de onde veio o falso pago)
BLOG='resenhavip'
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d "$BLOG" -v ON_ERROR_STOP=1 -c "SELECT COALESCE(utm_source,'(null)') AS utm_source, COALESCE(utm_medium,'(null)') AS utm_medium, COALESCE(utm_campaign,'(null)') AS utm_campaign, COALESCE(ref_host,'(null)') AS ref_host, count(*) AS eventos, count(DISTINCT session_id) AS sessoes FROM analytics_events WHERE referrer='pago' AND ts >= now() - interval '30 days' GROUP BY 1,2,3,4 ORDER BY eventos DESC;"
# leitura esperada (valida a premissa do RF-5 e a hipótese c9): ref_host facebook/instagram
# ou (null) + utm fora da regex paga => fbclid organico; google.com + utm ausente => gclid.
# Se aparecer Google Ads REAL, reavaliar o remap do RF-5 ANTES de implementar.
```

### Observação objetiva pós-rollout (painel) — cards a revalidar POR BLOG

Rodar em CADA blog no ar, na ordem: **resenhavip (canário) → sp011 → ksports →
esporteagora → oleysports → beeesportes** (+ pontofarma/creditovc quando
provisionados):

| Card | O que conferir | Resultado esperado |
|---|---|---|
| Analytics → **Fontes de tráfego** (item 11; janela 30d) | linha "Tráfego pago" | **não aparece** em blog sem campanha (o card filtra `value > 0` — `Analytics.tsx:345`), mesmo com histórico fbclid — o remap do RF-5 redistribui o legado para social/busca/referência/desconhecido |
| Analytics → mesmo card: **Top domínios de origem** e **Campanhas** (`topRefHosts`/`topCampaigns`) | continuam renderizando | inalterados (este PRD não toca `refHostMap`/`campaignMap` — `analyticsShared.ts:302-303`) |
| Analytics → **5 KPIs** e **Tráfego ao longo do tempo** | não-regressão | números idênticos ao pré-rollout na mesma janela (nenhuma outra métrica é tocada) |
| Admin → **Configurações** | bloco novo "Campanhas de tráfego pago (Analytics)" | visível, salva e recarrega sem erro; aviso de campanha sem identificador funciona |

## Critérios de aceite (mapeados à checklist e às regras do PRD 11)

| # | Critério (objetivo, nunca subjetivo) | Mapeamento | Verificação |
|---|---|---|---|
| CA-1 | Com `campaigns=[]`, NENHUMA combinação de sinais (`gclid`, `fbclid`, `paidClick` legado, `utm_medium` ∈ {cpc, ppc, paid, display, cpm, banner, retargeting}, com/sem host, com/sem UTM) retorna `"pago"` — teste de regressão em matriz | Item 11 da checklist; regra PRD 11 "`paid` > 0% exige campanha/UTM ativa cadastrada"; claims c1/c2/c3 | `pnpm run test` no api-server → passa |
| CA-2 | `fbclid` sem campanha: com `refHost` social → `"social"`; `gclid` sem campanha com `refHost` de busca → `"busca"`; click-id sem host → R5 (`fbclid`→social, `gclid`→busca); `paidClick` legado sem host → `"desconhecido"` | Item 11; claims c1/c2/c7; hipótese c9 | `pnpm run test` → passa |
| CA-3 | Campanha ativa casando (cada um dos 4 identificadores testado isoladamente) → `"pago"`; campanha `active:false`, fora do período `[startDay,endDay]`, ou sem identificador algum → NÃO-pago | Item 11; RF-1/RF-2 | `pnpm run test` → passa |
| CA-4 | Linhas legadas `referrer='pago'` (ts < `PAID_RULE_SINCE`) são remapeadas na agregação por `ref_host` e NENHUMA linha é reescrita: zero `update(analyticsEventsTable` no api-server | Invariante §17 "linhas nunca reescritas"; claim c5; item 11 | `pnpm run test` (teste de `buildWindowAggregates`/`resolveStoredChannel`) + `git grep -n "update(analyticsEventsTable" -- artifacts/api-server` → vazio |
| CA-5 | Remap preserva o total: a soma dos valores de `referrerChart` antes e depois do remap de uma mesma janela sintética é idêntica (linhas mudam de canal, nunca somem) — logo a soma das fontes segue 100% no card (`pct = value/totalRef` em `Analytics.tsx:602`; `totalRef` = soma dos canais em `:347`) | Regra PRD 11 "soma das fontes de tráfego = 100%" | `pnpm run test` → passa |
| CA-6 | Colunas `gclid`/`fbclid` existem em `analytics_events` após o boot (sp011 e ≥1 blog replicado) | §17 "migrações via Drizzle E ensureSchema"; RF-4 | Comandos 4 e 5 → 2 linhas cada — **pendente de execução** |
| CA-7 | Zero linha nova `referrer='pago'` pós-corte em blog sem campanha cadastrada (todos os blogs no ar) | Item 11; regra PRD 11 do pago; validação pós-rollout obrigatória do módulo | Comando 6 por blog → 0 — **pendente de execução** |
| CA-8 | Composição das linhas `pago` legadas confere com a premissa do remap (sem Google Ads real no histórico) — senão, reavaliar RF-5 antes de implementar | Hipótese c9; RF-5 | Comando 7 (Anexo A4) por blog — **pendente de execução** |
| CA-9 | `GET /api/site` não contém `paidCampaigns` em nenhum blog | RF-7; precedente `internalIps` (`site.ts:26`) | `curl -s https://<dominio>/api/site \| grep -c paidCampaigns` → 0 (pós-rollout) |
| CA-10 | Card Fontes de Tráfego sem linha "Tráfego pago" em blog sem campanha, inclusive com histórico fbclid; demais linhas do card continuam exibidas | Item 11; observação objetiva definida acima | Observação no painel por blog, pós-rollout (checklist da seção de rollout) |
| CA-11 | Typecheck dos 3 pacotes tocados passa no Windows (por pacote) | CLAUDE.md §14 | Comandos locais → sem erros |
| CA-12 | Shape do `/stats` inalterado (`referrerChart`/`topRefHosts`/`topCampaigns` — `analytics.ts:739-741`): nenhum componente do painel além de `Settings.tsx` precisa mudar | Fronteira PRD 09/10 | `pnpm run typecheck` no brasilia-agora sem mudanças em `Analytics.tsx` → sem erros |

**Regra da auditoria:** critério que depende de query no banco fica marcado
**pendente de execução** (MCP Supabase não conectado na sessão de escrita) e só
é dado como atendido depois que o comando rodar na VPS com o resultado esperado.

## Invariantes do §17 preservadas por este PRD

1. **"Canal classificado no servidor"** — reforçada: a decisão inteira
   (campanha + regra + remap) vive em `analyticsShared.ts`/`analytics.ts`; o
   client passa a enviar sinais AINDA mais crus (`gclid`/`fbclid` separados, só
   presença). Nenhuma classificação no client.
2. **"Linhas históricas nunca são reescritas"** — o tratamento do legado é
   remap SÓ na agregação (`resolveStoredChannel`), extensão direta do precedente
   `normalizeLegacyChannel` (`analyticsShared.ts:143-147`). Zero UPDATE em
   `analytics_events` (verificado por CA-4).
3. **"Migrações de coluna via Drizzle schema E ensureSchema"** — as duas colunas
   novas vão aos DOIS lugares (Modelo de dados); blogs criam no boot
   (§17 último bullet — nada de migração manual por blog).
4. **"Tráfego interno marcado `is_internal`, nunca dropado"** — intocada: a
   decisão `isInternal` (`analytics.ts:239-243`) e o `referrer="interno"`
   (`:263-264`) ficam como estão; `resolveStoredChannel` mantém a exclusão de
   `interno` do `channelMap` (`analyticsShared.ts:300`).
5. **"Heartbeat cumulativo agregado por MAX"** — não tocada (reducer de `read`,
   `analyticsShared.ts:319-327`, fora do escopo).
6. **"`totals.*` do `/stats` fixos ao agora"** — não tocada (`analytics.ts:
   374-381,410-421`).
7. **SSR/cache (`no-cache`, nunca `no-store`; sanitize isomórfico)** — não
   tocadas; as mudanças de client são em `parseUtm`/`takeFirstTouch`/`Settings`
   (nenhuma mexe em cache/SSR).
8. **Isolamento entre blogs / nunca hardcodar conteúdo por blog na imagem**
   (§13, reforça §17) — o cadastro é settings por blog; a imagem é idêntica para
   os 8.

## Casos de borda

1. **`?fbclid=` com valor vazio** — `p.has()` continua true; segue RF-2 (host →
   social etc.), nunca pago sem campanha.
2. **Sessão iniciada antes do rollout** — `bee_utm` no sessionStorage tem o
   formato antigo (só `paidClick`); `JSON.parse` devolve objeto sem
   `gclid`/`fbclid` → tratado como paidClick legado (passo 6 da RF-2). Nunca
   pago sem campanha.
3. **Bundle web antigo em cache** (até o usuário recarregar) — envia só
   `paidClick` fundido. Sem campanha: nunca pago (objetivo do PRD). Com campanha
   ativa por click-id: o clique pago real pode ser subatribuído
   (social/busca/desconhecido) durante a transição — perda aceita, transitória e
   documentada; hoje NENHUM blog tem campanha, então a perda real no rollout é
   zero.
4. **Campanha com `utm_campaign` que colide com UTM orgânica de terceiro** —
   falso pago possível por construção (o sistema não tem como saber quem criou a
   URL). Mitigação: recomendar nomes específicos no texto de ajuda da UI (RF-6).
5. **Duas campanhas casando a mesma visita** — resultado idêntico (`"pago"`);
   nenhuma desambiguação necessária (o canal não guarda qual campanha casou).
6. **Campanha sem identificador** — nunca casa (RF-1); UI avisa (RF-6).
7. **`startDay`/`endDay`** — dia BRT (`brtDayKey`), extremos inclusivos;
   inválidos/malformados = tratados como ausentes (sem limite) — nunca lançar no
   ingest.
8. **Desativar campanha** — encerra classificações novas; linhas `pago` já
   gravadas (pós-corte) permanecem `pago` na leitura (o remap do RF-5 só
   reinterpreta o legado pré-corte). Excluir campanha tem o mesmo efeito — a
   atribuição histórica não depende do cadastro.
9. **Rollout atrasado vs `PAID_RULE_SINCE`** — constante deve ser ≥ data real do
   deploy (RF-5); errar para DEPOIS é conservador (linhas novas legítimas
   seriam remapeadas — só relevante se já houver campanha cadastrada); errar
   para ANTES confiaria em linhas da regra antiga — proibido.
10. **`utm_medium=cpc` sem campanha** — deixa de ser pago (mudança intencional,
    coberta por CA-1); cai em host/desconhecido conforme RF-2. Documentar no
    `docs/ANALYTICS.md` (RF-8).
11. **Linha legada `pago` com `ref_host` de e-mail** — remap devolve `email`
    (ordem do bloco de host da RF-5 espelha `classifyChannel:127-134`).
12. **Settings corrompidas** (`paidCampaigns` string/objeto) — parser defensivo
    devolve `[]`; ingest segue sem campanhas (RN-F confiabilidade).
13. **Blogs ainda não provisionados** (pontofarma, creditovc) — nascem já com a
    regra nova (imagem); o loop de rollout do §6 os pula com `[ -d ... ] ||
    continue` até existirem.
14. **First-touch perdido** (dedup de 15s após `bee_ref_done` — borda anotada na
    auditoria c5) — inalterado por este PRD: perda de atribuição pré-existente,
    não reclassificação; fica com o PRD 02/03.

## Plano de testes (node --test no pacote, dados sintéticos)

Local: `artifacts/api-server` (script `pnpm run test` = `node --test
"test/**/*.test.ts"`, `package.json:11`); imports com extensão `.ts` explícita
(CLAUDE.md §14). Tudo função pura — sem banco, sem Express.

1. **`test/analyticsShared.channel.test.ts` (REESCREVER o 1º caso)** — o teste
   atual `:5-9` ("gclid/fbclid ou utm_medium pago vencem qualquer outro sinal")
   descreve o comportamento defeituoso e será substituído por:
   - *Regressão obrigatória (CA-1)*: matriz `campaigns=[]` × sinais
     {`gclid:true`, `fbclid:true`, `paidClick:true`, cada `utm_medium` da regex
     paga, combinações com `refHost` google/facebook/nenhum, com `utm_source`} →
     `assert.notEqual(resultado, "pago")` para TODAS as células.
   - *R5*: `{fbclid:true}` → `"social"`; `{gclid:true}` → `"busca"`;
     `{fbclid:true, refHost:"facebook.com"}` → `"social"`;
     `{gclid:true, refHost:"google.com"}` → `"busca"`;
     `{paidClick:true}` (legado, sem plataforma) → `"desconhecido"`.
   - *Campanha casa (CA-3)* (com `todayKey` injetado como 3º arg de
     `classifyChannel`): uma campanha ativa por identificador — `utmCampaign`
     (exige `utmCampaign` no `ChannelSignals`/na chamada — RF-2/RF-3), par
     `utmSource`+`utmMedium`, `acceptGclid`, `acceptFbclid` — cada uma →
     `"pago"`; case-insensitive (`utm_campaign=BLACK-friday` casa
     `black-friday`).
   - *Campanha não casa* (com `todayKey` injetado para as datas): `active:false`;
     `endDay` no passado; `startDay` no futuro; campanha sem identificador;
     `utmCampaign` diferente → não-pago.
   - *Precedência preservada fora do pago*: casos existentes de email/busca/
     social/referência/direto/desconhecido/legado (`:11-52`) continuam passando
     sem alteração.
2. **`matchesPaidCampaign`** (casos unitários dedicados): janela de datas BRT
   inclusiva; identificadores em branco (`""`) tratados como indefinidos;
   `todayKey` injetado (determinístico).
3. **`resolveStoredChannel` + `buildWindowAggregates`
   (`test/analyticsShared.aggregate.test.ts`, estender)**:
   - linha sintética `referrer:'pago'`, `ts` < corte, `refHost:'facebook.com'`
     → conta em `channelMap.social`; `refHost:'google.com'` → `busca`;
     `refHost:'parceiro.com.br'` → `referencia`; sem `refHost` →
     `desconhecido`; `refHost:'mail.google.com'` → `email`.
   - linha `referrer:'pago'`, `ts` ≥ corte → conta em `channelMap.pago`.
   - *CA-5*: janela sintética mista (pago legado + social + direto) — soma dos
     valores do `channelMap` idêntica com e sem remap.
   - casos existentes (`outro→referencia`, exclusão de `interno`) inalterados.
4. **Client (`web/lib/analyticsClient.test.ts`, atualizar)**: `parseUtm` devolve
   `gclid`/`fbclid` separados + `paidClick` compat (o teste atual `:12-13`
   documenta o merge — atualizar a expectativa).
5. **Validação em staging/produção**: comandos 4–7 da seção de verificação
   (**pendentes de execução** — dependem da VPS/banco). Nenhum dado sintético é
   inserido em banco de produção; os testes sintéticos vivem só no `node --test`.

## Plano de rollback (reverter esta mudança específica se quebrar em qualquer blog)

1. **Código**: `git revert` do(s) commit(s) deste PRD na `main` (dev solo,
   commit direto — CLAUDE.md §5,§18).
2. **Imagem**: novo bump do §6 com o revert (build `api web` no sp011, canário,
   demais) — OU, para blog replicado isolado com problema, voltar a tag
   anterior imediatamente:
   ```bash
   cd /opt/blogs/<id>
   sed -i "s|^BLOG_IMAGE_TAG=.*|BLOG_IMAGE_TAG=<vN-1>|" .env
   docker compose up -d
   curl -s https://<dominio>/api/site | grep -o '"siteName":"[^"]*"'
   ```
3. **Dados**: nada a desfazer — nenhuma linha foi reescrita (RF-5); as colunas
   `gclid`/`fbclid` são aditivas e anuláveis (a imagem antiga as ignora;
   `ensureSchema` é idempotente); o campo `paidCampaigns` nas settings é inerte
   para a imagem antiga (campo desconhecido no JSON). Ao voltar a imagem, o card
   volta EXATAMENTE aos números antigos (inclusive o falso "pago" — esperado).
4. **Critério de acionamento**: qualquer CA quebrado no canário (resenhavip),
   mistura de siteName entre blogs, erro 5xx no `/stats`, ou card de Fontes
   zerado numa janela com pageviews não-internos comprovados.

## Riscos e dependências de outros PRDs (FRONTEIRAS do STATUS.md)

- **PRD 01 (modelo de dados/taxonomia)**: define o PADRÃO de migração
  Drizzle+ensureSchema que as colunas `gclid`/`fbclid` seguem, e a taxonomia de
  payloads onde os dois sinais novos devem ser registrados. Fronteira declarada
  no escopo deste módulo: "se precisar de settings/coluna nova, padrão do
  PRD 01".
- **PRD 02 (tracking client-side)**: revisa o SDK — as mudanças deste PRD em
  `parseUtm`/`takeFirstTouch` devem ser coordenadas para não conflitar (mesmos
  arquivos). A borda "first-touch perdido" (c5) e cobertura de eventos ficam no
  02.
- **PRD 03 (ingestão/filtros)**: dono da validação genérica do ingest e da
  mitigação ampla do c6 (body hostil). Este PRD apenas REDUZ o impacto do c6
  para o canal pago; não adiciona autenticação.
- **PRD 06 (agregações)**: mexe em `buildWindowAggregates` para outros itens
  (3, 6, 17, 18 — fronteira do STATUS.md); implementar 05 e 06 em commits
  separados e sequenciais para evitar conflito no mesmo arquivo.
- **PRD 08 (saúde da coleta)**: exposição/alerta "paid > 0% sem campanha
  cadastrada" é do 08 (fronteira "exposição/alerta → PRD 08"); este PRD entrega
  os dados que tornam o alerta computável (cadastro + colunas persistidas).
- **PRD 10 (frontend do dashboard)**: nenhum componente de exibição muda aqui
  (CA-12); estados vazios do card e demais ajustes visuais são do 10. A única
  UI deste PRD é o cadastro em Configurações (RF-6).
- **PRD 11 (validação cross-metric)**: a regra "`paid` > 0% exige campanha/UTM
  ativa cadastrada" passa a ser ESTRUTURAL para linhas novas; a checagem
  contínua por blog (e a regra "soma das fontes = 100%") é implementada no 11
  usando as colunas do RF-4.
- **PRD 12 (testes/validação)**: o script de tráfego sintético deve incluir os
  cenários de canal deste PRD (nunca poluindo dados reais).
- **Riscos principais**: (1) premissa do remap total do legado depende do A4
  (CA-8 — se houver Google Ads real no histórico, ajustar RF-5 antes de
  implementar); (2) `PAID_RULE_SINCE` mal posicionada confia em linhas da regra
  antiga (caso de borda 9 — checklist de commit); (3) colisão de UTM orgânica
  com campanha cadastrada (borda 4 — aceito e documentado); (4) janela de
  transição de bundles antigos com campanha ativa (borda 3 — hoje inócua).

## Estimativa de esforço (P/M/G)

**M.** Backend: ~6 funções puras novas/alteradas + 2 colunas + memoização +
redação no `/api/site` (padrões todos existentes no repo). Client: 2 campos no
`parseUtm`/`takeFirstTouch`. UI: um bloco novo em Configurações com i18n
pt/EN. Testes: reescrita de 1 caso + ~20 casos novos, todos puros. Sem migração
de dados, sem endpoint novo, sem redesign. O que impede de ser P: a UI do
cadastro + a coordenação de fronteiras (02/06) + a validação multi-blog
pós-rollout.
