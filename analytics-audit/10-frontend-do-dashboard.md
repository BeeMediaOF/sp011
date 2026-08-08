# PRD 10 — Frontend do painel de Analytics (Analytics.tsx, Dashboard.tsx, AdsManager.tsx)

> **O que é este documento.** PRD de implementação, escrito para ser consumido pelo
> Claude Code numa sessão futura SEM o contexto da auditoria — autocontido: dá para
> executar lendo só este arquivo. Fontes: `analytics-audit/00-auditoria-estado-atual.md`
> (Fase 0.2, achados com evidência — sua fonte primária), `analytics-audit/00-inventario.md`
> (mapa; §8 tem correções de linha), `analytics-audit/STATUS.md` (FRONTEIRAS entre
> PRDs — obrigatórias), `PRD_ANALYTICS_PLANEJAMENTO_v2.md` (template e descrição
> oficial do módulo 10), e CLAUDE.md §§5, 6, 14, 17. Todas as evidências
> `arquivo:linha` deste PRD foram REABERTAS nos arquivos reais na sessão de escrita
> (2026-07-23): `artifacts/brasilia-agora/src/pages/admin/Analytics.tsx` (interface
> `Stats` completa, funções utilitárias, os 7 blocos de card tocados),
> `artifacts/brasilia-agora/src/pages/admin/Dashboard.tsx:320-403`,
> `artifacts/brasilia-agora/src/lib/adminI18n.ts` (chaves citadas, blocos pt-BR e EN),
> `artifacts/brasilia-agora/src/lib/adminApi.ts:113,440` e
> `artifacts/brasilia-agora/src/lib/analyticsClient.test.ts` (padrão de teste do
> pacote). Os demais PRDs (04-08) foram lidos por completo para extrair as fronteiras
> e os contratos de payload que este PRD consome.
>
> **Princípio obrigatório:** volume baixo NÃO é bug — os blogs são novos. Bug é o que
> é logicamente incorreto ou inconsistente, independente do volume. Os três defeitos
> centrais deste PRD (chips de % > 100%, barra de categoria estourando a largura do
> card, soma de lista truncada exibida como total) são exemplos canônicos: acontecem
> mesmo com 1 ou 2 eventos na janela — corrigir NÃO faz nenhum número subir, só faz o
> dashboard parar de mentir sobre a proporção.
>
> **SEM REDESENHO** (descrição oficial do módulo 10, doc v2): nenhuma mudança de
> layout, grid, cores, hierarquia visual, navegação ou biblioteca de UI. Toda alteração
> deste PRD é correção de CÁLCULO/RÓTULO/CONSUMO DE CAMPO dentro dos componentes
> existentes — o card continua no mesmo lugar, com o mesmo visual.
>
> **Multi-blog:** os 8 blogs (sp011, ksports, esporteagora, resenhavip, oleysports,
> beeesportes, pontofarma, creditovc) rodam a MESMA imagem `blog-web:vN`
> (CLAUDE.md §6). Este PRD altera só `artifacts/brasilia-agora` — serviço afetado no
> rollout: `web` (mapeamento CLAUDE.md §5). A correção vale para a rede inteira no
> próximo rollout — e um erro de tipo/render quebra o painel admin da rede inteira de
> uma vez (nunca o site público: todo o escopo deste PRD é `/admin`).
>
> **Fronteiras que delimitam este PRD** (STATUS.md, reproduzidas — OBRIGATÓRIAS):
> - "Exibição/cálculo no frontend (item 14 chips % `Analytics.tsx:350/:793-795`;
>   barra do Dashboard `:343-344`; exibição do item 24) → **PRD 10**; totais NÃO
>   truncados de comportamento servidos pelo backend (hoje soma top-15/top-10) →
>   **PRD 07**." (STATUS.md, fronteiras adicionais)
> - "Consequência secundária no front (FRONTEIRA PRD 10): quando o líder vem do
>   fallback com atividade 0, a base de normalização vira 1 e os chips '%' exibem
>   300%/1500%" e "sessão×conteúdo é FRONTEIRA do PRD 10" e "barras/rótulos do card de
>   dia da semana [...] é FRONTEIRA do PRD 10" (PRD 06 §2.3/§14).
> - "Consumirá `searchesTotal`/`externalClicksTotal` [...]; dono de estados
>   vazios/rotulagem" (PRD 07 §14).
> - "Nenhum componente de exibição muda aqui [no PRD 05]; estados vazios do card e
>   demais ajustes visuais são do 10. A única UI deste PRD [05] é o cadastro em
>   Configurações" — **logo o card "Fontes de tráfego" (Analytics.tsx:586-653) está
>   FORA do escopo deste PRD** (nenhum bug de exibição foi confirmado ali; a correção
>   é 100% de classificação no servidor).
> - "Frontend geral do dashboard = PRD 10 ('não redesenhar'; [...]) — este PRD
>   [08] toca SOMENTE o card Saúde da coleta e as chaves i18n dele [...] qualquer
>   reestilização geral do dashboard é PRD 10 e deve preservar a semântica dos
>   elementos deste card" — **logo o card "Saúde da coleta"
>   (Analytics.tsx:1336-1369) é FORA do escopo de EDIÇÃO deste PRD**; este PRD só
>   verifica, por observação, que não o quebrou de raspão (§10/§11).
> - "Exibição opcional dos contadores internos, dataKey homônimo do top-3, estados
>   vazios [de anúncios]. Nada aqui bloqueia esses PRDs" (PRD 04 §14) — **opcional,
>   NÃO faz parte do mínimo deste PRD** (registrado em §14 como item não-bloqueante).
>
> **Encurtamentos:** `web = artifacts/brasilia-agora/src`. Sem `api =`/`db =` neste
> PRD — nenhum arquivo de `artifacts/api-server` ou `lib/db` é tocado (§6).

---

## 1. Objetivo

Corrigir os três defeitos de exibição do dashboard `/admin` já atribuídos a este
módulo pelas fronteiras do STATUS.md, sem redesenhar nenhum card:

1. **Item 14 (chips de % do card "Top categorias" detalhado)** — base de
   normalização usa só a PRIMEIRA linha do array (`Analytics.tsx:350,:793-795,:814`),
   que pode vir de um critério de ordenação diferente do exibido (fallback por nº de
   artigos, item 3) e ter atividade zero — os demais chips então dividem por 1 e
   mostram 300%/1500%.
2. **Barra do card "Top categorias" do Dashboard** (`Dashboard.tsx:343-344`) — mesmo
   padrão de bug: base = `stats.topCategories[0].views || 1`, pode gerar barra com
   largura > 100% do card.
3. **Item 24 (Resumo de interações)** — "Buscas realizadas" e "Cliques externos"
   somam as listas `topSearchTerms`/`topLinkDomains`, que o servidor trunca em 15/10
   ANTES de enviar (`Analytics.tsx:1297,:1302`) — subcontagem sistemática acima desses
   limiares. O PRD 07 passa a servir os totais reais (`searchesTotal`/
   `externalClicksTotal`); este PRD troca o consumo no frontend.

