# PRD 02 — Tracking client-side (SDK do site público)

> **O que é este documento.** PRD de implementação, escrito para ser consumido pelo
> Claude Code numa sessão futura SEM o contexto da auditoria — autocontido: dá para
> executar lendo só este arquivo. Fontes: `analytics-audit/00-auditoria-estado-atual.md`
> (Fase 0.2, achados com evidência), `analytics-audit/00-inventario.md` (mapa; §8 tem
> correções de linha), `analytics-audit/STATUS.md` (FRONTEIRAS entre PRDs),
> `PRD_ANALYTICS_PLANEJAMENTO_v2.md` (template e descrição do módulo),
> `docs/ANALYTICS.md` (dicionário de métricas) e CLAUDE.md §§5, 6, 14, 17. As
> evidências `arquivo:linha` abaixo foram REABERTAS nos arquivos reais na sessão de
> escrita deste PRD (2026-07-23), exceto onde marcado "(cf. auditoria)".
>
> **DADOS REAIS (2026-07-23):** o Anexo A da auditoria foi executado; a §9.5 revelou que
> `behavior_events` está **VAZIA em toda a rede** (zero `link_click`/`newsletter` em 6
> blogs, ~2.000 pageviews). Isso adiciona um **pré-diagnóstico obrigatório ao RF2**
> (provar por que nada chega hoje antes de ampliar a cobertura) e reforça o RF1 (gate da
> newsletter). Fato = Confirmado com dados; causa = Hipótese (ver bloco no RF2).
>
> **Princípio obrigatório:** volume baixo NÃO é bug — os blogs são novos. Bug é o que
> é logicamente incorreto ou inconsistente, independente do volume. Este PRD não
> existe para "fazer números subirem": existe para que cada evento client-side
> dispare pelas regras certas (consentimento, marcação interna, dedup, cobertura) —
> mesmo que o resultado honesto seja um número MENOR.
>
> **Multi-blog:** os 8 blogs (sp011, ksports, esporteagora, resenhavip, oleysports,
> beeesportes, pontofarma, creditovc) rodam a MESMA imagem `blog-api:vN`/`blog-web:vN`
> (CLAUDE.md §6). Todo o código deste PRD vive no `brasilia-agora` (imagem `web`) —
> a correção vale para a rede inteira no próximo rollout, e um erro quebra a rede
> inteira de uma vez. Nenhum fix pode ser condicionado a BLOG_ID (CLAUDE.md §13/§17).
>
> **Encurtamentos:** `api = artifacts/api-server/src`, `web = artifacts/brasilia-agora/src`,
> `db = lib/db/src`.

---

## 1. Objetivo

Fechar as lacunas do SDK de tracking client-side (`web/hooks/useAnalytics.ts`,
`web/lib/analyticsClient.ts`, `web/components/ads/useAds.ts`) para que TODO evento
enviado pelo navegador obedeça às mesmas quatro regras, sem exceção:

1. **Gate LGPD**: nada sai do dispositivo sem `getConsent() === "accepted"` —
   inclusive newsletter (QUICK WIN) e impressão/clique de anúncio (hoje fora do gate).
2. **Marcação interna**: tráfego do operador é MARCADO (`internal:true`), nunca
   contado como público — inclusive a prévia `?adminPreview=1` aberta em navegador
   sem `admin_token` (hoje contaria como tráfego normal).
3. **Dedup/critério de disparo definido por evento**: tabela normativa única (RF8)
   de gatilho/debounce/dedup para os 11 eventos do client, incluindo dedup de
   `share` (hoje inexistente) e eliminação da janela de dupla contagem do `scroll`.
4. **Cobertura correta**: `link_click` com filtro de esquema (`mailto:`/`tel:` fora)
   e cobertura de site inteiro (hoje só corpo do artigo), sem contaminar com cliques
   de anúncio.

Itens da checklist do doc v2 cobertos: **18** (Profundidade de leitura — lado
client), **23** (Links externos clicados — lado client), **24** (Resumo de
interações — caminho da newsletter no client), **22** (Termos buscados — regressão),
e a parte de ADMISSÃO client dos itens **4/19/20/21** (anúncios — em coordenação com
o PRD 04, dono do servidor de ads).

---

## 2. Contexto / estado atual (achados da auditoria, com evidência)

### 2.1 O SDK hoje (Confirmado no código)

- **Gate comum de envio** — `send()` (`web/hooks/useAnalytics.ts:106-126`): só envia
  com `getConsent() === "accepted"` (`:107`; `getConsent` em
  `web/components/LGPDConsent.tsx:9-15`, default `null`); injeta `sessionId`
  (`getSessionId`, `:21-32`, chave `bee_session_id` em sessionStorage — **a "sessão"
  de todo o sistema é a aba**), `visitorId` só se consentido (`:36-50`) e
  `internal:true` quando `isInternalClient()` (`:54-61` — `import.meta.env.DEV` ou
  `localStorage.admin_token`). Transporte `navigator.sendBeacon` com fallback
  `fetch keepalive` (`:112-124`).
- **`sendBehavior()`** (`useAnalytics.ts:249-259`): mesmo gate + flag `internal`,
  POST em `/api/analytics/behavior`. Usado por `trackSearch` (`:261-264`) e
  `trackLinkClick` (`:266-268`).
- **Newsletter FORA do SDK** — os 2 formulários fazem `fetch` direto a
  `/api/analytics/behavior` **sem `getConsent()` e sem flag `internal`**:
  `web/components/Footer.tsx:62-76` (fetch em `:68-72`) e
  `web/components/blocks/HomeCustomBlocks.tsx:364-378` (fetch em `:370-374`) —
  cada um com uma CÓPIA local de `getSessionId` (`Footer.tsx:45-54`;
  `HomeCustomBlocks.tsx:337-344`). O e-mail digitado (dado pessoal) vai em
  `value` para `behavior_events.value` ignorando o gate LGPD usado por todo o resto
  do tracking, e inscrição feita por admin/dev conta como signup real (auditoria
  §4.6, item 24 — Bug). O servidor descarta interno só por flag ou IP cadastrado
  (`api/routes/analytics.ts:330`) — flag que estes formulários nunca enviam.
- **`link_click`** — só o corpo do artigo é instrumentado: links markdown
  (`web/pages/Artigo.tsx:281-285`, com filtro `^https?://` e exclusão por
  `startsWith(window.location.origin)`) e delegação no corpo HTML (`:408-413`,
  **sem filtro de esquema**: `mailto:`/`tel:` passam, e no servidor
  `new URL('mailto:...').hostname` = `""` → domínio vazio contado e renderizado como
  barra sem rótulo — auditoria §4.5, item 23 — Parcial). A exclusão por
  `startsWith(origin)` é comparação de prefixo de string, não de origin real.
  Links externos de rodapé/menu/blocos da home não contam, embora o card se
  apresente como "Links externos" do site.
- **`scroll`** — `useScrollDepth` (`useAnalytics.ts:276-339`): dedup por
  sessão+conteúdo em sessionStorage, MAS a chave é `bee_scroll_<articleId>` OU
  `bee_scroll_p:<path>` conforme `articleId` esteja definido (`:283`). O único
  consumidor é `Artigo.tsx:131`, que passa `article?.id` — `undefined` durante o
  load do artigo. Rolar durante o skeleton dispara marcos sob a chave `path`; após
  o load o hook re-roda com a chave `articleId` e pode disparar os MESMOS marcos de
  novo (chaves distintas também no servidor: `analyticsShared.ts:330` usa
  `sessionId|articleId ?? path` — auditoria §4.4, item 18 — Parcial).
- **`share`** — `trackShare` (`useAnalytics.ts:241-244`; call-site
  `Artigo.tsx:139-152`, envio em `:151`): **sem dedup** — cada clique envia
  (inventário §3: "sem dedup (cada clique envia)").
