# PRD P0 V2 — OleySports: indexação, resolução de URL e sitemap

> **Status:** **ENTREGUE em 2026-08-21** (imagem `v98`, commits `1bc16a5..da19dc4`;
> relatório em `docs/IMPLEMENTACAO-P0-OLEYSPORTS-RELATORIO.md`) ·
> **Data:** 2026-08-20 · **Prioridade:** P0 · **Versão:** 2
>
> **Supersede a versão anterior após revalidação adversarial de 19/20-08-2026.**
> Documento anterior: `docs/PRD-P0-OLEYSPORTS-RESOLUCAO-URL-E-SOFT-404.md`
> (preservado como histórico — **não** apagar). A V1 recebeu veredito **`NO-GO`**
> na revalidação; este documento é a versão corrigida.
>
> **Deriva de:** `docs/PRD-SEO-TECHNICAL-OLEYSPORTS-V2.md` (item **P0**).
> **Evidência nova:** `docs/REVALIDACAO-PRDS-OLEYSPORTS.md`.
>
> **Ordem de autoridade:** runtime confirmado > código atual > dados/configuração
> atual > git history > PDF snapshot > inferência.
>
> Escrito para ser executado por quem **não** participou da investigação: todos
> os paths, funções e linhas estão citados. **Implementado e validado em
> produção em 2026-08-21** — as duas ressalvas de desvio estão no §5 do
> relatório (o `/__ssr-stats` não foi criado; as editorias do sitemap vêm do
> acervo em vez da superfície).

---

## 1. Título

Indexação, resolução de URL e sitemap do blog engine: **um só comportamento para
buscador e navegador**, 404 real para o que não existe, 301 de UUID para slug,
superfície de editorias por blog, e sitemap que publica o acervo real — **em uma
única release**.

---

## 2. O que mudou da V1 para a V2

| # | Mudança | Motivo |
|---|---|---|
| 1 | **`socialOgPlugin` entra no escopo.** A V1 o declarava "não tocado" | Googlebot/bingbot recebem stub de 3 KB; o `301` da V1 **nunca chegaria** ao buscador |
| 2 | **Sitemap entra na mesma entrega.** A V1 o deixava para o deploy seguinte | Isolado, o P0-1 faria **11 de 14** URLs do sitemap virarem 404 |
| 3 | **`/sitemap.xml` na raiz e o fallback de arquivos entram no escopo** | Runtime: `/sitemap.xml`, `/manifest.json`, `/wp-login.php` e `/assets/inexistente.js` devolvem **200 `text/html`** |
| 4 | **A regra de categorias muda:** não declarada + com conteúdo passa a ser **200 indexável**, não `noindex` | A regra da V1 des-indexaria sp011 `/seguranca` (**163 artigos**) e ameaçava Oley `/copa-do-mundo` (**86**) |
| 5 | **`visible: false` ganha semântica explícita** | A V1 não definia; a leitura decidia o destino de 86 artigos |
| 6 | **RN-1 vira cascata `stale → 503`**, não `200 + shell` | 200 numa falha de infra repete o defeito que este PRD combate e esconde o incidente do monitoramento |
| 7 | **Barra final sai do escopo** (vira P2 investigativo) | Não é duplicata (é soft-404), não vem de finding P0, e contradiz decisão deliberada e testada |
| 8 | **Limpeza dos blocos mock sai do escopo** (vira P2) | O mock **não chega à produção** — `PortalZoneBlocks.tsx:765` intercepta |
| 9 | **"Ver mais" passa a validar o destino**, não a presença do campo | Existe bloco com `category: "geral"` **explícito** no Oley |
| 10 | **Canário duplo obrigatório: sp011 + oleysports** | O sp011 é o blog com a taxonomia mais divergente |
| 11 | **Sai toda causalidade com "Páginas enganosas"** | Correlação, não causa; e o pilar factual (os mocks) caiu |
| 12 | **Quatro classes de categoria explícitas** | Separar existência de conteúdo, validade da taxonomia e indexabilidade |

---

## 3. Problema

O blog engine da rede **não tem como responder que uma URL não existe** — e, em
`/artigo/*`, **não entrega o site ao buscador**. Cinco defeitos se somam e
produzem, no OleySports, um conjunto de URLs indexáveis que não corresponde ao
conteúdo real do portal:

1. **Googlebot e bingbot recebem um stub de 3 KB** no lugar da matéria de 86 KB.
   Sem corpo, sem links internos, sem `NewsArticle`, sem `BreadcrumbList`.
2. **Soft-404 universal.** `/geral`, `/rota-inventada`, `/artigo/qualquer-coisa`
   → 200. E também `/sitemap.xml`, `/wp-login.php`, `/assets/inexistente.js` →
   200 `text/html`.
3. **A rede publica o link `/artigo/__placeholder__`.** O card de estado vazio de
   editoria sem artigos é clicável e aponta para um id sintético.
4. **13 editorias do sp011 respondem 200 e vazias** em todo blog da rede — são
   elas que criam as editorias vazias do item 3 no OleySports.
5. **`/artigo/<uuid>` e `/artigo/<slug>` servem o mesmo artigo com 200**, sem
   redirect. E **o sitemap geral não publica nenhum artigo** — 14 URLs, todas
   estáticas, 12 delas de outro portal.

Os cinco pertencem ao **mesmo subsistema**: a camada que decide, para um path,
*o que existe ali, qual é a URL canônica disso, que status responder e a quem
entregar o quê*. Por isso viram um PRD só, e por isso a release é atômica
(§28.3).

**Contexto de urgência.** O OleySports migrou para `oleysports.com.br` em
14/08/2026. O host antigo faz **301 preservando o path** — o mecanismo padrão de
migração, que transfere sinais. É um **período sensível de migração e
indexação**, não uma indexação do zero. O que o Google encontra nesse período é
o descrito acima.

**Sobre "Páginas enganosas":** há precedente interno de alerta em outro domínio
da rede (`resenhavip`, `CLAUDE.md §19.3`), cuja causa **não foi comprovada**. Não
há evidência, nesta auditoria, de que `oleysports.com.br` tenha esse alerta.

---

## 4. Evidências

### 4.1 Runtime de produção (19-20/08/2026, somente GET/HEAD)

| # | Verificação | Resultado |
|---|---|---|
| **R1** | `GET /artigo/<slug>` com UA de navegador | **200, 85.961 B**, 1 `ld+json`, corpo completo |
| **R2** | **A mesma URL com `Googlebot/2.1`** | **200, 2.953 B**, **0** `ld+json`, `<h1>` + `<p>` + `<img>` |
| **R3** | A mesma URL com `bingbot/2.0` | 200, 3.007 B, 0 `ld+json` |
| **R4** | Home e `/futebol` com Googlebot | **idênticas** ao navegador (219.001 B / 209.770 B) |
| **R5** | 18 paths inexistentes | **18/18 = 200**, inclusive `/rota-inventada-xyz` e `/caminho/de/dois` |
| **R6** | `/sitemap.xml`, `/sitemap_index.xml`, `/manifest.json`, `/wp-login.php`, `/nada.xml`, `/assets/inexistente.js` | **200 `text/html`** (shell da SPA) |
| **R7** | `/api/sitemap.xml` | **14 `<loc>`, 0 `/artigo/`**, 1.929 B, **sem `Cache-Control`** |
| **R8** | As 13 editorias fixas do sp011 no Oley | 200, `<h1>` próprio, canonical próprio, **`<a href="/artigo/__placeholder__" class="group block">` em todas** |
| **R9** | `/artigo/<uuid>` × `/artigo/<slug>` | 200 (85.961 B) e 200 (85.967 B), mesmo artigo |
| **R10** | `/futebol/` (barra final) | **7.868 B**, shell, sem `<h1>`, sem canonical — **soft-404, não duplicata** |
| **R11** | `HEAD /` e `HEAD /futebol` | 200 — `isReadRequest` cobre HEAD |
| **R12** | `/api/articles/<inexistente>` | **404** · `/api/site` com banco fora | **503** — a distinção existe de verdade |
| **R13** | `oleysports.midia.run/futebol` | **301** → `…com.br/futebol` (path preservado) |
| **R14** | `oleysports.midia.run/api/sitemap.xml` | **200**, publicando URLs `midia.run` |
| **R15** | Mock "Mais Lidas" no HTML servido | **0 ocorrências** — o bloco exibe artigos reais |

### 4.2 Dados (API pública do próprio blog)

| Métrica | OleySports | sp011 |
|---|---|---|
| Artigos publicados | **640** | — |
| Sem slug | **0** | — |
| Slugs duplicados | **0** | — |
| Colisões slug ↔ id | **0** | — |
| Slugs com acento / com espaço | 7 / 1 | — |
| `publishedAt` no futuro | **0** | — |
| **Editoria com conteúdo fora do menu** | `copa-do-mundo` **86**, `tebol` **39**, `copa-do-mndo` 2, `otros` 1 | **`seguranca` 163**, `aviacao` 27, `nfl` 8, `copa-do-mundo` 1 |
| Artigos em categorias que o menu não expõe | **128 de 640 (20%)** | — |

### 4.3 Código

| # | Arquivo | Linha | O que prova |
|---|---|---|---|
| E1 | `brasilia-agora/vite.config.ts` | **41-42** | `CRAWLER_RE` inclui **`Googlebot`, `bingbot`, `Applebot`** junto dos crawlers sociais |
| E2 | `brasilia-agora/vite.config.ts` | **330-419** | `socialOgPlugin`: `if (!apiRes.ok) next()` (não distingue 404 de 5xx) e `res.end(html)` (**200 implícito**) |
| E3 | `brasilia-agora/vite.config.ts` | **1089-1093** | O plugin roda **antes** do `ssrPlugin` |
| E4 | `brasilia-agora/vite.config.ts` | 849-890 | `spaHeadPlugin` responde **sempre 200** para path sem extensão fora de `/api/` |
| E5 | `brasilia-agora/vite.config.ts` | **864** | Paths **com extensão** são excluídos do `spaHeadPlugin` |
| E6 | `brasilia-agora/vite.config.ts` | **1195-1198** | `preview` **não define `appType`** → vale o default `spa`, com fallback single-page no estático |
| E7 | `brasilia-agora/vite.config.ts` | 817-820 | `handleSsr`: `if (html === null) { next(); }` |
| E8 | `brasilia-agora/vite.config.ts` | 656, 718 | `renderArticle` / `renderCategory` devolvem `null` |
| E9 | `brasilia-agora/vite.config.ts` | **430-432** | `isReadRequest` cobre `GET` **e** `HEAD` |
| E10 | `brasilia-agora/vite.config.ts` | **804** | Chave do cache = `` `${host}|${route.key}` `` — **inclui o host** |
| E11 | `brasilia-agora/src/pages/CategoryArchivePage.tsx` | 125-134 | `placeholder` com `id: "__placeholder__"` |
| E12 | `brasilia-agora/src/components/CategoryPage.tsx` | 75-77 | O card destacado é `<Link href={/artigo/${art.slug \|\| art.id}}>` |
| E13 | `brasilia-agora/src/lib/categoryRoutes.ts` | **28-44**, 96-99 | `FIXED_CATEGORIES` = **13** entradas, resolvidas **antes** do menu |
| E14 | `brasilia-agora/src/lib/categoryRoutes.ts` | 48-50 | `RESERVED_PATHS` = `/artigo, /arquivo, /contato, /privacidade, /termos` |
| E15 | `brasilia-agora/src/App.tsx` | 228-317 | Inventário completo de rotas: 24 `/admin/*`, 13 fixas, 4 institucionais, `/:slug`, fallback |
| E16 | `brasilia-agora/src/lib/ssrRoutes.ts` | **35** | `if (p.endsWith("/")) return null;` — decisão **deliberada**, com teste que a protege |
| E17 | `api-server/src/lib/articleService.ts` | 271-278 | `getArticle`: `or(eq(id), eq(slug))` |
| E18 | `api-server/src/app.ts` | 171-190 | `503 setup_required` / `db_unavailable` **antes** do router |
| E19 | `api-server/src/routes/sitemap.ts` | 6-20, 36-37 | 14 `STATIC_PAGES` do sp011 + `store.getArticles()` |
| E20 | `api-server/src/lib/store.ts` | 1330-1333 | `getArticles: () => []` — *"Legacy stubs"*, desde `51bfc2f` (22/06/2026) |
| E21 | `api-server/src/routes/articles.ts` | **15** | `/api/articles/categories` filtra `visible !== false` — **o filtro que não se deve copiar** |
| E22 | `brasilia-agora/src/components/blocks/PortalZoneBlocks.tsx` | **745-768** | Intercepta `mais-lidas` na sidebar → **o mock não renderiza** |
| E23 | `brasilia-agora/vite.config.ts` | **241** | `<meta name="twitter:site" content="@brasiliaagora">` — marca de outro blog |

