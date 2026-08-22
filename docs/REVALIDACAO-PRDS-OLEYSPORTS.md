# Revalidação Adversarial — PRDs do OleySports

> **Data:** 2026-08-19/20 · **Método:** tentativa de refutação dos dois PRDs
> anteriores · **Alvo:** `docs/PRD-SEO-TECHNICAL-OLEYSPORTS.md` e
> `docs/PRD-P0-OLEYSPORTS-RESOLUCAO-URL-E-SOFT-404.md`
>
> **Ordem de autoridade aplicada:** runtime atual > código atual >
> dados/configuração atual > git history > PDF snapshot > inferência.
>
> **Nenhum arquivo de código, banco, infraestrutura, configuração ou PRD foi
> alterado.** Este documento é o único artefato produzido.

---

## Nota de método e limitações

**Runtime ESTAVA disponível.** Ao contrário da primeira auditoria (feita só com
leitura de repositório), esta revalidação alcançou produção por `curl` read-only:
`oleysports.com.br`, `sp011.com.br`, `credito.vc`, `ocomandantenews.com.br` e o
host antigo `oleysports.midia.run`. Foram feitas **apenas requisições GET/HEAD**.
Nenhum POST, nenhuma mutação, nenhum acesso a banco, nenhuma credencial.

Isso muda o peso de quase todos os vereditos: onde a primeira análise dizia
"Confiança: Alta (leitura de código)", agora há resposta HTTP real.

**Limitação registrada — o PDF não pôde ser relido.** O arquivo
`2026-08-19 — Relatório Comparativo SEO — BeeSports vs OleySports — Revisado.pdf`
não está no repositório e não sobreviveu à compactação do contexto. As
afirmações do PDF citadas aqui vêm (a) das citações preservadas dentro do próprio
PRD geral e (b) da descrição que o prompt de revalidação faz do conteúdo do PDF.
Onde o veredito depende da redação exata do PDF — essencialmente a §5 (F-08) —
isso está sinalizado como `DEPENDE DE RELEITURA DO PDF`.

**Acesso a banco:** não utilizado. Todos os números de dados desta revalidação
saem da **API pública** do próprio blog (`/api/articles?limit=all`,
`/api/articles/categories`, `/api/site`), que expõe exatamente o conjunto
publicado. Contagens de rascunho/despublicado **não** são visíveis por essa via —
onde isso importa, está marcado `DEPENDE DE DADOS`.

---

## 1. Resumo executivo

A **tese central dos dois PRDs sobrevive** — e em vários pontos foi reforçada por
runtime, deixando de ser inferência. Mas a revalidação encontrou **quatro
problemas sérios**, sendo dois deles bloqueadores de implementação:

**O que se confirmou de forma agora incontestável.** O sitemap geral de produção
devolve 14 URLs e **zero artigos**, e as editorias que ele publica são as do
sp011 (F-01). Todas as rotas testadas devolvem 200, sem exceção (F-02). As 13
editorias fixas do sp011 renderizam no OleySports com `<h1>POLÍTICA</h1>` e
publicam `<a href="/artigo/__placeholder__">` — verificado uma a uma (F-03,
F-04). O breadcrumb aponta para a home em **640 de 640** artigos publicados
(F-15). O `/favicon.jpg` servido é **byte a byte** o asset do repositório
(F-18). Nada disso é mais hipótese.

**O que foi refutado.** O F-14 — "a home publica 5 manchetes falsas de Brasília",
classificado como P0 e usado como argumento de risco de "Páginas enganosas" —
**está errado**. O mock `MostRead.tsx` não chega ao HTML de produção do
OleySports nem de nenhum outro blog vivo da rede. O bloco `mais-lidas` do
template está em `area: "sidebar"`, e `PortalZoneBlocks.tsx:765` intercepta esse
caso e renderiza `SidebarMostRead` com artigos **reais**. Verificado no HTML
servido: as manchetes do mock aparecem 0 vezes; o bloco exibe "Marquinhos,
capitão do PSG…". Isto foi um **falso positivo da primeira auditoria** e é
corrigido aqui.

**O que invalida o desenho do P0 (bloqueador nº 1).** O `socialOgPlugin` trata
**Googlebot e bingbot** como crawlers sociais (`vite.config.ts:41-42`). Em
produção, `GET /artigo/<slug>` devolve **85.961 bytes** de SSR completo para um
navegador e **2.953 bytes** para o Googlebot — um stub com título, subtítulo, uma
imagem e **nenhum JSON-LD, nenhum corpo de texto, nenhum link interno**. Como
esse plugin roda **antes** do `ssrPlugin` e encerra a resposta, o `301` de
UUID→slug — entrega-título do P0 — **nunca alcançará o buscador que ele pretende
servir**. O PRD P0 declara esse plugin "não tocado"; isso está errado e é
condição de bloqueio. Há ainda um risco de conformidade: servir conteúdo
substancialmente diferente por User-Agent é o que as políticas de spam do Google
descrevem como *cloaking*.

**O que invalida a regra de categorias (bloqueador nº 2).** A regra proposta
("não declarada + tem artigos → 200 + noindex") aplicada aos dados reais
**des-indexaria arquivos legítimos e populados**: no sp011, `/seguranca` tem
**163 artigos publicados** e não está no menu nem em `settings.categories`
(que no sp011 é ausente); `/nfl` (8), `/aviacao` (27) e `/copa-do-mundo` (1)
estão na mesma situação. No próprio OleySports, `/copa-do-mundo` tem **86 artigos
publicados** e está em `settings.categories` com `visible: false` — e o PRD **não
define** se a superfície filtra por `visible`. Conforme a leitura, 86 artigos
ganham página indexável ou são marcados `noindex`.

**O que está incompleto.** A cadeia de causa do soft-404 no PRD termina no
`spaHeadPlugin`, mas existe uma **segunda fonte independente**: o fallback
estático do `vite preview`. Paths **com extensão** — explicitamente fora do
escopo do conserto proposto — também devolvem 200 + HTML: `/sitemap.xml`,
`/manifest.json`, `/wp-login.php`, `/nada.xml` e até `/assets/inexistente.js`
(200 `text/html`). O F-20, que estava marcado "precisa de teste em runtime",
está **confirmado**, e revela essa classe maior.

**Dado que destrava uma dúvida.** A verificação de unicidade de slug — a regra
GO/NO-GO mais dura do prompt — passou **limpa**: dos **640** artigos publicados,
**0** sem slug, **0** slugs duplicados, **0** colisões slug↔id de outro artigo. O
`301` de UUID→slug é **seguro do ponto de vista de dados**. F-16 pode continuar
P2; não precisa virar pré-condição.

**Veredito:** `NO-GO` para o PRD P0 como está — dois bloqueadores arquiteturais,
ambos corrigíveis com mudanças delimitadas. O PRD geral fica `GO COM AJUSTES`.

---

## 2. Veredito geral sobre o PRD técnico (`PRD-SEO-TECHNICAL-OLEYSPORTS.md`)

**`GO COM AJUSTES`.**

A arquitetura descrita está correta e foi confirmada em runtime. A matriz PDF ×
código está, no essencial, certa. As correções necessárias são de **redação,
priorização e justiça com o PDF**, mais uma remoção de finding:

| Área | Situação | Ação |
|---|---|---|
| F-01, F-02, F-03, F-04 | Reforçados por runtime | `MANTER` (elevar confiança para código+runtime) |
| F-14 | Refutado em produção | `REBAIXAR PRIORIDADE` (P0 → P2) e reescrever |
| F-08 | Redação injusta com o PDF | `REESCREVER` |
| F-09, F-23 | Redação exagerada | `REESCREVER` |
| F-20 | Confirmado e maior que o descrito | `AUMENTAR PRIORIDADE` (P2 → P1) |
| F-05, F-15, F-18 | Confirmados, mas impacto superestimado | `REESCREVER` a seção de impacto |
| §2 "todo defeito aqui é um defeito da rede inteira" | Generalização não sustentada | `REESCREVER` |
| §2 "indexado do zero" | Não comprovado; há 301 preservando path | `REESCREVER` |
| §2/F-14 vínculo com "Páginas enganosas" | Correlação sem causalidade | `REESCREVER` |
| Ausente: divergência por User-Agent | Achado novo, indispensável | `ADICIONAR` como P0 |

---

## 3. Veredito geral sobre o PRD P0 (`PRD-P0-...-SOFT-404.md`)

**`NO-GO` como está.** Não porque a tese esteja errada — o soft-404 é real e a
correção é necessária — mas porque **duas decisões de projeto, como escritas,
produzem resultado errado ou nulo**:

1. **`socialOgPlugin` declarado "não tocado"** → o `301` não chega ao Googlebot;
   e a divergência por UA (85 KB × 3 KB) fica em pé, não endereçada.
   → `BLOQUEAR IMPLEMENTAÇÃO` até o plugin entrar no escopo.
2. **Regra de categoria não declarada + com artigos → `noindex`** → des-indexa
   arquivos reais e populados (sp011 `/seguranca`, 163 artigos; Oley
   `/copa-do-mundo`, 86 artigos, a depender da leitura de `visible`).
   → `REESCREVER` a RN-2/RN-3 e o §13.2.

Além disso, três ajustes obrigatórios e um opcional:

3. **`fetchJson` tri-estado** — `SEGURA`, e agora provada: a API devolve **404**
   para artigo inexistente e **503** para banco indisponível. A distinção existe
   de verdade. `MANTER`.
4. **B15 (API fora → 200 + shell)** — `MANTER`, com um ajuste (§9, RN-1).
5. **Barra final** — `REMOVER DO P0`. Contradiz decisão deliberada já testada.
6. **Cobertura do 404** — `REESCREVER`: o escopo atual deixa de fora toda a
   classe de paths com extensão.

---

## 4. Matriz F-01 → F-25

Legenda de veredito conforme o prompt. "Runtime/dados" traz a evidência nova.