- **`search`** — `trackSearch` via `sendBehavior` (gate ok): `Header.tsx:296-302`
  (submit em `:298`) e `HomeCustomBlocks.tsx:473-484` (SearchForm, `:482`). OK
  (item 22). Busca via URL direta `/arquivo?q=` não é rastreada (auditoria §4.9).
- **Anúncios** — `useAdImpression` (`web/components/ads/useAds.ts:144-175`):
  viewability ≥50% por 1s contínuo (`IMPRESSION_DWELL_MS=1000`, `:128`), dedup SÓ
  no client, por ABA, via `sessionStorage bee_adimp_<id>` (`:130-135`) + `Set` por
  instância do hook (`:145`). `trackImpression` (`:121-124`) e `trackClick`
  (`:116-119`) têm como único filtro `isInternalTraffic()` (`:107-114` — DEV ou
  `admin_token`; SUPRIME em vez de marcar) e **nunca consultam `getConsent()`**
  (auditoria, claim j): visitante que ignora/rejeita o banner gera todas as
  impressões viewáveis e ZERO pageviews — assimetria estrutural que produz
  impressões >> pageviews mesmo com tráfego 100% honesto. Cliques nem têm dedup
  client. `docs/ANALYTICS.md:87` afirma dedup "1× por anúncio por sessão", mas o
  mecanismo real é 1× por ABA e só no client (correção registrada no inventário §8).
- **Prévia do admin** — `HomeBlocksManager.tsx:3013-3016` carrega o site real em
  iframe com `?adminPreview=1`; a flag só existe em `Home.tsx:755-756` (fonte dos
  blocos/otimizações) — **nenhum código de tracking a lê** (auditoria, claim f). A
  prévia só não conta hoje porque o iframe é same-origin e enxerga o `admin_token`.
  A MESMA URL aberta em navegador sem token (link copiado, outro dispositivo) conta
  impressões normalmente — e pageviews, se houver consentimento e IP não-interno.
- **Sem emissor no client** (tipos aceitos pelo servidor, whitelist `ALLOWED` em
  `api/routes/analytics.ts:325`): `video_play`, `download` (inventário §3).

### 2.2 O que NÃO é deste PRD (fronteiras do STATUS.md)

- Servidor de ads (UNIQUE, reparo, dedup server, dimensão interna, `adDailyChart`):
  **PRD 04** — que já antecipa o contrato do payload client (`sessionId`/`path`/
  `internal` no body, PRD 04 §7.1/§7.5).
- Classificação de canal / `paidClick`: **PRD 05** (servidor). O client continua
  enviando só sinais crus — nada de `parseUtm`/`takeFirstTouch` muda aqui.
- Coluna `is_internal` em `behavior_events`: **PRD 01** (coluna) + **PRD 03**
  (lógica de marcação no ingest). Este PRD apenas passa a ENVIAR a flag `internal`
  que o servidor já lê (`analytics.ts:330`) — "o servidor não distingue
  consentimento; PRD 03 anota" (STATUS.md, fronteiras).
- Totais de comportamento não truncados (soma top-15/top-10): **PRD 07**. Chave do
  scroll na agregação e demais defeitos do `/stats`: **PRD 06**. Rótulos/estados
  vazios de UI (barra sem rótulo, "sessões" no card de scroll): **PRD 10**.

---

## 3. Problema a resolver

1. **P1 (LGPD, QUICK WIN)**: e-mail de newsletter sai do navegador sem consentimento
   e sem marcação interna — único evento do sistema fora do gate; inscrição de
   admin conta como pública (item 24).
2. **P2**: `link_click` conta `mailto:`/`tel:` (domínio vazio no card), usa
   comparação de prefixo em vez de origin real, e cobre só o corpo do artigo
   enquanto o card promete "Links externos" do site (item 23).
3. **P3**: `scroll` tem janela de dupla contagem na troca de chave
   `path` → `articleId` durante o load do artigo (item 18).
4. **P4**: `share` sem dedup — cliques repetidos inflam o Resumo de interações
   (item 24) e o shareChart.
5. **P5**: `?adminPreview=1` sem `admin_token` no navegador trackearia como tráfego
   normal (pageview, read, scroll, impressões) — prévia não é audiência.
6. **P6**: impressão/clique de anúncio fora do gate LGPD (assimetria de admissão vs
   pageview — mecanismo 2 do Problema 1 da auditoria) e dedup client divergente da
   documentação (`docs/ANALYTICS.md:87`); clique pode ocorrer antes do dwell de 1s,
   violando `clicks ≤ impressions`.
7. **P7**: `video_play`/`download` aceitos pelo servidor sem nenhum emissor no
   client — cadeia órfã (decisão pertence ao PRD 01).

---

## 4. Requisitos funcionais

Ordem sugerida de implementação: RF7 (base compartilhada) → RF1 → RF5 → RF6 →
RF2 → RF3 → RF4 → RF9. Todos podem ir no mesmo commit/rollout.

### RF1 — QUICK WIN LGPD: newsletter dentro do gate

- Novo export `trackNewsletter(email: string)` em `web/hooks/useAnalytics.ts`,
  ao lado de `trackSearch`/`trackLinkClick` (`:261-268`):

  ```ts
  export function trackNewsletter(email: string) {
    const v = email.trim();
    if (!v) return;
    sendBehavior({ eventType: "newsletter", value: v.slice(0, 200) });
  }
  ```

  `sendBehavior` (`:249-259`) já aplica `getConsent() !== "accepted" → return` e
  `internal:true` quando interno — nenhuma lógica nova.
- `web/components/Footer.tsx` (`NewsletterForm`, `:57-76`): substituir o `fetch`
  direto (`:68-72`) por `trackNewsletter(v)`; **remover** a cópia local de
  `getSessionId` (`:45-54`). O submit deixa de ser `async`/`await` — o envio é
  fire-and-forget; o formulário mostra "ok" após a validação local do e-mail
  (comportamento visível de hoje preservado: o Footer já mostra "ok" mesmo com
  fetch falhando, `:73-74`).
- `web/components/blocks/HomeCustomBlocks.tsx` (NewsletterBlock, `:364-378`): idem
  — substituir o fetch (`:370-374`) por `trackNewsletter(v)` e **remover** a cópia
  local de `getSessionId` (`:337-344`). O estado `"err"` fica reservado ao e-mail
  inválido (`:367`); e-mail válido → `"ok"` direto.
- Consequências declaradas (não são bugs): (a) visitante sem consentimento que se
  inscreve não gera evento — o "cadastro" hoje é SOMENTE métrica (não existe
  backend de mailing; ver §11); (b) inscrição de admin/dev passa a ir com
  `internal:true` e o servidor a descarta (`analytics.ts:330` — exceção documentada
  em `docs/ANALYTICS.md:124-125`; coluna para marcar em vez de dropar é fronteira
  do PRD 01/03).

### RF2 — `link_click`: filtro de esquema + origin real + cobertura de site inteiro