### 4.4 Testes existentes (baseline a preservar)

`ssrRoutes.test.ts`, `categoryRoutes.test.ts`, `gtmSnippet.test.ts` e demais:
**156 testes verdes** em `brasilia-agora` (19/08/2026); typecheck limpo nos dois
pacotes. Dois testes são **contratos a respeitar**:

- *"o painel NUNCA é renderizado no servidor"* (`ssrRoutes.test.ts`);
- *"barra final fica com a SPA (o wouter do cliente pode casar outra rota)"*
  (`ssrRoutes.test.ts:16-19`) — **por isso a barra final sai do escopo**.

---

## 5. Causa raiz

Não são cinco bugs independentes. São **duas decisões arquiteturais**, cada uma
com consequências, mais um resíduo de tabela fixa.

### 5.1 Causa A — o vocabulário de resposta tem um elemento só: `200`

O frontend de produção é `vite preview` + plugins. O último plugin da cadeia,
`spaHeadPlugin`, foi escrito para resolver um problema **de marca** — servir o
`<head>` do blog certo numa imagem compartilhada. Ele assumiu, corretamente para
aquele objetivo, que *toda rota de página deve receber o shell*. O que nunca foi
adicionado é a pergunta anterior: **esta página existe?**

E existe uma **segunda fonte, independente**, que a V1 não cobria: paths com
extensão saem do `spaHeadPlugin` (E5) e caem no **estático do `vite preview`**,
que sem `appType` explícito (E6) tem fallback single-page — e devolve
`index.html` com 200 para qualquer arquivo que não exista.

```
FIXED_CATEGORIES (13 editorias do sp011, tabela fixa na imagem compartilhada)
        │  resolveCategoryRoute consulta a tabela ANTES do menu do blog
        ▼
/politica, /cidade, /economia … resolvem no OleySports  →  SSR 200
        │  a editoria não tem artigo nenhum num blog de esporte
        ▼
CategoryArchivePage monta `placeholder` com id "__placeholder__"
        │  CategoryPage renderiza o card destacado dentro de um <Link>
        ▼
HTML servido publica <a href="/artigo/__placeholder__">   (confirmado nas 13)
        │  o crawler segue o link
        ▼
renderArticle não encontra → return null → next() → spaHeadPlugin → HTTP 200
                                                    ▲
/sitemap.xml, /wp-login.php, /assets/x.js ──────────┘ (via estático, mesma 200)
```

Em paralelo, duas fontes independentes de URL inválida e a duplicação:

```
bloco sem categoria      →  href="/geral"  →  não é editoria do Oley  →  200
bloco COM category:"geral" explícito  →  href="/geral"  →  idem  (a V1 não previu)

getArticle(x) = WHERE id = x OR slug = x   (sem redirect)
        ▼
/artigo/<uuid> e /artigo/<slug> → ambos 200, mesmo conteúdo
```

### 5.2 Causa B — o buscador foi classificado como crawler social

`CRAWLER_RE` (E1) coloca `Googlebot`, `bingbot` e `Applebot` na mesma lista de
`facebookexternalhit`, `WhatsApp`, `Twitterbot` e afins. O `socialOgPlugin` roda
**antes** do `ssrPlugin` (E3), monta um HTML de Open Graph mínimo e **encerra a
resposta**.

O propósito declarado do plugin é o **preview de compartilhamento**: um card com
título, descrição e imagem, mais um `window.location.replace(canonical)` para
que um humano que clique no link chegue à matéria. Para essa finalidade ele está
certo. Para um **buscador**, ele substitui o site por um resumo.

Consequência decisiva para este PRD: **qualquer decisão de rota que este
documento implemente é ignorada em `/artigo/*` quando o UA é de buscador.** O
301, o 404 e o `noindex` nunca chegariam lá.

### 5.3 Por que um PRD só, e uma release só

Os itens compartilham a mesma pergunta e o mesmo ponto de implementação. Além
disso, há uma dependência **medida**: o sitemap atual publica 14 URLs e, se a
resolução de URL for corrigida sozinha, **11 delas (79%) passam a responder
404** — anunciadas ao Google durante a janela entre os dois deploys. A ordem
interna das etapas (§26) reflete o resto: **primeiro parar de publicar links
inválidos, depois passar a responder o status correto.**

---

## 6. Arquitetura atual

```
request
  │
  ├─ Caddy (snippet blog)         headers de segurança, gzip/zstd
  │     ├─ /api/*  → <id>-api:8080   (Express)
  │     └─ resto   → <id>-web:3000   (vite preview)
  │
  └─ vite preview · middlewares em ordem (vite.config.ts:1089-1093)
       │
       ├─ staticCachePlugin   /assets/*, /fonts/* → cache imutável
       ├─ socialOgPlugin      UA em CRAWLER_RE + /artigo/* → HTML de OG, 200
       │                      ◄── AQUI O BUSCADOR PERDE O SITE  (Causa B)
       ├─ seoTextPlugin       /robots.txt, /llms.txt
       ├─ ssrPlugin  ────────► classifySsrPath(path)
       │     │                   ├─ home     → renderHome()
       │     │                   ├─ article  → renderArticle()  ── fetch /api/articles/:id
       │     │                   ├─ category → renderCategory() ── fetch /api/site + /api/articles
       │     │                   └─ null     → next()
       │     └─ render === null → next()      ◄── AQUI NASCE O SOFT-404  (Causa A)
       │
       ├─ spaHeadPlugin       path SEM extensão → index.html + <head> do blog, 200
       └─ estático (sirv, fallback SPA)
                              path COM extensão inexistente → index.html, 200  ◄── (Causa A)
```

---

## 7. Arquitetura alvo

```
request
  │
  ├─ searchCrawler? ──── SIM ──► segue o fluxo NORMAL (ssrPlugin)   ★ mudança
  │                              mesmo HTML editorial do navegador
  │
  ├─ socialCrawler? ──── SIM ──► socialOgPlugin (preview de compartilhamento)
  │                              /artigo/* apenas; inalterado
  │
  └─ ssrPlugin
       │
       ├─ classifyPagePath(path)  ───────────────────────────── (puro, testável)
       │     ├─ "asset" | "api" | "admin"     → next()          200 (inalterado)
       │     ├─ "home"                        → renderHome()     200
       │     ├─ "static" (allowlist)          → next()           200
       │     ├─ "article"  ── resolveArticle() ──┬─ found + slug≠pedido → 301 /artigo/<slug>
       │     │                                   ├─ found + slug=pedido → 200 SSR
       │     │                                   ├─ notFound            → 404
       │     │                                   └─ unavailable         → stale ou 503
       │     ├─ "category" ── resolveCategory() ─┬─ Classe 1 → 200 SSR indexável
       │     │                                   ├─ Classe 2 → 200 SSR + noindex
       │     │                                   ├─ Classe 3 → 200 SSR indexável   ★ mudança
       │     │                                   ├─ inexistente → 404
       │     │                                   └─ unavailable → stale ou 503
       │     └─ "unknown"                      → 404
       │
       ├─ spaHeadPlugin   recebe o status da decisão e injeta noindex quando 404
       │
       └─ staticExistsPlugin  ★ novo
             path COM extensão: existe em dist/public? → next() (sirv)
                                não existe             → 404 text/plain
```

**Princípio de projeto (inalterado da V1, e reforçado):** toda decisão vira
**função pura** em `src/lib/`, no padrão de `classifySsrPath` — que existe
justamente porque *"um falso positivo aqui não é lentidão, é o painel vazando
para o HTML público"* (`ssrRoutes.ts:5-7`). **Nenhuma regra de negócio deste PRD
pode nascer dentro do `vite.config.ts`.**

---

## 8. Escopo

1. **Unificação de comportamento para buscadores.** `Googlebot` e `bingbot`
   (e `Applebot`, recomendado) saem do `socialOgPlugin` e passam pelo fluxo SSR
   normal. Crawlers sociais permanecem. (§12)
2. **Vocabulário de resposta.** `404`, `301` e `noindex` na cadeia de
   middlewares do frontend.
3. **Fallback de arquivos.** Path **com extensão** que não existe em
   `dist/public` passa a responder **404**, não `200 text/html`. (§14)
4. **`/sitemap.xml` e `/sitemap_index.xml` na raiz** ganham política explícita.
   (§14.2)
5. **Superfície de editorias por blog**, com **quatro classes** e semântica
   explícita de `visible: false`. (§13)
6. **Canonicalização de artigo.** `301` de `/artigo/<uuid>` → `/artigo/<slug>`.
7. **Estado vazio de editoria deixa de ser link** (fim do
   `/artigo/__placeholder__` publicado).
8. **"Ver mais" valida o destino** contra a superfície de editorias — não contra
   a presença do campo `category`.
9. **Sitemap geral passa a ler o banco**, publicar as editorias **deste** blog e
   ter `Cache-Control`. (§14.1)
10. **Falha de API/DB:** cascata `stale → 503`, nunca 404, nunca 200 vazio.
    (§17)
11. **Testes** cobrindo status HTTP, UA, redirect, superfície, sitemap e
    fallback de arquivos. (§21)

---

## 9. Fora de escopo

Cada item tem lugar no roadmap do PRD geral V2. **A dependência futura está
registrada.**

| Item | Onde vai | Dependência registrada |
|---|---|---|
| **Barra final** (`/futebol/` → 301) | P2-6, **investigativo** | Contradiz `ssrRoutes.ts:35` e o teste que o protege; hoje é soft-404, não duplicata |
| **Limpeza dos componentes mock** | P2-2 | O mock não chega à produção (E22); a limpeza continua certa, a urgência não |
| **Redesenho visual da 404** | P1-6 | Depende do status 404 criado aqui |
| **Metadata/description por rota** | P1-1 | Depende da allowlist de rotas criada aqui. **Atenção:** o P1-1 planeja canonical no `spaHeadPlugin` e **não pode** criar canonical em resposta 404 (§16, NR) |
| **SSR das institucionais** | P1-2 | Depende do `kind: "static"` criado aqui |
| **Breadcrumb / `lib/categoryRoute.ts`** | P1-3 | **Passa a ser visível ao buscador por causa deste PRD** — fazer no mesmo ciclo P1, ou junto |
| **`publisher.logo` e `dateModified`** | P1-5 | `dateModified` bloqueado por **E-12** (semântica de `updatedAt`) |
| **JSON-LD de home e coleção** | P1-4 | — |
| **`UNIQUE` em `articles.slug`** | P2-1 | Dados limpos hoje (0 duplicados em 640); é prevenção |
| **Limpeza dos 42 artigos em slugs corrompidos** | P1-8 | Depois dela, `/tebol` vira 404 **sem código novo** |
| **`twitter:site` hardcoded** | P2-3 | Encontrado no plugin que este PRD toca; correção é independente |
| **`PREDEFINED_DEFAULTS` com categorias do sp011** (`Home.tsx:629-643`) | P2 | Mesma classe do F-04; os blocos estão `visible: false` no Oley |
| **Peso de DOM, imagens, CWV** | P2-7 | Só com CWV de campo (E-9) |
| **Qualquer mudança em `Caddyfile`, compose ou infraestrutura** | — | Este PRD não toca infraestrutura |
| **Findings exclusivos do BeeSports** | — | Fora por definição |

---

## 10. Comportamento atual × esperado