E, dentro do mandato oficial do módulo 10 (doc v2: "garantir estados vazios corretos
[...], loading states, comparativos de período e toggles"), mais três itens que a
auditoria e as fronteiras dos PRDs 02/06 atribuem explicitamente a este módulo:

4. **Rótulo "sessões" do card de Profundidade de leitura** (`Analytics.tsx:1005`) —
   a contagem real é por par sessão×conteúdo (1 sessão lendo 3 artigos conta 3), não
   por sessão — rótulo impreciso mesmo com o dado internamente correto.
5. **Card "Pico por dia da semana"** — consumir, de forma aditiva/tolerante, os
   campos `occurrences`/`avg` que o PRD 06 (RF-3) passa a servir, sem quebrar
   enquanto o PRD 06 não estiver no ar.
6. **Auditoria e blindagem** dos estados vazios, loading states e comparativos/toggles
   nos 25 itens da checklist cobertos por `Analytics.tsx`/`Dashboard.tsx`/
   `AdsManager.tsx` — preservar o que já está correto (a maioria) e confirmar, por
   comando/observação, que as correções 1-5 não quebraram nada ao redor.

Itens da checklist do doc v2 cobertos por este PRD: **3** (parte exibição — a
ORDENAÇÃO é PRD 06), **14**, **18** (parte rótulo — a dedup é PRD 06, o cliente é
PRD 02), **17** (parte exibição — consumo aditivo de `occurrences`/`avg`), **24**
(parte exibição — os totais NÃO truncados são PRD 07), e preservação verificada de
**1, 2, 5, 7-13, 15, 16, 19-23, 25**.

---

## 2. Contexto / estado atual

### 2.1 Os três bugs confirmados, reabertos nesta sessão

**Item 14 — chips de % (`web/pages/admin/Analytics.tsx`):**

```tsx
// :350 (escopo do componente, calculado 1x por render)
const maxCatViews = topCats[0] ? ((topCats[0].clicks || 0) + (topCats[0].views || 0)) || 1 : 1;

// :793-795 (dentro do .map() do card "Top categorias" detalhado)
const totalActivity = (cat.clicks || 0) + (cat.views || 0);
const maxActivity = topCats[0] ? ((topCats[0].clicks || 0) + (topCats[0].views || 0)) || 1 : 1; // idêntico a :350 — cálculo DUPLICADO
const pct = ((totalActivity / maxActivity) * 100).toFixed(1); // chip de texto "{pct}%"

// :814 (barra de progresso, mesma linha do card)
style={{ width: `${(totalActivity / maxCatViews) * 100}%`, background: color }}
```

Duas variáveis (`maxCatViews` no escopo do componente, `maxActivity` recalculada
dentro do loop) fazem EXATAMENTE a mesma conta — código duplicado que sempre precisa
mudar em uníssono. Ambas usam só `topCats[0]`. Se o líder do array (posição 0) vier
com `clicks+views === 0` — cenário do item 3/PRD 06: o sort atual do endpoint
(`analytics.ts:589`, ver `analytics-audit/06-agregacoes-e-rollups.md` §4/D1) cai para
ordenar por nº de artigos quando a atividade é zero, o que pode colocar uma categoria
SEM acesso na posição 0 enquanto outra categoria, mais abaixo, tem acessos reais —
então `maxActivity`/`maxCatViews` viram `1` (o `|| 1`) e o chip de uma categoria com,
por exemplo, 3 acessos mostra `300%`; com 15, `1500%`. A barra (`:814`) sofre o
mesmo estouro de largura (`width: 1500%`).

**Barra do Dashboard (`web/pages/admin/Dashboard.tsx`):**

```tsx
// :342-344 (dentro do .map() do card "Top categorias")
const maxViews = stats.topCategories[0].views || 1;
const pct = Math.round((cat.views / maxViews) * 100);
// :357-361: <div style={{ width: `${pct}%`, ... }} />
```

Mesmo padrão de bug (base = só a primeira linha do array, `|| 1` na base), variante
que usa só `views` (não `clicks+views` como o Analytics.tsx — o Dashboard já rotula
o card como "an.byViews" = "por visualizações", `:333`, então a base correta AQUI é
só `views`, sem `clicks` — este PRD preserva essa diferença de semântica entre os
dois cards, não a unifica).

**Item 24 — Resumo de interações (`web/pages/admin/Analytics.tsx`):**

```tsx
// :1291-1303 (array de tiles do card "Resumo de interações")
{
  label: t("an.searchesMade"),
  value: (stats.behaviorStats?.topSearchTerms.reduce((s, term) => s + term.count, 0) ?? 0).toLocaleString(nloc),
  ...
},
{
  label: t("an.externalClicks"),
  value: (stats.behaviorStats?.topLinkDomains.reduce((s, d) => s + d.count, 0) ?? 0).toLocaleString(nloc),
  ...
},
```

`topSearchTerms`/`topLinkDomains` chegam truncados em 15/10 pelo servidor
(`analytics-audit/07-comportamento-no-site.md` §2.1, `analytics.ts:702-705,:707-710`
— arquivo/linhas confirmados por aquele PRD, não reabertos aqui). Somar o array
truncado e chamar de "Buscas realizadas"/"Cliques externos" subconta sempre que
existirem >15 termos distintos ou >10 domínios distintos na janela — bug lógico
independente de volume (com 3 buscas na janela o bug não se manifesta numericamente,
mas o PADRÃO de código está errado e vai subcontar assim que o volume crescer). O
**PRD 07** já foi escrito e passa a servir `behaviorStats.searchesTotal` e
`behaviorStats.externalClicksTotal` (totais reais, não truncados) — ver contrato
citado em §7 deste PRD. Este PRD troca o consumo.

Confirmação de que os arrays `topSearchTerms`/`topLinkDomains` NÃO sofrem o mesmo
bug de base-de-normalização do item 14 (achado desta sessão, não da auditoria):

```tsx
// :1220-1221 (card "Termos mais buscados")
{stats.behaviorStats.topSearchTerms.slice(0, 8).map(({ term, count }, i) => {
  const maxC = stats.behaviorStats!.topSearchTerms[0]!.count;
// :1256-1257 (card "Links externos clicados") — mesmo padrão
```

Aqui usar `[0]` como máximo é CORRETO: o PRD 07 (RF1, regra 5) ordena
`topSearchTerms`/`topLinkDomains` por `count` DESC antes de truncar — a posição 0 é
genuinamente a maior, ao contrário de `topCategories` (cujo sort tem o fallback
defeituoso do item 3). **Este PRD NÃO toca essas duas barras** — não há bug ali.

### 2.2 Rótulo "sessões" do card de Profundidade de leitura

```tsx
// :986-1018 (card "Profundidade de leitura")
<span className="text-xs text-slate-400">{t("an.readDepthSub")}</span>  // :991
...
<span className="text-xs font-semibold text-[#0F172A]">{count.toLocaleString(nloc)} {t("an.sessions")}</span>  // :1005
```

`an.sessions` (`web/lib/adminI18n.ts:263` pt-BR = `"sessões"`, `:1091` EN =
`"sessions"`) é usado **só nesta linha** em todo `artifacts/brasilia-agora/src`
(confirmado por grep nesta sessão — nenhum outro consumidor). A contagem real
(`scrollDepthChart[].count`) é o tamanho de um `Set` chaveado por
`sessionId|articleId ?? path` (`analyticsShared.ts:330`, cf.
`analytics-audit/06-agregacoes-e-rollups.md` D4) — um par sessão×conteúdo, não uma
sessão. O próprio `title` do card (tooltip nativo do HTML) já está honesto e mais
específico:

```
// adminI18n.ts:257 (pt-BR) — usado como title={...} em :988
"an.readDepthTip": "Sessões únicas que atingiram cada marco do CORPO do artigo
  (cabeçalho/rodapé não contam). Cada marco vale 1× por sessão e artigo."
```

O tooltip já diz "por sessão e artigo"; só o rótulo compacto inline (`:1005`) e o
subtítulo (`:991`, `an.readDepthSub` = "sessões que chegaram até") dizem apenas
"sessões". Este PRD alinha os três textos.

### 2.3 Card "Pico por dia da semana" e o contrato aditivo do PRD 06

```tsx
// :950-984 (card completo)
{stats.peakDay && (stats.dayOfWeekChart ?? []).some(d => d.views > 0) && (
  <span ...>{t("an.peak")} {dow(stats.peakDay)}</span>          // :954-958 badge do dia eleito
)}
...
<Bar dataKey="views" ...>                                        // :972 barras por soma bruta
  {(stats.dayOfWeekChart ?? []).map((entry) => (
    <Cell fill={entry.day === stats.peakDay ? "#E71D36" : "#7C3AED"} ... />  // :974-978
  ))}
</Bar>
```

O destaque da barra JÁ é feito comparando `entry.day === stats.peakDay` — **isso
continua funcionando corretamente mesmo depois do PRD 06 mudar o critério de eleição
do pico** (soma bruta → média por ocorrência, `analytics-audit/06-agregacoes-e-rollups.md`
RF-3), porque o componente só compara strings de dia, não recalcula o pico. O
`Stats.dayOfWeekChart` hoje é tipado só com `{ day: string; views: number }`
(`Analytics.tsx:42`) — o PRD 06 adiciona `occurrences`/`avg` de forma ADITIVA
(shape antigo ⊂ novo). O risco registrado pelo PRD 06 (§14, risco 1): "entre o
rollout do PRD 06 e o do PRD 10, o card [...] continua desenhando barras pela soma
bruta enquanto o `peakDay` já vem normalizado — o dia destacado pode não ser o da
maior barra" — o PRD 06 pede explicitamente a este PRD para tratar isso (§14: "o
front do PRD 10 deve tratar campo ausente — fallback para `views`").

### 2.4 Estado dos 25 itens da checklist (fonte: auditoria §1) tocados por este PRD

| Item | Status na auditoria | Ação deste PRD |
|---|---|---|
| 3 | Bug (endpoint = PRD 06; UI = base do item 14, já coberta) | preservação — nenhuma ação extra além do item 14 |
| 14 | Bug — `Analytics.tsx:350,:793-795,:813-814` | **corrigir (RF1/RF2)** |
| 17 | Parcial — front consome `occurrences`/`avg` de forma aditiva | **adaptar (RF6)** |
| 18 | Parcial — rótulo "sessões" impreciso (`:1005`) | **corrigir (RF5)** |
| 24 | Bug — `Analytics.tsx:1297,:1302` somam lista truncada | **corrigir (RF4)** |
| 1,2,5,7-13,15,16,19-23,25 | OK/Parcial (causas fora deste módulo) | **preservar/blindar (RF7-RF10)** |

---

## 3. Problema a resolver

1. Um chip de "%" no card "Top categorias" detalhado pode exibir 300% ou 1500% —
   número logicamente impossível (percentual de participação nunca pode passar de
   100%), independente do volume de tráfego.
2. A barra do card "Top categorias" do Dashboard pode transbordar visualmente o
   contêiner (largura CSS > 100%) pelo mesmo motivo.
3. "Buscas realizadas" e "Cliques externos" no card "Resumo de interações" subcontam
   sistematicamente quando a janela tem mais termos/domínios distintos do que os
   tetos de exibição (15/10) — o rótulo diz "Buscas realizadas" (implica total), o
   valor é uma soma parcial.
4. O rótulo "sessões" no card de Profundidade de leitura implica uma unidade
   (sessão) diferente da que o número realmente representa (sessão×conteúdo),
   confundindo o operador ao comparar com outros KPIs que SÃO por sessão (ex.:
   "Sessões únicas" do topo da página).
5. Quando o PRD 06 estiver no ar, o card de "Pico por dia da semana" pode destacar
   uma barra que não é visualmente a mais alta (o pico passa a ser eleito por
   média por ocorrência) sem nenhuma explicação visível — não é um bug de dado (o
   dado está certo, ver PRD 06), mas a ausência de contexto pode ser lida pelo
   operador como inconsistência do painel.

O que NÃO é problema (não mexer): números pequenos, dias/categorias sem eventos,
`null` em vez de badge de tendência quando não há base de comparação, cards que já
mostram "Sem dados ainda"/"Aguardando dados" corretamente, `topSearchTerms[0]`/
`topLinkDomains[0]` como base de normalização (correto — arrays já vêm ordenados),
loading/refreshing/toggles do período e de Cidades/Estados (já funcionam — auditados
em §2.5 abaixo e preservados por regressão em §9).

### 2.5 O que já está correto e este PRD preserva (auditado nesta sessão)

- **Loading inicial** (`:308-317`): spinner + `t("an.loading")` enquanto
  `loading === true`; **erro** (`:319-327`): mensagem `t("an.loadError")` quando
  `error || !stats`; **refresh silencioso** (`:200-226,:478,:481`): `refreshing`
  desabilita o botão de atualizar e anima o ícone `RefreshCw`, sem re-mostrar o
  spinner de tela cheia — o auto-refresh de 30s (`:230`) não pisca a UI.
- **Seletor de período** (`:190-194,:204-210,:458-478`): `periodKey` com 5 opções +
  custom (`customFrom`/`customTo`); sem as duas datas em `custom` o fetch nem
  dispara (`:207`) — não manda período pela metade.
- **Toggle Cidades/Estados** (`:190,:832-839`): `geoTab` local, sem chamada de rede
  extra (os dois arrays já vêm no mesmo payload).
- **Tendências** (`fmtDelta`, `:154-158`): `null`/`undefined` → `null` (o badge some
  do DOM); nunca "NaN%" nem "+0%" inventado.
- **Empty states já corretos**: `an.noCategoryData` (`:788`), `an.noDataYet`
  (`:744`, top artigos), `an.waitingData` (`:961`, dia da semana),
  `an.noScrollData` (`:994`), `an.noAdDataPeriod` (`:1108-1112`, distingue
  "sem registro no período" de "zero real" — item 20), `dash.noData`
  (`Dashboard.tsx:338`).

---

## 4. Requisitos funcionais

### RF1 — Helper puro de normalização (`web/lib/analyticsDisplay.ts`, NOVO)

Novo módulo, zero imports de React (mesmo padrão de `web/lib/analyticsClient.ts`,
que já é testado por `tsx --test` sem DOM):

```ts
// artifacts/brasilia-agora/src/lib/analyticsDisplay.ts
//
// Funções puras de normalização para barras/percentuais de "participação" nos
// cards do dashboard admin. Corrigem a base bugada de "usar só o primeiro item
// do array" (que pode não ser o líder real quando a ordenação do backend tem
// fallback — ver PRD 06 RF-1 / analytics-audit item 3/14), garantindo:
//   (a) a base é o MAIOR valor real da lista inteira, nunca só o item 0;
//   (b) o resultado nunca passa de 100%, nunca é NaN/Infinity/negativo;
//   (c) quando não há NENHUM item com valor > 0, o resultado é 0% honesto —
//       nunca 100% "por acidente" de divisão 0/0 nem crash.

/** Maior valor entre os itens, segundo `pick`. Lista vazia ou todo valor <= 0
 *  (ou não-finito) → 0. NUNCA lança. */
export function maxMetric<T>(items: readonly T[], pick: (item: T) => number): number {
  let max = 0;
  for (const item of items) {
    const v = pick(item);
    if (Number.isFinite(v) && v > max) max = v;
  }
  return max;
}

/** value/max em pontos percentuais, SEMPRE dentro de [0, 100]. `max <= 0`
 *  (nenhum item com atividade real) ou `value` não-finito/<=0 → 0. Nunca
 *  NaN/Infinity/negativo — nunca uma barra CSS width > 100% nem um chip
 *  "300%". */
export function pctOfMax(value: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!Number.isFinite(max) || max <= 0) return 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
}
```

Regras de design (testadas em §12): (1) `maxMetric` NUNCA assume que o array está
ordenado — percorre todos os itens; isso corrige o bug INDEPENDENTEMENTE de o
PRD 06 já ter corrigido a ordenação do endpoint ou não (defesa em profundidade:
mesmo que uma regressão futura reintroduza um sort ruim no backend, o front nunca
mais mostra >100%); (2) `pctOfMax` é a ÚNICA função que deve produzir uma
percentagem de participação nos cards — RF2/RF3 a chamam em vez de reimplementar a
conta inline (elimina a duplicação `maxCatViews`/`maxActivity` de `:350`/`:794`).

### RF2 — Corrigir chips de % e barra do card "Top categorias" detalhado (item 14)

Em `web/pages/admin/Analytics.tsx`:

- `:25` — `import { maxMetric, pctOfMax } from "../../lib/analyticsDisplay";` (ajustar
  caminho relativo real do arquivo).
- `:350` — substituir por:
  ```tsx
  const maxCatViews = maxMetric(topCats, c => (c.clicks || 0) + (c.views || 0));
  ```
- `:793-795` — remover a variável `maxActivity` duplicada; usar a `maxCatViews` do
  escopo do componente (já corrigida acima) e trocar o cálculo do chip por:
  ```tsx
  const totalActivity = (cat.clicks || 0) + (cat.views || 0);
  const pct = pctOfMax(totalActivity, maxCatViews).toFixed(1);
  ```
- `:814` — trocar `width: \`${(totalActivity / maxCatViews) * 100}%\`` por
  `width: \`${pctOfMax(totalActivity, maxCatViews)}%\`` (mesma função, elimina a
  segunda cópia manual da fórmula).

Efeito: com QUALQUER composição de `topCategories` (líder por acesso real, líder por
fallback com 0 acesso, todas as categorias em 0), o chip e a barra ficam sempre em
`[0, 100]`. Quando todas as categorias têm `clicks+views === 0` (blog recém-
provisionado sem tráfego, cenário LEGÍTIMO — nunca é bug), `maxCatViews` é `0`,
`pctOfMax` retorna `0` para todas — todos os chips mostram honestamente `0.0%` (hoje,
antes do fix, mostrariam `0/1 = 0%` só se o líder já fosse 0; o bug só aparece quando
o líder tem 0 e OUTRA linha tem >0 — cenário que RF2 também corrige).

### RF3 — Corrigir a barra do card "Top categorias" do Dashboard

Em `web/pages/admin/Dashboard.tsx`:

- Import do mesmo `analyticsDisplay.ts` (caminho relativo de `pages/admin/`).
- `:343` — substituir por:
  ```tsx
  const maxViews = maxMetric(stats.topCategories, c => c.views);
  ```
- `:344` — substituir por:
  ```tsx
  const pct = Math.round(pctOfMax(cat.views, maxViews));
  ```

Preserva a semântica atual do card (base = só `views`, sem `clicks` — rótulo
`t("dash.byViews")`, `:333`, "por visualizações"); corrige SÓ a base de
normalização. `Math.round` mantido (comportamento visual idêntico ao atual quando
não há bug).

### RF4 — Servir os totais corretos no "Resumo de interações" (item 24)

Consome o contrato aditivo do **PRD 07** (`behaviorStats.searchesTotal`/
`externalClicksTotal` — ver §7). Em `web/pages/admin/Analytics.tsx`:

- `:67-71` — estender a interface local `Stats.behaviorStats` com os 4 campos
  OPCIONAIS do PRD 07 (aditivos — não quebra se a API ainda não os servir):
  ```tsx
  behaviorStats?: {
    totalEvents: number; newsletterSignups: number;
    searchesTotal?: number; externalClicksTotal?: number;       // NOVO — PRD 07
    searchTermsDistinct?: number; linkDomainsDistinct?: number;  // NOVO — PRD 07
    topSearchTerms: { term: string; count: number }[];
    topLinkDomains: { domain: string; count: number }[];
  };
  ```
- `:1297` — substituir por:
  ```tsx
  value: (
    stats.behaviorStats?.searchesTotal ??
    stats.behaviorStats?.topSearchTerms.reduce((s, term) => s + term.count, 0) ??
    0
  ).toLocaleString(nloc),
  ```
- `:1302` — substituir por:
  ```tsx
  value: (
    stats.behaviorStats?.externalClicksTotal ??
    stats.behaviorStats?.topLinkDomains.reduce((s, d) => s + d.count, 0) ??
    0
  ).toLocaleString(nloc),
  ```

O `??` em cascata é a defesa de compatibilidade: se o `web` deste PRD subir ANTES do
`api` do PRD 07 (janela de rollout parcial — ambos versionam juntos no bump padrão
do §6, mas um blog pode ficar temporariamente numa tag intermediária), o campo novo
vem `undefined` e o card volta ao comportamento ATUAL (soma truncada — mesmo
resultado de hoje, não pior). Assim que o PRD 07 estiver no ar no mesmo blog, o
total passa a ser o real. Nenhuma mudança visual no card (mesmos rótulos, mesma
posição) — só o valor numérico corrige.

### RF5 — Rótulo honesto da Profundidade de leitura (item 18)

Em `web/lib/adminI18n.ts` (DOIS blocos — pt-BR na vizinhança de `:256-263`, EN na de
`:1084-1091` — CLAUDE.md §15: painel admin com idioma por usuário, mesmo número de
chaves nos dois blocos):

- **Remover** `an.sessions` (`:263` pt-BR = `"sessões"`; `:1091` EN = `"sessions"`) —
  confirmado por grep nesta sessão: nenhum outro consumidor em
  `artifacts/brasilia-agora/src` além de `Analytics.tsx:1005`.
- **Adicionar** `an.readDepthUnit` — pt-BR: `"leituras"`; EN: `"reads"`.
- **Alterar o valor** de `an.readDepthSub` (`:256` pt-BR, `:1084` EN) — de
  `"sessões que chegaram até"` para `"leituras que chegaram até"`; EN de
  `"sessions that reached"` para `"reads that reached"` (mesma estrutura de frase,
  só a palavra da unidade muda).
- `an.readDepthTip` (`:257` pt-BR, `:1085` EN) **NÃO muda** — já está correto ("Cada
  marco vale 1× por sessão e artigo").

Em `web/pages/admin/Analytics.tsx:1005`, trocar `{t("an.sessions")}` por
`{t("an.readDepthUnit")}`.

### RF6 — Card "Pico por dia da semana": consumo aditivo de `occurrences`/`avg` (item 17)

Em `web/pages/admin/Analytics.tsx`:

- `:42` — estender o tipo:
  ```tsx
  dayOfWeekChart?: { day: string; views: number; occurrences?: number; avg?: number | null }[];
  ```
- `:968-971` (formatter do `Tooltip`) — quando `avg`/`occurrences` estiverem
  presentes no ponto (`payload` do Recharts), mostrar também a média por ocorrência;
  caso contrário, comportamento IDÊNTICO ao atual (só `views`):
  ```tsx
  formatter={(v: number, _name, item: { payload?: { occurrences?: number; avg?: number | null } }) => {
    const occ = item?.payload?.occurrences;
    const avg = item?.payload?.avg;
    if (typeof occ === "number" && occ > 0 && typeof avg === "number") {
      return [`${v} (${t("an.avgPerOcc")}: ${avg})`, t("an.views")];
    }
    return [v, t("an.views")];
  }}
  ```
- Badge do dia eleito (`:954-958`) — quando o dia destacado (`stats.peakDay`) NÃO for
  o de maior `views` bruto no array (ou seja, quando `occurrences`/`avg` estiverem
  presentes e a eleição divergir da maior barra), adicionar um `title` (tooltip
  nativo, sem elemento novo de UI) explicando o critério:
  ```tsx
  {stats.peakDay && (stats.dayOfWeekChart ?? []).some(d => d.views > 0) && (() => {
    const dow = stats.dayOfWeekChart ?? [];
    const hasAvg = dow.some(d => typeof d.avg === "number");
    const maxViewsDay = dow.reduce((best, d) => (d.views > (best?.views ?? -1) ? d : best), dow[0])?.day;
    const divergent = hasAvg && maxViewsDay !== stats.peakDay;
    return (
      <span
        className="text-[11px] font-semibold bg-red-50 text-[#E71D36] px-2 py-0.5 rounded-full"
        title={divergent ? t("an.peakByAvgTip") : undefined}
      >
        {t("an.peak")} {dow_(stats.peakDay)}{divergent ? " *" : ""}
      </span>
    );
  })()}
  ```
  (nome da função de tradução de dia é `dow` no componente — usar identificador
  diferente no exemplo, ex. `dow_`, para não colidir; o implementador ajusta ao
  nome real usado no arquivo.)
- Novas chaves i18n (pt-BR/EN, mesmo par de blocos do RF5): `an.avgPerOcc` (pt:
  `"média/ocorrência"`; en: `"avg/occurrence"`), `an.peakByAvgTip` (pt: `"Este dia
  tem menos visualizações somadas que outro, mas ocorreu menos vezes na janela — a
  média por ocorrência é maior"`; en: `"This day has fewer summed views than
  another, but occurred fewer times in the window — its per-occurrence average is
  higher"`).

Sem `occurrences`/`avg` no payload (API antiga, PRD 06 ainda não deployado): `hasAvg`
é `false`, `divergent` é `false`, o asterisco e o tooltip novo NUNCA aparecem —
comportamento 100% idêntico ao atual. Nenhuma barra muda de altura (continuam por
`views`, soma bruta — "não redesenhar"); só o tooltip e o indicador textual do badge
mudam, e só quando o dado justificar.

### RF7 — Auditoria e blindagem de estados vazios (todos os cards do módulo)

Confirmar, por observação de código (sem alterar comportamento onde já está
correto), que cada card com dado genuinamente ausente mostra um estado vazio
honesto — nunca `NaN%`, `undefined`, `Infinity%`, barra negativa ou tabela com uma
linha de zeros disfarçando ausência de registro. Tabela de verificação (todas já
corretas na leitura desta sessão — §2.5 — este RF é sobre MANTER, não mudar):

| Card | Guarda de vazio | Chave i18n |
|---|---|---|
| Top categorias (detalhado) | `topCats.length === 0` (`:787`) | `an.noCategoryData` |
| Top categorias (Dashboard) | `!stats \|\| length === 0` (`Dashboard.tsx:335`) | `dash.noData` |
| Top artigos | `topArts.length === 0` (`:743`) | `an.noDataYet` |
| Pico por dia da semana | `every(d => d.views === 0)` (`:960`) | `an.waitingData` |
| Profundidade de leitura | `every(d => d.count === 0)` (`:993`) | `an.noScrollData` |
| Desempenho por anúncio (linha) | `ad.hasData === false` (`:1108`) | `an.noAdDataPeriod` |

Com as mudanças de RF2/RF3 (base de normalização), reconfirmar que o caso "todas as
categorias em 0" continua caindo no ramo de EmptyState (`length === 0`) OU, se
`topCategories` vier não-vazio mas todo zerado (catálogo listado sem acesso — estado
LEGÍTIMO documentado no PRD 06 §11: "Todas as categorias com 0 acessos [...] lista
ordenada por nº de artigos DESC [...] estado legítimo, não bug; o card continua
rotulado 'por acessos' e o front pode mostrar estado vazio"), os chips mostram
`0.0%` honesto (RF2) em vez de renderizar a tabela do catálogo como se tivesse
dados de acesso reais. Este PRD NÃO adiciona um segundo EmptyState para esse caso
intermediário (catálogo sem acesso) — mantém a tabela visível com 0% em todas as
linhas, que já é informação honesta (mostra o catálogo do blog) — decisão
registrada aqui para não ser reaberta.

### RF8 — Blindagem de loading/refreshing states (preservação)

Nenhuma mudança de comportamento. Confirmar por leitura (§2.5, já feita) e por
regressão manual pós-rollout (§8.3) que `loading` (`:186,:308-317`), `refreshing`
(`:188,:200-226,:478,:481`) e `error` (`:187,:222,:319-327`) continuam cobrindo,
respectivamente: carregamento inicial (spinner de tela cheia), auto-refresh de 30s
(ícone `RefreshCw` girando, sem re-mostrar o spinner cheio) e falha de rede
(mensagem `an.loadError`, sem tela em branco).

### RF9 — Blindagem de comparativos de período e toggles (preservação)

Nenhuma mudança de comportamento. Confirmar que o seletor de período
(`periodKey`/`customFrom`/`customTo`, `:192-210,:458-478`) e o toggle Cidades/
Estados (`geoTab`, `:190,:832-839`) continuam funcionando após as mudanças de
RF2-RF6 (nenhum deles é tocado por este PRD — a verificação é regressão pura).

### RF10 — Painel de Saúde da coleta: NÃO-GOAL explícito

Este PRD **NÃO edita** o card "Saúde da coleta" (`Analytics.tsx:1336-1369` e a
interface `Health`, `:75-80`) — fronteira explícita do PRD 08 (§2 do cabeçalho
deste documento). O rótulo "desde o boot" já existe HOJE de forma correta:
`an.collectionHealthSub` = `"(contadores desde o último reinício do servidor)"`
(`web/lib/adminI18n.ts:297` pt-BR; bloco EN citado no PRD 08 `:1124-1142`) — o
PRD 08 vai adicionar a exibição explícita de `bootAt` formatado ao lado desse
sub-rótulo (PRD 08 RF2), a tabela por endpoint, os alertas e o `<details>` de
filtros — tudo dentro do card que ele já possui como fronteira própria. Ação deste
PRD: nenhuma edição de código no card; verificação de não-regressão em §8.1 (grep
confirmando que o diff deste PRD não toca as linhas `1336-1369`) e em §9 (CA
dedicado). Se, no momento da implementação, o PRD 08 ainda não tiver sido
implementado, este card permanece exatamente como está hoje — não é bloqueio para
nenhum RF1-RF9 deste PRD (arquivos e blocos de JSX diferentes).

---

## 5. Requisitos não-funcionais

- **Performance:** zero requisição de rede nova (RF1-RF9 operam só sobre o payload
  já buscado por `fetchStats`, `:200-226`); `maxMetric`/`pctOfMax` são O(n) sobre
  arrays de no máximo dezenas de itens (categorias, dias da semana) — custo
  desprezível, sem novo `useEffect`/polling.
- **LGPD:** nenhuma coleta, exibição ou persistência de dado pessoal novo — este PRD
  é 100% correção de exibição de agregados já existentes no payload.
- **Confiabilidade:** todas as mudanças em campos consumidos de outros PRDs (06/07)
  são ADITIVAS e tolerantes a ausência (`??`, checagem `typeof`/`Number.isFinite`) —
  o painel nunca quebra (tela branca/exceção React) se um blog ainda estiver numa
  imagem sem os PRDs 06/07/08. Nenhum novo `throw`/acesso não-guardado a índice de
  array.
- **Multi-blog:** mesma imagem `blog-web:vN` para os 8 blogs; nenhuma condicional
  por `BLOG_ID`/domínio/nome de blog em nenhum dos arquivos tocados (CLAUDE.md
  §13/§17). Rollout e validação por blog em §15.
- **Windows/dev (CLAUDE.md §14):** `vite build` do `web` NÃO roda localmente — só
  `pnpm run typecheck` (dentro de `artifacts/brasilia-agora`, o filtro da raiz não
  casa no Windows) e os testes via `pnpm test` (script real do pacote —
  `tsx --test src/**/*.test.ts`, NÃO `node --test` puro nem vitest); build real e
  validação visual acontecem na VPS (Docker) no rollout do §15; imports relativos
  nos arquivos de teste do pacote SEM extensão explícita (padrão REAL de
  `web/lib/analyticsClient.test.ts`, que faz `from "./analyticsClient"` — o `tsx`
  resolve sem `.ts`; DIFERENTE das suites `node --test` de `api-server`/
  `news-engine`/`central-hub`, que exigem `.ts` explícito, CLAUDE.md §14); nenhum
  caractere unicode literal em regex (nenhuma regex nova é introduzida por este PRD).

---

## 6. Modelo de dados

**Nenhuma coluna, tabela, índice ou statement de `ensureSchema.ts` é criado, alterado
ou consumido por este PRD.** É um PRD 100% de frontend — nenhum arquivo de
`artifacts/api-server` ou `lib/db` é tocado (verificável por `git diff --stat` em
§8.1). A regra do CLAUDE.md §17 ("colunas novas SEMPRE via schema Drizzle E
`ensureSchema.ts`") é respeitada por vacuidade: não há necessidade de coluna nova
para exibir campos que os PRDs 06/07 já entregam pela API.

---

## 7. Contrato de API

**Nenhum endpoint novo, nenhuma mudança de request.** Este PRD é consumidor puro dos
contratos aditivos já definidos pelos PRDs 06 e 07 em `GET /api/analytics/stats`
(endpoint existente, `api/routes/analytics.ts:366`, inalterado por este PRD):

| Campo consumido | Origem/contrato | Uso neste PRD |
|---|---|---|
| `topCategories[].{name,views,clicks,articles}` | já existia; ORDEM corrigida pelo PRD 06 RF-1 (não é um campo novo — este PRD não depende da ordem para corrigir a base de normalização, RF1 usa `maxMetric` sobre o array inteiro) | RF2/RF3 |
| `dayOfWeekChart[].occurrences` (novo, `number`) | PRD 06 §7 RF-3 — aditivo | RF6 |
| `dayOfWeekChart[].avg` (novo, `number \| null`) | PRD 06 §7 RF-3 — aditivo | RF6 |
| `peakDay` (mesma chave, semântica nova: eleito por média, não soma) | PRD 06 §7 RF-3 | RF6 (já funciona sem mudança — §2.3) |
| `scrollDepthChart[].count` (mesma chave; valor pode CAIR após o PRD 06 RF-4 fechar a dupla contagem) | PRD 06 §7 | RF5 (só rótulo — o valor já reflete o fix quando o PRD 06 estiver no ar) |
| `behaviorStats.searchesTotal` (novo, `number`) | PRD 07 §7 RF1/RF2 — aditivo | RF4 |
| `behaviorStats.externalClicksTotal` (novo, `number`) | PRD 07 §7 RF1/RF2 — aditivo | RF4 |
| `behaviorStats.searchTermsDistinct`/`linkDomainsDistinct` (novos, `number`) | PRD 07 §7 — aditivo | recebidos no tipo (RF4); exibição opcional, não obrigatória neste PRD (ver §11) |

Nenhum campo é removido, renomeado ou tem seu tipo estreitado. Todos os campos novos
consumidos são opcionais (`?:`) nas interfaces locais deste PRD (`Stats` em
`Analytics.tsx`) — o painel funciona (com o comportamento ATUAL, não pior) mesmo
contra uma API que ainda não implementou os PRDs 06/07.

---

## 8. Comandos de verificação (rodar exatamente estes, com resultado esperado)

### 8.1 Local (Windows, antes do commit)

```powershell
cd "c:\Users\Usuario(a) Master\sp011\artifacts\brasilia-agora"
pnpm run typecheck
# esperado: sem erros
pnpm test
# esperado: TODOS os testes passam, incluindo o novo src/lib/analyticsDisplay.test.ts
```

```powershell
cd "c:\Users\Usuario(a) Master\sp011"
git grep -n "maxMetric\|pctOfMax" -- artifacts/brasilia-agora/src
# esperado: definicao em lib/analyticsDisplay.ts + uso em pages/admin/Analytics.tsx
#           E pages/admin/Dashboard.tsx (>=3 arquivos)
git grep -n "topCats\[0\]" -- artifacts/brasilia-agora/src/pages/admin/Analytics.tsx
# esperado: NENHUMA ocorrência (exit code 1) — base antiga removida
git grep -n "stats.topCategories\[0\]" -- artifacts/brasilia-agora/src/pages/admin/Dashboard.tsx
# esperado: NENHUMA ocorrência (exit code 1) — base antiga removida
git grep -n "searchesTotal" -- artifacts/brasilia-agora/src/pages/admin/Analytics.tsx
# esperado: >=2 hits (tipo + uso no tile "Buscas realizadas")
git grep -n "an.sessions" -- artifacts/brasilia-agora/src
# esperado: NENHUMA ocorrência (exit code 1) — chave removida nos dois blocos e no uso
git grep -n "an.readDepthUnit" -- artifacts/brasilia-agora/src/lib/adminI18n.ts
# esperado: exatamente 2 hits (pt-BR e EN)
git diff --stat HEAD~1 -- artifacts/api-server lib/db
# esperado: VAZIO — este PRD não toca api-server nem lib/db (§6)
git diff --stat HEAD~1 -- artifacts/brasilia-agora/src/pages/admin/Analytics.tsx | grep -c "1336,\|1337,\|1338,"
# checagem manual do range do diff: nenhum hunk deve cobrir as linhas 1336-1369
# (card Saude da coleta — fronteira PRD 08, RF10). Conferir visualmente o diff
# completo do arquivo, já que grep de hunk-range varia por formatação do git.
```

### 8.2 Verificação de tipo/estrutura (defensiva contra regressão de contrato)

```powershell
cd "c:\Users\Usuario(a) Master\sp011"
git grep -n "occurrences\?\?:" -- artifacts/brasilia-agora/src/pages/admin/Analytics.tsx
git grep -n "avg\?\?:" -- artifacts/brasilia-agora/src/pages/admin/Analytics.tsx
# esperado: os dois campos aparecem na interface Stats.dayOfWeekChart (RF6)
```

### 8.3 Verificação manual em produção/staging (pós-rollout, NÃO depende de banco)

Estas verificações são de OBSERVAÇÃO VISUAL no navegador (login admin) — não
exigem consulta SQL nem MCP Supabase; são objetivas (comparar número exibido/
comportamento contra a regra escrita, não "parece certo"). Rodar no canário
(resenhavip) antes dos demais blogs (§15):

1. Card "Top categorias" (Analytics → aba principal, seção detalhada): nenhum chip
   de "%" mostra valor > `100.0%`; se pelo menos uma categoria tiver
   `views+clicks > 0`, o chip da categoria de maior `views+clicks` mostra
   exatamente `100.0%`.
2. Card "Top categorias" (Dashboard): nenhuma barra ultrapassa visualmente a
   largura do card (inspecionar DOM: nenhum `style="width: ...%"` acima de 100%).
3. Card "Resumo de interações": abrir DevTools → Network →
   `GET /api/analytics/stats?period=30d` → Response; se
   `behaviorStats.searchesTotal` existir no JSON, o valor exibido em "Buscas
   realizadas" no card é IGUAL a `behaviorStats.searchesTotal` (não à soma do
   array `topSearchTerms`, que pode ser menor); idem para "Cliques externos" vs
   `externalClicksTotal`. Se o campo NÃO existir no JSON (PRD 07 ainda não
   deployado nesse blog), o valor exibido é a soma do array truncado (comportamento
   atual — mudança adiada, não regressão).
4. Card "Profundidade de leitura": o texto ao lado de cada contagem é "leituras"
   (não "sessões"); o subtítulo do card é "leituras que chegaram até" (não
   "sessões que chegaram até").
5. Card "Pico por dia da semana": se `dayOfWeekChart[].avg` existir no JSON (PRD 06
   deployado) e o dia destacado não for o de maior barra, passar o mouse sobre o
   badge mostra o tooltip explicativo (`an.peakByAvgTip`) e um `*` aparece ao lado
   do nome do dia.
6. Card "Saúde da coleta": nenhuma regressão visual (mesmos 6 tiles + rodapé de
   hoje) — confirma que RF10 não vazou nenhuma edição para este card.
7. Loading/refresh/período/Cidades-Estados: comportamento idêntico ao pré-rollout
   (spinner só no load inicial; ícone de refresh gira durante o auto-refresh de
   30s; trocar o período recarrega o payload; alternar Cidades/Estados não
   dispara nova requisição de rede — conferir na aba Network).

---

## 9. Critérios de aceite

Mapeamento: itens **3, 14, 17, 18, 24** da checklist do doc v2 (correção) e **1, 2,
5, 7-13, 15, 16, 19-23, 25** (preservação verificada). Nenhum critério é subjetivo.
Critérios que dependem de observação em produção estão marcados **verificação
manual pós-rollout** (não exigem banco — ver nota de escopo abaixo); nenhum
critério deste PRD depende de query SQL (PRD 10 é puro frontend/exibição — a única
menção a "pendente de execução" no sentido do CLAUDE.md/doc v2, que é
especificamente sobre banco/MCP Supabase, não se aplica a nenhum CA aqui).

| # | Critério | Item/Regra | Verificação | Status na escrita |
|---|---|---|---|---|
| CA1 | `pnpm run typecheck` e `pnpm test` (brasilia-agora) passam, incluindo `analyticsDisplay.test.ts` novo | 14, 3 | §8.1 → exit 0 / todos ok | a executar no dev |
| CA2 | `maxMetric`/`pctOfMax` existem em `analyticsDisplay.ts` e são usados por `Analytics.tsx` E `Dashboard.tsx`; nenhuma ocorrência remanescente de `topCats[0]`/`stats.topCategories[0]` como base de normalização | 14, 3 | greps do §8.1 | a executar no dev |
| CA3 | Propriedade testada: para QUALQUER lista sintética de categorias (inclusive líder com atividade 0 e outra linha com atividade > 0), `pctOfMax` nunca retorna valor fora de `[0, 100]` | 14 | teste 1-3 do §12 | a executar no dev (pure function — determinístico) |
| CA4 | `topSearchTerms[0]`/`topLinkDomains[0]` como base das barras dos cards "Termos mais buscados"/"Links externos" NÃO são alterados por este PRD (são corretos — arrays já vêm ordenados pelo PRD 07) | fronteira (não regressão) | `git diff` não toca as linhas `:1221`/`:1257` | a executar no dev |
| CA5 | "Buscas realizadas"/"Cliques externos" usam `searchesTotal`/`externalClicksTotal` quando presentes no payload, com fallback para a soma truncada quando ausentes (nunca `undefined`/crash) | 24 | grep `searchesTotal` do §8.1 + teste de shape (fallback) no componente — verificação manual §8.3 item 3 | verificação manual pós-rollout (para a comparação de VALOR real) |
| CA6 | Card de Profundidade de leitura não usa mais a chave `an.sessions`; usa `an.readDepthUnit`="leituras"/"reads" no rótulo inline e no subtítulo | 18 | grep `an.sessions` (ausente) + `an.readDepthUnit` (2 hits) do §8.1 | a executar no dev |
| CA7 | `an.readDepthTip` (tooltip) permanece inalterado (já estava correto) | 18 | `git diff` não toca a linha da chave `an.readDepthTip` | a executar no dev |
| CA8 | Interface `Stats.dayOfWeekChart` aceita `occurrences?`/`avg?` sem quebrar o typecheck quando ausentes no JSON real (API antiga) | 17 | §8.2 + CA1 (typecheck) | a executar no dev |
| CA9 | Badge do dia de pico exibe indicador (`*` + tooltip) SOMENTE quando `avg` está presente E o dia eleito diverge do de maior `views` bruto; em qualquer outro caso, comportamento idêntico ao atual | 17 | teste do componente não aplicável (sem RTL no repo) — verificação manual §8.3 item 5 | verificação manual pós-rollout |
| CA10 | Nenhum arquivo de `artifacts/api-server` ou `lib/db` é tocado pelo commit deste PRD | fronteiras (§6) | `git diff --stat` do §8.1 → vazio | a executar no dev |
| CA11 | Nenhuma linha do card "Saúde da coleta" (`Analytics.tsx:1336-1369`) é tocada pelo commit deste PRD | fronteira PRD 08 (RF10) | inspeção do diff completo (§8.1) | a executar no dev |
| CA12 | Nenhuma linha do card "Fontes de tráfego" (`Analytics.tsx:586-653`) é tocada pelo commit deste PRD | fronteira PRD 05 | inspeção do diff completo | a executar no dev |
| CA13 | Estados vazios da tabela do §4/RF7 continuam disparando nos mesmos cenários (janela sem dados) | 3,13,17,18,20 | verificação manual pós-rollout, blog sem tráfego ou período "hoje" num blog novo | verificação manual pós-rollout |
| CA14 | Loading inicial, ícone de refresh (30s) e mensagem de erro de rede continuam funcionando sem alteração de comportamento | módulo 10 (doc v2) | verificação manual §8.3 item 7 | verificação manual pós-rollout |
| CA15 | Seletor de período e toggle Cidades/Estados continuam funcionando sem alteração de comportamento | módulo 10 (doc v2) | verificação manual §8.3 item 7 | verificação manual pós-rollout |
| CA16 | Pós-rollout, os cards da lista do §15 revalidados no canário resenhavip e depois nos demais blogs provisionados | multi-blog (doc v2) | observação por blog (§15) | verificação manual pós-rollout |

---

## 10. Invariantes do CLAUDE.md §17 preservadas por este PRD

1. **Heartbeat cumulativo agregado por MAX** — não tocada: este PRD não lê nem
   recalcula `read`/heartbeat; `engagement.avgReadTime` é só exibido, sem novo
   cálculo.
2. **Tráfego interno marcado `is_internal`, nunca dropado** — não tocada: nenhum
   filtro de admissão de evento é alterado; este PRD só formata valores já
   agregados pelo servidor.
3. **`totals.*` do `/stats` fixos ao agora** — não tocada: `stats.totals` é lido e
   exibido sem reindexação ao período selecionado (`:373`, inalterado).
4. **Canal classificado no servidor** — não tocada: o card "Fontes de tráfego" é
   explicitamente FORA de escopo (fronteira PRD 05, CA12).
5. **Migrações de coluna via Drizzle schema E `ensureSchema.ts`** — não acionada:
   nenhuma coluna nova (§6).
6. **Colunas novas se autocriam no boot** — idem, não acionada.
7. **Isolamento entre blogs / nada hardcodado por blog na imagem** (§13, reforça
   §17) — nenhuma referência a `BLOG_ID`/nome de domínio em nenhum arquivo tocado;
   as correções são 100% genéricas, dependentes só do payload recebido.
8. **SSR/perf ("HTML `no-cache` nunca `no-store`", sanitize isomórfico, allowlist
   do proxy de imagem)** — não tocadas: `Analytics.tsx`/`Dashboard.tsx`/
   `AdsManager.tsx` são páginas do `/admin`, atrás de autenticação, SEM rota SSR
   (SSR só cobre a home pública — CLAUDE.md §17) — nenhum header de cache, rota
   pública ou HTML servidor-renderizado é afetado por este PRD.
9. **Linhas históricas nunca são reescritas** — não aplicável (este PRD não
   escreve no banco em nenhuma hipótese; é 100% leitura/exibição client-side).

---

## 11. Casos de borda

- **Todas as categorias com 0 acesso** (blog novo/recém-backfillado, catálogo sem
  tráfego real): `maxMetric` retorna `0`, `pctOfMax` retorna `0` para todas as
  linhas — chips mostram `0.0%` honesto, nenhuma barra tem largura, nenhum
  `NaN%`/`Infinity%`. Estado LEGÍTIMO — não é bug (RF7).
- **Backend ainda sem o PRD 06 no ar** (ordenação de `topCategories` ainda com o
  fallback do item 3): `maxMetric` percorre TODO o array, não confia na ordem —
  o chip/barra continuam corretos mesmo com o backend "errado" na ordenação
  (defesa em profundidade — RF1).
- **Backend ainda sem o PRD 07 no ar** (`searchesTotal`/`externalClicksTotal`
  ausentes): fallback `??` retorna a soma truncada — mesmo número exibido hoje
  (não regride, não quebra) — RF4.
- **Backend ainda sem o PRD 06's `occurrences`/`avg`**: card de dia da semana
  continua idêntico ao atual (barras por soma, badge sem asterisco/tooltip extra)
  — RF6.
- **`topCategories` com exatamente 1 categoria**: `maxMetric([cat], ...)` = valor
  da própria categoria; `pctOfMax(v, v)` = `100`. Comportamento trivial, coberto
  por teste (§12).
- **Todas as categorias empatadas em atividade > 0**: todos os chips mostram
  `100.0%` — correto (todas são "o líder").
- **`stats.behaviorStats` inteiro `undefined`** (payload malformado/erro parcial de
  API): `stats.behaviorStats?.searchesTotal ?? stats.behaviorStats?.topSearchTerms.reduce(...) ?? 0`
  — a segunda tentativa também usa `?.`, cai em `0` sem lançar exceção.
- **`dayOfWeekChart` vazio (`[]`)**: `every(d => d.views === 0)` sobre array vazio é
  `true` (vacuously) — cai no `EmptyState` (`an.waitingData`), comportamento atual
  preservado, não alterado por RF6.
- **Valor negativo ou não-numérico vindo de um payload corrompido**
  (`Number.isFinite` falha ou `<= 0`): `maxMetric`/`pctOfMax` tratam como `0` —
  nunca propagam `NaN`/`-Infinity` para o `style.width` do CSS (que renderizaria
  layout quebrado).
- **`period=custom` sem `from`/`to` preenchidos**: comportamento atual preservado —
  o fetch nem dispara (`:207`), sem chamada de API pela metade (RF9, não alterado).
- **Duas abas do admin abertas simultaneamente** com auto-refresh de 30s cada:
  sem interferência — cada aba tem seu próprio estado React; nenhuma mudança
  deste PRD introduz estado compartilhado entre abas.
- **Card "Pico por dia da semana" com `peakDay === null`** (janela totalmente sem
  eventos): o badge inteiro não renderiza (`stats.peakDay &&`, `:954` — condição já
  existente, preservada); RF6 não adiciona lógica que rode com `peakDay` nulo.

---

## 12. Plano de testes (`tsx --test`, CLAUDE.md §14 — script real do pacote)

Novo arquivo `artifacts/brasilia-agora/src/lib/analyticsDisplay.test.ts` — mesmo
padrão de `web/lib/analyticsClient.test.ts` (import de `node:test`/
`node:assert/strict`, zero DOM, zero mock de rede):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { maxMetric, pctOfMax } from "./analyticsDisplay";
```

Casos (CA3 e adjacentes):

1. **`maxMetric` ignora a ordem** — `[{v:0},{v:5},{v:2}]` com `pick=x=>x.v` → `5`
   (não `0`, que seria o `[0]`).
2. **`maxMetric` com líder-por-fallback em 0 e outra linha com atividade** —
   fixture que reproduz o cenário do bug real: `[{views:0,clicks:0,articles:30},
   {views:3,clicks:0,articles:1}]` com `pick = c => c.views + c.clicks` → `3`
   (nunca `0`).
3. **`maxMetric` lista vazia** → `0`. **Todo valor <= 0** → `0`. **Valor não-finito
   (`NaN`/`Infinity`) no meio da lista** → ignorado, não vira o máximo.
4. **`pctOfMax` nunca excede 100** — propriedade: para qualquer `value >= 0` e
   `max > 0` tais que `value <= max`, `pctOfMax(value, max) <= 100`; para
   `value > max` (não deveria acontecer nos dados reais, mas é defesa), ainda
   assim `<= 100` (clamp).
5. **`pctOfMax` com `max <= 0`** → `0` para qualquer `value` (nunca divide por
   zero, nunca retorna `Infinity`/`NaN`/`100` por acidente).
6. **`pctOfMax` com `value` não-finito/negativo** → `0`.
7. **`pctOfMax(x, x)` (líder consigo mesmo)** → `100` exato (não `99.9`/`100.1` por
   erro de ponto flutuante — usar `assert.equal`, valores inteiros nos fixtures).
8. **Reprodução end-to-end do bug relatado**: fixture com 4 categorias onde a
   ordenação de ENTRADA (simulando o array já recebido do endpoint, ordenado pelo
   critério do item 3) coloca a categoria de maior atividade na posição 2 (não 0)
   — `maxMetric` + `pctOfMax` sobre esse array produzem o mesmo resultado
   correto que produziriam se a categoria estivesse na posição 0 (prova de que o
   fix independe da ordem).

Comando: `cd artifacts/brasilia-agora && pnpm test` (roda `tsx --test
src/**/*.test.ts` — inclui o arquivo novo automaticamente pelo glob do script).

**O que NÃO é testável por `tsx --test` neste PRD** (requer DOM/render de React —
o repo não tem React Testing Library nem framework de teste de componente
instalado, e instalar um é fora de escopo deste PRD): a integração visual real
(chip renderizado, largura de barra CSS, badge com tooltip, troca de rótulo na
tela). A garantia para essas partes vem de três camadas: (a) as funções puras
100% testadas acima; (b) os greps estruturais do §8.1 confirmando que o
componente CHAMA a função pura em vez de reimplementar a fórmula (elimina o risco
de "corrigi a função mas esqueci de trocar o call site"); (c) a verificação manual
objetiva do §8.3/§15 no navegador, pós-rollout, no canário antes da rede.

---

## 13. Plano de rollback

Sem migração de schema e sem escrita em banco (PRD 100% de exibição) → rollback é
só de imagem do serviço `web`, o mais simples possível:

```bash
# Reverter o código-fonte
cd /opt/sp011
git revert <commit-deste-PRD>
git push
```

```bash
# Rollback rápido por blog (sem rebuild — a tag anterior já existe na VPS)
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

Efeito do rollback: o painel `/admin` volta EXATAMENTE ao comportamento anterior
(chips podendo mostrar >100%, "Buscas realizadas" subcontando, rótulo "sessões").
Nenhum dado precisa ser restaurado — nada foi escrito diferente em banco algum (o
`api` nem é tocado por este PRD; um rollback do `web` isolado é seguro mesmo que
os PRDs 06/07/08 já estejam no ar no `api`, porque todo consumo novo é aditivo com
fallback — reverter só o `web` volta ao consumo antigo dos MESMOS campos, sem
quebrar o `api` mais novo).

**Critério de acionamento:** qualquer CA do §9 quebrado no canário (resenhavip),
exceção JavaScript não tratada em qualquer card do Analytics/Dashboard, ou chip/
barra ainda mostrando valor fora de `[0,100]` após o deploy.

---

## 14. Riscos e dependências (FRONTEIRAS do STATUS.md — obrigatórias)

| PRD | Fronteira/dependência |
|---|---|
| **PRD 02** (tracking client) | Dono do rótulo "sessões" do card de scroll (citado em `02:836,:275` como fronteira PRD 10 — **este PRD a cumpre em RF5**) e da cobertura de `link_click` — não sobreposto. |
| **PRD 04** (propagandas) | Dono de TODOS os bugs de dado de anúncio (upsert, UNIQUE, dedup) — este PRD não toca `AdsManager.tsx` nem os cards de anúncio do Analytics além de auditar (RF7) que o `hasData`/EmptyState continuam corretos. Item OPCIONAL não-bloqueante registrado pelo PRD 04 (§14 de lá): "exibição opcional dos contadores internos, dataKey homônimo do top-3 [de anúncios homônimos]" — **NÃO faz parte do mínimo deste PRD**; se implementado depois, é um PRD/ticket próprio, não uma pendência deste documento. |
| **PRD 05** (fontes de tráfego) | Declara explicitamente "nenhum componente de exibição muda aqui [...] estados vazios do card e demais ajustes visuais são do 10" — mas a auditoria NÃO confirmou nenhum bug de EXIBIÇÃO no card "Fontes de tráfego" (o bug é 100% de classificação no servidor) — **este PRD não abre nenhum RF para esse card** (CA12 confirma que não foi tocado). |
| **PRD 06** (agregações) | **Dependência de contrato, não de ordem de deploy.** Entrega a ordenação corrigida de `topCategories` (RF2/RF3 deste PRD funcionam de qualquer forma — `maxMetric` não depende da ordem) e os campos aditivos `occurrences`/`avg` de `dayOfWeekChart` (RF6, com fallback total quando ausentes) e a correção da chave de dedup do scroll (RF5 só troca o RÓTULO — o VALOR de `scrollDepthChart[].count` já é corrigido pelo PRD 06, não por este). Pode ser implementado antes OU depois deste PRD sem quebrar nada. |
| **PRD 07** (comportamento no site) | **Dependência de contrato, não de ordem de deploy.** Entrega `searchesTotal`/`externalClicksTotal` (RF4, com fallback para a soma truncada quando ausentes). Pode ser implementado antes OU depois deste PRD. |
| **PRD 08** (saúde da coleta) | Dono INTEGRAL do card "Saúde da coleta" — este PRD declara NÃO-GOAL explícito (RF10) e verifica, por CA11, que nenhuma linha daquele card foi tocada. Se o PRD 08 subir depois deste, nenhuma interação — arquivos/blocos de JSX completamente diferentes. |
| **PRD 09** (contratos de API por card) | Ainda não escrito no momento da escrita deste PRD (`analytics-audit/09-*.md` não existe no repo). Este PRD consome os contratos JÁ documentados pelos PRDs 06/07/08 (que descrevem seus próprios payloads em detalhe) e o contrato ATUAL do `/stats`/`/health` (lido diretamente do código-fonte nesta sessão — §2). **Risco registrado:** se o PRD 09, quando escrito, redefinir nomes/shape de algum campo consumido aqui (`topCategories`, `behaviorStats.*`, `dayOfWeekChart.*`), este PRD precisa ser revisitado antes da implementação — checar `analytics-audit/09-*.md` (se existir) contra §7 deste documento antes de codar. |
| **PRD 11** (validação cross-metric) | Não consome nada deste PRD diretamente (é puro frontend) — mas os PRDs 06/07 declaram regras (`R07-1..4`, CA-8/CA-9 do PRD 06) que, se violadas em produção, indicariam que os campos que este PRD exibe (`searchesTotal`, `occurrences`) estão incoerentes — nesse caso o bug é DAQUELES PRDs, não deste. |
| **PRD 12** (testes/validação) | Absorve o padrão de teste deste PRD (`analyticsDisplay.test.ts`) na estratégia geral de `tsx --test` do pacote `brasilia-agora`. |

**Riscos técnicos:**

1. *Rollout parcial (web novo + api antigo em algum blog, ou vice-versa)*: coberto
   por design — todos os campos novos consumidos são opcionais com fallback
   (§4 RF4/RF6); nenhum CA deste PRD assume que o `api` já tem os PRDs 06/07.
2. *Duplicação de lógica de normalização não eliminada por completo*: RF2 remove a
   duplicação `maxCatViews`/`maxActivity` de `Analytics.tsx`, mas o Dashboard.tsx
   (RF3) e o Analytics.tsx (RF2) continuam sendo DOIS call sites separados de
   `pctOfMax` com bases diferentes (`views` vs `views+clicks`) — decisão
   deliberada (preservar a semântica distinta de cada card, "não redesenhar"), não
   um defeito remanescente.
3. *Mesma imagem, 8 blogs*: erro de tipo/render no `web` quebra o painel admin da
   rede inteira — mitigado por `pnpm run typecheck` + `pnpm test` obrigatórios
   antes do commit, canário resenhavip antes dos demais (§15), e rollback de tag
   trivial (§13, sem dado a desfazer).
4. *Ausência de teste de componente (RTL)*: aceito como limitação do repo (§12) —
   compensado por funções puras exaustivamente testadas + greps estruturais +
   verificação manual objetiva no canário antes do rollout completo.

---

## 15. Rollout multi-blog (padrão CLAUDE.md §6) + cards a revalidar

Só `artifacts/brasilia-agora` muda → serviço afetado: `web` (mapeamento §5 do
CLAUDE.md). O build padrão do §6 versiona `api` e `web` juntos mesmo quando só um
muda — seguir o fluxo completo de imagem.

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
# 2) Canario (resenhavip) — conferir o site E os cards do §8.3 ANTES de seguir
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

Diagnóstico anti-mistura (incidente clássico): `curl -s https://<dominio>/api/site
| grep -o '"siteName":"[^"]*"'` em cada domínio deve devolver o próprio nome.

**Cards do dashboard a revalidar POR BLOG após o rollout** (primeiro no canário
resenhavip; depois em sp011, ksports, esporteagora, oleysports, beeesportes e — se
já provisionados — pontofarma e creditovc). Login no `/admin` de cada blog,
Analytics e Dashboard:

| Card | O que conferir (observação objetiva) |
|---|---|
| Dashboard → Top categorias | Nenhuma barra ultrapassa a largura do card; barra mais longa corresponde à categoria de maior `views` quando alguma tiver `views > 0` |
| Analytics → Top categorias (detalhado) | Nenhum chip de "%" acima de `100.0%`; categoria líder mostra `100.0%` quando houver alguma com atividade |
| Analytics → Resumo de interações | "Buscas realizadas"/"Cliques externos" batem com `behaviorStats.searchesTotal`/`externalClicksTotal` do JSON (DevTools → Network) quando esses campos existirem; senão, valor igual ao pré-rollout |
| Analytics → Profundidade de leitura | Rótulo diz "leituras" (não "sessões"), inclusive no subtítulo do card |
| Analytics → Pico por dia da semana | Badge do dia eleito continua aparecendo; se o JSON já tiver `avg`/`occurrences` e o dia divergir da maior barra, aparece `*` + tooltip explicativo |
| Analytics → Termos mais buscados / Links externos | REGRESSÃO: idênticos ao pré-rollout (este PRD não toca essas duas barras — §2.1) |
| Analytics → Saúde da coleta | REGRESSÃO: idênticos ao pré-rollout (fronteira PRD 08, RF10) |
| Analytics → Fontes de tráfego | REGRESSÃO: idênticos ao pré-rollout (fronteira PRD 05) |
| Analytics → 5 KPIs, Tráfego ao longo do tempo, Dispositivos/Navegadores/Sistemas, Localização, Artigos top, Propagandas (KPIs/tabela/gráfico) | REGRESSÃO: idênticos ao pré-rollout (nenhum é tocado por este PRD) |
| Loading / auto-refresh / seletor de período / toggle Cidades-Estados | REGRESSÃO: comportamento idêntico ao pré-rollout (§8.3 item 7) |

Padrão pós-push (CLAUDE.md §18): a resposta do commit de implementação deve
terminar com os blocos acima prontos para colar.

---

## 16. Estimativa de esforço

**P** (pequeno). Um módulo puro novo (2 funções, ~15 linhas), 3 pontos de código
localizados nos componentes existentes (2 bases de normalização corrigidas + 1 troca
de consumo de campo), 1 troca de rótulo i18n (2 blocos), 1 adaptação aditiva/
tolerante de um card (dia da semana) e uma auditoria de preservação (estados
vazios/loading/toggles) que não exige mudança de código onde já está correto. Sem
migração, sem coluna, sem endpoint novo, sem alteração de `api-server`/`lib/db`. O
maior custo é a checagem de fronteira (garantir que nenhum RF vaza para os cards dos
PRDs 05/08) e a validação multi-blog pós-rollout (8 blogs, checklist de ~10 cards
cada) — ainda assim, menor que os PRDs de backend por não ter migração nem SQL de
sanidade a rodar.