> ⚠️ **PRÉ-DIAGNÓSTICO OBRIGATÓRIO (dado real, §9.5 da auditoria).** A tabela
> `behavior_events` está **VAZIA em TODA a rede** — zero `link_click` e zero
> `newsletter` em todos os 6 blogs consultados, apesar de ~2.000 pageviews (Confirmado
> com dados). Antes de ampliar a cobertura, **provar por que nada chega hoje** — do
> contrário este RF troca uma instrumentação que não dispara por outra que também não
> dispara. Causas candidatas NO CÓDIGO (Hipótese, a confirmar reabrindo os arquivos):
> **(a)** o gate de consentimento em `sendBehavior` (`useAnalytics.ts:249-259`:
> `getConsent() !== "accepted" → return`) — se poucos visitantes aceitam o banner LGPD,
> `link_click`/`search` nunca saem (é o mecanismo, não bug: mas explica o zero);
> **(b)** superfície estreita — `link_click` hoje só instrumenta links do CORPO do
> artigo (`§2.1`, `ProseContent`), não o site inteiro; num catálogo novo com poucas
> visitas a artigo, quase nunca dispara; **(c)** a newsletter faz `fetch` DIRETO ao
> `/behavior` FORA do gate (achado 11 da auditoria — `Footer.tsx`/`HomeCustomBlocks.tsx`)
> e mesmo assim não há linha ⇒ ou ninguém submeteu (plausível em volume baixo) ou o
> fetch está quebrado — **reabrir e conferir o payload/URL**. **Conclusão de método**:
> a tabela vazia é CONSISTENTE com volume baixo + superfície estreita + gate de
> consentimento; **não prova** instrumentação quebrada por si só (princípio: volume
> baixo não é bug). Este RF só se declara cumprido quando o **script sintético do PRD 12
> em modo `--behavior public`** (que contorna o gate marcando `synthtest-`) gravar as
> linhas esperadas — prova positiva de que o caminho evento→tabela funciona. Se, com o
> gate contornado, AINDA não gravar, aí sim há bug de instrumentação (rótulo então
> passa a Confirmado no código, com o `arquivo:linha` da falha).

- **Função pura nova** em `web/lib/analyticsClient.ts` (testável com o runner do
  pacote, ver §12):

  ```ts
  /** Href externo válido para link_click: só http/https e origin diferente do
   *  atual. mailto:/tel:/javascript:/relativos/inválidos → null. */
  export function externalHrefOf(href: string, currentOrigin: string): string | null {
    try {
      const u = new URL(href);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      if (u.origin === currentOrigin) return null;
      return u.href;
    } catch {
      return null;
    }
  }
  ```

  Corrige as duas falhas do item 23: `mailto:`/`tel:` nunca chegam ao servidor
  (adeus domínio vazio) e a exclusão é por `origin` real, não por prefixo de string
  (`https://<dominio>.evil.com` passa a contar como externo, corretamente).
- **Listener delegado ÚNICO** (cobertura de site inteiro), registrado dentro do
  `useAnalytics()` (que já é montado em todas as rotas — `App.tsx:165-168`, cf.
  inventário §3) num `useEffect` próprio, com `document.addEventListener("click",
  handler, true)` (capture, para não ser bloqueado por `stopPropagation` de
  componentes). O handler:
  1. `const a = (e.target as HTMLElement | null)?.closest?.("a[href]")`; sem `<a>` → sai.
  2. Rota atual casa `ADMIN_RE` (`useAnalytics.ts:16`) → sai (painel não é audiência).
  3. `a.closest("[data-bee-ad]")` → sai (clique de anúncio NÃO é link externo —
     ver marcação abaixo).
  4. `const href = externalHrefOf(a.href, window.location.origin)`; `null` → sai.
  5. Debounce: mesmo `href` dentro de 1.000 ms → sai (decisor puro
     `shouldCountLinkClick` em `analyticsClient.ts`, com relógio injetável).
  6. `trackLinkClick(href, ARTICLE_RE.test(location) ? articleIdRef.current : undefined)`
     — o `articleIdRef` já existe no hook (`useAnalytics.ts:139`).
- **Remover os dois instrumentadores atuais** (senão haveria dupla contagem no
  corpo do artigo): o `onClick` do link markdown (`Artigo.tsx:281-285` — manter o
  `<a>` com `target`/`rel`, remover só o tracking) e a prop `onClick` do contêiner
  do corpo HTML (`Artigo.tsx:408-413`).
- **Marcar contêineres de anúncio com `data-bee-ad`** no elemento raiz dos
  componentes que têm `<a>` de anúncio (call-sites de clique do inventário §3):
  `AdBanner.tsx`, `AdSlot.tsx`, `AdSidebar.tsx`, `AdInFeed.tsx`, `AdCentral.tsx`,
  `DestaquesListaBadge.tsx`, o banner do `Header.tsx` (`:362-374`) e os wrappers
  ImageBlock/HtmlBlock com `isAd` de `HomeCustomBlocks.tsx` (`:93-94/:147` e
  `:243-244/:253-258`). Cliques nesses contêineres continuam contando SÓ como
  clique de anúncio (rota `/api/ads/:id/click`), nunca como `link_click`.
- Fronteiras: soma truncada de "Cliques externos" no card (top-10) → **PRD 07**;
  linhas legadas com domínio vazio já gravadas em `behavior_events` → nenhum
  reparo aqui (o defeito morre na fonte; exibição de legado → **PRD 10**).

### RF3 — `scroll`: eliminar a janela de dupla contagem `path` → `articleId`

- `useScrollDepth` (`useAnalytics.ts:276-339`) ganha opção `waitForId`:

  ```ts
  export function useScrollDepth(
    articleId: string | undefined,
    contentRef?: RefObject<HTMLElement | null>,
    opts?: { waitForId?: boolean },
  )
  ```

  Quando `opts?.waitForId === true` e `articleId === undefined`, o `useEffect`
  retorna cedo: **não instala** listener, timer de página curta nem chave de
  storage. Quando o artigo resolve, o effect re-roda (deps já incluem `articleId`,
  `:338`) e TODA a medição acontece sob a chave única `bee_scroll_<id>`.
- `Artigo.tsx:131` passa a chamar `useScrollDepth(article?.id, contentRef,
  { waitForId: true })` — único consumidor do hook (inventário §3).
- Efeito: rolar durante o skeleton não dispara nada; nenhum marco é gravado sob
  `bee_scroll_p:/artigo/...`; a dupla contagem (chaves `path` e `articleId`
  distintas também na agregação do servidor, `analyticsShared.ts:330`) morre na
  origem. A chave da agregação server em si é fronteira do **PRD 06**; o rótulo
  "sessões" do card é **PRD 10**.
- O comportamento sem `waitForId` (chave por `path`) permanece disponível para
  eventual uso futuro em página não-artigo — sem consumidor hoje.

### RF4 — `share`: dedup 1× por (sessão, conteúdo, plataforma)

- `trackShare` (`useAnalytics.ts:241-244`) passa a dedupar antes de enviar, no
  padrão do scroll (sessionStorage + fallback em memória):
  - chave de storage: `bee_share_<articleId ?? path>`, valor = array JSON de
    plataformas já enviadas (`["facebook","copy",...]`);
  - plataforma já presente → não envia; ausente → grava e envia;
  - storage indisponível → fallback `Set` em memória por página (module-level no
    hook), mesma semântica degradada do scroll (`useAnalytics.ts:292`).
- Decisão registrada: na mesma sessão e mesmo conteúdo, compartilhar em plataforma
  DIFERENTE conta (são shares distintos); repetir a MESMA plataforma (ex.: "copy"
   2×) conta 1. Payload não muda (`type:"share"`, `platform`, `articleId`).
- Racional: `share` alimenta o shareChart e o Resumo de interações (item 24);
  clique repetido no mesmo botão não é novo compartilhamento.

### RF5 — Prévia `?adminPreview=1`: suprimir por MARCAÇÃO interna via flag

- **Função pura nova** em `web/lib/analyticsClient.ts`:

  ```ts
  /** Mesma regra do Home.tsx:755-756 — prévia do admin nunca é audiência. */
  export function hasAdminPreviewParam(search: string): boolean {
    try { return new URLSearchParams(search).get("adminPreview") === "1"; }
    catch { return false; }
  }
  ```

- No boot do contexto de tracking (RF7): se `hasAdminPreviewParam(window.location.search)`,
  gravar `sessionStorage.setItem("bee_admin_preview", "1")` — a marca persiste na
  navegação SPA dentro da aba/iframe (o param some da URL ao navegar).