| ID | Claim atual | PDF | Código | Runtime/dados | Veredito | Mudança no PRD |
|---|---|---|---|---|---|---|
| **F-01** | `/api/sitemap.xml` não contém artigo | Deu 2/2 (positivo) | `sitemap.ts:36` → `store.getArticles()` → `store.ts:1332` `[]` | **14 `<loc>`, 0 `/artigo/`**; as 12 editorias são do sp011; 1.929 bytes | `CONFIRMADO POR CÓDIGO + RUNTIME` | `MANTER` · elevar confiança |
| **F-02** | Qualquer URL inexistente responde 200 | P0 dele | `vite.config.ts:817-820, 849-890` | **18/18 paths testados = 200**, inclusive `/rota-inventada-xyz`, `/caminho/de/dois` | `CONFIRMADO POR CÓDIGO + RUNTIME` | `REESCREVER` · causa incompleta (ver §6) |
| **F-03** | A rede publica `/artigo/__placeholder__` | Achou a URL | `CategoryArchivePage.tsx:126` + `CategoryPage.tsx:77` | `<a href="/artigo/__placeholder__" class="group block">` presente nas **13** editorias fixas | `CONFIRMADO POR CÓDIGO + RUNTIME` | `MANTER` |
| **F-04** | 13 editorias do sp011 respondem 200 em todo blog | Viu as rotas vazias | `categoryRoutes.ts:28-44` (**13**, conferido) | Todas as 13 com `<h1>` próprio e canonical próprio no Oley | `CONFIRMADO POR CÓDIGO + RUNTIME` | `MANTER` · corrigir "todo blog" (ver §10) |
| **F-05** | UUID e slug servem o mesmo artigo com 200 | P0 dele ("4 pares") | `articleService.ts:275` `or(eq(id),eq(slug))` | UUID **200** (85.961 B) e slug **200** (85.967 B), mesmo artigo. Mas **0 de 640** artigos sem slug | `CONFIRMADO POR CÓDIGO + RUNTIME`, **impacto superestimado** | `REESCREVER` impacto · `MANTER` ação |
| **F-06** | Description de editoria = a do site | Mediu 26 URLs | `vite.config.ts:750` | Todas as institucionais e editorias: `Notícia. Agora. Sempre.` | `CONFIRMADO POR CÓDIGO + RUNTIME` | `MANTER` |
| **F-07** | Home e editorias sem JSON-LD | Observou | 3 ocorrências de `ld+json`, só artigo/AMP | Home e `/futebol`: 0 `ld+json`. **Agravante:** artigo também tem 0 para Googlebot | `CONFIRMADO POR CÓDIGO + RUNTIME` | `REESCREVER` · agravado pelo achado de UA |
| **F-08** | Institucionais: "diagnóstico do PDF incorreto" | Chamou de thin e ofereceu bifurcação | Páginas reais (142/190/451/387 linhas), sem SSR | HTML inicial: **7.867 B, 0 canonical, título e description idênticos aos do site**; texto visível nulo | `PARCIALMENTE CONFIRMADO` — **a acusação ao PDF é injusta** | `REESCREVER` (ver §5) |
| **F-09** | Peso de DOM "sem problema mensurável" | Mediu 197 KB DOM / 39 KB | Cortes deliberados documentados | 219.001 B → **44.122 B** comprimidos; 76 imgs, **71 lazy**; TTFB 1,58 s | `CORRETO, MAS REDAÇÃO EXAGERADA` | `REESCREVER` (ver §17 do prompt) |
| **F-10** | "Robots e sitemaps 2/2" contradito | Deu 2/2 | Idem F-01 | `robots.txt` correto e aponta para os dois; XML válido; inventário vazio | `PARCIALMENTE CONFIRMADO` | `REESCREVER` para "funcional como endpoint, errado como inventário editorial" |
| **F-11** | Hreflang não aplicável | Apontou ausência | `Artigo.tsx:246-260` auto-referência no cliente | `siteLanguage: pt-BR`, monolíngue | `CONFIRMADO POR CÓDIGO` | `MANTER` |
| **F-12** | Autoridade/backlinks | Lacuna de medição | N/A | N/A | `NÃO FOI POSSÍVEL CONFIRMAR` | `MANTER` |
| **F-13** | Findings do BeeSports fora de escopo | — | — | — | `CONFIRMADO` (decisão de escopo) | `MANTER` |
| **F-14** | **Home publica 5 manchetes falsas de Brasília** | Não viu | `MostRead.tsx:8-14` existe; `Home.tsx:710` o chama | **`PortalZoneBlocks.tsx:765` intercepta**: bloco é `area:"sidebar"` → `SidebarMostRead` com artigos reais. HTML servido: mock **0 ocorrências**; nenhum blog vivo o exibe | **`CONTRADITO POR RUNTIME`** | `REBAIXAR PRIORIDADE` P0→P2 e reescrever inteiro |
| **F-15** | Breadcrumb aponta para a home em ~todo artigo | Contou schema como vantagem | `categoryRoute.ts` `ROUTE_MAP` sem nenhuma categoria do Oley | JSON-LD: pos 1 e pos 2 = `https://oleysports.com.br/`. Visível: `<a href="/">FUTEBOL</a>`. **640/640 artigos** | `CONFIRMADO POR CÓDIGO + RUNTIME` | `MANTER` · trocar "~todos" por **640/640** · reduzir impacto SEO (ver §16) |
| **F-16** | `articles.slug` sem `UNIQUE` | Não viu | `articles.ts:39,70` índice não-único; laço TOCTOU | **0 duplicados, 0 sem slug, 0 colisões** em 640 publicados | `CONFIRMADO POR CÓDIGO`; `DEPENDE DE DADOS` → **dados limpos** | `MANTER P2` — **não** precisa virar pré-condição |
| **F-17** | 404 é o scaffold do Vite, em inglês | — | `not-found.tsx` 21 linhas | Não está no HTML inicial (0 ocorrências) — só aparece **após hidratação**; status 200 | `CONFIRMADO POR CÓDIGO`, `PARCIALMENTE` em runtime | `REESCREVER` · é UX pós-hidratação, não HTML servido |
| **F-18** | `publisher.logo` = asset da imagem compartilhada | Não viu | `Artigo.tsx:545-549` `${origin}/favicon.jpg` | **sha256 idêntico** ao `public/favicon.jpg` do repo (33.166 B). Sem troca no build, sem volume, sem Caddy | `CONFIRMADO POR CÓDIGO + RUNTIME` | `MANTER` · reduzir impacto (Googlebot não recebe o JSON-LD) |
| **F-19** | `dateModified` = `datePublished` | — | `Artigo.tsx:534-535` | JSON-LD servido: ambos `2026-08-19T19:24:40.707Z` | `CONFIRMADO POR CÓDIGO + RUNTIME` | `MANTER` · condicionar à semântica de `updatedAt` (§16) |
| **F-20** | `/sitemap.xml` na raiz — a confirmar | — | Paths com extensão saem do `spaHeadPlugin` | **200 `text/html`** servindo o shell da SPA. Idem `/sitemap_index.xml`, `/manifest.json`, `/wp-login.php`, `/assets/inexistente.js` | `CONFIRMADO POR RUNTIME` | `AUMENTAR PRIORIDADE` P2→P1 · revela classe maior |
| **F-21** | `sitemap-news` não filtra `publishedAt` futuro | — | `sitemap-news.ts:31` sem teto | **0 artigos com data futura**. `ingest.ts:246` grava sempre `now`; só o admin pode pôr data futura | `PARCIALMENTE CONFIRMADO` — **causa descrita está errada** | `MANTER P3` · corrigir a justificativa |
| **F-22** | Sitemap geral sem `Cache-Control` | — | Sem header | Confirmado: geral **sem** `Cache-Control`; news com `public, max-age=900` | `CONFIRMADO POR CÓDIGO + RUNTIME` | `MANTER` |
| **F-23** | "Zero cobertura de teste na camada de SEO" | — | 87 arquivos de teste | Existem **3 suites relevantes**: `ssrRoutes.test.ts`, `categoryRoutes.test.ts`, `gtmSnippet.test.ts`. **156 testes passam** em `brasilia-agora` | `CORRETO, MAS REDAÇÃO EXAGERADA` | `REESCREVER`: "nenhum teste dedicado a sitemap/status/canonical/JSON-LD" |
| **F-24** | Sem CI de build/typecheck/teste | — | `.github/workflows/` só `security.yml` | Confirmado | `CONFIRMADO POR CÓDIGO` | `MANTER` |
| **F-25** | Herança do domínio antigo | — | `sitemap.ts:34` monta `base` do host | `midia.run/` → **301** → `.com.br/` (path preservado); `midia.run/api/sitemap.xml` → **200** publicando URLs `midia.run` | `CONFIRMADO POR RUNTIME` | `MANTER` |

**Contagem:** confirmados **17** · parcialmente confirmados **5** (F-08, F-09,
F-10, F-17, F-21) · exagerados na redação **2** (F-09, F-23 — contados em ambos
os grupos quando aplicável) · contraditos **1** (F-14) · não verificáveis **1**
(F-12) · de decisão de escopo **1** (F-13).

---

## 5. Revalidação PDF × PRDs

### 5.1 F-08 — a acusação ao PDF é injusta. Correção assumida.

O PRD geral classificou o item como **"DIAGNÓSTICO DO PDF INCORRETO"** e afirmou
que seguir a recomendação do PDF *"apagaria páginas legítimas — inclusive a
Política de Privacidade"*. Reexaminando com runtime:

| Fato | Evidência |
|---|---|
| O HTML inicial **é** thin | `/contato`, `/termos`, `/privacidade`, `/arquivo`: **7.866–7.871 bytes**, `<body>` = `<div id="root"></div>`, **zero** texto visível, **zero** `<h1>` |
| A metadata **é** genérica | Os quatro: `<title>OleySports — Notícia. Agora. Sempre.</title>` e a mesma description. **Nenhum canonical** |
| O conteúdo real existe, mas só em CSR | `Contato.tsx` 142 linhas, `Termos.tsx` 190, `Privacidade.tsx` 451, `Archive.tsx` 387 |
| O crawler do PDF **não tinha como** saber disso | Ele lê o HTML servido. O HTML servido não contém o conteúdo |

**Conclusão honesta:** o PDF **observou corretamente**. Ele mediu o que era
mensurável e viu exatamente o que um rastreador sem execução de JS vê. Além
disso, conforme o próprio prompt de revalidação registra, o PDF **distingue** o
caso "rota realmente vazia → noindex/404/410" do caso "página institucional real
→ metadata e conteúdo próprios" — e é o segundo ramo que se aplica, com a
recomendação **correta**.