| # | Requisição | Hoje | Alvo |
|---|---|---|---|
| B1 | `/artigo/<slug>` · navegador | 200 SSR (85.961 B) | **200 SSR** (inalterado) |
| **B2** | **`/artigo/<slug>` · Googlebot** | **200, stub 2.953 B, 0 schema** | **200 SSR — mesmo conteúdo editorial essencial** |
| B3 | `/artigo/<uuid>` · navegador | 200 | **301** → `/artigo/<slug>` |
| **B4** | **`/artigo/<uuid>` · Googlebot** | **200 stub** | **301** → `/artigo/<slug>` |
| B5 | `/artigo/nao-existe` | 200 shell | **404** + `noindex`, **sem canonical** |
| B6 | `/artigo/__placeholder__` | 200 shell | **404** — e **nenhuma página linka para ele** |
| B7 | `/artigo/<slug>` · facebookexternalhit | 200 OG stub | **200 OG stub** (inalterado) |
| B8 | `/futebol` (Classe 1) | 200 SSR | **200 SSR indexável** |
| B9 | `/basquete` (Classe 2: declarada, vazia) | shell 200 | **200 SSR + `noindex`**, estado vazio **sem link** |
| **B10** | **`/copa-do-mundo` no Oley (Classe 3: 86 artigos, `visible:false`)** | **shell 200, sem `<h1>`** | **200 SSR indexável** |
| **B11** | **`/seguranca` no sp011 (Classe 3: 163 artigos, fora do menu)** | 200 SSR | **200 SSR indexável — sem `noindex`** |
| B12 | `/politica` no Oley (não declarada, 0 artigos) | 200 SSR + placeholder | **404** |
| B13 | `/politica` e `/geral` no **sp011** | 200 SSR | **200 SSR** (não-regressão) |
| B14 | `/geral` no Oley | 200 shell | **404** — e nenhum bloco linka para lá |
| B15 | `/rota-inventada`, `/a/b/c` | 200 shell | **404** |
| B16 | `/contato`, `/termos`, `/privacidade`, `/arquivo` | 200 shell | **200** (allowlist; SSR fica para o P1-2) |
| **B17** | **`/assets/inexistente.js`, `/nada.xml`, `/wp-login.php`** | **200 `text/html`** | **404**, `Content-Type` não-HTML |
| **B18** | **`/sitemap.xml`** | **200 `text/html`** | **301 → `/api/sitemap.xml`** (§14.2) |
| **B19** | **`/sitemap_index.xml`** | **200 `text/html`** | **404** |
| **B20** | **`/api/sitemap.xml`** | 14 URLs, 0 artigos, sem cache | **`/` + editorias indexáveis + os 640 artigos**, com `Cache-Control` |
| B21 | `/futebol/` (barra final) | 200 shell | **inalterado** (P2-6) |
| **B22** | **API do blog fora do ar, com cache stale** | 200 shell vazio | **200 com o HTML stale** |
| **B23** | **API do blog fora do ar, sem stale** | 200 shell vazio | **503 + `Retry-After`** — **nunca 404** |
| B24 | Qualquer 404 | 200 + scaffold pós-hidratação | Status **404** do servidor; o visual fica para o P1-6 |
| B25 | Home | bloco "Mais Lidas" com artigos reais | **inalterado** (o mock não renderiza) |

---

## 11. Regras de negócio

| # | Regra | Justificativa / evidência |
|---|---|---|
| **RN-0** | **Buscador e navegador recebem o mesmo conteúdo editorial essencial na mesma URL:** `title`, `canonical`, `H1`, corpo, links internos e structured data aplicável. Diferenças auxiliares (banners, widgets, ordem de blocos secundários) não são problema. | Hoje há 2.953 B × 85.961 B na mesma URL. Unificar é o núcleo deste PRD |
| **RN-1** | **Falha de infraestrutura nunca vira 404.** Só um `404` explícito da `api` autoriza um `404` na borda. Cascata obrigatória: **(1)** stale seguro → 200 · **(2)** sem stale → **503 + `Retry-After`** · **(3)** nunca 404. | `app.ts:171-190` responde 503 quando o banco não hidratou; `/api/articles/<inexistente>` responde 404. A distinção **existe**. E 200-vazio repetiria o defeito que este PRD combate, além de esconder o incidente do monitoramento |
| **RN-2** | **Uma editoria existe se o blog a declara OU se ela tem conteúdo publicado.** Declarada = `settings.categories` ∪ `menuItems` internos. | Protege URL histórica de blog que mudou de taxonomia |
| **RN-3** | **Ter conteúdo ≠ ser indexável.** As duas perguntas são separadas e ambas são respondidas pela tabela de classes (§13.2). | Exigência explícita: não existe a regra universal "tem artigo = indexável" |
| **RN-4** | **`visible: false` é visibilidade de NAVEGAÇÃO.** Não significa "não existe" nem "não indexar". | §13.3 |
| **RN-5** | **A URL canônica de um artigo é `/artigo/<slug>`**; com `slug` nulo/vazio, é `/artigo/<id>`. Um só valor, calculado num só lugar (`canonicalArticlePath`). | Já é o que o canonical do SSR emite (`vite.config.ts:669`) |
| **RN-6** | **O identificador antigo nunca deixa de resolver.** O backend continua aceitando id **ou** slug; muda o status, não a resolução. | Link externo/histórico não pode quebrar |
| **RN-7** | **Nenhuma página do site publica link para URL que responderia 404.** Vale para o placeholder, para o "Ver mais" e para o sitemap. | Trocar soft-404 por hard-404 **linkado internamente** seria piorar |
| **RN-8** | **`noindex` sempre reescreve a tag `robots` existente**, nunca acrescenta uma segunda. | Duas tags `robots` têm resolução indefinida entre buscadores. `applyHead` é o funil único |
| **RN-9** | **`FIXED_CATEGORIES` só entra quando o blog não declara nada** (nem `categories`, nem menu interno). | O sp011 tem menu → a tabela **não** se aplica a ele. **Correção da V1:** essa regra o protege do **404**, não do `noindex`; a proteção real vem da RN-2 + §13.2 |
| **RN-10** | **Cliente e servidor usam a MESMA função** para decidir o que é editoria e qual é o path dela. | Invariante já registrada em `categoryRoutes.ts:3-12`; discordância = hidratação quebrada. É por isso que as 13 rotas fixas saem do `App.tsx` |
| **RN-11** | **Toda decisão é função pura em `src/lib/`.** O middleware executa; não decide. | `ssrRoutes.ts:5-7`; é a única forma de testar sem `vite build` (que não roda no Windows) |
| **RN-12** | **Nenhum literal de marca, domínio ou taxonomia de um blog entra na imagem compartilhada.** | `CLAUDE.md §13`. É a raiz do F-01 e do F-04 |

---

## 12. Regras de crawler / User-Agent

### 12.1 Quem sai e quem fica

`CRAWLER_RE` (`vite.config.ts:41-42`) é dividido em dois conjuntos explícitos.

| User-Agent | Classe | Decisão | Motivo |
|---|---|---|---|
| `Googlebot` | **buscador** | **SAI do plugin** | Precisa do HTML editorial completo. Evidência direta: 2.953 B × 85.961 B |
| `bingbot` | **buscador** | **SAI do plugin** | Idem (3.007 B medidos) |
| `Applebot` | **buscador** | **SAI do plugin** (recomendado) | Rastreia para busca da Apple (Siri/Spotlight). Mesma classe dos dois acima; sem medição própria, mas o comportamento do plugin é o mesmo |
| `W3C_Validator` | ferramenta | **SAI do plugin** (opcional, baixo risco) | É um validador: entregar um stub torna a validação sem sentido |
| `facebookexternalhit` | social | **FICA** | Preview de compartilhamento é o propósito do plugin |
| `Twitterbot` | social | **FICA** | idem |
| `WhatsApp` | social | **FICA** | idem |
| `LinkedInBot` | social | **FICA** | idem |
| `Slackbot` | social | **FICA** | idem |
| `TelegramBot` | social | **FICA** | idem |
| `Discordbot` | social | **FICA** | idem |
| `Pinterest` | social | **FICA** | idem |
| `vkShare` | social | **FICA** | idem |
| `instagram` | social **e usuário real** | **FICA**, com observação | O navegador embutido do app do Instagram traz `Instagram` no UA: **um leitor humano cai no stub** e só chega à matéria pelo `window.location.replace`. Não é P0 e **não** se resolve aqui; fica registrado para avaliação (P2) |

**Implementação sugerida (mínima e reversível):** separar em duas constantes
nomeadas — `SOCIAL_CRAWLER_RE` (usada pelo plugin) e uma lista comentada dos UAs
removidos com o motivo — em vez de editar o regex único. Assim a decisão fica
legível no fonte e um `git blame` explica por quê.

### 12.2 Armadilha de diagnóstico (registrar no runbook)

O UA usado pelo **"Testar URL ativa" do Search Console** é
`Google-InspectionTool`, que **não casa** o regex atual. Dependendo da
ferramenta, o teste pode exibir a página completa e **mascarar o defeito**.

> **A verificação válida é sempre `curl -A 'Googlebot/2.1 (+http://www.google.com/bot.html)'`.**

### 12.3 Critério obrigatório de aceite (RN-0)

Para a mesma URL de artigo, `UA de navegador` e `UA Googlebot` devem expor:

| Elemento | Igualdade exigida |
|---|---|
| `<title>` | **idêntico** |
| `<link rel="canonical">` | **idêntico** |
| `<h1>` | **idêntico** |
| Corpo do artigo | presente nos dois; tamanho do Googlebot **≥ 95%** do navegador |
| Links internos | presentes nos dois (contagem de `<a href="/` > 20) |
| `application/ld+json` | **2 nos dois** (`NewsArticle` + `BreadcrumbList`) |

### 12.4 Garantia de que o compartilhamento social não regride

- Os UAs sociais **permanecem** no plugin — o caminho deles não é tocado.
- Verificação obrigatória pós-deploy, por rede:
  `curl -s -A '<UA>' $D/artigo/<slug> | grep -c 'og:title\|og:image\|og:description'`
  ≥ 3 para `facebookexternalhit`, `WhatsApp`, `Twitterbot`, `LinkedInBot`,
  `TelegramBot`.
- Validação manual no **Sharing Debugger** do Facebook e no **Post Inspector**
  do LinkedIn, com "Scrape again" (o cache deles é de 24 h+).
- **Não-regressão:** `NR-11` da §24.

---

## 13. Categorias

### 13.1 Três conceitos separados

A V1 misturava os três. Aqui eles são independentes e cada um tem sua pergunta:

| Conceito | Pergunta | Responde |
|---|---|---|
| **A · Conteúdo** | A rota tem artigos publicados? | Objetivo, contável (`/api/articles?category=<slug>`) |
| **B · Taxonomia** | O slug é uma editoria válida deste portal? | `settings.categories` ∪ `menuItems`; e **humano**, para slugs corrompidos |
| **C · Indexabilidade** | Esta página deve entrar no índice? | Decisão de SEO/produto, escrita na tabela abaixo |

**Não existe a regra universal `tem artigo = indexável`.**

### 13.2 As quatro classes

| Classe | Definição | Exemplo real | Status | `noindex`? | No sitemap? |
|---|---|---|---|---|---|
| **1** | Declarada e válida, **com** conteúdo | Oley `/futebol` (307) | **200 SSR** | não | **sim** |
| **2** | Declarada e válida, **vazia** | Oley `/basquete` (0) | **200 SSR** | **sim** | não |
| **3** | **Não** declarada no menu, válida/histórica, **com** conteúdo | sp011 `/seguranca` (163), `/aviacao` (27), `/nfl` (8) · Oley `/copa-do-mundo` (86) | **200 SSR** | **não** | **sim** |
| **4** | Slug **corrompido** por erro histórico | Oley `tebol` (39), `copa-do-mndo` (2), `otros` (1) | ver §13.4 | ver §13.4 | ver §13.4 |
| — | Não declarada e **vazia** | Oley `/politica`, `/geral`, `/rota-inventada` | **404** | (n/a) | não |

**A Classe 3 é a correção mais importante em relação à V1.** A V1 mandava
`200 + noindex`; isso **des-indexaria** `/seguranca` no sp011 — 163 artigos
publicados, página SSR real de 208 KB — porque ela não está no menu. Ausência no
menu é decisão de **navegação**, não de **indexação**.

**Três ações possíveis para a Classe 3**, na ordem de preferência, decididas por
quem conhece a intenção da taxonomia:

1. **Manter 200 indexável** (default deste PRD — não perde nada, não exige
   decisão prévia);
2. **Adicionar à superfície oficial** (cadastrar em `settings.categories` ou no
   menu) — melhor para o leitor, é edição de painel, não de código;
3. **Redirecionar (301) para a categoria equivalente** — **somente** quando
   existir substituta explícita e a decisão for tomada por um humano.

**A opção 3 nunca é inferida pelo código.**

### 13.3 Semântica de `visible: false`

```
visibilidade na navegação   ≠   existência da taxonomia   ≠   indexabilidade
```

| Pergunta | `visible: false` responde |
|---|---|
| Aparece no menu / nas listas de navegação? | **Não** |
| A editoria existe? | **Sim** — está declarada em `settings.categories` |
| A página é servida? | **Sim** |
| A página é indexável? | **Depende do conteúdo**: com artigos → sim (Classe 1/3); vazia → `noindex` (Classe 2) |

**Consequência de implementação, explícita:** `blogCategorySurface()` **NÃO
copia** o filtro `visible !== false` de `/api/articles/categories`
(`articles.ts:15`). Aquele filtro é de **navegação/UI**; a superfície de rota é
de **existência**.

**Cenário de aceite obrigatório — `/copa-do-mundo` no OleySports:**

| Fato | Valor |
|---|---|
| Em `settings.categories`? | **sim**, com `visible: false` |
| No menu? | não |
| Artigos publicados | **86** (2ª maior editoria do blog) |
| Comportamento hoje | shell 200, **sem página** |
| **Comportamento alvo** | **200 SSR indexável, no sitemap** |

Se a decisão de produto for outra (manter fora do índice), a mudança é **uma
linha** em `blogCategorySurface` — mas tem de ser **escrita**, não inferida.

### 13.4 Classe 4 — slugs corrompidos: tarefa de dados, não de HTTP