- `isInternalContext()` (RF7) passa a devolver `true` também quando
  `bee_admin_preview === "1"`. Efeito por evento:
  - pageview/read/scroll/share/category: enviados com `internal:true` — o servidor
    grava `is_internal=true` e exclui das métricas (**marcado, nunca dropado** —
    invariante §17; incrementa `flaggedInternal` na Saúde da coleta,
    `analytics.ts:243`);
  - behavior (search/link_click/newsletter): `internal:true` → servidor descarta
    (exceção documentada, `analytics.ts:328-330`);
  - impressão/clique de anúncio: com o PRD 04 na mesma imagem → enviados com
    `internal:true` (contam em `internal_*`); sem o PRD 04 → suprimidos (mesmo
    tratamento do `admin_token` hoje, `useAds.ts:117,:122`).
- Fecha o claim f da auditoria: a URL de preview copiada/aberta em navegador sem
  token deixa de contar como tráfego público.

### RF6 — Anúncios no client (coordenação com o PRD 04, dono do servidor)

- **Gate LGPD**: `trackImpression` e `trackClick` (`useAds.ts:116-124`) passam a
  exigir `getConsent() === "accepted"` (import de `LGPDConsent.tsx:9-15`) — mesma
  admissão do pageview. Elimina a assimetria do claim j (visitante sem aceite
  gerava M impressões e zero pageview). **Consequência esperada e comunicável:
  impressões públicas VÃO CAIR** — precedente registrado em
  `docs/ANALYTICS.md:131` ("é o número honesto"). Este RF é o gatilho declarado no
  PRD 04 RF6 para apertar a margem de sanidade **M: 3 → 1.5** e a severidade
  warning → violation (execução da regra: PRD 11).
- **Impressão-no-clique**: no fluxo de clique (antes do POST de clique), se a
  impressão do `adId` ainda não foi contada nesta aba
  (`impressionAlreadyCounted(adId) === false`, `useAds.ts:130-135`), marcar
  (`markImpressionCounted`) e disparar `trackImpression(adId)` ANTES do
  `trackClick`. Cobre o clique mais rápido que o dwell de 1s (caso de borda do
  PRD 04 §11) e garante `clicks ≤ impressions` por sessão — habilita o PRD 11 a
  apertar a regra irmã para `≤` estrito.
- **Dedup client: MANTIDO por aba** (`bee_adimp_<id>` em sessionStorage). Decisão
  registrada: a unidade "sessão" de TODO o sistema já é a aba — `bee_session_id`
  também vive em sessionStorage (`useAnalytics.ts:6,:21-32`) e é o que o card
  "Sessões únicas" conta. Logo "1× por anúncio por sessão" é verdadeiro na
  definição do próprio sistema; o que faltava era o reforço server-side por
  (sessão, anúncio), que é o RF4 do **PRD 04** (janela 30 min). Entregável deste
  RF: corrigir `docs/ANALYTICS.md:87` para descrever o mecanismo real (client:
  1×/anúncio por aba-sessão via sessionStorage; servidor: dedup 30 min por
  (sessionId, anúncio) — PRD 04).
- **Marcação interna**: `isInternalTraffic()` (`useAds.ts:107-114`) passa a
  delegar em `isInternalContext()` (RF7 — inclui adminPreview). A troca de
  supressão por envio com flag `internal:true` e o body
  `{sessionId, path, internal}` são contrato do **PRD 04 §7.1/§7.5** — este PRD
  NÃO os duplica; se o PRD 02 for implementado antes do PRD 04, o gate de
  consentimento e a impressão-no-clique aplicam-se ao fetch atual sem body
  (compatível — o servidor ignora o que não conhece).
- Viewability/dwell (≥50% × 1s, IAB) e o comportamento do carrossel (1 impressão
  por criativo da rotação, deliberado — auditoria claim e): **inalterados**.

### RF7 — Contexto compartilhado de tracking (base dos RFs acima)

- Novo módulo `web/lib/trackingContext.ts` exportando:
  - `getSessionId(): string` — MOVIDO de `useAnalytics.ts:21-32` (chave
    `bee_session_id` definida num único lugar; o PRD 04 §7.5 exige exatamente este
    helper compartilhado para o body das rotas de ads);
  - `isInternalContext(): boolean` — unificação de `isInternalClient()`
    (`useAnalytics.ts:54-61`) e `isInternalTraffic()` (`useAds.ts:107-114`):
    `import.meta.env.DEV` OU `localStorage.admin_token` OU
    `sessionStorage.bee_admin_preview === "1"` (RF5), com try/catch;
  - `captureAdminPreviewOnce(): void` — grava `bee_admin_preview` quando
    `hasAdminPreviewParam(window.location.search)`; chamada no mount do
    `useAnalytics()` (junto de `captureUtmOnce()`, `useAnalytics.ts:146`).
- `useAnalytics.ts` e `useAds.ts` passam a importar daqui (as funções locais
  são removidas); a lógica de decisão pura (`hasAdminPreviewParam`) fica em
  `analyticsClient.ts` para ser testável sem DOM no escopo de módulo.

### RF8 — Tabela normativa de disparo/debounce/dedup por evento (estado FINAL)

Esta tabela é o contrato do SDK após este PRD — qualquer emissor novo precisa
declarar sua linha aqui (e no PRD 01, dono da taxonomia):

| Evento | Gatilho | Gate LGPD | Marcação interna | Dedup client | Debounce | Dedup server (fronteira) |
|---|---|---|---|---|---|---|
| pageview (genérico) | troca de rota fora de `ADMIN_RE`/`ARTICLE_RE` (`useAnalytics.ts:217-219`) | sim (`send`, `:107`) | `internal:true` (`:111`) | — (1 por navegação) | — | 15s `pv:sessão\|path` (`analytics.ts:231` — PRD 03) |
| pageview (artigo) | `useEffect([article?.id])` (`Artigo.tsx:155-160`) | sim | idem | 1× por `article.id` montado | — | idem |
| read | acúmulo ativo-visível; envia se `secs>2`; heartbeat 30s (`:179-215`) | sim | idem | cumulativo (idempotente por MAX no server) | 30s | MAX por sessão+path (`analyticsShared.ts:319-327` — invariante §17) |
| category | mount da página de categoria (`:232-234`) | sim | idem | — | — | sem dedup hoje → **PRD 03** |
| scroll (25/50/75/100) | marcos sobre o bloco de conteúdo (`:276-339`) | sim | idem | sessionStorage `bee_scroll_<id>`; **RF3**: em artigo, só após `articleId` resolvido | — | Set sessão×conteúdo (`analyticsShared.ts:330` — PRD 06) |
| share | clique em rede/copy (`Artigo.tsx:139-152`) | sim | idem | **RF4**: 1× por sessão+conteúdo+plataforma (`bee_share_*`) | — | — |
| search | submit com query não-vazia (`Header.tsx:298`; `HomeCustomBlocks.tsx:482`) | sim (`sendBehavior`) | `internal:true` (server descarta) | — (cada submit é uma busca) | — | rate 30/min/IP |
| link_click | **RF2**: listener delegado global; só `http(s)` de outro origin; fora de `[data-bee-ad]` e de `/admin` | sim (`sendBehavior`) | idem | — | **1s por href** | rate 30/min/IP |
| newsletter | **RF1**: submit com e-mail válido → `trackNewsletter` | **sim (novo)** | **`internal:true` (novo)** | — | — | rate 30/min/IP |
| impressão de anúncio | ≥50% visível por 1s contínuo (`useAds.ts:144-175`) OU **RF6** impressão-no-clique | **sim (novo)** | flag no body (PRD 04) / supressão até lá | 1× por anúncio por aba (`bee_adimp_<id>`) | dwell 1s | 30 min por (sessão, anúncio) — **PRD 04 RF4** |
| clique de anúncio | onClick do `<a>` do anúncio | **sim (novo)** | idem | — (clique repetido é legítimo) | — | 10s por (sessão, anúncio) — **PRD 04 RF4** |