O erro foi da primeira auditoria, que leu a bifurcação do PDF como se fosse uma
recomendação única de 404/410 e construiu em cima disso uma acusação.

**Reclassificação proposta:**
`PARCIALMENTE CONFIRMADO — OBSERVAÇÃO DO PDF CORRETA; O CÓDIGO REVELA A CAUSA
(CSR-only), QUE O HTML NÃO MOSTRAVA. A RECOMENDAÇÃO DE CONTEÚDO/METADATA
PRÓPRIOS PERMANECE VÁLIDA.`

`DEPENDE DE RELEITURA DO PDF` para a redação final — ver limitação na abertura.

### 5.2 F-10 — precisar melhor, sem inverter o sinal

O prompt pede a distinção entre **sitemap funcional como endpoint** e **sitemap
correto como inventário**. Runtime dá as duas metades:

- Endpoint: `HTTP 200`, `Content-Type: application/xml`, XML bem-formado,
  anunciado no `robots.txt` por host correto. **O PDF acertou nisso.**
- Inventário: **0 artigos** de um acervo de **640**; 12 das 14 URLs são editorias
  de outro portal que não existem editorialmente aqui.

**Veredito preciso:**
`FUNCIONAL COMO ENDPOINT, INCOMPLETO/ERRADO COMO INVENTÁRIO EDITORIAL` — não
"PDF errado". A pontuação 2/2 mede a dimensão que o crawler conseguia medir. A
frase do PRD *"o que o PDF contou como vantagem é um P0"* continua verdadeira
como consequência, mas a acusação ao PDF deve sair.

### 5.3 F-09 / performance — manter a incerteza

O PRD concluiu *"não há problema mensurável de download"*. Medido: 219.001 B →
**44.122 B** comprimidos; 76 `<img>`, **71** com `loading="lazy"`; TTFB 1,58 s.

Sobre **download**, a frase está certa. Mas o prompt tem razão: DOM, hidratação,
main-thread, memória, LCP, INP e CLS são dimensões diferentes e **não foram
medidas**. Sem Lighthouse/CrUX, a conclusão correta é:

`NÃO HÁ EVIDÊNCIA SUFICIENTE PARA PRIORIZAR` — e não "não existe problema".

Observação de campo, não conclusiva: durante os testes, uma requisição a
`/f1` com timeout de 20 s **caiu para o shell** e a repetição seguinte devolveu
SSR completo (182.516 B) em duas tentativas. Isso indica que o caminho de SSR
frio pode passar de 20 s sob certas condições — o que **reforça** a necessidade
da RN-1 (falha/lentidão nunca vira 404), mas não é medição de performance.

---

## 6. Revalidação das causas raiz

### 6.1 A cadeia do soft-404 está certa — e é incompleta

A cadeia descrita no PRD P0 (§6.2) foi **confirmada inteira em runtime**:

```
FIXED_CATEGORIES (13)  →  /politica … resolvem no Oley  →  SSR 200 com <h1>POLÍTICA</h1>
        →  editoria vazia  →  placeholder id "__placeholder__"
        →  <a href="/artigo/__placeholder__">  (confirmado no HTML das 13)
        →  renderArticle não acha  →  next()  →  spaHeadPlugin  →  200
```

**Mas existe uma segunda fonte, independente e não coberta pelo conserto
proposto.** O PRD afirma (F-20, §12) que paths com extensão "caem no estático do
`vite preview`" e os deixa fora do escopo. Runtime mostra o que o estático faz:

| Path | Resposta | Observação |
|---|---|---|
| `/sitemap.xml` | **200 `text/html`** | shell da SPA (`<div id="root">` presente) |
| `/sitemap_index.xml` | **200** | idem |
| `/manifest.json` | **200 `text/html`** | idem |
| `/wp-login.php` | **200 `text/html`** | idem |
| `/nada.xml`, `/foo.txt`, `/nao-existe.png` | **200 `text/html`** | idem |
| `/assets/inexistente.js` | **200 `text/html`** | **chunk ausente devolve HTML** |

A última linha é a mais séria operacionalmente: depois de um deploy, um chunk que
não existe mais devolve HTML com 200 em vez de 404, e o navegador falha com erro
de MIME em vez de falhar limpo.

**Consequência para o PRD P0:** a §9 ("Vocabulário de resposta") e o §12
("Arquivos afetados") precisam alcançar o fallback estático do `vite preview`
(`appType`/`sirv single`), ou o PRD entrega um 404 que cobre metade do problema e
deixa `/sitemap.xml` — justamente a URL que um buscador sonda por convenção —
respondendo 200 com HTML.

### 6.2 A causa do `/geral` está certa pela metade

O PRD atribui o `/geral` a `Home.tsx:533,653` (`block.category ?? "geral"`).
Runtime confirma **um** link `/geral` na home, num "Ver mais →". Mas a
configuração real do blog mostra **duas** fontes possíveis:

- `content-os-mais` — `category: null` → cai no fallback `?? "geral"`;
- `image-1786734949673` — **`category: "geral"` explícito**, `visible: true`.

O conserto proposto (§13.8) testa `!!block.category`. Um bloco com categoria
**explícita** que não pertence à superfície do blog (exatamente o caso acima)
**continuaria** gerando o link. A correção precisa validar o `href` contra a
mesma superfície de editorias, não contra a presença do campo.

### 6.3 A causa raiz que faltou: divergência por User-Agent

Não estava em nenhum dos dois PRDs, nem no PDF. É a causa de maior alcance
encontrada nesta revalidação e é **indispensável** para julgar o P0 (§5 do
prompt de revalidação a exige explicitamente). Detalhada na §7.2.

---

## 7. Revalidação com runtime

### 7.1 Estado de deploy × HEAD

| Pergunta | Resposta | Evidência |
|---|---|---|
| Branch atual | `main` | `git rev-parse` |
| HEAD | `b555965` (18/08/2026) | `git log -1` |
| Último commit tocando a camada auditada | `20e01a6` (17/08/2026, "GTM no HTML servido") | `git log -- vite.config.ts …` |
| Produção roda ≥ `20e01a6`? | **SIM** | O HTML servido contém o GTM injetado **pelo servidor** (`googletagmanager.com/gtm.js`, `GTM-NX23MQXR` 3×), que é justamente o que `20e01a6` introduziu |
| Há gap HEAD × deploy nesta camada? | **NÃO** | `b555965` (único commit posterior) mexe em SQL da central, não no blog |

Veredito: **`CÓDIGO NÃO MUDOU; DEPLOY CONFIRMADO COMO ≥ 20e01a6`**. E, de todo
modo, cada comportamento afirmado foi verificado direto na resposta HTTP — não
depende dessa correspondência.

### 7.2 `socialOgPlugin` — as 7 perguntas obrigatórias

`CRAWLER_RE` (`vite.config.ts:41-42`) inclui `Googlebot` e `bingbot`, além dos
crawlers sociais.

| # | Pergunta do prompt | Resposta | Evidência de runtime |
|---|---|---|---|
| 1 | Consulta a API? | **SIM** | `fetch(${apiBase}/api/articles/${slug})` |
| 2 | Distingue 404 de indisponibilidade? | **NÃO** | `if (!apiRes.ok) { next(); }` — trata 404 e 5xx igual |
| 3 | Artigo inexistente: 404 ou 200? | **200 hoje**; depois do P0 vira 404 | cai no `next()` → shell (7.881 B) |
| 4 | UUID: 301 ou 200? | **200 — e continuará 200 depois do P0** | Googlebot em `/artigo/<uuid>`: **200, 2.953 B** |
| 5 | Pode ignorar a `routeDecision`? | **SIM, integralmente** | roda antes do `ssrPlugin` e encerra com `res.end()` |
| 6 | Canonical correto? | **SIM** | `<link rel="canonical" href="…/artigo/<slug>">` presente |
| 7 | Comportamento varia por UA? | **SIM, drasticamente** | ver tabela abaixo |

**Medição, mesmo artigo, mesma URL:**

| User-Agent | Bytes | `ld+json` | `NewsArticle` | Corpo |
|---|---|---|---|---|
| Chrome (navegador) | **85.961** | 1 | 1 | artigo completo + navegação |
| `Googlebot/2.1` | **2.953** | **0** | **0** | `<h1>` + `<p>` + `<img>` |
| `bingbot/2.0` | **3.007** | 0 | 0 | idem |
| `facebookexternalhit` | **3.007** | 0 | 0 | idem |

O corpo integral servido ao Googlebot é:

```html
<body>
<h1><a href="…/artigo/manchester-city-nico-gonzalez">Fim de carreira? Nico González…</a></h1>
<p>O meio-campista pode mudar de clube… — Leia mais em nosso site</p>
<img src="https://central.midia.run/api/news/image/…webp" alt="…" style="max-width:100%">
</body>
```

Escopo: **somente `/artigo/*`**. Home (219.001 B) e `/futebol` (209.770 B) são
idênticas para Googlebot e navegador.

**Três consequências que os PRDs precisam absorver:**

1. **O 301 do P0 é inócuo para buscadores.** É a entrega-título do PRD.
2. **O "224/250 páginas com NewsArticle/BreadcrumbList" do PDF descreve o que um
   crawler de UA comum vê.** O Google não recebe schema nenhum em artigo. Isso
   **reduz muito** o impacto real de F-15 (breadcrumb inválido) e F-18
   (`publisher.logo`) — o defeito existe, mas no documento que o buscador não lê.
   O invariante **P-3** do PRD geral ("preservar o schema do artigo") descreve
   uma vantagem que, para o Google, não está em vigor.
3. **Risco de conformidade.** Entregar 3 KB sem corpo ao Googlebot e 86 KB ao
   usuário é divergência substancial por User-Agent. Não afirmo que haja
   penalidade aplicada — isso exigiria GSC (§8, E-8) — mas o padrão é o que as
   políticas de spam do Google descrevem como *cloaking*, e ele convive com um
   precedente interno de alerta na rede (§11).