`tebol` (39), `copa-do-mndo` (2), `otros` (1) — **42 artigos**. O padrão bate com
o bug já corrigido em `90a0d47` (*"slugify: barra dupla apagava u, f e
dígitos"*).

**O engine não tenta detectar corrupção.** Não existe critério seguro para
distinguir, em código, "slug corrompido" de "editoria legítima não declarada" —
e tentar seria inventar regra de produto sem evidência. Portanto:

- **Enquanto os dados não forem corrigidos**, a Classe 4 é tratada **como Classe
  3** (200 indexável). É feio e honesto: são 42 artigos reais.
- **A correção é a tarefa de higiene de dados** (P1-8 do PRD geral V2), que exige:
  1. levantamento read-only, por slug, publicados e não publicados, **em todos os
     blogs** (o bug era da imagem compartilhada);
  2. **destino decidido por humano**, caso a caso — nunca por semelhança de
     string no código;
  3. `UPDATE articles SET category = <destino> WHERE category = <corrompido>`,
     com **contagem antes e depois** e soma conferida (39 + 2 + 1 = 42);
  4. verificação de URLs históricas: se algum slug corrompido foi indexado,
     definir `301` **antes** do UPDATE (hoje eles não estão em sitemap nenhum e
     respondem shell 200, então a probabilidade é baixa);
  5. **efeito colateral desejado:** depois da migração o slug fica com 0 artigos
     e passa a responder **404 sem nenhuma linha de código específica**;
  6. validação: `/futebol` ganha 39 artigos, `/tebol` responde 404, total
     publicado continua **640**.
- **A migração não é executada neste PRD.**

### 13.5 Precedência da superfície

```
blogCategorySurface(menuItems, categories):
   1. settings.categories        ← inclusive as visible:false  (existência ≠ navegação)
   2. ∪ menuItems internos       ← achatados 1 nível, sem links externos
   3. FIXED_CATEGORIES           ← SOMENTE se 1 e 2 juntos produzirem lista vazia
   − RESERVED_PATHS              ← /artigo, /arquivo, /contato, /privacidade, /termos
```

Mais a **Classe 3**, que não vem da superfície e sim do dado: slug fora da
superfície **com** `count > 0` também existe.

**Efeito por blog (medido):**

| Blog | Passo 1 | Passo 2 | `FIXED_CATEGORIES` se aplica? |
|---|---|---|---|
| oleysports | 9 entradas | 7 editorias | **não** → `/politica` vira 404 ✔ |
| **sp011** | **ausente** | **9 itens** | **não** → `/politica` e `/geral` continuam 200 ✔ |
| blog recém-instalado, sem settings | — | — | **sim** → comportamento idêntico ao de hoje |

---

## 14. Sitemap e arquivos de convenção

### 14.1 `/api/sitemap.xml` — especificação

O sitemap final deve:

| # | Requisito | Como |
|---|---|---|
| 1 | **Ler artigos do banco real** | `db.select({ slug, id, publishedAt, updatedAt, canonicalUrl }).from(articlesTable)`, no molde de `sitemap-news.ts:26-35`. **Apagar** o uso de `store.getArticles()` (e o próprio stub, para que qualquer outro consumidor quebre no typecheck em vez de silenciosamente) |
| 2 | **Só artigos publicados** | `eq(status, "published")` |
| 3 | **URL canônica pública** | `base + "/artigo/" + canonicalArticlePath(a)` — **a mesma função** da RN-5 |
| 4 | **Nunca emitir UUID quando existe slug** | consequência do item 3 |
| 5 | **Nenhuma URL que responde 301** | garantido pelo item 3 + teste |
| 6 | **Nenhuma URL 404** | editorias vêm da superfície; artigos vêm do banco |
| 7 | **Nenhuma página `noindex`** | Classe 2 **fica de fora**; entram Classes 1 e 3 |
| 8 | **Nenhum canonical externo** | excluir artigo cujo `canonicalUrl` aponte para outro host. **Pré-condição de conteúdo: E-3** (§25) |
| 9 | **Categorias válidas deste portal** | `blogCategorySurface` + contagem > 0. **Zero** literais de slug no código (RN-12) |
| 10 | **`Cache-Control`** | `public, max-age=900` (igual ao `sitemap-news`) |
| 11 | **Limite do protocolo** | teto de **50.000 URLs** / 50 MB. Acima disso, cortar por `publishedAt desc` e **registrar em log**. Não construir sitemap index agora |
| 12 | **Testes** | §21 |

**Páginas estáticas incluídas:** `/` + as editorias indexáveis + `/arquivo`,
`/contato`, `/privacidade`, `/termos`. As institucionais entram porque **são
páginas reais e permanentes**; a magreza do HTML inicial delas é o P1-2 e não se
resolve escondendo a URL.

**`<lastmod>`:** usar **`publishedAt`** enquanto **E-12** não confirmar a
semântica de `updatedAt`. Motivo concreto: `updateArticle` grava
`updatedAt: new Date()` em **toda** chamada (`articleService.ts:428`), inclusive
nas rotinas de manutenção `migrate-json` (`admin.ts:886`) e de reparo de conteúdo
(`admin.ts:636`) — uma manutenção rodada num dia colocaria `lastmod` = aquele dia
em centenas de artigos, um sinal de frescor **falso**.

**Host:** `base` continua saindo de `req.get("host")` (`sitemap.ts:34`). Isso
mantém o comportamento correto por blog **e** preserva o caso conhecido do host
antigo (`F-25`), que continua publicando URLs `midia.run` — registrado, não
corrigido aqui.

### 14.2 `/sitemap.xml` e `/sitemap_index.xml` na raiz

| Path | Hoje | **Decisão** | Motivo |
|---|---|---|---|
| `/sitemap.xml` | 200 `text/html` | **`301` permanente → `/api/sitemap.xml`** | Uma única fonte da verdade; nenhum XML duplicado em duas URLs; o `robots.txt` continua apontando para o canônico. É a opção de menor código e menor risco |
| `/sitemap_index.xml` | 200 `text/html` | **`404`** | **Não existe** sitemap index nesta arquitetura e não há razão para inventar um |

**Alternativa registrada (não escolhida):** servir o XML diretamente em
`/sitemap.xml`, com o plugin do `web` fazendo passthrough de
`${apiBase}/api/sitemap.xml`. É defensável (é a URL de convenção), mas cria dois
endereços para o mesmo documento e mais código. **Se for preferida, a única
mudança é trocar o 301 pelo passthrough** — o resto do PRD não muda.

**Onde implementar:** no `web`, junto ao `seoTextPlugin` (que já responde
`/robots.txt` e `/llms.txt`, ambos com extensão) — portanto **antes** do
`staticExistsPlugin` da §14.3.

### 14.3 Fallback de paths com extensão

**Regra:** path com extensão que **não existe** em `dist/public` responde
**404**, com `Content-Type` não-HTML.

| Classe | Exemplo | Alvo |
|---|---|---|
| Asset inexistente | `/assets/inexistente.js` | **404** (`text/plain`) |
| Arquivo público inexistente | `/nada.xml`, `/foo.txt`, `/nao-existe.png`, `/wp-login.php` | **404** |
| Endpoint SEO convencional suportado | `/robots.txt`, `/llms.txt` | 200 (inalterado, `seoTextPlugin`) |
| Endpoint SEO com política explícita | `/sitemap.xml` | **301** (§14.2) |
| Endpoint SEO sem suporte | `/sitemap_index.xml` | **404** |
| Arquivo existente | `/favicon.jpg`, `/assets/<hash>.js`, `/index.html` | **200** (inalterado) |

**Implementação: `staticExistsPlugin`, registrado como o ÚLTIMO dos plugins
customizados** (depois de `spaHeadPlugin`), de modo que `/robots.txt`,
`/llms.txt` e `/sitemap.xml` já tenham sido respondidos:

```ts
// Pseudocódigo. A regra pura (normalizar, recusar traversal, decidir) mora em
// src/lib/staticPath.ts; o plugin só faz o fs.existsSync e o res.end.
if (!isReadRequest(req)) return next();
if (!/\.[a-zA-Z0-9]+$/.test(pathOnly)) return next();   // rota de página: não é aqui
if (pathOnly.startsWith("/api/")) return next();
const rel = safeRelative(pathOnly);                      // recusa "..", "%2e%2e", "//"
if (rel === null || !fs.existsSync(path.join(DIST_PUBLIC, rel))) {
  res.statusCode = 404;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60");
  res.end("Not Found");
  return;
}
next();   // existe: o estático (sirv) serve
```

**Alternativa registrada (não escolhida):** definir `appType: "mpa"` no
`vite.config.ts`. Resolveria em uma linha, mas muda o comportamento do **dev
server** também e é menos explícito. O plugin é cirúrgico, testável e não toca o
dev.

**O que a solução preserva, obrigatoriamente:** SPA legítima (paths sem
extensão continuam no `spaHeadPlugin`), `/admin/**`, páginas públicas, assets
existentes, `/api/*` e os arquivos gerados pelo build.

---

## 15. Regras de URL

| Padrão | Existe? | Status alvo | Canônica |
|---|---|---|---|
| `/` | sim | 200 | `/` |
| `/artigo/<slug>` | se o artigo existe | 200 | ela mesma |
| `/artigo/<uuid>` | se o artigo existe | **301** | `/artigo/<slug>` |
| `/artigo/<uuid>` de artigo **sem** slug | sim | 200 | ela mesma (**0 casos hoje**) |
| `/artigo/<qualquer-outro>` | não | **404** | — |
| `/<Classe 1>` | sim | 200 | ela mesma |
| `/<Classe 2>` | sim | 200 + `noindex` | ela mesma |
| `/<Classe 3>` | sim | **200 indexável** | ela mesma |
| `/<não declarada, vazia>` | não | **404** | — |
| `/arquivo`, `/contato`, `/privacidade`, `/termos` | sim | 200 | ela mesma |
| `/admin/**` (24 rotas) | sim | 200 | — (`Disallow` no robots) |
| `/a/b`, `/a/b/c` | não | **404** | — |
| `/<path>/` (barra final) | — | **inalterado** (P2-6) | — |
| `/FUTEBOL` (caixa alta) | não | **404** pela regra geral | — |
| `//futebol` (barra dupla) | — | tratado como hoje por `classifySsrPath` (`//` = home) | — |
| `/*.ext` **existente** | sim | 200 | — |
| `/*.ext` **inexistente** | não | **404** | — |
| `/sitemap.xml` | convenção | **301** → `/api/sitemap.xml` | — |
| `/sitemap_index.xml` | não | **404** | — |
| `/robots.txt`, `/llms.txt` | sim | 200 | — |
| `/api/**` | sim | inalterado | — |

**Nenhum path de URL é renomeado.** O PRD altera **status**, não **forma**, com a
única exceção do 301 de UUID→slug e do 301 de `/sitemap.xml`.

**Query string:** não entra na decisão (`pathOnly` já é `split("?")[0]`,
`vite.config.ts:806`). Verificado em runtime: `/futebol?page=2` devolve o mesmo
HTML e o mesmo canonical. O `Location` do 301 **preserva a query**.

**`HEAD`:** `isReadRequest` (`vite.config.ts:430-432`) cobre `GET` e `HEAD`;
todo status novo vale para HEAD automaticamente, sem corpo.

---

## 16. Regras HTTP

| Status | Quando | `Cache-Control` | Corpo | Canonical | `robots` |
|---|---|---|---|---|---|
| **200** | rota existe (Classes 1 e 3, artigo, home, estática) | inalterado (`max-age=30/60`, SWR) | SSR ou shell | próprio | `index, follow` |
| **200 + `noindex`** | Classe 2 (declarada e vazia) | idem | SSR | **próprio** (nunca apontando para outra URL) | `noindex, follow` |
| **200 (stale)** | API indisponível **e** há entrada em cache dentro da janela | `no-cache, must-revalidate` | HTML stale | do HTML stale | do HTML stale |
| **301** | `/artigo/<uuid>` → slug · `/sitemap.xml` → `/api/sitemap.xml` | `public, max-age=3600` | vazio | — | — |
| **404** | rota de página inexistente | `public, max-age=60` | shell com o `<head>` do blog | **NENHUM** | `noindex, follow` |
| **404** | arquivo/asset inexistente | `public, max-age=60` | `text/plain` mínimo | — | — |
| **503** | API indisponível **e** sem stale | `no-store` | shell mínimo ou texto | — | — |
| — | `/api/**`, `/admin/**`, assets existentes | inalterado | inalterado | — | — |

**`410 Gone` não é usado.** Ele afirma remoção permanente e definitiva, o que não
é verdade para `/politica` num blog que pode cadastrar essa editoria amanhã, nem
para um artigo despublicado que pode voltar. **404 é o status correto e
reversível.**

**404 × 200 + `noindex` não são equivalentes** e são usados para coisas
diferentes: 404 = *não existe*; 200 + `noindex` = *existe, é navegável, mas não
deve entrar no índice*.

**Emitir `noindex` junto do 404 é redundante mas defensivo** — se algum dia o
status vazar como 200 por bug de middleware, o `noindex` segura. **Manter.**

**Duas exigências que viram teste** (senão o P1-1 quebra este PRD):

- a resposta 404 tem **exatamente uma** tag `robots`;
- a resposta 404 **não contém** `<link rel="canonical">`.

---

## 17. Falha de API/DB (RN-1 detalhada)

### 17.1 A cascata

```
fetch /api/... falhou (timeout, 5xx, ECONNREFUSED, 503 db_unavailable/setup_required)
   │
   ├─ (1) existe entrada no htmlCache para (host, rota) com idade ≤ STALE_MAX?
   │        SIM → 200 com o HTML stale, Cache-Control: no-cache, must-revalidate
   │              + log warn "ssr.staleServed"
   │
   ├─ (2) NÃO →  503 Service Unavailable
   │              Retry-After: 60
   │              Cache-Control: no-store
   │              + log warn "ssr.apiUnavailable"
   │
   └─ (3) NUNCA 404.  Timeout, 5xx e DB indisponível NÃO são "not found".
```

### 17.2 Limites do stale

| Parâmetro | Valor | Motivo |
|---|---|---|
| `STALE_MAX_MS` | **10 min** | Cobre restart, deploy e pico; além disso o conteúdo servido deixa de ser confiável |
| Aplica-se a | `unavailable` **apenas** | Ver 17.3 |
| Fonte | O `htmlCache` já existente (`vite.config.ts:481-505`), com `revalidate()` em `:771-790` | Reaproveita arquitetura; nenhuma estrutura nova |
| Cache do 503 | **nunca** (`no-store`) | Um 503 cacheado prolongaria o incidente |

### 17.3 Conteúdo despublicado — o caso que **não** pode usar stale

Se a API responde **404** (artigo despublicado ou apagado), isso é **autoritativo**:

- a resposta é **404**, não stale;
- a entrada correspondente no `htmlCache` é **invalidada**;
- só um 404 explícito da API produz 404 na borda (RN-1).

Se o artigo voltar a ser publicado, ele volta a 200 no próximo ciclo (TTL de
60 s).

### 17.4 Por que não `200 + shell` (a escolha da V1)

| Critério | 200 + shell | **503 + `Retry-After`** | stale |
|---|---|---|---|
| Risco de soft-404 | **Alto** — 200 sem conteúdo é o defeito que este PRD combate | Nulo | Nulo |
| Sinal ao crawler | Ambíguo (parece página vazia) | **Correto e explícito**: "volte depois" | Ótimo |
| Risco de desindexação | Médio (200 vazio repetido) | Baixo (503 curto é tratado como transitório) | Baixo |
| UX | Ruim, mas a SPA hidrata | Página de erro | **Melhor de todas** |
| Monitoramento | **Invisível** — 200 não acende alarme | Visível em qualquer métrica | Visível |
| Complexidade | Nenhuma | Baixa | Média (SWR já existe) |

### 17.5 Métricas e logs desta regra

Ver §18 e §19. O contador `apiUnavailable` e o log `warn` são **inegociáveis**:
sem eles, uma `api` instável degrada em silêncio.

---

## 18. Cache

| Aspecto | Decisão | Evidência / motivo |
|---|---|---|
| Estrutura | Entrada tri-estado: `{ kind: "html" \| "redirect" \| "notFound", html?, location?, at, ttl }` | `revalidate()` passa a lidar com os três casos |
| **Chave** | `` `${host}|${route.key}` `` — **inalterada** | `vite.config.ts:804`. **Verificado: não mistura blogs**, duplamente — o host está na chave **e** cada blog roda seu próprio container `web` |
| TTL de `html` | inalterado (`PAGE_TTL_MS`, 60 s + SWR) | — |
| TTL de `notFound` e `redirect` | **60 s** | Curto para um artigo publicado agora aparecer rápido; longo para um bot não martelar a `api` |
| Query string na chave | **não** | Verificado: `/futebol?page=2` devolve o mesmo HTML e o mesmo canonical |
| Capacidade | 200 entradas, LRU, `mem_limit: 768m` no container | Entradas `notFound`/`redirect` são minúsculas (sem `html`) |
| **Teto separado para `notFound`** | **máx. 50 das 200 entradas** | **Novo.** Sem isso, uma varredura de URLs inexistentes despeja páginas úteis do cache |
| Envenenamento por `Host` forjado | Baixo risco | O Caddy roteia por host declarado; host desconhecido não chega ao container |
| Cache do 503 | **proibido** | §17.2 |
| Stale | Só para `unavailable`, janela de 10 min | §17.2 |

---

## 19. Observabilidade e logs

O container `web` é `vite preview` e não tem logger estruturado. **Sem inventar
infraestrutura nova**, o mínimo viável:

### 19.1 Contadores em memória

Expostos em `/__ssr-stats`, **não roteado pelo Caddy** (alcançável só de dentro
da rede docker), por `kind` de rota:

```
{ ok, notFound, redirect, staleServed, unavailable503, socialOg, staticNotFound }
```

### 19.2 Logs

| Evento | Nível | Conteúdo | Amostragem |
|---|---|---|---|
| `ssr.notFound` | debug | `path`, `kind` | 1/50 |
| `ssr.redirect` | debug | `from`, `to` | 1/50 |
| `ssr.staticNotFound` | debug | `path` | 1/50 |
| **`ssr.staleServed`** | **warn** | `path`, idade do stale | 1/10 |
| **`ssr.apiUnavailable`** | **warn** | `path`, `upstream`, `reason` | 1/10 |
| `ssr.renderError` | error | `path`, mensagem | sempre |

**Nunca logar:** query string completa, cookies, headers de autenticação, IP. O
`pino` do `api-server` já serializa `req.url.split("?")[0]` de propósito
(`app.ts:105-107`) — mesma disciplina no `web`.

**Se algo tiver de sair por escopo, o inegociável é `ssr.apiUnavailable`:** sem
ele, a RN-1 é exercida em silêncio.

### 19.3 Fonte externa

Google Search Console, semanalmente após o deploy: "Não encontrada (404)" —
conferir que a lista bate com §15 e que **nenhuma** entrada é artigo ou editoria
real.

---

## 20. Structured data afetado

**Este PRD não altera nenhum schema.** Mas muda **quem o recebe**, e isso tem
consequências que precisam estar escritas:

| Item | Antes | Depois deste PRD |
|---|---|---|
| `NewsArticle` no artigo | existe; **Googlebot não recebe** | existe; **Googlebot passa a receber** |
| `BreadcrumbList` no artigo | existe, **inválido** (posições 1 e 2 = home, em 640/640); Googlebot não recebe | existe, **ainda inválido**, e agora **visível ao buscador** → **corrigir no mesmo ciclo P1** (P1-3) |
| `publisher.logo` | aponta para `/favicon.jpg` estático (sha256 == asset do repo); Googlebot não recebe | idem, agora visível → P1-5 |
| `dateModified` | igual a `datePublished`; Googlebot não recebe | idem, agora visível → P1-5, **bloqueado por E-12** |
| `mainEntityOfPage.@id` | podia divergir da URL pedida (UUID) | com o 301, **sempre coincide** com a URL da resposta |
| Home / editoria | sem JSON-LD | inalterado (P1-4) |
| AMP | `NewsArticle` próprio | inalterado |

**Não-regressão:** a contagem de páginas com schema **não pode cair**, e passa a
valer **também para o UA Googlebot** (§12.3).

---

## 21. Testes

Runner: `node --test` via `tsx`. Imports relativos com extensão `.ts` explícita.
**Baseline a superar: 156 testes verdes** em `brasilia-agora`, typecheck limpo
nos dois pacotes.

### 21.1 Unitários — funções puras

| Arquivo | Função | Casos |
|---|---|---|
| `src/lib/routeDecision.test.ts` *(novo)* | `decideArticle`, `decideCategory` | 21.2 e 21.3 |
| `src/lib/categoryRoutes.test.ts` *(estender)* | `blogCategorySurface`, `resolveCategoryRoute` | 21.4 |
| `src/lib/ssrRoutes.test.ts` *(estender)* | `classifySsrPath` | 21.5 |
| `src/lib/staticPath.test.ts` *(novo)* | `safeRelative`, decisão de arquivo | 21.6 |
| `src/lib/crawlerUa.test.ts` *(novo)* | `isSocialCrawler` | 21.7 |
| `src/lib/homeBlocks.test.ts` *(estender)* | `href` de "Ver mais" validado contra a superfície | 21.8 |
| `api-server/test/sitemapXml.test.ts` *(novo)* | geração de XML a partir de lista injetada | 21.9 |

### 21.2 `decideArticle`

| # | `requested` | lookup | Esperado |
|---|---|---|---|
| A-1 | `futebol-x` | ok, slug=`futebol-x` | `200 article` |
| A-2 | `<uuid>` | ok, slug=`futebol-x` | `301 /artigo/futebol-x` |
| A-3 | `<uuid>` | ok, slug=`null` | `200 article` |
| A-4 | `<uuid>` | ok, slug=`""` | `200 article` |
| A-5 | `nao-existe` | not_found | `404` |
| A-6 | `__placeholder__` | not_found | `404` |
| A-7 | `qualquer` | unavailable + stale | `200 stale` |
| A-8 | `qualquer` | unavailable, sem stale | **`503`** |
| **A-9** | **`uts-rio-joão-fonseca`** (acento) | ok, slug igual | `200` — **sem 301 espúrio por encoding** |
| **A-10** | **`thiagog silvaehulkfluminense`** (espaço) | ok, slug igual | `200`; se vier pelo id, `301` com `%20` no `Location` |
| A-11 | `<uuid>?utm_source=x` | ok, slug=`s` | `301 /artigo/s?utm_source=x` (query preservada) |
| A-12 | `futebol-x` | ok, slug=`futebol-x` | **nenhum redirect** — prova de ausência de loop |

### 21.3 `decideCategory`

| # | Classe | `declared` | `visible` | `total` | Esperado |
|---|---|---|---|---|---|
| C-1 | 1 | true | true | 307 | `200`, sem `noindex` |
| C-2 | 2 | true | true | 0 | `200 + noindex` |
| **C-3** | **3** | **false** | — | 163 | **`200`, sem `noindex`** (sp011 `/seguranca`) |
| **C-4** | **3** | **true** | **false** | 86 | **`200`, sem `noindex`** (Oley `/copa-do-mundo`) |
| C-5 | 2 | true | false | 0 | `200 + noindex` |
| C-6 | — | false | — | 0 | **`404`** |
| C-7 | 4 | false | — | 39 | `200`, sem `noindex` (`tebol`, até a higiene de dados) |
| C-8 | qualquer | — | — | unavailable + stale | `200 stale` |
| C-9 | qualquer | — | — | unavailable, sem stale | **`503`** |

### 21.4 `blogCategorySurface`

| # | `categories` | `menuItems` | Esperado |
|---|---|---|---|
| S-1 | 9 do Oley | menu do Oley | `/politica` **ausente**; `/copa-do-mundo` **presente** |
| S-2 | vazio | menu do Oley | editorias do menu; `/politica` ausente |
| S-3 | **vazio** | **vazio** | as **13** `FIXED_CATEGORIES` (rede de segurança, RN-9) |
| S-4 | vazio | só links externos (`https://…`) | as 13 fixas |
| **S-5** | uma com `visible:false` | menu sem ela | **entra na superfície** (existência ≠ navegação) |
| S-6 | com `outros` | menu com `/outros` | sem duplicata |
| **S-7** | **ausente** | **menu do sp011 (9 itens)** | **`FIXED_CATEGORIES` NÃO se aplica**; `/politica` e `/geral` presentes; `/colunas` e `/brasil` ausentes |
| S-8 | qualquer | menu com `/contato` | `RESERVED_PATHS` vence: `/contato` **não** é editoria |

### 21.5 `classifySsrPath`

| # | path | Esperado |
|---|---|---|
| P-1 | `/`, `//`, `/index.html` | `home` |
| P-2 | `/artigo/abc` | `article`, slug `abc` |
| P-3 | `/futebol` | `category` |
| P-4 | `/contato`, `/termos`, `/privacidade`, `/arquivo` | `static` |
| P-5 | `/a/b`, `/a/b/c` | `unknown` |
| **P-6** | **`/FUTEBOL`** | `category` (a decisão de existência é do `decideCategory` → 404) |
| P-7 | `/admin`, `/admin/artigos`, `/admin/setup` | `null` — **regressão do teste existente** |
| P-8 | `/favicon.jpg`, `/assets/x.js` | `null` |
| P-9 | `/api/site` | `null` |
| **P-10** | **`/futebol/`** | **`null`** — barra final **continua** com a SPA (teste existente **preservado**) |

### 21.6 `staticPath`

| # | path | Existe no disco? | Esperado |
|---|---|---|---|
| T-1 | `/assets/main-abc123.js` | sim | `next()` |
| T-2 | `/assets/inexistente.js` | não | **404** |
| T-3 | `/nada.xml`, `/foo.txt`, `/wp-login.php` | não | **404** |
| T-4 | `/favicon.jpg` | sim | `next()` |
| T-5 | `/../../etc/passwd`, `/%2e%2e/x.js` | — | **404**, sem acesso a filesystem |
| T-6 | `/futebol` (sem extensão) | — | `next()` — não é competência deste plugin |
| T-7 | `/api/site` | — | `next()` |
| T-8 | `/sitemap.xml` | — | já respondido antes (301) — nunca chega aqui |

### 21.7 `isSocialCrawler`

| # | UA | Esperado |
|---|---|---|
| U-1 | `…Googlebot/2.1…` | **false** (vai para o SSR) |
| U-2 | `…bingbot/2.0…` | **false** |
| U-3 | `…Applebot/0.1…` | **false** |
| U-4 | `facebookexternalhit/1.1` | **true** |
| U-5 | `WhatsApp/2.x` | **true** |
| U-6 | `Twitterbot/1.0` | **true** |
| U-7 | `Mozilla/5.0 … Chrome/…` | **false** |
| U-8 | `Google-InspectionTool/1.0` | **false** (e registrar: não casa nem hoje) |
| U-9 | `""` (vazio) | **false** |

### 21.8 "Ver mais"

| # | Bloco | Esperado |
|---|---|---|
| V-1 | `source: "latest"`, sem categoria | **sem** `href` |
| V-2 | `source: "most_read"`, sem categoria | **sem** `href` |
| **V-3** | **`category: "geral"` explícito, blog sem `/geral` na superfície** | **sem** `href` (caso real do Oley — a V1 gerava o link) |
| V-4 | `category: "futebol"`, blog com `/futebol` | `href = "/futebol"` |
| V-5 | `category: "geral"`, **blog sp011** (tem `/geral`) | `href = "/geral"` |

### 21.9 Sitemap (unitário, lista injetada)

| # | Entrada | Esperado |
|---|---|---|
| M-1 | 3 publicados + 1 draft | 3 `<loc>` de artigo |
| M-2 | artigo com slug e id | `<loc>` usa o **slug** |
| M-3 | artigo sem slug | `<loc>` usa o **id** |
| M-4 | artigo com `canonicalUrl` de outro host | **excluído** |
| M-5 | título com `&`, `<`, `"` | escapado |
| M-6 | Classe 2 (declarada e vazia) | editoria **fora** |
| M-7 | Classe 1 e Classe 3 | editorias **dentro** |
| M-8 | 60.000 artigos | corta em **50.000** e loga |
| M-9 | qualquer | header `Cache-Control: public, max-age=900` |
| M-10 | qualquer | `<lastmod>` = `publishedAt` (até E-12) |

### 21.10 Integração na VPS (`curl`) — `$D = https://oleysports.com.br`, `$S = https://sp011.com.br`

| # | Verificação | Esperado |
|---|---|---|
| I-1 | `$D/artigo/<slug>` navegador | 200, `<h1>`, canonical, 2 `ld+json` |
| **I-2** | **`$D/artigo/<slug>` Googlebot** | **200, mesmo `<h1>`, mesmo canonical, 2 `ld+json`, ≥ 95% dos bytes** |
| I-3 | `$D/artigo/<uuid>` navegador | **301** → `/artigo/<slug>` |
| **I-4** | **`$D/artigo/<uuid>` Googlebot** | **301** → `/artigo/<slug>` |
| I-5 | `$D/artigo/nao-existe-abc` | **404** |
| I-6 | `$D/artigo/__placeholder__` | **404** |
| I-7 | `$D/futebol \| grep -c __placeholder__` | **0** |
| I-8 | `$D/rota-inventada`, `$D/a/b` | **404** |
| I-9 | `$D/politica`, `$D/geral` | **404** |
| I-10 | `$D/futebol` | 200, `<h1>`, **sem** `noindex` |
| I-11 | `$D/basquete` (Classe 2) | 200, **com** `noindex` |
| **I-12** | **`$D/copa-do-mundo`** | **200, `<h1>`, artigos, sem `noindex`** |
| **I-13** | **`$S/seguranca`** | **200, `<h1>`, sem `noindex`** |
| **I-14** | **`$S/politica` e `$S/geral`** | **200** |
| I-15 | `$S/futebol` | **404** (não é editoria do sp011) |
| I-16 | `$D/tebol` | 200 (Classe 4 tratada como 3) — registrar para a higiene |
| I-17 | `$D/contato`, `/termos`, `/privacidade`, `/arquivo` | 200 |
| I-18 | `$D/admin`, `$D/admin/setup` | 200, **sem** `__SSR_DATA__` |
| **I-19** | **`$D/sitemap.xml`** | **301** → `/api/sitemap.xml` |
| **I-20** | **`$D/sitemap_index.xml`** | **404** |
| **I-21** | **`$D/assets/inexistente.js`, `$D/nada.xml`, `$D/wp-login.php`** | **404**, `Content-Type` ≠ `text/html` |
| I-22 | `$D/favicon.jpg`, `$D/robots.txt`, `$D/llms.txt` | 200 |
| **I-23** | **`$D/api/sitemap.xml \| grep -c '/artigo/'`** | **= 640** (nº de publicados) |
| I-24 | `$D/api/sitemap.xml` — cada `<loc>` | **todas 200**; nenhuma 301, nenhuma 404, nenhuma com `noindex` |
| I-25 | `$D/api/sitemap-news.xml` — cada `<loc>` | todas **200** |
| I-26 | `HEAD $D/artigo/nao-existe` | **404**, sem corpo |
| I-27 | `HEAD $D/artigo/<uuid>` | **301**, sem corpo |
| I-28 | `$D/futebol?page=2` | 200, canonical = `…/futebol` |
| I-29 | `$D/FUTEBOL` | **404** |
| I-30 | `$D/futebol/` | **inalterado** (200 shell) — prova de que a barra final ficou fora |
| I-31 | `$D/` | resposta 404 de qualquer rota **não contém** `<link rel="canonical">` |
| I-32 | qualquer 404 | **exatamente 1** tag `<meta name="robots"` |
| **I-33** | **`curl -A facebookexternalhit $D/artigo/<slug>`** | **≥ 3 tags `og:`** (preview social intacto) |
| I-34 | `curl -A 'WhatsApp/2' …`, `Twitterbot`, `LinkedInBot`, `TelegramBot` | idem |
| I-35 | `$D/api/amp/artigos/<slug>` | 200 |

### 21.11 Falha de infraestrutura (RN-1) — teste manual controlado

**Em ambiente de teste, nunca em produção.** Parar o container `api` de um blog e
confirmar:

| # | Verificação | Esperado |
|---|---|---|
| F-1 | `/` logo após parar (cache quente) | **200 com HTML stale** |
| F-2 | `/` após 11 min (fora da janela) | **503** + `Retry-After` |
| F-3 | `/artigo/<slug>` sem cache | **503**, **nunca 404** |
| F-4 | Nenhuma rota | **nenhum 404** |
| F-5 | Log | `ssr.apiUnavailable` em nível `warn` |
| F-6 | Após religar o `api` | volta a 200 SSR em ≤ 60 s |

### 21.12 Regressão

```
pnpm exec tsc -b
cd artifacts/api-server      && pnpm run typecheck && npx tsx --test test/*.test.ts
cd artifacts/brasilia-agora  && pnpm run typecheck && npx tsx --test "src/**/*.test.ts"
```

---

## 22. Arquivos afetados

### Novos

| Path | Conteúdo |
|---|---|
| `brasilia-agora/src/lib/routeDecision.ts` | `decideArticle()`, `decideCategory()`, `canonicalArticlePath()` — puras |
| `brasilia-agora/src/lib/routeDecision.test.ts` | 21.2, 21.3 |
| `brasilia-agora/src/lib/staticPath.ts` + `.test.ts` | `safeRelative()` e a decisão de arquivo (21.6) |
| `brasilia-agora/src/lib/crawlerUa.ts` + `.test.ts` | `isSocialCrawler()` (21.7) |
| `api-server/test/sitemapXml.test.ts` | 21.9 |

### Modificados

| Path | Referência | Mudança |
|---|---|---|
| `brasilia-agora/vite.config.ts` | **41-42** | `CRAWLER_RE` → `SOCIAL_CRAWLER_RE` via `crawlerUa.ts`; **Googlebot, bingbot e Applebot saem** |
| `brasilia-agora/vite.config.ts` | 330-419 | `socialOgPlugin` usa `isSocialCrawler`; (opcional) distinguir 404 de 5xx |
| `brasilia-agora/vite.config.ts` | 430-461, 463-846, 849-890 | `sendHtml(status)`; `fetchJson` tri-estado; cache tri-estado + stale/503; `handleSsr` executa a decisão; `serveShell(req,res,status)`; `applyHead` com `robots` |
| `brasilia-agora/vite.config.ts` | 1089-1093 | Registrar `staticExistsPlugin` como **último** dos customizados |
| `brasilia-agora/vite.config.ts` | ~968-1027 | `seoTextPlugin` (ou vizinho) responde `/sitemap.xml` (301) e `/sitemap_index.xml` (404) |
| `brasilia-agora/src/lib/ssrRoutes.ts` | 1-44 | Novos `kind` (`static`, `unknown`); **linha 35 (barra final) INALTERADA** |
| `brasilia-agora/src/lib/categoryRoutes.ts` | 28-107 | `CategoryLike`, `blogCategorySurface()`, 3º parâmetro retrocompatível em `resolveCategoryRoute` |
| `brasilia-agora/src/App.tsx` | 228-317 | Remover o `FIXED_CATEGORIES.map`; `DynamicCategory` passa `settings.categories` |
| `brasilia-agora/src/pages/CategoryArchivePage.tsx` | 125-134 | Placeholder deixa de ser tratado como artigo; expor `isEmpty` |
| `brasilia-agora/src/components/CategoryPage.tsx` | 68-110 | Estado vazio renderiza card **sem** `<Link>` |
| `brasilia-agora/src/pages/Home.tsx` | 529-534, 651-657 | `href` de "Ver mais" **validado contra a superfície** |
| `brasilia-agora/src/hooks/useSite.ts` | — | Garantir `categories` tipado no `settings` do cliente |
| `api-server/src/routes/sitemap.ts` | 6-20, 36-37 | Consulta ao banco; `STATIC_PAGES` derivadas de settings; `Cache-Control`; teto de 50k |
| `api-server/src/lib/store.ts` | 1330-1333 | Apagar o stub `getArticles` (para quebrar no typecheck qualquer outro consumidor) |

### **Não** modificados (importante)

- `Caddyfile`, `compose.yml`, `.env`, qualquer arquivo de infraestrutura.
- `api-server/src/lib/articleService.ts` — `getArticle` **continua** aceitando id
  **ou** slug: é o que permite o 301 sem quebrar link histórico.
- `brasilia-agora/src/components/MostRead.tsx` e demais mocks — **P2**.
- `brasilia-agora/src/lib/ssrRoutes.ts:35` e seu teste — **barra final fora**.
- `brasilia-agora/src/lib/categoryRoute.ts` (singular) — **P1-3**.
- Assets `.webp` de `src/assets/images/` — vários são `FALLBACK_IMGS` do
  `HeroSection.tsx:59`.

---

## 23. Compatibilidade com URLs existentes

**Nenhuma URL para de funcionar. Nenhuma URL muda de forma.**

| Caso | Antes | Depois | Quebra? |
|---|---|---|---|
| Link externo para `/artigo/<slug>` | 200 | 200 | não |
| Link externo para `/artigo/<uuid>` | 200 | **301** → slug | não |
| Link externo para `/politica` no Oley | 200 (vazia) | **404** | sim, **e é o objetivo** |
| Link externo para `/copa-do-mundo` no Oley | 200 shell (sem página) | **200 com conteúdo** | não — **melhora** |
| Link externo para `/seguranca` no sp011 | 200 | **200** | não |
| Link do `sitemap-news` | 200 | 200 | não |
| Link do `/api/amp/artigos/<uuid>` | 200 | 200 (backend não muda) | não |
| Compartilhamento social | OG stub | OG stub | não |
| **Resultado de busca para `/artigo/<slug>`** | stub de 3 KB | **matéria completa** | não — **melhora** |
| `oleysports.midia.run/artigo/<slug>` | 301 → domínio novo | 301 → domínio novo | não |
| `POST /api/ingest` da central | 200 | 200 | não (`/api/*` fora do middleware, e o Caddy roteia direto) |

**Cadeia de redirect a evitar:** quem chegar em
`oleysports.midia.run/artigo/<uuid>` fará 301 (Caddy) + 301 (este PRD) = **dois
hops**. Aceitável, e mais uma razão para o P2-5 (limpar `canonical_url` legado).

---

## 24. Critérios de aceite

Todos verificáveis por comando. `$D = https://oleysports.com.br`,
`$S = https://sp011.com.br`.

| # | Critério | Verificação |
|---|---|---|
| 1 | Artigo slug + navegador → **200 + SSR completo** | `curl -s $D/artigo/<slug> \| grep -c '<h1'` ≥ 1 |
| **2** | **Artigo slug + Googlebot → 200 + mesmo conteúdo editorial essencial** | §12.3: title, canonical, H1, corpo (≥95% dos bytes), links, 2 `ld+json` |
| 3 | Artigo UUID + navegador → **301** para o slug | `curl -sI $D/artigo/<uuid>` |
| **4** | **Artigo UUID + Googlebot → o mesmo 301** | `curl -sI -A 'Googlebot/2.1' …` |
| 5 | Artigo inexistente → **404** | I-5 |
| 6 | Placeholder → **404** e **zero links internos** para ele | I-6, I-7 |
| 7 | Rota inventada → **404** | I-8 |
| 8 | Arquivo inexistente → **404**, não HTML 200 | I-21 |
| 9 | Asset inexistente → **404** | I-21 |
| 10 | `/sitemap.xml` → **XML válido ou redirect explícito** | I-19 (301) |
| 11 | `/api/sitemap.xml` contém **artigos reais** | I-23 (= 640) |
| 12 | Nenhum `<loc>` termina em **301** | I-24 |
| 13 | Nenhum `<loc>` retorna **404** | I-24 |
| 14 | Nenhuma URL `noindex` entra no sitemap | I-24 + M-6 |
| 15 | `/futebol` continua **SSR e indexável** | I-10 |
| 16 | **`/seguranca` no sp011 não sofre regressão** | I-13 |
| 17 | **`/geral` no sp011 continua funcional** | I-14 |
| 18 | **`/copa-do-mundo` recebe tratamento explicitamente definido** | I-12 (200 indexável, §13.3) |
| 19 | Categorias corrompidas têm **plano de dados**, não regra genérica | §13.4 escrito; I-16 registra o estado |
| 20 | Falha de API sem stale → **503**, nunca 404 | F-2, F-3 |
| 21 | SSR e schema de artigo permanecem válidos | NR-1, NR-3 |
| 22 | Crawlers sociais continuam gerando preview | I-33, I-34 + Sharing Debugger |
| 23 | `robots.txt` continua apontando para o sitemap correto | `curl -s $D/robots.txt` |
| 24 | Headers de segurança permanecem | `curl -sI $D/` |
| 25 | **Nenhum 404 contém canonical** | I-31 |
| 26 | Suíte: **≥ 45 casos novos** verdes; typecheck limpo | 21.12 |
| 27 | `siteName` correto nos **11 domínios** | `curl -s https://<d>/api/site \| grep -o '"siteName":"[^"]*"'` |

---

## 25. Não regressões obrigatórias

Verificar **em todos os blogs** depois do rollout.

| # | Invariante | Como verificar |
|---|---|---|
| NR-1 | SSR ativo em home, artigo e editoria | `grep -c '<h1'` ≥ 1 e `grep -c '__SSR_DATA__'` = 1 |
| NR-2 | Artigo entrega conteúdo no HTML inicial | `grep -c '<article'` ≥ 1 |
| NR-3 | `NewsArticle` + `BreadcrumbList` presentes | `grep -c 'application/ld+json'` = 2 · Rich Results Test verde |
| **NR-3b** | **O mesmo, com UA Googlebot** | `curl -A 'Googlebot/2.1' … \| grep -c 'application/ld+json'` = **2** |
| NR-4 | `/api/sitemap-news.xml` funcionando | `grep -c '<loc>'` > 0 e todas 200 |
| NR-5 | `robots.txt` dinâmico e correto | cita os dois sitemaps do host certo |
| NR-6 | Headers de segurança presentes | HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP report-only |
| NR-7 | Cache de HTML + SWR funcionando | 2º `curl` da home com TTFB < 100 ms |
| NR-8 | `/admin` funciona e fica fora do SSR | login OK; `grep -c '__SSR_DATA__'` = 0 |
| NR-9 | `POST /api/ingest` entregando | painel central → Entregas sem `failed`/`dead` novos |
| NR-10 | AMP respondendo | `/api/amp/artigos/<slug>` = 200 |
| **NR-11** | **Compartilhamento social com OG certo** | 5 UAs sociais, ≥ 3 tags `og:` + Sharing Debugger |
| **NR-12** | **Nenhum blog perdeu suas editorias** | varredura de menu nos 11 domínios (script abaixo) |
| NR-13 | Analytics não quebrou | painel → Analytics registra pageview novo |
| NR-14 | Identidade por blog | `siteName` correto nos 11 domínios |
| **NR-15** | **Resposta 404 não contém canonical** | I-31 — **impede que o P1-1 quebre este PRD** |
| **NR-16** | **Barra final inalterada** | `$D/futebol/` continua 200 shell (prova de escopo) |

**NR-12 é o mais importante e o mais fácil de errar:**

```bash
for d in sp011.com.br ksports.midia.run esporteagora.midia.run resenhavip.midia.run \
         oleysports.com.br beeesportes.midia.run apostaganha.midia.run \
         recebabet.midia.run pontofarma.com credito.vc ocomandantenews.com.br; do
  echo "== $d"
  curl -s "https://$d/api/site" \
    | grep -oE '"path":"/[^"]*"' | sort -u | head -20 \
    | while read -r p; do
        u=$(echo "$p" | cut -d'"' -f4)
        printf '  %-24s %s\n' "$u" "$(curl -s -o /dev/null -w '%{http_code}' "https://$d$u")"
      done
done
```

Qualquer `404` na saída acima é **regressão** e obriga rollback.

---

## 26. Plano de implementação

**Múltiplos commits internos. Uma release de produção.**

### Etapa 0 · Baseline e dados (nada muda)

1. Rodar o bloco de baseline do PRD geral V2 §14.1 na VPS e **salvar a saída**.
2. **Responder E-3** (read-only, banco do blog): há `canonical_url` externo ou
   apontando para `oleysports.midia.run`?
   → **Pré-condição de conteúdo do sitemap**, não de código. O código pode ser
   escrito antes; o sitemap não pode ser **validado** sem isso.
3. **Se `/geral` não responder 200, ou o sitemap já tiver artigos, parar e
   revisar a análise.**

### Etapa 1 · Unificar buscadores (`F-26`)

`crawlerUa.ts` + `isSocialCrawler` + remoção de `Googlebot`/`bingbot`/`Applebot`
do plugin. Testes 21.7.

**Aceite:** `curl -A Googlebot $D/artigo/<slug>` devolve o mesmo `<h1>`, o mesmo
canonical e **2** `ld+json`; `curl -A facebookexternalhit` continua com `og:`.

> **Observação de risco, decisão humana.** Esta etapa é a única que pode ir
> sozinha em produção sem violar a atomicidade da §28.3: ela não muda a verdade
> de nenhuma URL — só entrega ao buscador o SSR que já existe e já está correto
> em `/artigo/*` (640 artigos reais). Se as etapas seguintes escorregarem, **é
> defensável liberá-la antes**, e o ganho é imediato. A recomendação padrão
> continua sendo **uma release única**.

### Etapa 2 · Fonte única de existência/taxonomia

`categoryRoutes.ts` (`CategoryLike`, `blogCategorySurface`, 3º parâmetro),
`App.tsx` (remover `FIXED_CATEGORIES.map`), `vite.config.ts` (`renderCategory`
passa `site.categories`). Testes 21.4.

**Ainda sem 404:** `/politica` apenas deixa de ser reconhecida como editoria.

**Aceite:** no Oley, `/futebol` continua SSR e `/politica` deixa de ter `<h1>`.
**No sp011, `/politica`, `/geral` e `/seguranca` continuam SSR** — é a prova da
RN-9 e da Classe 3.

### Etapa 3 · Parar de publicar links inválidos

Estado vazio sem `<Link>`; "Ver mais" validado contra a superfície. Testes 21.8.

**Aceite:** `grep -c '__placeholder__'` = 0 nas editorias; `grep -c 'href="/geral"'`
= 0 na home do Oley (**e ≥ 1 na do sp011**, onde `/geral` existe).

### Etapa 4 · Tri-estado da API + stale/503

`fetchJson` tri-estado, `sendHtml(status)`, `serveShell`, `applyHead` com
`robots`, cache tri-estado, cascata da §17. **A mudança de maior risco — fazer
sozinha, sem mudança de comportamento visível.**

**Aceite:** nenhum status muda; site idêntico ao baseline; teste 21.11 verde em
ambiente de teste.

### Etapa 5 · 404/200/noindex + fallback de arquivos

`ssrRoutes.ts` (novos `kind`), `routeDecision.ts`, `handleSsr`,
`staticExistsPlugin`, `/sitemap.xml` (301) e `/sitemap_index.xml` (404). Testes
21.2, 21.3, 21.5, 21.6.

**Aceite:** tabela 21.10 verde, exceto os itens de sitemap e 301.

### Etapa 6 · 301 UUID → slug

Ativar o ramo 301 do `decideArticle`. Testes A-2, A-9, A-10, A-11, A-12.

**Aceite:** I-3, I-4, I-26, I-27.

### Etapa 7 · Sitemap geral

`routes/sitemap.ts` reescrito conforme §14.1; stub do `store` apagado. Testes
21.9.

**Aceite:** I-23, I-24 e o `Cache-Control`.

### Etapa 8 · Testes integrados e revisão

Suíte completa verde, typecheck limpo, tabela 21.10 escrita como script.

### Etapa 9 · Release atômica

```bash
cd /opt/sp011
git pull
V=$(grep -m1 '^BLOG_IMAGE_VERSION=' .env | cut -d= -f2); N="v$((${V#v}+1))"
sed -i "s|^BLOG_IMAGE_VERSION=.*|BLOG_IMAGE_VERSION=$N|" .env
grep '^BLOG_IMAGE_VERSION=' .env
docker compose build api web
docker compose up -d api web
```

**Canário duplo obrigatório: `sp011` primeiro** (é o blog com a taxonomia mais
divergente — valida RN-9 e Classe 3), depois `oleysports`. Só então os demais 9,
em paralelo:

```bash
N=$(grep -m1 '^BLOG_IMAGE_VERSION=' /opt/sp011/.env | cut -d= -f2)
for b in ksports esporteagora resenhavip beeesportes apostaganha recebabet \
         pontofarma creditovc ocomandante; do
  [ -d "/opt/blogs/$b" ] || continue
  ( cd "/opt/blogs/$b" \
    && sed -i "s|^BLOG_IMAGE_TAG=.*|BLOG_IMAGE_TAG=$N|" .env \
    && docker compose up -d ) &
done
wait
cd /opt/sp011
```

> O `sp011` é servido pelo compose raiz (`up -d api web` acima já o atualiza).
> O `oleysports` está em `/opt/blogs/oleysports` e deve ser atualizado
> **individualmente**, antes do laço.

### Etapa 10 · Pós-deploy

- Tabela 21.10 no Oley e no sp011.
- §25 (não regressões) nos 11 domínios, com atenção a **NR-12**.
- GSC: reenviar `/api/sitemap.xml`; inspecionar URLs de §15 com "Testar URL
  ativa" — **e confirmar por `curl -A Googlebot`** (§12.2).
- Acompanhar "Não encontrada (404)" semanalmente por 30 dias.

---

## 27. Rollback

**Granularidade:** um commit por etapa. Cada etapa é revertível sozinha.

```bash
# 1. reverter
cd /opt/sp011 && git revert <sha> && git push

# 2. rebuild + rollout (bump obrigatório: a versão tagueia api E web)
V=$(grep -m1 '^BLOG_IMAGE_VERSION=' .env | cut -d= -f2); N="v$((${V#v}+1))"
sed -i "s|^BLOG_IMAGE_VERSION=.*|BLOG_IMAGE_VERSION=$N|" .env
docker compose build api web && docker compose up -d api web
```

**Rollback instantâneo de um blog só** (sem rebuild — a imagem anterior continua
no host, não há registry):

```bash
cd /opt/blogs/oleysports
sed -i "s|^BLOG_IMAGE_TAG=.*|BLOG_IMAGE_TAG=<tag-anterior>|" .env
docker compose up -d
curl -s https://oleysports.com.br/api/site | grep -o '"siteName":"[^"]*"'
```

**Gatilhos de rollback:**

- Qualquer item de §25 falhando (especialmente **NR-12**: editoria do menu em
  404).
- **404 em URL de artigo real** ou em editoria com conteúdo.
- **Preview social quebrado** (NR-11).
- Aumento de 5xx no `web` que não seja o 503 esperado da RN-1.
- Queda de pageviews no Analytics de qualquer blog.

**Cuidado operacional:** não rodar `docker image prune` enquanto o canário não
estabilizar. **Nunca** `docker system prune --volumes` (`CLAUDE.md §13`).

---

## 28. Riscos

| # | Risco | Prob. | Sev. | Mitigação |
|---|---|---|---|---|
| K-1 | **404 numa editoria real de algum blog** | Média | **Alta** | Classes explícitas (§13.2); Etapa 2 separada da Etapa 5; canário **sp011 primeiro**; NR-12 nos 11 domínios |
| K-2 | **`api` instável vira 404 em massa** | Baixa | **Crítica** | RN-1 + `fetchJson` tri-estado isolado na Etapa 4; teste 21.11; log `warn` |
| K-3 | **Des-indexar arquivo legítimo** (`/seguranca`, 163 artigos) | **Era Alta na V1** | Alta | Classe 3 = **200 indexável**; I-13 é critério de aceite |
| K-4 | **Preview social quebra** ao mexer no plugin | Baixa | Média | UAs sociais permanecem; I-33/I-34; Sharing Debugger; NR-11 |
| K-5 | Googlebot passa a ver o site e encontra o `BreadcrumbList` inválido | **Alta** | Baixa | Conhecido: P1-3 no mesmo ciclo (ou junto). Um breadcrumb inválido é ignorado, não penalizado |
| K-6 | Cliente e servidor discordarem sobre editoria (hidratação quebrada) | Média | Média | Uma única função (`blogCategorySurface`); remoção das rotas fixas do `App.tsx`; RN-10 |
| K-7 | `staticExistsPlugin` 404 num arquivo que existe | Baixa | **Alta** | Checagem por `fs.existsSync` no diretório de build + testes 21.6 + I-22; registrado como gatilho de rollback |
| K-8 | Sitemap grande derruba o `api` | Baixa | Média | `select` de 5 colunas, `Cache-Control: 900`, teto de 50k |
| K-9 | Slug com espaço/acento no `Location` do 301 | Baixa | Baixa | `encodeURIComponent` + testes A-9/A-10 |
| K-10 | Varredura de URLs inexistentes despeja o cache LRU | Baixa | Baixa | Teto separado de 50 entradas para `notFound` (§18) |
| K-11 | Rollout de ~20 min afetando 11 blogs | Alta | Baixa | `CLAUDE.md §6`; blogs em paralelo |
| K-12 | **Validar o `F-26` pelo "Testar URL ativa" do GSC e concluir errado** | Média | Média | §12.2: a verificação válida é `curl -A Googlebot` |
| K-13 | Emitir 404 em URL indexada de editoria vazia derruba impressões | Média | Baixa | É o objetivo; aumento em "Não encontrada (404)" no GSC é **sinal de sucesso**, desde que a lista bata com §15 |

### 28.1 Migração de índice (o que esperar, e não confundir com regressão)

1. O Google reprocessa as URLs que passaram a 404 e as remove do índice ao longo
   de semanas. **É o resultado desejado.**
2. As URLs UUID indexadas consolidam no slug via 301.
3. No GSC, esperar **aumento temporário** em "Não encontrada (404)" — sinal de
   sucesso, desde que as URLs listadas sejam as de §15 e **nenhuma** seja artigo
   ou editoria real.
4. Esperar **aumento** em URLs descobertas pelo sitemap (de 14 para ~650).
5. **Nenhuma ação de remoção manual no GSC.** A ferramenta é temporária (6 meses)
   e desnecessária quando o 404 é honesto.

### 28.2 Dados que ainda dependem de decisão ou de leitura

| # | Pendência | Bloqueia |
|---|---|---|
| **E-3** | `canonical_url` externo / no domínio antigo | **Validação do conteúdo do sitemap** (não o código) |
| **E-12** | Semântica de `updatedAt` | `dateModified` (P1-5) e `<lastmod>` definitivo |
| **D-1** | `/copa-do-mundo` (86 artigos): 200 indexável — confirmado? | §13.3; o default está escrito, a decisão é humana |
| **D-2** | Classe 3 no sp011: manter 200, cadastrar no menu, ou 301? | §13.2; o default (manter 200) não perde nada |
| **D-3** | Destino de `tebol`, `copa-do-mndo`, `otros` | P1-8 (higiene), **fora deste PRD** |
| **D-4** | `Applebot` e `W3C_Validator` saem do plugin? | §12.1 — recomendado, não medido |

### 28.3 Por que a release é atômica (com números)

O sitemap atual publica 14 URLs. Depois das Etapas 1-6 **sem** a Etapa 7:

| URL do sitemap | Status |
|---|---|
| `/` | 200 |
| `/politica`, `/cidade`, `/seguranca`, `/transporte`, `/saude`, `/educacao`, `/cultura`, `/esportes`, `/brasil`, `/mundo`, `/colunas` | **404** (11 URLs — nenhuma tem artigo no Oley) |
| `/arquivo`, `/contato` | 200 |

**11 de 14 URLs (79%) do sitemap responderiam 404**, anunciadas ao Google durante
a janela entre deploys. E o custo de juntar é baixo: a Etapa 7 é **Impacto alto +
esforço baixo** (trocar um stub por uma query já escrita em `sitemap-news.ts`).

> **Uma mesma release deve mudar a verdade das URLs e o sitemap que publica essa
> verdade.**

---

## 29. Edge cases

| # | Caso | Tratamento |
|---|---|---|
| X-1 | Artigo com `slug` vazio, pedido pelo UUID | Sem 301 — a URL canônica **é** o UUID. **0 casos hoje** |
| X-2 | Dois artigos com o mesmo slug (sem `UNIQUE`) | `getArticle` devolve um arbitrário; o 301 poderia levar ao slug errado. **0 duplicados em 640 hoje**; mitigação futura no P2-1. O 301 não piora o quadro: a URL do slug já era ambígua |
| X-3 | Artigo despublicado depois de indexado | API responde 404 → **404** na borda, **sem stale** (§17.3). Se voltar, volta a 200 |
| X-4 | Artigo com `canonicalUrl` externo | O SSR já respeita o campo. O 301 leva UUID→slug e a página declara o canonical externo. **Consistente.** O sitemap o **exclui** (§14.1, item 8) |
| X-5 | Slug com acento ou espaço (7 + 1 casos) | `encodeURIComponent` no `Location` e no `fetch`; testes A-9/A-10 garantem ausência de loop por encoding |
| X-6 | `?utm_source=…` | Não entra na decisão; o `Location` do 301 **preserva** a query |
| X-7 | `//` no início do path | `classifySsrPath` já trata como home (`ssrRoutes.ts:31`). Mantido |
| X-8 | `..` ou encoding malicioso em path com extensão | `safeRelative` recusa → **404**, sem tocar filesystem |
| X-9 | Blog recém-instalado (wizard incompleto) | `/api/site` → `503 setup_required` → `unavailable` → stale (não há) → **503 + `Retry-After`**. O visitante vê a página de erro; o `/admin/setup` continua acessível (é rota de página, não depende da API para o shell). **Nunca 404** |
| X-10 | Blog sem `settings.categories` e sem menu | RN-9: cai em `FIXED_CATEGORIES`. Idêntico ao de hoje |
| X-11 | `/contato` cadastrado como editoria | `RESERVED_PATHS` vence (teste S-8) |
| X-12 | `HEAD` numa rota 301 ou 404 | Mesmo status, sem corpo. `isReadRequest` já cobre |
| X-13 | Bot pedindo milhares de URLs inexistentes | Cache de 60 s por path, teto separado de 50 entradas; o `spaHeadPlugin` não consulta banco |
| X-14 | Editoria que ganha o primeiro artigo | Sai de `noindex` em ≤ 60 s (TTL do cache) |
| X-15 | Blog com idioma `en` (ksports) | `/artigo/` é o path real do App, não uma palavra traduzida. Nada muda |
| X-16 | Preview do admin (Home + menu → Templates) | `preview: true` inalterado; nenhum caminho deste PRD passa por lá |
| X-17 | **Deploy novo e chunk antigo pedido por aba aberta** | Passa a responder **404** (antes: HTML 200 com erro de MIME). É o comportamento correto; o cliente recarrega |
| X-18 | **Usuário real no navegador embutido do Instagram** | Continua no `socialOgPlugin` (UA `Instagram`) e chega à matéria pelo `location.replace`. Registrado; avaliação em P2 |
| X-19 | **Requisição não-GET/HEAD em `/artigo/*` com UA de crawler** | `handleCrawler` hoje não checa o método. Acrescentar o guard `isReadRequest` ao plugin (endurecimento gratuito ao passar por ali) |
| X-20 | Host desconhecido chegando ao container | O Caddy roteia por host declarado; a chave de cache inclui o host. Sem impacto |

---

## 30. Definition of Done

### Código

- [ ] `src/lib/crawlerUa.ts` com `isSocialCrawler`; **`Googlebot`, `bingbot` e
      `Applebot` fora** do plugin; UAs sociais preservados.
- [ ] `src/lib/routeDecision.ts` criado, **puro**, sem `IncomingMessage` e sem
      React.
- [ ] `src/lib/staticPath.ts` criado, puro, com recusa de traversal.
- [ ] `src/lib/ssrRoutes.ts` com `static` e `unknown`; **linha 35 (barra final)
      intacta**.
- [ ] `src/lib/categoryRoutes.ts` com `blogCategorySurface()` — **sem** o filtro
      `visible !== false` — e 3º parâmetro retrocompatível.
- [ ] `vite.config.ts`: `fetchJson` tri-estado, `sendHtml(status)`, `serveShell`,
      `applyHead` com `robots`, cache tri-estado com teto de `notFound`,
      `handleSsr` executando a decisão, `staticExistsPlugin` registrado por
      último, `/sitemap.xml` → 301 e `/sitemap_index.xml` → 404.
- [ ] `App.tsx` sem o `FIXED_CATEGORIES.map`; `DynamicCategory` com
      `settings.categories`.
- [ ] `CategoryArchivePage.tsx` / `CategoryPage.tsx`: estado vazio **sem**
      `<Link>`.
- [ ] `Home.tsx`: "Ver mais" validado contra a superfície.
- [ ] `routes/sitemap.ts` lendo o banco, com editorias de settings,
      `Cache-Control` e teto de 50k; stub `getArticles` **apagado**.
- [ ] **Nenhuma regra de negócio dentro do `vite.config.ts`.**
- [ ] **Nenhum literal de marca, domínio ou slug de blog** introduzido (RN-12).

### Testes

- [ ] 21.2, 21.3, 21.4, 21.5, 21.6, 21.7, 21.8 e 21.9 escritos e verdes.
- [ ] **≥ 45 casos novos**; suíte completa verde (baseline: **156**).
- [ ] `pnpm exec tsc -b` limpo; `pnpm run typecheck` limpo nos dois pacotes.
- [ ] Teste 21.11 (falha de infra) executado em ambiente de teste.

### Deploy

- [ ] Um commit por etapa, mensagem em pt-BR, direto na `main`.
- [ ] **Release única**: bump de `BLOG_IMAGE_VERSION` + `build api web`
      **juntos**.
- [ ] **Canário duplo: sp011 primeiro, depois oleysports**, verificados antes
      dos demais.
- [ ] Demais 9 blogs em paralelo.

### Verificação

- [ ] Baseline da Etapa 0 salvo **antes** de qualquer mudança, e **E-3
      respondido** antes de validar o conteúdo do sitemap.
- [ ] Tabela 21.10 verde no OleySports **e** no sp011.
- [ ] §24: os 27 critérios verificados por comando, saída registrada.
- [ ] §25: as 16 não-regressões verificadas; **NR-12 varrendo os 11 domínios**;
      **NR-11 com Sharing Debugger**.
- [ ] `siteName` correto nos 11 domínios.
- [ ] Painel central → Entregas sem `failed`/`dead` novos.

### Documentação

- [ ] `CLAUDE.md` atualizado com as invariantes novas: **buscador e navegador
      recebem o mesmo HTML**; **superfície de editorias por blog com as 4
      classes**; **falha de infra nunca vira 404 (stale → 503)**; **arquivo
      inexistente responde 404**.
- [ ] `docs/PRD-SEO-TECHNICAL-OLEYSPORTS-V2.md` com o P0 marcado como entregue e
      as métricas M-0 a M-7b medidas.
- [ ] GSC: sitemap reenviado; URLs de §15 inspecionadas; acompanhamento de 30
      dias agendado.