### RF9 — `video_play`/`download`: conforme decisão do PRD 01

- Estado: o servidor aceita os dois tipos (`ALLOWED`, `analytics.ts:325`) e não
  existe NENHUM emissor no client (inventário §3). O site não tem player de vídeo
  próprio nem área de downloads hoje.
- **Default deste PRD** (vale se o PRD 01 não dispuser em contrário): NÃO criar
  emissores agora — cadeia fica documentada como "aceita no servidor, sem emissor,
  card exibe 0" (volume zero real não é bug). O PRD 01 é o dono da taxonomia; se
  ele decidir REMOVER os tipos da whitelist, a mudança é no servidor (PRD 03
  executa); se decidir MANTER com emissores, a especificação de referência é:
  - `video_play`: 1× por (sessão, conteúdo, vídeo) no primeiro `play`, chave
    `bee_vplay_<articleId>:<videoId>` (mesmo padrão do scroll);
  - `download`: pelo MESMO listener delegado do RF2 — anchor com atributo
    `download` ou href casando lista de extensões (`\.(pdf|zip|xlsx?|docx?)$`),
    roteado para `eventType:"download"` em vez de `link_click` (nunca os dois).

---

## 5. Requisitos não-funcionais

- **Performance**: o listener delegado único SUBSTITUI dois handlers por artigo —
  zero listeners novos por componente; tudo fire-and-forget com `sendBeacon`/fetch
  keepalive (inalterado); nenhuma request nova em render; acréscimo de bundle
  ~1 KB. Nada toca SSR (SSR só da home — §17) nem cache de HTML.
- **LGPD**: e-mail (dado pessoal) só sai do navegador com consentimento (RF1);
  impressão/clique alinhados ao mesmo gate (RF6); nenhum dado novo é coletado ou
  persistido; `gclid`/`fbclid` continuam enviados só como PRESENÇA (nada muda no
  `parseUtm` — PRD 05). Parte da rede opera conteúdo político-adjacente — reduzir
  captação sem consentimento é requisito, não efeito colateral. Os toggles
  cosméticos do banner (`LGPDConsent.tsx:79-99`; limitação 2 de
  `docs/ANALYTICS.md:121-122`) NÃO são tocados.
- **Confiabilidade**: todo tracker mantém try/catch + `.catch(() => {})`; falha de
  analytics NUNCA quebra UX (formulários de newsletter mostram sucesso após
  validação local; storage bloqueado degrada para memória, nunca lança).
- **Multi-blog**: mesma imagem `web` para os 8 blogs; nenhuma referência a
  BLOG_ID; rollout §6 obrigatório com canário resenhavip (§8.4); revalidação de
  cards POR BLOG (§9).
- **Windows/dev (CLAUDE.md §14)**: `vite build` NÃO roda no Windows (build real na
  VPS); typecheck por pacote (`pnpm run typecheck` dentro de
  `artifacts/brasilia-agora`); testes do pacote via `pnpm run test`
  (`tsx --test src/**/*.test.ts` — `package.json:11`; vitest não roda); NUNCA
  unicode literal em regex.

---

## 6. Modelo de dados

**Nenhuma coluna, tabela ou índice novo.** Este PRD é 100% client-side — não há
nada a adicionar em schema Drizzle nem em `ensureSchema.ts` (regra do CLAUDE.md
§17, "colunas novas via Drizzle schema E ensureSchema", registrada aqui como
não-aplicável por construção). Chaves novas de storage do NAVEGADOR (não são banco):
`bee_admin_preview` (RF5), `bee_share_<conteúdo>` (RF4).

Fronteiras de dados citadas por este PRD, pertencentes a outros:
- `behavior_events.is_internal` (marcar em vez de dropar): coluna → **PRD 01**;
  ingest → **PRD 03**.
- `ad_daily_stats.internal_impressions/internal_clicks`: **PRD 04** §6.

---

## 7. Contrato de API

Nenhum endpoint novo ou alterado no servidor. O que muda é O QUE e QUANDO o client
envia aos endpoints existentes:

### 7.1 `POST /api/analytics/behavior` (existente — `analytics.ts:314-348`)

- Newsletter passa a chegar SOMENTE via `sendBehavior`, com o shape padrão:
  `{ eventType: "newsletter", value: "<email>", sessionId, internal?: true }`.
  O servidor JÁ lê `internal` (`:330`) — zero mudança server; o descarte de
  interno é comportamento preexistente documentado que o client agora aciona.
- `link_click` passa a ter `value` garantidamente `http(s)://` de origin externo
  (RF2). Sem mudança de shape.

### 7.2 `POST /api/analytics/event` (existente — `analytics.ts:206`)

Shape inalterado (`pageview`/`read`/`category`/`scroll`/`share`). Mudam os
CRITÉRIOS de disparo: scroll de artigo só com `articleId` definido (RF3), share
dedupado (RF4), `internal:true` também por adminPreview (RF5).

### 7.3 `POST /api/ads/:id/impression` e `/click` (existentes — `ads.ts:184,:141`)

Admissão client alinhada (consentimento — RF6) e impressão-no-clique. O body
`{sessionId, path, internal}` é contrato do **PRD 04 §7.1/§7.2/§7.5** — implementar
lá (ou junto); este PRD funciona com ou sem o body.

---

## 8. Comandos de verificação (rodar exatamente estes)

### 8.1 Local (Windows, antes do commit)

```powershell
cd "c:\Users\Usuario(a) Master\sp011\artifacts\brasilia-agora"
pnpm run typecheck
pnpm run test
cd "c:\Users\Usuario(a) Master\sp011\artifacts\api-server"
pnpm run typecheck
node --test "test/**/*.test.ts"
```

Resultado esperado: exit 0 em tudo; os testes de `src/lib/analyticsClient.test.ts`
passam incluindo os casos novos do §12 (api-server é só regressão — nenhuma mudança
server neste PRD).

Greps objetivos (na raiz do repo; resultado esperado ao lado):

```powershell
# fetch direto a /behavior sumiu dos componentes (só o SDK usa o endpoint)
rg -n "api/analytics/behavior" "artifacts/brasilia-agora/src" --glob "!**/*.test.ts"
#   → 1 único resultado, em src/hooks/useAnalytics.ts (sendBehavior)
# getSessionId único (trackingContext) — cópias do Footer/HomeCustomBlocks removidas
rg -n "bee_session_id" "artifacts/brasilia-agora/src"
#   → apenas src/lib/trackingContext.ts
# gate LGPD nos trackers de anúncio
rg -n "getConsent" "artifacts/brasilia-agora/src/components/ads/useAds.ts"
#   → >= 1 resultado
# instrumentação duplicada de link removida do Artigo
rg -n "trackLinkClick" "artifacts/brasilia-agora/src/pages/Artigo.tsx"
#   → 0 resultados
# adminPreview lido pelo tracking
rg -n "bee_admin_preview" "artifacts/brasilia-agora/src"
#   → trackingContext.ts (e nenhum outro lugar de lógica nova)
# doc corrigida (RF6)
rg -n "por aba" "docs/ANALYTICS.md"
#   → >= 1 resultado na linha do dicionário de impressões
```

### 8.2 Navegador (observação objetiva — DevTools → Network, site de produção ou preview da VPS)

1. **Aba anônima, banner ignorado** (sem aceitar): navegar home → artigo, rolar,
   ver anúncios. Esperado: **NENHUMA** request a `/api/analytics/event`,
   `/api/analytics/behavior`, `/api/ads/*/impression` ou `/api/ads/*/click`.