**Correção necessária:** o `socialOgPlugin` **entra no escopo do P0**. A opção
mínima e de menor risco é **retirar `Googlebot` e `bingbot` do `CRAWLER_RE`**,
deixando o plugin para crawlers sociais (que é o propósito declarado dele) e
fazendo buscador receber o SSR completo. Isso é uma mudança de uma linha, com
efeito grande, e precisa da sua decisão porque muda o que o Google indexa.

### 7.3 Inventário completo de rotas (exigido pelo §4 do prompt)

O prompt condiciona a aprovação do 404 a esta tabela. Fontes: `App.tsx` (todos os
`<Route>`), `RESERVED_PATHS`, plugins do Vite, rotas do `api-server`, Caddy.

| Path / padrão | Existe? | Quem responde hoje | Status atual | Status proposto | Seguro? |
|---|---|---|---|---|---|
| `/` | sim | `ssrPlugin.renderHome` | 200 | 200 | ✅ |
| `/artigo/<slug existente>` | sim | `ssrPlugin.renderArticle` | 200 | 200 | ✅ |
| `/artigo/<uuid existente>` | sim | idem | 200 | 301 → slug | ⚠️ inócuo p/ Googlebot (§7.2) |
| `/artigo/<inexistente>` | não | `spaHeadPlugin` | 200 | 404 | ✅ |
| `/artigo/__placeholder__` | não | `spaHeadPlugin` | 200 | 404 + deixar de ser linkado | ✅ |
| `/<editoria declarada, com artigos>` | sim | `renderCategory` | 200 | 200 | ✅ |
| `/<editoria declarada, vazia>` (`/basquete`) | sim | shell hoje | 200 | 200 + noindex | ✅ |
| `/<não declarada, COM artigos>` (`/copa-do-mundo` 86, `/tebol` 39) | sim | shell hoje | 200 | 200 + **noindex** | ❌ **ver §8.3** |
| `/<não declarada, vazia>` (`/politica`…) | não | `renderCategory` (via FIXED) | 200 | 404 | ✅ |
| `/geral` | não (no Oley) / **sim (no sp011)** | shell / SSR | 200 | 404 / 200 | ⚠️ ver §10 |
| `/arquivo`, `/contato`, `/privacidade`, `/termos` | sim | `spaHeadPlugin` | 200 | 200 (allowlist) | ✅ allowlist **completa** |
| `/admin/**` (24 rotas) | sim | `spaHeadPlugin` | 200 | 200 (inalterado) | ✅ `Disallow` no robots |
| `/admin/setup` | sim | idem | 200 | 200 | ✅ |
| `/<path>/` (barra final) | duplicata? | shell **7.868 B** | 200 | 301 proposto | ❌ ver §10.5 |
| `/FUTEBOL` (caixa alta) | não | shell | 200 | **não coberto** | ⚠️ |
| `//futebol` (barra dupla) | não | shell | 200 | **não coberto** | ⚠️ |
| `/a/b`, `/a/b/c` | não | shell | 200 | 404 | ✅ |
| `/robots.txt`, `/llms.txt` | sim | `seoTextPlugin` | 200 | inalterado | ✅ |
| `/api/**` | sim | Express | 200/404/503 correto | inalterado | ✅ |
| `/api/amp/artigos/:slug` | sim | `ampRouter` | 200 / **404** correto | inalterado | ✅ sem `rel="amphtml"` no artigo |
| `/*.ext` inexistente | não | **fallback estático** | **200 `text/html`** | **não coberto** | ❌ ver §6.1 |
| `/assets/*` inexistente | não | idem | **200 `text/html`** | **não coberto** | ❌ |

**Conclusão da tabela:** a allowlist de institucionais está **completa** (as 4
rotas batem exatamente com `RESERVED_PATHS` e com os `<Route>` do `App.tsx`).
Mas a tabela **não cobre 100% da superfície**: três padrões (extensão, caixa
alta, barra dupla) ficam de fora do conserto proposto. O §4 do prompt condiciona
a aprovação do 404 a essa cobertura — por isso o item entra como bloqueador
menor.

---

## 8. Revalidação com dados

Todos os números via API pública do próprio blog, em 19-20/08/2026.

### 8.1 Unicidade de slug — a regra GO/NO-GO do §7 do prompt

| Métrica | Valor |
|---|---|
| Artigos publicados | **640** |
| `slug` nulo/vazio (API devolve `slug === id`) | **0** |
| Slugs duplicados entre publicados | **0** |
| Slug que colide com `id` de outro artigo | **0** |
| Slugs com caractere fora de `[a-z0-9-]` | **7** (acentos: `uts-rio-joão-fonseca`, `joãofonseca-ultrapassa-4-milhões`, `volante-suíço-…`, `brasil-perde-tailândia-liiga`, e um com espaço: `thiagog silvaehulkfluminense`) |
| Artigos com `publishedAt` futuro | **0** |
| Janela do acervo | 2026-07-10 → 2026-08-19 |

**Veredito: `ETAPA UUID→SLUG: GO`.** Não existe o cenário perigoso
(UUID de A → slug compartilhado → resolve B). O `301` é determinístico com os
dados atuais.

**Ressalvas que continuam valendo:**

- `DEPENDE DE DADOS` para não-publicados: a API só expõe `status = published`.
  Um rascunho com slug duplicado não apareceria aqui, mas também não é servido.
- Os **7 slugs com acentos/espaço** merecem atenção na etapa do `301`:
  `encodeURIComponent` no `location` (como o PRD já prevê em `decideArticle`)
  resolve, mas o caso do slug **com espaço** (`thiagog silvaehulkfluminense`)
  precisa de teste explícito — é o único que produz URL com `%20`.
- F-16 (índice `UNIQUE`) permanece **P2**: é prevenção de um TOCTOU que ainda não
  ocorreu. **Não** precisa virar pré-condição do P0.

### 8.2 `canonicalUrl` externo / domínio antigo (§8 do prompt)

`NÃO FOI POSSÍVEL CONFIRMAR`. O campo `canonicalUrl` **não é exposto** por
`/api/articles` nem por `/api/articles/:id` no payload público. Verificar exige
consulta ao banco do blog, que esta revalidação não fez.

O que **é** verificável e importa para a decisão: o SSR respeita esse campo acima
de tudo (`vite.config.ts:685`). Portanto, se existirem artigos com `canonicalUrl`
apontando para `oleysports.midia.run`, o `301` de UUID→slug continua correto (ele
canonicaliza a **URL local**), mas o **sitemap** do P0-2 não deve incluí-los — o
que o PRD-2 já prevê no item 6 da solução. A regra está certa; falta o dado.

**Fica como pré-condição de dados do P0-2, não do P0-1.**

### 8.3 Superfície de categorias contra dados reais (§9 do prompt)

**OleySports** — `settings.categories` **existe** (9 entradas); `menuItems` traz
7 editorias + home.

| slug | `settings.categories` | menu | artigos publicados | comportamento HOJE | comportamento PROPOSTO |
|---|---|---|---|---|---|
| `futebol` | sim (visible) | sim | **307** | 200 SSR | 200 ✅ |
| `volei` | sim (visible) | sim | 42 | 200 SSR | 200 ✅ |
| `tenis` | sim (visible) | sim | 45 | 200 SSR | 200 ✅ |
| `f1` | sim (visible) | sim | 46 | 200 SSR | 200 ✅ |
| `futebol-americano` | sim (visible) | sim | 42 | 200 SSR | 200 ✅ |
| `e-sports` | sim (visible) | sim | 17 | 200 SSR | 200 ✅ |
| `outros` | sim (visible) | sim | 13 | 200 SSR | 200 ✅ |
| `basquete` | sim (visible) | **não** | **0** | **shell 200** | 200 + noindex ✅ |
| `copa-do-mundo` | sim, **`visible: false`** | **não** | **86** | **shell 200 (sem página!)** | **200 indexável OU 200+noindex — o PRD não define** ❌ |
| `tebol` | não | não | **39** | shell 200 | 200 + noindex ⚠️ |
| `copa-do-mndo` | não | não | 2 | shell 200 | 200 + noindex ⚠️ |
| `otros` | não | não | 1 | shell 200 | 200 + noindex ⚠️ |
| `geral` | não | não | 0 | shell 200 | 404 ✅ |
| `politica` … (13 fixas) | não | não | 0 | **200 SSR + placeholder** | 404 ✅ |

**Três achados de dados que o PRD não previu:**

1. **`copa-do-mundo` tem 86 artigos publicados e hoje NÃO tem página** (devolve
   shell). É a 2ª maior editoria do blog. A proposta a conserta — mas só se a
   superfície **não** filtrar por `visible`. O PRD escreve `CategoryLike` com
   campo `visible?` e não diz o que fazer com ele; `/api/articles/categories`
   (`articles.ts:15`) **filtra** `visible !== false`. Se `blogCategorySurface`
   copiar esse filtro, 86 artigos ganham `noindex`.
   **Decisão obrigatória antes de implementar.**