2. **Aceitar o banner**: pageview + impressões passam a sair. Esperado: requests
   normais.
3. **Newsletter sem consentimento** (outra aba anônima, banner rejeitado): submeter
   e-mail válido no rodapé. Esperado: formulário mostra sucesso e **nenhuma**
   request a `/behavior`.
4. **Newsletter com admin logado** (mesmo navegador do admin): submeter. Esperado:
   request a `/behavior` com `"internal":true` no payload.
5. **`mailto:` no corpo do artigo** (artigo que tenha um): clicar. Esperado: nenhuma
   request `link_click`. **Link externo no rodapé/menu**: clicar. Esperado: 1
   request `link_click` com `value` começando com `http`.
6. **Duplo clique rápido** no mesmo link externo: esperado 1 request (debounce 1s).
7. **Scroll durante o skeleton**: abrir artigo com throttling "Slow 3G" e rolar
   antes do conteúdo carregar. Esperado: nenhuma request `scroll` antes do artigo
   resolver; em sessionStorage NÃO existe chave `bee_scroll_p:/artigo/...`.
8. **Share 2× na mesma plataforma**: esperado 1 request `share`; plataforma
   diferente → nova request.
9. **`?adminPreview=1` em navegador SEM admin_token**: abrir
   `https://<dominio>/?adminPreview=1`, aceitar o banner, navegar. Esperado: todo
   payload de `/api/analytics/event` com `"internal":true`; nenhuma impressão
   pública de anúncio (com PRD 04: requests com `internal:true`; sem: nenhuma
   request).
10. **Clique de anúncio em <1s** (clicar assim que o banner aparece): esperado
    request de `impression` seguida de `click` (ordem no Network).

### 8.3 VPS — dados e servidor ⚠️ pendente de execução

(MCP Supabase não conectado na escrita deste PRD; blocos completos para colar,
padrão CLAUDE.md §12. NUNCA marcar os critérios correspondentes como atendidos sem
rodar.)

```bash
# (1) Newsletter interna não grava (comportamento server preexistente que o client agora aciona)
DOM='https://resenhavip.midia.run'
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d resenhavip -v ON_ERROR_STOP=1 -c "SELECT count(*) AS antes FROM behavior_events WHERE event_type='newsletter';"
curl -s -X POST "$DOM/api/analytics/behavior" -A "Mozilla/5.0 (verificacao PRD02)" -H 'Content-Type: application/json' -d '{"eventType":"newsletter","value":"teste-prd02@example.com","sessionId":"prd02-verif","internal":true}'
docker compose exec -T pg-blogs psql -U postgres -d resenhavip -v ON_ERROR_STOP=1 -c "SELECT count(*) AS depois FROM behavior_events WHERE event_type='newsletter';"
```

Esperado: `antes = depois` (evento interno descartado).

```bash
# (2) Depois do rollout, nenhum link_click novo com esquema não-http (domínio vazio morre na fonte)
#     Trocar DATA_ROLLOUT pela data (YYYY-MM-DD) do deploy da imagem nova.
DATA_ROLLOUT='2026-MM-DD'
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d resenhavip -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM behavior_events WHERE event_type='link_click' AND ts >= '$DATA_ROLLOUT' AND value !~* '^https?://';"
```

Esperado: `0`. (Linhas ANTERIORES ao rollout podem existir — legado, não é falha.)

```bash
# (3) sp011 (Supabase) — mesma checagem (2)
DATA_ROLLOUT='2026-MM-DD'
cd /opt/sp011
DBURL=$(grep -m1 '^SUPABASE_DATABASE_URL=' /opt/sp011/.env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
docker compose exec -T pg-blogs psql "$DBURL" -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM behavior_events WHERE event_type='link_click' AND ts >= '$DATA_ROLLOUT' AND value !~* '^https?://';"
```

```bash
# (4) Scroll: nenhum evento novo de artigo com dupla chave — proxy verificável:
#     eventos scroll com article_id NULL em paths de artigo, após o rollout
DATA_ROLLOUT='2026-MM-DD'
cd /opt/sp011
docker compose exec -T pg-blogs psql -U postgres -d resenhavip -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM analytics_events WHERE type='scroll' AND ts >= '$DATA_ROLLOUT' AND article_id IS NULL AND path LIKE '/artigo/%';"
```

Esperado: `0` (com RF3, scroll de artigo sempre carrega `articleId`).

### 8.4 Rollout multi-blog (CLAUDE.md §6 — obrigatório)

Arquivos tocados → serviços (§5): `artifacts/brasilia-agora` → `web`;
`docs/ANALYTICS.md` → nenhum serviço. (Se implementado JUNTO com o PRD 04, somam-se
`api` e `lib/db` — usar o mesmo bloco, que já builda os dois.) Bump + build + sp011:

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
# canário (resenhavip) — rodar os passos 1-10 do §8.2 e conferir os cards do §9 ANTES de seguir
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

Mapeamento: itens **18, 22, 23, 24** da checklist do doc v2 + admissão client dos
itens **4/19/20/21** (dono do server: PRD 04); regras do PRD 11: "cliques ≤
impressões" (CA9 habilita o `≤` estrito) e "impressões ≤ pageviews não-internos ×
slots × margem" (CA8 habilita M=1.5). Nenhum critério é subjetivo. Marcação de
status na coluna "Status na escrita" (nenhum critério é dado como atendido aqui):
os que exigem **query no banco** estão em **⚠️ pendente de execução** (MCP Supabase
não conectado na escrita deste PRD — execução na VPS pelo implementador/operador);
os que exigem o **site buildado** (observação no navegador de produção/preview, já
que o `vite build` não roda no Windows — CLAUDE.md §14) ficam "a executar no
navegador"; os puramente locais, "a executar no dev". Em nenhum caso marcar como
atendido sem rodar.

| # | Critério | Item/Regra | Verificação | Status na escrita |
|---|---|---|---|---|
| CA1 | Typecheck + testes dos 2 pacotes passam, incluindo os casos novos de `analyticsClient.test.ts` | — | §8.1 (exit 0) | a executar no dev |
| CA2 | Newsletter no gate: nenhum `fetch` direto a `/behavior` fora do SDK; sem consentimento não há request; com admin a request leva `internal:true` | 24 | §8.1 greps 1-2 + §8.2 passos 3-4 | a executar no dev/navegador |
| CA3 | Newsletter interna não é contabilizada (server descarta a flag que o client agora envia) | 24 | §8.3 bloco (1): antes = depois | ⚠️ pendente de execução |
| CA4 | `link_click`: `mailto:`/`tel:` nunca geram request; link externo de rodapé/menu/bloco gera; clique em anúncio NÃO gera (`data-bee-ad`) | 23 | §8.2 passo 5 + §8.2 passo 1 (aba de anúncios) | a executar no navegador |
| CA5 | Sem dupla contagem de link no corpo do artigo: instrumentadores antigos removidos e 1 clique = 1 request | 23 | §8.1 grep 4 + §8.2 passo 6 | a executar no dev/navegador |
| CA6 | Zero `link_click` com `value` não-`http(s)` após o rollout, em cada banco verificado | 23 | §8.3 blocos (2)-(3) → 0 | ⚠️ pendente de execução |
| CA7 | Scroll de artigo só dispara com `articleId` (nenhuma chave `bee_scroll_p:/artigo/...`; zero eventos scroll de `/artigo/%` com `article_id` NULL pós-rollout) | 18 | §8.2 passo 7 + §8.3 bloco (4) → 0 | ⚠️ pendente de execução (parte SQL) |
| CA8 | Impressão/clique de anúncio só com consentimento (aba sem aceite → zero requests de ads); dedup por aba mantido | 4, 19, 20, 21; regra "impressões ≤ pv×slots×M" (M→1.5, PRD 04 RF6/PRD 11) | §8.2 passos 1-2 | a executar no navegador |
| CA9 | Impressão-no-clique: clique <1s gera impression e depois click (ordem no Network) — `clicks ≤ impressions` por sessão | regra "cliques ≤ impressões" (PRD 11) | §8.2 passo 10 | a executar no navegador |
| CA10 | `?adminPreview=1` sem token: todos os eventos com `internal:true`; nenhuma contagem pública de anúncio | 25 (internos marcados) | §8.2 passo 9 | a executar no navegador |
| CA11 | Share dedupado por sessão+conteúdo+plataforma | 24 | §8.2 passo 8 | a executar no navegador |
| CA12 | `video_play`/`download`: estado conforme decisão do PRD 01 (default: nenhum emissor — `rg -n "video_play" artifacts/brasilia-agora/src` → 0 resultados) | 24 (resumo) | grep objetivo | a executar no dev |
| CA13 | `docs/ANALYTICS.md` atualizado: linha do dicionário de impressões (mecanismo real de dedup) e seção LGPD (newsletter e ads sob o gate) | — | §8.1 grep 6 + leitura do diff | a executar no dev |
| CA14 | Cards revalidados POR BLOG após rollout (lista abaixo), sem valor logicamente impossível; queda de impressões públicas é ESPERADA (gate), não é falha | 4, 18-24 | observação objetiva no admin de cada blog | ⚠️ pendente de execução |

**Cards a revalidar por blog (CA14)** — em sp011.com.br, ksports.bebee.me,
esporteagora.midia.run, resenhavip.midia.run, oleysports.midia.run,
beeesportes.midia.run (+ pontofarma e creditovc quando no ar):

1. Analytics → **Profundidade de leitura** (item 18) — segue populando após RF3;
   nenhum marco novo vindo de chave `path` em artigo.
2. Analytics → **Links externos clicados** (item 23) — sem barra sem rótulo NOVA
   (domínio vazio morreu na fonte); domínios novos de rodapé/menu podem APARECER
   (cobertura ampliada — esperado, não é anomalia).
3. Analytics → **Resumo de interações** (item 24) — newsletter/shares coerentes com
   os testes do §8.2; "Leram 100%" segue populando.
4. Analytics → **Termos mais buscados** (item 22) — regressão: buscas continuam
   contando.
5. Analytics → **Propagandas** (KPIs/tabela/top-3, itens 19-21) e Dashboard →
   **Propagandas** (item 4) — impressões públicas podem CAIR (gate LGPD);
   proporção impressões/pageviews converge para a margem M=1.5 do PRD 04 RF6.
6. Analytics → **Saúde da coleta** (item 25) — "internos marcados"
   (`flaggedInternal`) passa a subir também com navegação via adminPreview.

---

## 10. Invariantes do §17 preservadas por este PRD

1. **"Tráfego interno marcado `is_internal`, nunca dropado"** — REFORÇADA: o
   adminPreview vira marcação (`internal:true`) nos eventos do SDK, não supressão
   (RF5). Exceções preexistentes e documentadas, não alteradas aqui: `/behavior`
   descarta interno no servidor porque a tabela não tem coluna
   (`analytics.ts:328-330`; `docs/ANALYTICS.md:124-125` — alinhamento é PRD 01/03);
   impressão/clique de anúncio seguem suprimidos no client ATÉ o PRD 04 introduzir
   a dimensão interna server-side (aí a flag substitui a supressão, PRD 04 RF3).
2. **"Heartbeat cumulativo agregado por MAX"** — não tocado: nenhuma mudança em
   `read` (`useAnalytics.ts:179-215`) nem no reducer (`analyticsShared.ts:319-327`).
3. **"`totals.*` do /stats fixos ao agora"** — não tocado (nenhuma mudança server).
4. **"Canal classificado no servidor"** — não tocado: o client continua enviando só
   sinais crus (`parseUtm`/`takeFirstTouch` intactos; Problema 2 é PRD 05).
5. **"Migrações de coluna via Drizzle schema E ensureSchema"** — não-aplicável
   (nenhuma coluna nova; declarado no §6).
6. **SSR/perf** ("SSR só da home", `no-cache` nunca `no-store`,
   `sanitizeArticleHtml` isomórfico, allowlist do proxy de imagem em 2 arquivos) —
   não tocados. Atenção verificada: remover a prop `onClick` do contêiner do corpo
   HTML (`Artigo.tsx:408-413`) não altera o `sanitizeArticleHtml` nem o
   `dangerouslySetInnerHTML`.
7. **Isolamento entre blogs / nada hardcodado por blog** — todo o código é
   genérico; nenhuma referência a BLOG_ID.

---

## 11. Casos de borda

- **Newsletter sem consentimento**: o e-mail não é gravado em lugar NENHUM — hoje o
  "cadastro" existe apenas como métrica em `behavior_events` (não há backend de
  mailing). O formulário mostra sucesso (UX preservada). Registro para o operador:
  se um dia houver mailing real, ele precisa de endpoint próprio com base legal
  própria (fora do analytics) — este PRD não cria essa dívida, só a torna visível.
- **`sessionStorage` bloqueado**: `getSessionId` devolve `"unknown"` (comportamento
  atual, `useAnalytics.ts:29-31`); dedup de share/scroll degrada para memória por
  página; `bee_admin_preview` não persiste → preview com storage bloqueado e sem
  token pode contar (janela residual aceita — mesmo grau de degradação do resto do
  SDK).
- **Flag adminPreview "gruda" na aba**: navegação subsequente na MESMA aba continua
  interna mesmo sem o param — correto por decisão (aba de prévia não é audiência);
  fechar a aba limpa o sessionStorage.
- **Rollout misto (minutos)**: web novo + api velho → flag `internal` no body de
  ads é ignorada (PRD 04 §11 — inofensivo); web velho em cache + api novo → nada
  deste PRD regride (mudanças são client-side).
- **Link externo dentro de bloco HTML de anúncio** (HtmlBlock isAd, delegação de
  clique própria em `HomeCustomBlocks.tsx:253-258`): `data-bee-ad` no wrapper
  garante que o clique conte SÓ como clique de anúncio, nunca `link_click`.
- **Âncora relativa, `#hash`, `javascript:`, `target=_blank` same-origin**:
  `externalHrefOf` devolve `null` — nada é enviado (o `a.href` do DOM já vem
  absoluto, então "relativo" só ocorre em string crua passada à função pura).
- **Prefixo enganoso** `https://<dominio-do-blog>.evil.com`: hoje tratado como
  interno pelo `startsWith` (`Artigo.tsx:282,:410`) e NÃO contado; com RF2 passa a
  contar como externo (comparação de `origin` real) — mudança de comportamento
  correta e intencional.
- **Clique com `preventDefault`** (algum componente cancela a navegação): o
  listener em capture ainda conta — aceito: o clique aconteceu; caso raro sem
  consumidor atual.
- **Artigo 404/nunca resolve**: com `waitForId`, scroll nunca dispara — correto
  (não há conteúdo para medir).
- **Sessões antigas** com chaves `bee_scroll_p:/artigo/...` ou shares pré-RF4 no
  storage: inócuas — chaves novas não colidem; nenhum reparo necessário.
- **Busca via URL direta** (`/arquivo?q=`): segue não instrumentada — decisão
  registrada (instrumentar no mount duplicaria o submit que navega para lá,
  `Header.tsx:301`; se o PRD 07 quiser cobrir, precisa de dedup por termo+sessão).
- **Duplicated tab** (Ctrl+Shift+K/duplicar aba copia o sessionStorage): a nova aba
  herda `bee_session_id` e os dedups — contagem não reinicia; consistente com a
  definição de sessão do sistema.