2. **`tebol` (39), `copa-do-mndo` (2), `otros` (1)** são **slugs corrompidos** —
   o padrão bate com o bug já corrigido em `90a0d47` ("slugify: barra dupla
   apagava u, f e dígitos"): `futebol`→`tebol`, `copa-do-mundo`→`copa-do-mndo`,
   `outros`→`otros`. São **42 artigos** órfãos de taxonomia. Isso é **tarefa de
   dados**, não de código, e nenhum status HTTP a resolve.
3. **128 dos 640 artigos (20%)** estão em categorias que o menu não expõe e que
   `/api/articles/categories` não lista.

### 8.4 O impacto no sp011 (§10 e §15 do prompt) — aqui está a regressão

`settings.categories` do sp011 é **ausente** (confirma a "taxonomia vazia de
propósito"). `menuItems` declara **9**: `/politica`, `/economia`, `/mundo`,
`/cidade`, `/esportes`, `/cultura`, `/saude`, `/tecnologia`, **`/geral`**.

Pela cascata proposta (`categories` → `menuItems` → `FIXED` só se 1 e 2 vazios),
o passo 2 do sp011 **não é vazio** → **`FIXED_CATEGORIES` nunca se aplica ao
sp011**. Consequências, com contagens reais:

| slug (sp011) | no menu? | artigos | HOJE | PROPOSTO | Avaliação |
|---|---|---|---|---|---|
| `politica` | sim | 744 | 200 SSR | 200 ✅ | ok |
| `cidade` | sim | 308 | 200 | 200 ✅ | ok |
| `cultura` | sim | 514 | 200 | 200 ✅ | ok |
| `economia` | sim | 612 | 200 | 200 ✅ | ok |
| `mundo` | sim | 674 | 200 | 200 ✅ | ok |
| `esportes` | sim | 325 | 200 | 200 ✅ | ok |
| `saude` | sim | 210 | 200 | 200 ✅ | ok |
| `tecnologia` | sim | 192 | 200 | 200 ✅ | ok |
| `geral` | **sim** | **473** | 200 SSR (`<h1>GERAL</h1>`, 206 KB) | 200 ✅ | ok — **mas ver §10.2** |
| **`seguranca`** | **não** | **163** | **200 SSR real, 208 KB** | **200 + noindex** | ❌ **REGRESSÃO** |
| `transporte` | não | 0 | 200 SSR + placeholder | 404 | ✅ desejável |
| `educacao` | não | 0 | 200 SSR + placeholder | 404 | ✅ desejável |
| `colunas` | não | 0 | 200 SSR + placeholder (**confirmado**) | 404 | ✅ desejável |
| `brasil` | não | 0 | 200 SSR + placeholder (**confirmado**) | 404 | ✅ desejável |
| `aviacao` | não | **27** | shell 200 | 200 + noindex | ⚠️ |
| `nfl` | não | **8** | shell 200 | 200 + noindex | ⚠️ |
| `copa-do-mundo` | não | 1 | shell 200 | 200 + noindex | ⚠️ |

**A regressão é concreta:** `/seguranca` no sp011 é hoje uma editoria viva, com
**163 artigos publicados** e página SSR completa de 208 KB. A regra proposta a
rebaixa para `noindex` porque ela não está no menu. Isso satisfaz o critério de
NO-GO do §31 do prompt ("a superfície de categorias puder apagar URLs
legítimas") — tirar do índice é apagar.

**Correção proposta (a decidir por você, §14):** a regra
`não declarada + tem artigos → noindex` deve virar
`não declarada + tem artigos → 200 INDEXÁVEL`. Justificativa: conteúdo publicado
é conteúdo publicado; a ausência no menu é uma decisão de navegação, não de
indexação. O `noindex` fica reservado para **declarada + vazia** (RN-3, que
continua correta). Com isso:

- sp011 `/seguranca`, `/nfl`, `/aviacao` → **200 indexável**, e `/nfl` e
  `/aviacao` inclusive **ganham** página (hoje são shell);
- Oley `/copa-do-mundo` → **200 indexável**, resolvendo os 86 artigos sem depender
  da leitura de `visible`;
- Oley `/tebol`, `/copa-do-mndo`, `/otros` → 200 indexável, o que é feio mas
  honesto; a solução real é a limpeza de dados (§8.3, item 2);
- `/politica` e as demais fixas vazias → **404**, que é o objetivo do PRD.

Isto **elimina os dois riscos** (regressão no sp011 e ambiguidade de `visible`)
sem enfraquecer o P0.

---

## 9. Revalidação das regras RN-1 → RN-9

| # | Regra | Veredito | Observação |
|---|---|---|---|
| **RN-1** | Falha de infraestrutura nunca vira 404 | **`SEGURA` — premissa confirmada** | `/api/articles/<inexistente>` → **404**; `app.ts:175-186` → **503** para banco fora. A distinção que o `fetchJson` tri-estado precisa **existe de verdade**. Ver §9.1 para 200 × 503 |
| **RN-2** | Editoria existe se declarada **ou** tem conteúdo | **`PRECISA MUDAR`** | O princípio está certo; a consequência escrita (`noindex` para "tem conteúdo mas não declarada") é a regressão da §8.4 |
| **RN-3** | Declarada + vazia → 200 + `noindex` | **`SEGURA`** | Correta e conservadora. `/basquete` é exatamente esse caso |
| **RN-4** | URL canônica = `/artigo/<slug>`; sem slug, `/artigo/<id>` | **`SEGURA`** | Já é o que o SSR emite (`vite.config.ts:669`). Com 0 artigos sem slug, o ramo do `id` é hoje inalcançável |
| **RN-5** | Identificador antigo nunca deixa de resolver | **`SEGURA`** | Backend mantém `or(eq(id),eq(slug))`; muda só o status |
| **RN-6** | Nenhuma página publica link que daria 404 | **`SEGURA` e essencial** | É o que ordena as etapas (primeiro parar de linkar, depois 404). Mas precisa alcançar o caso do §6.2 (bloco com categoria explícita fora da superfície) |
| **RN-7** | `noindex` reescreve a tag `robots`, nunca acrescenta | **`SEGURA`** | `index.html` traz `<meta name="robots" content="index, follow">`; `applyHead` é o funil único. Ver §10.4 |
| **RN-8** | `FIXED_CATEGORIES` só entra quando o blog não declara nada | **`PRECISA MUDAR`** | Tecnicamente funciona (sp011 tem menu → FIXED não se aplica), mas **não protege o sp011** como a regra afirma: `/seguranca` cai para `noindex`. A proteção real vem da correção da RN-2 |
| **RN-9** | Cliente e servidor usam a MESMA função | **`SEGURA`** | Invariante já registrada em `categoryRoutes.ts:3-12`. A remoção das 13 rotas fixas do `App.tsx` é coerente com ela |

### 9.1 API indisponível: 200 + shell, 503, ou outra coisa? (§6 do prompt)

O PRD escolheu **200 + shell**. Reavaliando as três estratégias:

| Critério | **A · 200 + shell** | **B · 503 + `Retry-After`** | **C · stale do cache** |
|---|---|---|---|
| Risco de soft-404 | **Alto** — 200 sem conteúdo é o defeito que o PRD combate | Nulo | Nulo |
| Sinal ao crawler | Ambíguo (parece página vazia) | **Correto e explícito**: "volte depois" | Ótimo (conteúdo real) |
| Risco de desindexação | Médio (200 vazio repetido) | **Baixo** — Google trata 503 curto como transitório | Baixo |
| UX | Ruim, mas a SPA hidrata e pode se recuperar | Página de erro | **Melhor de todas** |
| Monitoramento | **Invisível** — 200 não acende alarme | Visível em qualquer métrica | Visível |
| Restart curto | Tolerável | Tolerável | Transparente |
| Complexidade | Nenhuma (é o hoje) | Baixa | Média (já existe SWR parcial) |

**Veredito: `RN-1 REESCREVER`** — mas mantendo o princípio (nunca 404).
Recomendação em camadas, na ordem:

1. **Se houver entrada no cache** (mesmo expirada) → servir o **stale** com 200.
   O `htmlCache` já guarda o HTML e o `revalidate()` já existe
   (`vite.config.ts:771-790`); é a melhor resposta possível e reaproveita
   arquitetura existente.
2. **Se não houver stale** → **`503` com `Retry-After: 60`**, não 200.
   Motivo decisivo: o PRD inteiro existe para acabar com "200 que não significa
   200". Responder 200 numa falha de infraestrutura repete exatamente esse
   pecado, e ainda por cima esconde o incidente do monitoramento.
3. **Nunca 404.** Este é o núcleo da RN-1 e permanece intocado.

O texto atual de B15 ("**200** com shell — degradação atual") deve ser
substituído por essa cascata.

---

## 10. Revalidação da arquitetura proposta

Veredito decisão a decisão, conforme pedido no §22 do prompt.

| Decisão do P0 | Veredito | Observação |
|---|---|---|
| `classifySsrPath` ganhar `kind` (`static`/`unknown`/…) | **`SEGURA`** | Função pura, já testada (18 testes passando). É o lugar certo |
| `STATIC_PAGE_PATHS` = 4 institucionais | **`SEGURA` e completa** | Bate exatamente com `RESERVED_PATHS` e com os `<Route>` do `App.tsx` |
| `blogCategorySurface(menu, categories)` | **`PRECISA MUDAR`** | Ver §8.3/§8.4: definir o tratamento de `visible: false` e não usar `noindex` para não-declarada-com-conteúdo |
| `decideArticle` | **`SEGURA`** | Lógica correta; dados limpos (§8.1). Testar o slug com espaço |
| `decideCategory` | **`PRECISA MUDAR`** | Mesmo motivo do `blogCategorySurface` |
| `fetchJson` tri-estado | **`SEGURA`** | Premissa confirmada em runtime (404 × 503). É a mudança mais importante e mais bem fundamentada do PRD |
| `sendHtml(status)` | **`SEGURA`** | Mudança mecânica |
| `noindex` via `applyHead` (regex na tag existente) | **`SEGURA`** | Ver §10.4 |
| `handleSsr` como roteador | **`SEGURA`** | Desde que o `socialOgPlugin` deixe de interceptar buscadores (§7.2) |
| `serveShell(req,res,status)` | **`SEGURA`** | |
| Cache tri-estado (`html`/`redirect`/`notFound`), TTL 60 s | **`SEGURA`** | Ver §10.3 |
| Remover as 13 rotas fixas do `App.tsx` | **`SEGURA`** | Coerente com RN-9 |
| Empty state deixa de ser `<Link>` | **`SEGURA`** | Correção direta de F-03 |
| Blocos mock fora do renderizador | **`SEGURA`, mas não é P0** | Ver §11 — o mock não chega a produção |
| "Ver mais" sem categoria | **`PRECISA MUDAR`** | Ver §6.2 — validar contra a superfície, não contra `!!block.category` |
| **Barra final → 301** | **`REMOVER DO P0`** | Ver §10.5 |
| `socialOgPlugin` "não tocado" | **`PRECISA MUDAR` — bloqueador** | §7.2 |
| Paths com extensão fora de escopo | **`PRECISA MUDAR`** | §6.1 |

### 10.1 HEAD, query string, admin, setup, preview

- **HEAD:** `isReadRequest` (`vite.config.ts:430-432`) devolve `true` para
  `GET` **e** `HEAD`. Runtime: `HEAD /` e `HEAD /futebol` → 200. O 404/301 valerá
  para HEAD automaticamente. **`SEGURA`.**
- **Query string:** `/futebol?page=2` devolve o mesmo HTML e o mesmo canonical
  (`…/futebol`). A `cacheKey` usa `route.key`, derivado do path — query não
  fragmenta o cache nem muda a decisão. **`SEGURA`.**
- **Admin/setup:** `classifySsrPath` recusa `/admin*` (teste "o painel NUNCA é
  renderizado no servidor" passa) e o `robots.txt` mantém `Disallow: /admin`.
  As 24 rotas de admin continuam 200. **`SEGURA`.**
- **Preview do admin:** o `Home.tsx` distingue `isAdminPreview`; nada no P0 mexe
  nesse caminho. **`SEGURA`.**

### 10.2 O `/geral` não é uma rota inexistente na rede

O PRD escreve, no §13.8, que o `/geral` *"era uma rota que não existe em blog
nenhum da rede"*. **Isso é falso.** No sp011, `/geral` é **item de menu** e tem
**473 artigos publicados**, servindo 206 KB de SSR com `<h1>GERAL</h1>`.

A regra proposta é orientada a dados e trata o caso corretamente (declarada →
200), então **o código está certo e o comentário está errado**. Mas o comentário
viraria um comentário mentiroso no fonte, e é o tipo de frase que induz alguém a
"simplificar" a regra depois. `REESCREVER`.

### 10.3 Cache de 404 (§24 do prompt)

| Verificação | Resultado |
|---|---|
| Chave inclui host? | **SIM** — `vite.config.ts:804`: `` `${host}|${route.key}` `` |
| Blog A `/futebol` pode vazar para blog B? | **NÃO.** Duplamente: o host está na chave **e** cada blog roda seu próprio container `web` (projeto compose por blog) — os processos não compartilham memória |
| Query entra na chave? | Não — e não precisa (§10.1) |
| Capacidade / LRU | 200 entradas, reinserção no fim (`Map` por ordem de inserção), `mem_limit: 768m` |
| URL criada logo após um 404 | TTL de **60 s** proposto → aparece em ≤ 60 s |
| Risco de envenenamento por `Host` forjado | Baixo: o Caddy roteia por host declarado; um host desconhecido não chega ao container do blog |

**Veredito: `SEGURA`.** O critério de NO-GO "cache puder misturar blogs" **não**
se materializa.

Ressalva menor: com TTL de 60 s e teto de 200 entradas, um varredor de URLs
inexistentes pode despejar entradas úteis do cache. Não é bloqueador, mas vale
considerar um teto separado para `notFound` ou não cachear 404 de path
claramente hostil.

### 10.4 404 + `noindex` (§23 do prompt)

- `404` e `200 + noindex` **não** são equivalentes e o PRD já os trata como
  coisas distintas (tabela §16). **Correto.**
- Emitir `noindex` **junto** com o 404 é redundante (um 404 não é indexado), mas
  **inofensivo e defensivo**: se um dia o status vazar como 200 por bug de
  middleware, o `noindex` segura. Recomendo **manter**.
- **Exigências, todas atendíveis pelo desenho atual:** uma única tag `robots`
  (RN-7 + `applyHead` como funil único — o `index.html` traz exatamente uma tag,
  e o regex a reescreve no lugar); **nenhum canonical** no corpo do 404 (hoje o
  `spaHeadPlugin` já passa `extraTags` vazio, então nasce certo — mas isso
  precisa virar **teste**, porque o P1-1 planeja adicionar canonical ao
  `spaHeadPlugin` e criaria canonical em página 404).
- **Recomendação nova:** incluir em §29 (não regressões) o item *"resposta 404
  não contém `<link rel="canonical">`"*, senão o P1-1 quebra o P0-1.

### 10.5 Barra final (§25 do prompt) — retirar do P0

Três motivos, o terceiro decisivo:

1. **Não é duplicata de conteúdo.** Runtime: `/futebol` = 209.770 B com
   `<h1>FUTEBOL</h1>`; `/futebol/` = **7.868 B**, shell, **sem** H1 e **sem**
   canonical. É um soft-404, não conteúdo duplicado. A justificativa escrita no
   PRD (A12: "duplicata de A5") está incorreta.
2. **Contradiz uma decisão deliberada e testada.** `ssrRoutes.ts:35` tem
   `if (p.endsWith("/")) return null;` com o comentário *"SPA responder, como
   antes deste PRD"*, e o teste `"barra final fica com a SPA (o wouter do cliente
   pode casar outra rota)"` (`ssrRoutes.test.ts:16-19`) o protege. Mudar isso
   exige entender por que a decisão foi tomada — o comentário sugere um caso de
   roteamento do wouter no cliente.
3. **Não vem do PDF nem de nenhum finding P0.** É melhoria oportunista dentro de
   uma mudança já grande e arriscada.

**Veredito: `REMOVER` do P0-1** (vira item P2 próprio). Se ficar, tem de vir com
teste explícito para `/`, `/artigo/x/`, `/admin/`, assets e API.

### 10.6 P0-1 e P0-2: separar ou entregar junto? (§26 do prompt)

**Veredito: `ENTREGAR ATOMICAMENTE`.** Com dados:

O sitemap atual publica 14 URLs. Depois do P0-1 isoladamente:

| URL do sitemap | Status pós-P0-1 |
|---|---|
| `/` | 200 |
| `/politica`, `/cidade`, `/seguranca`, `/transporte`, `/saude`, `/educacao`, `/cultura`, `/esportes`, `/brasil`, `/mundo`, `/colunas` | **404** (11 URLs — nenhuma tem artigo no Oley) |
| `/arquivo`, `/contato` | 200 |

**11 de 14 URLs (79%) do sitemap passariam a responder 404.** Anunciar isso ao
Google, deliberadamente, durante uma janela de deploy, é pior que qualquer ganho
de faseamento. Some-se que o P0-2 é **Impacto alto + esforço baixo** (trocar um
stub por uma query já escrita em `sitemap-news.ts`) e o argumento de separar
desaparece.

O PRD geral (§P0-2, "Dependências") já reconhece *"as editorias vazias precisam
sair na mesma leva"* — esta revalidação apenas quantifica e torna a entrega
conjunta **obrigatória**, não preferencial.

---

## 11. Riscos não suficientemente tratados nos PRDs

Somente riscos das mudanças já propostas.

| # | Risco | Origem | Severidade |
|---|---|---|---|
| **K-A** | O `301` de UUID→slug não alcança Googlebot/bingbot; e a divergência 3 KB × 86 KB por UA permanece | §7.2 | **Bloqueador** |
| **K-B** | `noindex` em editoria não declarada com conteúdo remove do índice `/seguranca` (163 artigos, sp011) e ameaça `/copa-do-mundo` (86, Oley) | §8.4 | **Bloqueador** |
| **K-C** | Ambiguidade de `visible: false` em `blogCategorySurface` decide o destino de 86 artigos e não está escrita | §8.3 | Alta |
| **K-D** | Paths com extensão continuam 200 + HTML (`/sitemap.xml`, `/assets/*.js` ausente) | §6.1 | Alta |
| **K-E** | P1-1 (canonical no `spaHeadPlugin`) introduziria canonical em resposta 404 | §10.4 | Média — evitável com teste |
| **K-F** | "Ver mais" com categoria explícita fora da superfície recria o link para 404 | §6.2 | Média |
| **K-G** | Barra final: mudar `ssrRoutes.ts:35` quebra teste que protege decisão deliberada | §10.5 | Média |
| **K-H** | Slug com espaço/acento (7 casos) no `Location` do 301 | §8.1 | Baixa — coberta por `encodeURIComponent` + teste |
| **K-I** | 42 artigos em categorias de slug corrompido (`tebol`, `copa-do-mndo`, `otros`) — nenhum status HTTP resolve | §8.3 | Baixa (dados) |
| **K-J** | Varredura de URLs inexistentes despeja o cache LRU de 200 entradas | §10.3 | Baixa |

### 11.1 A relação com "Páginas enganosas" (§12 do prompt) — corrigida

O PRD geral (§2, F-14) escreve que o padrão do OleySports *"é a assinatura exata
do padrão que o Search Console classificou como 'Páginas enganosas' no
`resenhavip`"*. Reavaliando:

- O evento no `resenhavip` está registrado em `CLAUDE.md §19.3` — **existe**.
- Não existe, em lugar nenhum, evidência de **causalidade** entre mocks,
  soft-404 ou conteúdo replicado e aquela classificação. O próprio `CLAUDE.md`
  registra a hipótese como *"provável gatilho: domínio novo + conteúdo 100%
  duplicado do backfill"* — hipótese, não conclusão.
- Não há GSC do `oleysports.com.br` nesta análise, então **não se pode afirmar
  que o OleySports tenha qualquer alerta**.
- E o pilar factual do argumento — os mocks — **caiu** (§11 abaixo).

**Redação corrigida:** `há precedente interno de outro domínio da rede com alerta
de "Páginas enganosas", cuja causa não foi comprovada; não há evidência de alerta
no oleysports.com.br`. `REESCREVER` nos dois PRDs.

### 11.2 F-14 refutado — o registro completo (§11 do prompt)

O prompt pede para não usar "manchetes falsas" sem prova de que chegam a
produção. A prova foi buscada e deu **negativo**:

| Verificação | Resultado |
|---|---|
| `MostRead.tsx` tem os textos hardcoded? | **Sim** — `MostRead.tsx:8-14`, intactos no HEAD |
| `Home.tsx:710` chama `<MostRead />`? | **Sim** |
| O template do Oley tem `mais-lidas` visível? | **Sim**, `visible: true`, ordem 1 |
| **O bloco tem `area`?** | **`area: "sidebar"`** — o PRD não registrou este campo |
| Quem renderiza blocos com `area`? | `renderZoneItem` → **`ZoneBlock`**, com `PredefinedBlock` só como `fallback` |
| `ZoneBlock` trata `mais-lidas`? | **Sim** — `PortalZoneBlocks.tsx:765-766`: `if (block.id === "mais-lidas" && zone === "sidebar") return <SidebarMostRead …>` com `sortByViews(getArticles(""))` |
| As manchetes aparecem no HTML servido? | **NÃO.** "Morar DF", "Eixão", "dengue", "IDEB", "Câmara Legislativa": **0 ocorrências** |
| Os links mortos aparecem? | **NÃO.** `/artigo/pol-2`, `df-3`, `sau-1`, `df-4`, `tec-4`: **0 ocorrências** |
| O que o bloco exibe de fato? | Artigos reais: *"Marquinhos, capitão do PSG, recusa Arábia Saudita…"*, com `href="/artigo/dallas-cowboys-contrata-von-miller"` |
| E o bloco `ultimas` (`DestaquesListaBadge`)? | `visible: false` no template do Oley — não renderiza |
| Algum blog vivo exibe o mock? | **Nenhum.** `credito.vc` e `ocomandantenews.com.br` testados: 0 ocorrências |

**Varredura de todos os templates da rede** (`deploy/*/template_final.sql`):
`oleysports`, `sp011`, `esporteagora`, `resenhavip`, `beeesportes`,
`apostaganha`, `recebabet` têm `mais-lidas` em `area: sidebar` (mock inerte).
`creditovc`, `pontofarma` e `ocomandante` contêm **variantes de template** com
`mais-lidas`/`ultimas` **sem `area` e `visible: true`** — que **renderizariam** o
mock. Mas os dois blogs vivos foram testados e não o exibem: a variante aplicada
não é essa.

**Veredito: `CONTRADITO POR RUNTIME`.** F-14 sai do P0. O que sobra é real, mas
menor: **código morto perigoso** — cinco componentes mock que voltam a aparecer
se alguém arrastar o bloco para fora da sidebar no painel, ou aplicar a variante
de template errada em `creditovc`/`pontofarma`/`ocomandante`. Isso é **P2** e a
ação proposta (§13.7: trocar por `ConfigurableBlock` e apagar os mocks) continua
**certa** — só não é urgente e não sustenta argumento de "Páginas enganosas".

Assumo o erro: a primeira auditoria leu `Home.tsx:710` sem verificar a
precedência do renderizador de zonas nem o campo `area` do template, e não
confirmou em produção. Foi um falso positivo classificado como P0.

### 11.3 "Todo defeito aqui é um defeito da rede inteira" (§10 do prompt)

A frase do §2 do PRD geral é uma generalização que os dados desmentem. A
formulação correta:

`A implementação defeituosa é compartilhada pelos 11 blogs; o impacto observável
depende de settings e dados de cada blog.`

Três provas dessa distinção nesta revalidação:

| Defeito | Código | Impacto observado |
|---|---|---|
| Mock "Mais Lidas" | Compartilhado nos 11 | **Zero** blogs vivos afetados |
| `FIXED_CATEGORIES` vazando | Compartilhado nos 11 | Oley: **13** editorias fantasmas · sp011: só `/colunas` e `/brasil` (as outras 11 são reais lá) |
| Sitemap com stub | Compartilhado nos 11 | Todos, sem exceção — este **é** um defeito da rede inteira |

### 11.4 Migração de domínio (§13 do prompt)

| Verificação | Resultado |
|---|---|
| `oleysports.midia.run/` | **301** → `https://oleysports.com.br/` |
| `oleysports.midia.run/futebol` | **301** → `…com.br/futebol` (path preservado) |
| `oleysports.midia.run/api/sitemap.xml` | **200** — não redireciona (exclusão deliberada de `/api/*`) e publica `<loc>` com `oleysports.midia.run` |
| Data 14/08/2026 | Documentada em `deploy/README.md:141` e `CLAUDE.md §4`; **não verificável por runtime** |

**Correção de linguagem obrigatória:** o PRD geral afirma que *"o domínio novo
está sendo indexado do zero agora"*. Um 301 que preserva path **transfere
sinais** — é o mecanismo padrão de migração. Sem dados de GSC, a redação correta
é **`período sensível de migração/indexação`**. O argumento de urgência
permanece válido; a afirmação factual, não.

---

## 12. Pré-condições de GO

As 16 perguntas obrigatórias do §27, com evidência.

| # | Pergunta | Resposta | Evidência |
|---|---|---|---|
| 1 | Produção reproduz os soft-404s? | **SIM** | 18/18 paths testados = 200, incluindo `/rota-inventada-xyz`, `/artigo/nao-existe-abc`, `/caminho/de/dois` |
| 2 | O sitemap geral contém zero artigos? | **SIM** | 14 `<loc>`, **0** com `/artigo/`, 1.929 bytes |
| 3 | O mock "Mais Lidas" chega à home atual? | **NÃO** | 0 ocorrências das 5 manchetes e dos 5 links; bloco exibe artigos reais (§11.2) |
| 4 | `/artigo/__placeholder__` é efetivamente linkado? | **SIM** | `<a href="/artigo/__placeholder__" class="group block">` nas **13** editorias fixas |
| 5 | UUID e slug retornam 200 para o mesmo artigo? | **SIM** | 200/85.961 B e 200/85.967 B |
| 6 | Há slug duplicado em artigos publicados? | **NÃO** | 0 duplicados em 640 |
| 7 | Há artigos publicados sem slug? | **NÃO** | 0 em 640 |
| 8 | Há `canonicalUrl` externo? | **NÃO FOI POSSÍVEL CONFIRMAR** | Campo não exposto pela API pública; exige banco |
| 9 | Há `canonicalUrl` no domínio antigo? | **NÃO FOI POSSÍVEL CONFIRMAR** | Idem |
| 10 | Quais editorias não declaradas ainda têm artigos? | **SIM, e são muitas** | Oley: `copa-do-mundo` 86, `tebol` 39, `copa-do-mndo` 2, `otros` 1 · sp011: `seguranca` 163, `aviacao` 27, `nfl` 8, `copa-do-mundo` 1 |
| 11 | O `socialOgPlugin` respeitaria 404/301? | **NÃO** | 404 sim (por `next()`); **301 não** — devolve 200 com OG HTML a Googlebot/bingbot |
| 12 | API/DB indisponível: 200 ou 503? | **503 (com stale antes)** | §9.1 — a escolha atual de 200 repete o defeito que o PRD combate |
| 13 | P0-1 e P0-2 devem ser atômicos? | **SIM** | 11 de 14 URLs do sitemap virariam 404 na janela intermediária |
| 14 | A allowlist cobre 100% das páginas públicas válidas? | **SIM para páginas; NÃO para a superfície toda** | As 4 institucionais estão completas; extensão/caixa alta/barra dupla ficam fora (§7.3) |
| 15 | A mudança é segura para o sp011? | **NÃO como está** | `/seguranca` (163 artigos) cairia para `noindex` (§8.4) |
| 16 | O impacto nos demais blogs é confirmado ou potencial? | **Misto** | Sitemap vazio: confirmado nos 11. `FIXED_CATEGORIES`: confirmado no Oley e parcial no sp011. Mock: **nenhum** blog afetado |

---

## 13. Bloqueadores de implementação

| # | Bloqueador | Por quê | O que destrava |
|---|---|---|---|
| **B-1** | `socialOgPlugin` intercepta Googlebot/bingbot | O `301` do P0 não chega ao buscador; divergência 3 KB × 86 KB por UA fica de pé. Atende o critério de NO-GO do §31 ("burlar a regra de URL de modo crítico") | Trazer o plugin para o escopo do P0. Opção mínima: remover `Googlebot` e `bingbot` do `CRAWLER_RE` (`vite.config.ts:42`) — **decisão sua**, porque muda o que o Google indexa |
| **B-2** | `noindex` em editoria não declarada com conteúdo | Des-indexa `/seguranca` (163 artigos, sp011) e possivelmente `/copa-do-mundo` (86, Oley). Atende o critério "a superfície de categorias puder apagar URLs legítimas" | Trocar a regra por **200 indexável** (§8.4) e escrever explicitamente o tratamento de `visible: false` |

**Bloqueadores menores** (não impedem começar, impedem declarar pronto):

| # | Item | Ação |
|---|---|---|
| b-3 | Paths com extensão continuam 200 + HTML | Estender o escopo ao fallback estático ou registrar como limitação explícita e abrir item próprio |
| b-4 | Barra final | Remover do P0 |
| b-5 | RN-1 / B15 (200 em falha de API) | Reescrever para stale → 503 |
| b-6 | "Ver mais" validado por `!!block.category` | Validar contra a superfície de editorias |
| b-7 | Ausência de teste "404 não tem canonical" | Adicionar a §29, antes do P1-1 |

---

## 14. Correções necessárias no PRD geral

Seção por seção, com o texto a corrigir.

| Seção | Texto atual | Correção |
|---|---|---|
| §2 Resumo · item 4 | "O bloco 'Mais Lidas' da home é um mock de Brasília… cinco manchetes falsas" | **Remover do resumo.** O mock não renderiza. Reescrever F-14 como P2 de código morto |
| §2 Resumo | "todo defeito encontrado aqui é um defeito da rede inteira" | "A implementação defeituosa é compartilhada; o impacto observável depende de settings e dados de cada blog" (§11.3) |
| §2 Urgência | "O domínio novo está sendo indexado **do zero agora**" | "Período sensível de migração/indexação" — o 301 preserva path e transfere sinais (§11.4) |
| §2 Urgência | "Esse é exatamente o perfil que já rendeu à rede um flag de 'Páginas enganosas'" | "Há precedente interno de alerta em outro domínio da rede, com causa não comprovada; não há evidência de alerta no oleysports.com.br" (§11.1) |
| §2 tabela "Conclusão sobre o PDF" | "Certo no sintoma, errado no diagnóstico" para as institucionais | "Observação correta; o PDF não tinha como ver o conteúdo CSR. Recomendação de metadata/conteúdo próprios permanece válida" (§5.1) |
| §2 tabela · "Contradito" | "Robots e sitemaps 2/2 — contradito" | "Funcional como endpoint, incompleto/errado como inventário editorial" (§5.2) |
| §2 tabela · "Superestimado" | "Não há problema mensurável de download" | "Não há evidência suficiente para priorizar" — DOM/hidratação/CWV não foram medidos (§5.3) |
| §5 matriz · OLEY-01c | "PARCIALMENTE CONFIRMADO — DIAGNÓSTICO DO PDF INCORRETO" | "PARCIALMENTE CONFIRMADO — observação do PDF correta, causa revelada pelo código" |
| §5 matriz · OLEY-04b | Schema do artigo como vantagem presente | Acrescentar: **Googlebot não recebe o JSON-LD** (§7.2) |
| §6 F-01 a F-05 | "Confiança: Alta (leitura de código)" | "CONFIRMADO POR CÓDIGO + RUNTIME", com os números da §4 |
| §6 F-05 | Impacto alto, "o PDF fala em 4 pares" | Acrescentar: **0 de 640 artigos sem slug**; a URL UUID só existe por link externo/histórico. Impacto **Médio** |
| §7 F-08 | Todo o bloco | Reescrever conforme §5.1 |
| §7 F-09 | "não há problema mensurável" | Conforme §5.3 |
| §8 F-10 | "CONTRADITO PELO REPOSITÓRIO" | Conforme §5.2 |
| §9 F-14 | P0, "manchetes falsas na primeira dobra" | **Reescrever inteiro** como P2 "componentes mock órfãos"; registrar `PortalZoneBlocks.tsx:765` e a varredura de templates (§11.2) |
| §9 F-15 | "~todos os artigos" | **640/640**; e registrar que o Googlebot não recebe esse JSON-LD → impacto real é a **trilha visível** (UX), não o schema |
| §9 F-16 | P2, "desconhecida na ocorrência" | Acrescentar: **0 duplicados / 0 sem slug** hoje. Continua P2 |
| §9 F-17 | "É o que um leitor brasileiro vê" | Precisar: o texto **não está no HTML servido**; aparece só após hidratação |
| §9 F-18 | Impacto Baixo-Médio | Acrescentar: **sha256 do asset servido == repo** (prova); e que o Googlebot não recebe o JSON-LD |
| §9 F-20 | P2, "PRECISA DE TESTE EM RUNTIME" | **Confirmado**: 200 `text/html`. Subir para **P1** e ampliar para toda a classe de paths com extensão (§6.1) |
| §9 F-21 | "a central grava `deliveries.scheduledAt` futuro" | Causa errada: `ingest.ts:246` grava sempre `now`. O único caminho é edição manual no admin. **0 ocorrências** |
| §9 F-23 | "Zero cobertura de teste na camada de SEO" | "Nenhum teste dedicado a sitemap, status HTTP, canonical ou JSON-LD"; registrar as 3 suites existentes e os **156 testes** que passam |
| §10 P-3 | "NewsArticle + BreadcrumbList — preservar" | Acrescentar que o invariante **não vale para Googlebot** hoje (§7.2) |
| **Novo finding** | — | **Adicionar F-26 · Divergência de conteúdo por User-Agent em `/artigo/*` · P0** (§7.2) |

---

## 15. Correções necessárias no PRD P0

| Seção | Texto atual | Correção |
|---|---|---|
| §4 Problema / §6.2 | Cadeia causal termina no `spaHeadPlugin` | Acrescentar a **segunda fonte**: fallback estático do `vite preview` (§6.1) |
| §5.3 | Comportamento validado por simulação local | Substituir pelos dados de runtime desta revalidação |
| §7 A12 | "`/futebol/` → 200, shell SPA (**duplicata** de A5)" | Não é duplicata: é shell de 7.868 B sem H1 nem canonical — é soft-404 |
| §7 A13 | "Bloco 'Mais Lidas' com 5 manchetes falsas" | **Remover.** Não ocorre (§11.2) |
| §8 B13 | "Bloco Mais Lidas com as notícias reais" | **Já é o comportamento atual.** Remover do "esperado" |
| §8 B7b | "não declarada + com artigos → 200 + `noindex`" | **200 indexável** (§8.4) |
| §8 B12 | "`/futebol/` → 301" | **Remover do P0** (§10.5) |
| §8 B15 | "API fora → **200** com shell" | Cascata: **stale → 503 + `Retry-After`**; nunca 404 (§9.1) |
| §9 Escopo item 5 | "Blocos mock saem do renderizador" (dentro do P0) | Mover para P2 — a limpeza continua certa, a urgência não |
| §9 Escopo item 7 | Normalização de barra final | Remover |
| §9 Escopo | — | **Acrescentar:** `socialOgPlugin` e o fallback de paths com extensão |
| §10 Fora de escopo | "`socialOgPlugin` não tocado" (§12) | **Passa a estar em escopo** (§7.2) — bloqueador B-1 |
| §13.2 `blogCategorySurface` | Não define o tratamento de `visible: false` | Definir explicitamente. Recomendação: **incluir** as invisíveis na superfície (invisibilidade é de navegação, não de existência) — decide o destino de 86 artigos |
| §13.8 comentário | "o `/geral` que saía daqui era uma rota que não existe em blog nenhum da rede" | **Falso** — `/geral` no sp011 é item de menu com 473 artigos (§10.2) |
| §13.8 lógica | `hasCategory = … && !!block.category` | Validar contra `blogCategorySurface`, não contra a presença do campo (§6.2) |
| §14 RN-1 | "→ 200 com shell" | Reescrever conforme §9.1 |
| §14 RN-2 | Consequência `noindex` | Reescrever conforme §8.4 |
| §14 RN-8 | "protege o sp011" | Precisar: protege do **404**, não do **noindex**; a proteção real vem da RN-2 corrigida |
| §15 Regras de URL | Tabela | Acrescentar: caixa alta, barra dupla, paths com extensão |
| §16 Regras HTTP | linha "passthrough 200" | Trocar por stale/503 |
| §25 Etapa 6 | Barra final | Remover |
| §25 Etapa 7 Rollout | Canário `resenhavip` | Acrescentar canário **sp011** obrigatório antes dos demais — é o blog com o comportamento mais divergente (§8.4) |
| §27 Casos de teste | — | Acrescentar: slug com espaço; `/sitemap.xml`; `/FUTEBOL`; `//futebol`; Googlebot em `/artigo/<uuid>`; sp011 `/seguranca` e `/geral` |
| §29 Não regressões | — | Acrescentar: "resposta 404 **não** contém `<link rel="canonical">`" e "sp011 `/seguranca` continua indexável" |
| §36 Dependências | P0-2 depois do P0-1 | **Entregar atomicamente** (§10.6) |

---

## 16. Veredito

# `NO-GO`

**Para o `PRD-P0-OLEYSPORTS-RESOLUCAO-URL-E-SOFT-404.md`, como está escrito.**

Não por a tese estar errada — o soft-404 é real, foi confirmado em produção rota
a rota, e consertá-lo é a decisão certa. O `NO-GO` decorre de dois itens que
satisfazem explicitamente os critérios do §31 do prompt:

1. **`socialOgPlugin` continua burlando a regra de URL de modo crítico** — o
   `301`, entrega-título do PRD, não alcança Googlebot nem bingbot, que recebem
   3 KB sem corpo nem schema onde o usuário recebe 86 KB.
2. **A superfície de categorias apagaria URLs legítimas do índice** —
   `/seguranca` no sp011 (163 artigos publicados) e, conforme a leitura de
   `visible`, `/copa-do-mundo` no OleySports (86 artigos).

Ambos são corrigíveis com mudanças delimitadas, já especificadas na §15. Feitas
essas duas correções, mais os cinco ajustes menores (b-3 a b-7), o PRD P0 passa a
`GO`.

**Para o `PRD-SEO-TECHNICAL-OLEYSPORTS.md`: `GO COM AJUSTES`.** A arquitetura e
17 dos 25 findings estão confirmados, vários agora por runtime. As correções são
de redação, priorização, um finding a rebaixar (F-14) e um a acrescentar (F-26).

**O que esta revalidação recomenda como próximo passo** — decisão sua, nada foi
implementado: tratar a divergência por User-Agent em `/artigo/*` como o item de
maior valor da auditoria inteira. Ela é anterior ao sitemap e ao soft-404 na
cadeia de causa: hoje, para o Google, **todo artigo do OleySports é uma página de
três parágrafos sem links internos e sem dados estruturados** — e nem o PDF nem a
primeira auditoria a enxergaram.

---

## Anexo · Comandos de verificação (read-only, reproduzíveis)

```bash
# 1. Sitemap geral: contar URLs e artigos
curl -s https://oleysports.com.br/api/sitemap.xml | grep -c '<loc>'
curl -s https://oleysports.com.br/api/sitemap.xml | grep -c '/artigo/'

# 2. Soft-404: status por rota
for p in / /futebol /politica /geral /rota-inventada-xyz /artigo/__placeholder__ \
         /artigo/nao-existe-abc /contato /futebol/ /sitemap.xml /nada.xml; do
  printf '%-32s %s\n' "$p" \
    "$(curl -s -o /dev/null -w '%{http_code}' https://oleysports.com.br$p)"
done

# 3. Divergência por User-Agent (o achado bloqueador)
A=https://oleysports.com.br/artigo/manchester-city-nico-gonzalez
curl -s -o /dev/null -w 'navegador: %{size_download}B\n' "$A"
curl -s -o /dev/null -w 'googlebot: %{size_download}B\n' \
  -A 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' "$A"

# 4. Placeholder nas 13 editorias do sp011
for p in politica cidade seguranca transporte saude educacao cultura esportes \
         colunas brasil mundo economia tecnologia; do
  printf '/%-12s placeholder=%s\n' "$p" \
    "$(curl -s https://oleysports.com.br/$p | grep -c '__placeholder__')"
done

# 5. Unicidade de slug (GO/NO-GO do 301)
curl -s 'https://oleysports.com.br/api/articles?limit=all' > /tmp/arts.json
python -c "
import json,collections
a=json.load(open('/tmp/arts.json',encoding='utf-8'))['articles']
c=collections.Counter(x['slug'] for x in a)
print('publicados:',len(a))
print('sem slug  :',sum(1 for x in a if x['slug']==x['id']))
print('duplicados:',sum(1 for s,n in c.items() if n>1))
"

# 6. Superfície de categorias × conteúdo real
curl -s https://oleysports.com.br/api/articles/categories
curl -s https://sp011.com.br/api/articles/categories

# 7. Migração de domínio
curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' \
  https://oleysports.midia.run/futebol
```