- **PRD 02 antes do PRD 04**: gate LGPD e impressão-no-clique funcionam sobre o
  fetch atual sem body; a marcação interna de ads continua por supressão até o
  PRD 04. **PRD 04 antes do PRD 02**: admissão continua assimétrica (M=3, warning)
  até este PRD entrar. Qualquer ordem é segura; juntos no mesmo rollout é o ideal.

---

## 12. Plano de testes (runner do pacote; CLAUDE.md §14)

Testes de lógica pura em `web/src/lib/analyticsClient.test.ts` (arquivo existente —
padrão do repo: `pnpm run test` roda `tsx --test src/**/*.test.ts`,
`package.json:11`; imports relativos com extensão `.ts`; sem unicode literal em
regex; hooks React NÃO são testáveis aqui — por isso toda decisão nova vira função
pura em `analyticsClient.ts`):

1. **`externalHrefOf`**: `https://externo.com/x` com origin `https://blog.com` →
   href; mesmo origin → null; `mailto:a@b.c` → null; `tel:+55` → null;
   `javascript:void(0)` → null; string inválida → null;
   `https://blog.com.evil.com/x` com origin `https://blog.com` → href (externo);
   `http://` vs `https://` do mesmo host → origins diferentes → href (conta).
2. **`shouldCountLinkClick`** (decisor de debounce com relógio injetado): mesmo
   href em <1000ms → false; >1000ms → true; href diferente imediato → true.
3. **`hasAdminPreviewParam`**: `"?adminPreview=1"` → true; `"?adminPreview=0"`,
   `""`, `"?x=1"` → false; string malformada → false (não lança).
4. **Dedup de share** (extrair decisor puro, ex.
   `newSharePlatforms(platform, already: ReadonlySet<string>)` ou equivalente):
   plataforma repetida → vazio; nova → [plataforma]; independência por conteúdo.
5. **Regressão**: casos existentes de `parseUtm`/`refHostOf`/`contentScrollPct`/
   `newMilestones`/`createDwellDecider` (`analyticsClient.test.ts`) continuam
   passando — NENHUM deles muda neste PRD.
6. **api-server** (regressão apenas): `node --test "test/**/*.test.ts"` — nenhuma
   mudança server aqui.

Dados sintéticos apenas; nenhum teste toca banco ou rede. Validação com produção é
exclusivamente §8.2 (navegador) e §8.3 (VPS, ⚠️ pendente de execução) — ao testar
manualmente em produção, usar sessão com `internal:true` (admin logado ou
adminPreview) para NUNCA poluir métricas públicas; o único teste que gera evento é
o bloco (1) do §8.3, que é interno e descartado por construção.

---

## 13. Plano de rollback

Este PRD não tem migração de dados nem mudança de schema — rollback é
exclusivamente de imagem, por blog (o client é bundle único; não existe rollback
parcial de um RF sem rebuild):

```bash
# sp011 (raiz): voltar BLOG_IMAGE_VERSION para a tag anterior e recriar
cd /opt/sp011
sed -i "s|^BLOG_IMAGE_VERSION=.*|BLOG_IMAGE_VERSION=vANTERIOR|" .env
docker compose up -d api web
```

```bash
# cada blog replicado com problema (rollback pontual — canário existe para isso)
cd /opt/blogs/<id>
sed -i "s|^BLOG_IMAGE_TAG=.*|BLOG_IMAGE_TAG=vANTERIOR|" .env
docker compose up -d
```

- Dados gravados no período com a imagem nova permanecem válidos (são MAIS
  restritos: menos eventos, todos legítimos) — nenhuma limpeza necessária.
- Se a imagem revertida também carregar o PRD 04 (mesma tag), seguir ADICIONALMENTE
  o §13 do PRD 04 (lá há considerações de dados; aqui não).
- Reversão de um único RF (ex.: manter gate da newsletter mas desfazer o listener
  global): reverter o commit específico no repo e refazer o ciclo §8.4 — nunca
  editar imagem na VPS.

---

## 14. Riscos e dependências de outros PRDs (FRONTEIRAS do STATUS.md)

| PRD | Fronteira/dependência |
|---|---|
| **PRD 01** (modelo de dados/taxonomia) | Dono da taxonomia de eventos: decide `video_play`/`download` (RF9 tem o default e a spec condicional) e a coluna `is_internal` de `behavior_events`. Em conflito, o PRD 01 manda. |
| **PRD 03** (ingest/filtros) | O servidor NÃO distingue consentimento — "PRD 03 apenas anota" (fronteira literal do STATUS.md): o gate é 100% client e vive AQUI. Dedup do evento `category` no ingest, contadores de descarte e a lógica server de marcação interna de `/behavior` são do 03. |
| **PRD 04** (ads server) | Dono do servidor de ads e do payload `{sessionId, path, internal}` (§7.1/§7.5 de lá). Este PRD entrega o que o 04 declara como fronteira dele: consentimento, dedup client, impressão-no-clique. O RF6 daqui é o GATILHO para M: 3 → 1.5 e severidade warning → violation na regra de sanidade do 04/11. Ordem qualquer é segura (§11), ideal juntos. |
| **PRD 05** (canal) | Nenhuma mudança em `parseUtm`/first-touch aqui — sinais crus intactos; classificação é do servidor (invariante §17). |
| **PRD 06** (agregações) | Chave de dedup do scroll na agregação (`analyticsShared.ts:330`) e demais defeitos do `/stats` — RF3 resolve na fonte, mas a chave server é de lá. |
| **PRD 07** (comportamento) | Totais NÃO truncados de buscas/cliques externos servidos pelo backend (hoje soma top-15/top-10, `analytics.ts:702-710`); RF2 só melhora a fonte. |
| **PRD 08** (saúde/alertas) | Exposição de contadores e alertas — o `flaggedInternal` a mais gerado pelo RF5 aparece lá. |
| **PRD 10** (frontend do dashboard) | Rótulo "sessões" do card de scroll, exibição de legado com domínio vazio, estados vazios do item 24. |
| **PRD 11** (validação cross-metric) | Consome os efeitos deste PRD: com CA8 aceito, aperta M para 1.5; com CA9 aceito, pode apertar `clicks ≤ impressions` para estrito. |
| **PRD 12** (plano de testes) | O script de tráfego sintético DEVE usar as marcações deste PRD (`internal:true`/adminPreview) para nunca poluir dados reais. |

**Riscos**: (1) queda visível de impressões públicas e de signups de newsletter
(gate LGPD) — comunicar ao operador ANTES do rollout; precedente
`docs/ANALYTICS.md:131`; não é regressão, é o número honesto; (2) cobertura
ampliada do `link_click` muda o perfil do card (mais domínios: rodapé/menu) — é a
semântica que o card já anunciava; registrar na comunicação do rollout; (3) um
`data-bee-ad` esquecido em componente de anúncio novo contaminaria "Links
externos" — mitigado pelo checklist do RF2 (lista fechada dos call-sites do
inventário §3) e pelo caso de teste manual §8.2 passo 1; (4) listener global em
capture interagindo com bibliotecas de terceiros — o site não usa router com
interceptação de clique global além do wouter (navegação same-origin é filtrada
por origin), risco baixo; (5) rede inteira na mesma imagem — canário resenhavip
obrigatório antes dos demais (§8.4).

---

## 15. Estimativa de esforço

**M** (médio). Código pequeno e distribuído (2 formulários, 1 módulo de contexto
novo, 3 funções puras, 1 listener delegado, ajustes em `useAds`/`useScrollDepth`/
`trackShare`, atributo `data-bee-ad` em ~9 componentes, doc), sem servidor e sem
migração — mas com matriz de verificação manual extensa (10 passos de navegador ×
canário + revalidação de 6 cards × 6-8 blogs) e coordenação de contrato com o
PRD 04.
