# PRD P0 — OleySports: Resolução de URL e status HTTP (fim do soft-404, do placeholder e da duplicação slug/UUID)

> Documento de implementação. Deriva de `docs/PRD-SEO-TECHNICAL-OLEYSPORTS.md`
> (item **P0-1** do roadmap). Escrito para ser executado por quem **não**
> participou da investigação: todos os paths, funções e linhas estão citados.

---

## 1. Título

Resolução de URL e status HTTP do blog engine — 404 real para o que não existe,
301 de UUID para slug, superfície de editorias por blog, e fim dos blocos mock
que publicam artigos inventados.

---

## 2. Status

`Proposto`

---

## 3. Prioridade

**P0.**

---

## 4. Problema

O blog engine da rede **não tem como responder que uma URL não existe**. Todo
path de página que não seja um asset ou `/api/*` recebe HTTP 200 com o shell da
SPA. Sobre essa base, quatro defeitos se somam e produzem, no OleySports, um
conjunto de URLs indexáveis que não correspondem a conteúdo nenhum:

1. **Soft-404 universal.** `/geral`, `/rota-inventada`, `/artigo/qualquer-coisa`
   → 200.
2. **A rede publica o link `/artigo/__placeholder__`.** O card de estado vazio de
   uma editoria sem artigos é clicável e aponta para um id sintético.
3. **13 editorias do sp011 respondem 200 e vazias em todo blog da rede.** São
   elas que criam as editorias vazias do item 2 no OleySports.
4. **A home publica 5 manchetes falsas de Brasília com 5 links mortos.** O bloco
   "Mais Lidas" é um mock hardcoded, e está `visible: true` no template de
   produção do OleySports.
5. **`/artigo/<uuid>` e `/artigo/<slug>` servem o mesmo artigo com 200**, sem
   redirect.

Os cinco pertencem ao **mesmo subsistema**: a camada que decide, para um path,
*se aquilo existe, qual é a URL canônica daquilo e que status HTTP responder*.
Por isso viram um único PRD — corrigir um sem os outros deixa a cadeia causal
intacta (§6).

**Contexto de urgência.** O OleySports migrou para `oleysports.com.br` em
14/08/2026 (`deploy/README.md`, "Domínio próprio depois"). O índice do domínio
novo está se formando agora. Conteúdo fabricado fora do nicho na primeira dobra
+ páginas sem valor respondendo 200 é o mesmo perfil que rendeu ao `resenhavip`
um flag de "Páginas enganosas" no Search Console (`CLAUDE.md §19.3`).

---

## 5. Evidência

### 5.1 PDF (snapshot público de 13/08/2026)

- **OLEY-01 · ALTA · P0** — "Seis URLs retornaram 200, title padrão, nenhum
  canonical, nenhum H1 e 4 palavras. O placeholder confirmou HTTP 200, title
  padrão, nenhum H1, 65 palavras e OnPage 90,85." URLs citadas: `/arquivo`,
  `/contato`, `/termos`, `/privacidade`, `/geral`, `/artigo/__placeholder__`.
- **OLEY-02 · ALTA · P0** — "quatro pares de artigos com mesmo title/description
  em slug e UUID"; "Title padrão compartilhado por 7 URLs".

### 5.2 Código

| # | Arquivo | Linha | O que prova |
|---|---|---|---|
| E1 | `artifacts/brasilia-agora/vite.config.ts` | 849-890 | `spaHeadPlugin` responde **sempre 200** para qualquer path sem extensão que não seja `/api/*` |
| E2 | `artifacts/brasilia-agora/vite.config.ts` | 817-820 | `handleSsr`: `if (html === null) { next(); return; }` — o SSR recusa e o `spaHeadPlugin` responde 200 |
| E3 | `artifacts/brasilia-agora/vite.config.ts` | 656 | `renderArticle`: artigo inexistente → `return null` |
| E4 | `artifacts/brasilia-agora/vite.config.ts` | 718 | `renderCategory`: slug que não é editoria → `return null` |
| E5 | `artifacts/brasilia-agora/src/pages/CategoryArchivePage.tsx` | 125-134 | `placeholder` com `id: "__placeholder__"`, usado como `featured` quando a editoria está vazia |
| E6 | `artifacts/brasilia-agora/src/components/CategoryPage.tsx` | 75-77 | O card destacado é `<Link href={/artigo/${art.slug \|\| art.id}}>` — o placeholder vira link |
| E7 | `artifacts/brasilia-agora/src/lib/categoryRoutes.ts` | 30-44, 88-92 | `FIXED_CATEGORIES` (13 editorias do sp011) resolvida **antes** do menu do portal |
| E8 | `artifacts/brasilia-agora/src/App.tsx` | 322-326 | As 13 rotas fixas são criadas no cliente, sem consultar o blog |
| E9 | `artifacts/api-server/src/lib/articleService.ts` | 271-278 | `getArticle`: `or(eq(id, x), eq(slug, x))` — uma rota, dois identificadores |
| E10 | `artifacts/brasilia-agora/src/components/MostRead.tsx` | 8-14, 26 | 5 manchetes hardcoded de Brasília + `<Link href={/artigo/${item.id}}>` |
| E11 | `artifacts/brasilia-agora/src/pages/Home.tsx` | 710, 712 | `if (block.id === "mais-lidas") return <MostRead />;` e `"ultimas" → <DestaquesListaBadge />` |
| E12 | `deploy/oleysports/template_final.sql` | bloco `order: 1` | `{"id":"mais-lidas","name":"Mais Lidas","visible":true}` |
| E13 | `artifacts/brasilia-agora/src/pages/Home.tsx` | 533, 653 | `const cat = block.category ?? "geral"` → `href = "/geral"`; 3 blocos visíveis do Oley não têm categoria |
| E14 | `artifacts/brasilia-agora/index.html` | 129 | O `<body>` do shell é literalmente `<div id="root"></div>` — 0 palavras, 0 H1 |
| E15 | grep global | — | Nenhum `noindex` no frontend do blog |

### 5.3 Comportamento validado localmente (19/08/2026)

Simulação com o menu real do OleySports (extraído de
`deploy/oleysports/template_final.sql`) sobre as funções puras `classifySsrPath`
(`src/lib/ssrRoutes.ts`) e `resolveCategoryRoute` (`src/lib/categoryRoutes.ts`):

```
path                         | classifySsrPath | resolveCategoryRoute | destino final
/                            | home            | -                    | SSR home 200
/futebol                     | category        | futebol              | SSR editoria 200
/copa-do-mundo               | category        | copa-do-mundo        | SSR editoria 200
/geral                       | category        | -                    | SPA fallback 200 (soft-404)
/politica                    | category        | politica             | SSR editoria 200  <-- editoria do sp011
/esportes                    | category        | esportes             | SSR editoria 200  <-- editoria do sp011
/arquivo                     | -               | -                    | SPA fallback 200
/contato                     | -               | -                    | SPA fallback 200
/artigo/__placeholder__      | article         | -                    | SSR se existir; senao SPA 200
/artigo/pol-2                | article         | -                    | SSR se existir; senao SPA 200
/rota-que-nao-existe         | category        | -                    | SPA fallback 200 (soft-404)
```

**Não validado localmente:** o HTML efetivamente servido. `vite build` não roda
no Windows (`CLAUDE.md §14`), então nenhuma resposta HTTP foi observada nesta
máquina. O baseline em produção é a Etapa 0 (§25).

### 5.4 Testes existentes

`src/lib/ssrRoutes.test.ts`, `src/lib/categoryRoutes.test.ts` e
`src/lib/homeBlocks.test.ts`: **43 testes, 43 passando** (19/08/2026). Typecheck
limpo em `api-server` e `brasilia-agora`. **Nenhum** teste cobre status HTTP,
`<head>` servido ou sitemap.

---

## 6. Root cause

Não são cinco bugs independentes. É **uma decisão arquitetural com quatro
consequências**, mais um resíduo de scaffold.

### 6.1 A causa técnica

O frontend de produção é `vite preview` + plugins. O último plugin da cadeia,
`spaHeadPlugin`, foi escrito para resolver um problema **de marca** — servir o
`<head>` do blog certo numa imagem Docker compartilhada (comentário em
`vite.config.ts:838-848`). Ele assumiu, corretamente para aquele objetivo, que
*toda rota de página deve receber o shell*. O que nunca foi adicionado é a
pergunta anterior: **esta página existe?**

Como consequência, o sistema tem **um vocabulário de resposta de apenas um
elemento**: 200. Não há 404, não há 301, não há `noindex`. Todos os "achados de
índice" do PDF são derivações disso.

### 6.2 A cadeia causal completa

```
FIXED_CATEGORIES (13 editorias do sp011, tabela fixa na imagem compartilhada)
        │  resolveCategoryRoute consulta a tabela ANTES do menu do blog
        ▼
/politica, /cidade, /economia … resolvem no OleySports  →  SSR 200
        │  a editoria não tem artigo nenhum no blog de esporte
        ▼
CategoryArchivePage monta `placeholder` com id "__placeholder__"
        │  CategoryPage renderiza o card destacado dentro de um <Link>
        ▼
HTML servido publica <a href="/artigo/__placeholder__">
        │  o crawler segue o link
        ▼
renderArticle não encontra o artigo → return null → next()
        ▼
spaHeadPlugin → HTTP 200 + shell vazio        ←── o soft-404 do PDF
```

E, em paralelo, duas fontes independentes de URL inválida:

```
MostRead.tsx (mock)  →  5 <Link href="/artigo/{pol-2,df-3,sau-1,df-4,tec-4}">  →  200
bloco sem categoria  →  href="/geral"  →  não é editoria do Oley  →  200
```

E a duplicação:

```
getArticle(x) = WHERE id = x OR slug = x     (sem redirect)
        ▼
/artigo/<uuid>  e  /artigo/<slug>  →  ambos 200, mesmo conteúdo
        │  o canonical do SSR já aponta para o slug (atenuação existente)
        ▼
2 URLs indexáveis por artigo; consolidação depende do canonical ser respeitado
```

### 6.3 Por que um PRD só

Os cinco itens compartilham a mesma pergunta ("o que existe nesta URL, e qual é a
sua forma canônica") e o mesmo ponto de implementação (a cadeia
`ssrPlugin` → `spaHeadPlugin` + a resolução de editoria em `categoryRoutes.ts`).
Corrigir só o placeholder deixa `/geral` e `/politica` de pé. Corrigir só o 404
deixa a rede publicando links para URLs que agora dão 404 — troca soft-404 por
hard-404 **linkado internamente**, que é pior no Search Console. A ordem interna
das etapas (§25) reflete isso: **primeiro parar de publicar links inválidos,
depois passar a responder o status correto.**

---

## 7. Comportamento atual

| # | Requisição | Resposta hoje |
|---|---|---|
| A1 | `GET /artigo/<slug-existente>` | 200, SSR completo, canonical = slug |
| A2 | `GET /artigo/<uuid-do-mesmo-artigo>` | **200**, SSR completo, canonical = slug |
| A3 | `GET /artigo/nao-existe` | **200**, shell SPA, sem canonical, sem H1 |
| A4 | `GET /artigo/__placeholder__` | **200**, shell SPA |
| A5 | `GET /futebol` (com artigos) | 200, SSR, H1, canonical |
| A6 | `GET /tenis` (editoria do blog, sem artigos) | 200, SSR, H1, **link para `/artigo/__placeholder__`** |
| A7 | `GET /politica` (editoria de OUTRO blog) | 200, SSR, H1 `POLÍTICA`, **link para `/artigo/__placeholder__`** |
| A8 | `GET /geral` | **200**, shell SPA |
| A9 | `GET /rota-inventada` | **200**, shell SPA |
| A10 | `GET /caminho/de/dois/segmentos` | **200**, shell SPA |
| A11 | `GET /contato` | 200, shell SPA (página real, mas invisível sem JS) |
| A12 | `GET /futebol/` (barra final) | **200**, shell SPA (duplicata de A5) |
| A13 | Home | Bloco "Mais Lidas" com 5 manchetes falsas de Brasília e 5 links mortos |
| A14 | Qualquer 404 no cliente | `pages/not-found.tsx`: "404 Page Not Found / Did you forget to add the page to the router?" — em inglês, sem header/footer |

---

## 8. Comportamento esperado

| # | Requisição | Resposta alvo |
|---|---|---|
| B1 | `GET /artigo/<slug-existente>` | **200**, SSR completo (inalterado) |
| B2 | `GET /artigo/<uuid-do-mesmo-artigo>` | **301** → `/artigo/<slug>` |
| B3 | `GET /artigo/nao-existe` | **404**, shell com `noindex` |
| B4 | `GET /artigo/__placeholder__` | **404** — e **nenhuma página do site linka para ele** |
| B5 | `GET /futebol` (com artigos) | **200**, SSR (inalterado) |
| B6 | `GET /tenis` (editoria do blog, sem artigos) | **200**, SSR, `noindex`, estado vazio **sem link** |
| B7 | `GET /politica` (editoria de outro blog, 0 artigos) | **404** |
| B7b | `GET /esportes` (editoria de outro blog, **com** artigos legados) | **200** + `noindex` (compatibilidade com URL histórica) |
| B8 | `GET /geral` | **404** — e nenhum bloco da home linka para lá |
| B9 | `GET /rota-inventada` | **404** |
| B10 | `GET /caminho/de/dois/segmentos` | **404** |
| B11 | `GET /contato` | **200** (allowlist explícita; SSR fica para o P1-2) |
| B12 | `GET /futebol/` | **301** → `/futebol` |
| B13 | Home | Bloco "Mais Lidas" com as notícias **reais** mais lidas do próprio blog |
| B14 | Qualquer 404 | Status 404 do servidor; o visual da página fica para o P1-6 |
| B15 | **API do blog fora do ar / 5xx** | **200** com shell (degradação atual). **Nunca 404 por falha de infraestrutura.** |

---

## 9. Escopo

1. **Vocabulário de resposta.** Introduzir `404`, `301` e `noindex` na cadeia de
   middlewares do frontend (`ssrPlugin` + `spaHeadPlugin`).
2. **Superfície de editorias por blog.** `resolveCategoryRoute` passa a derivar a
   lista de editorias de `settings.categories` → `menuItems` → (só então)
   `FIXED_CATEGORIES`, e a rota fica válida quando a editoria é declarada **ou**
   tem pelo menos um artigo publicado.
3. **Canonicalização de artigo.** `301` de `/artigo/<uuid>` para
   `/artigo/<slug>` quando o artigo tem slug e o identificador pedido não é ele.
4. **Estado vazio de editoria deixa de ser link.** O placeholder vira card
   estático (não `<Link>`), e a página recebe `noindex`.
5. **Blocos mock saem do renderizador.** `mais-lidas` e `ultimas` passam a usar
   os blocos reais; `MostRead.tsx`, `DestaquesListaBadge.tsx` e os cinco
   componentes mock órfãos são removidos.
6. **`href` de bloco sem categoria.** Bloco cuja fonte é `latest`/`most_read` ou
   que não tem categoria **não** renderiza "Ver mais" apontando para `/geral`.
7. **Normalização de barra final** (`/futebol/` → 301 `/futebol`).
8. **Testes** cobrindo status HTTP por rota, redirect e superfície de editorias.

---

## 10. Fora de escopo

Explicitamente **não** entram neste PRD (cada um tem seu item no roadmap geral):

- **Sitemap** (P0-2 · F-01). O sitemap é a *publicação* da verdade que este PRD
  estabelece; vai no deploy seguinte, por dependência (§36).
- **SSR das páginas institucionais** (P1-2 · F-08). Aqui elas só ganham
  allowlist e 200 garantido.
- **Redesenho visual da página 404** (P1-6 · F-17). Aqui muda o **status**; o
  visual continua o scaffold até o P1-6.
- **Metadata/description por rota** (P1-1 · F-06).
- **JSON-LD de home e coleção** (P1-4 · F-07).
- **Breadcrumb / `lib/categoryRoute.ts`** (P1-3 · F-15). Arquivo diferente,
  mudança independente — não tocar aqui para não misturar diffs.
- **`UNIQUE` em `articles.slug`** (P2-1 · F-16).
- **`PREDEFINED_DEFAULTS` com categorias do sp011** (`Home.tsx:629-643`): é a
  mesma classe de problema do F-04, mas os blocos afetados (`brasil`, `mundo`,
  `esporte`, `cultura`, `df`, `saude`, `tecnologia`) estão `visible: false` no
  template do OleySports. Registrar e tratar depois.
- **Peso de DOM, imagens, Core Web Vitals.**
- **Qualquer mudança em `Caddyfile`, compose ou infraestrutura.**
- **Qualquer correção derivada de findings exclusivos do BeeSports.**

---

## 11. Arquitetura envolvida

### 11.1 Fluxo atual

```
request
  │
  ├─ Caddy (blog)                     headers de segurança, gzip/zstd
  │     ├─ /api/*  → oleysports-api:8080  (Express)
  │     └─ resto   → oleysports-web:3000  (vite preview)
  │
  └─ vite preview · middlewares em ordem (vite.config.ts:1089-1093)
       │
       ├─ staticCachePlugin      /assets/*, /fonts/*  → cache imutável
       ├─ socialOgPlugin         crawler social em /artigo/* → HTML de OG
       ├─ seoTextPlugin          /robots.txt, /llms.txt
       ├─ ssrPlugin  ────────────► classifySsrPath(path)
       │     │                       ├─ home     → renderHome()
       │     │                       ├─ article  → renderArticle()  ── fetch /api/articles/:id
       │     │                       ├─ category → renderCategory() ── fetch /api/site + /api/articles
       │     │                       └─ null     → next()
       │     └─ render === null  → next()                    ◄── AQUI NASCE O SOFT-404
       │
       ├─ spaHeadPlugin          qualquer path sem extensão → index.html + <head> do blog, 200
       └─ estático (sirv)
```

### 11.2 Fluxo alvo

```
request
  └─ ssrPlugin
       │
       ├─ classifyPagePath(path)  ─────────────────────────────── (puro, testável)
       │     ├─ "asset" | "api" | "admin"        → next()            200 (inalterado)
       │     ├─ "trailing-slash"                 → 301 path sem barra
       │     ├─ "home"                           → renderHome()       200
       │     ├─ "static" (allowlist)             → next()             200
       │     ├─ "article"  ── resolveArticle() ──┬─ found + slug≠pedido → 301 /artigo/<slug>
       │     │                                   ├─ found + slug=pedido → 200 SSR
       │     │                                   ├─ notFound            → 404
       │     │                                   └─ apiDown             → next() 200  (B15)
       │     ├─ "category" ── resolveCategory() ─┬─ declarada + tem artigo → 200 SSR
       │     │                                   ├─ declarada + vazia      → 200 SSR + noindex
       │     │                                   ├─ não declarada + tem artigo → 200 SSR + noindex
       │     │                                   ├─ não declarada + vazia  → 404
       │     │                                   └─ apiDown                → next() 200  (B15)
       │     └─ "unknown"                        → 404
       │
       └─ spaHeadPlugin  ── recebe o status da decisão (200 ou 404) e injeta
                            <meta name="robots" content="noindex"> quando 404
```

**Princípio de projeto:** toda a decisão vira uma função **pura** em
`src/lib/`, no mesmo padrão de `classifySsrPath` — que já existe justamente
porque *"um falso positivo aqui não é lentidão, é o painel vazando para o HTML
público"* (`ssrRoutes.ts:5-7`). O middleware só executa a decisão.

---

## 12. Arquivos afetados

### Novos

| Path | Conteúdo |
|---|---|
| `artifacts/brasilia-agora/src/lib/routeDecision.ts` | `classifyPagePath()`, `decideArticle()`, `decideCategory()` — puras, sem `IncomingMessage`, sem React |
| `artifacts/brasilia-agora/src/lib/routeDecision.test.ts` | Tabela de casos de §27 |

### Modificados

| Path | Linhas de referência | Mudança |
|---|---|---|
| `artifacts/brasilia-agora/vite.config.ts` | 430-461, 463-846, 849-890 | `sendHtml` ganha `status`; `handleSsr` passa a executar a decisão; `fetchJson` passa a distinguir 404 de falha de rede; cache de HTML passa a guardar também `redirect`/`notFound`; `spaHeadPlugin` aceita status e injeta `noindex` |
| `artifacts/brasilia-agora/src/lib/ssrRoutes.ts` | 1-44 | Novos `kind`s (`static`, `unknown`, `trailing-slash`); `null` passa a significar só "não é rota de página" |
| `artifacts/brasilia-agora/src/lib/ssrRoutes.test.ts` | — | Estender para os novos `kind`s |
| `artifacts/brasilia-agora/src/lib/categoryRoutes.ts` | 30-107 | `resolveCategoryRoute` ganha 3º parâmetro `categories`; nova precedência; nova função `blogCategorySurface()` |
| `artifacts/brasilia-agora/src/lib/categoryRoutes.test.ts` | — | Casos de precedência |
| `artifacts/brasilia-agora/src/App.tsx` | 322-326 | Remover o `FIXED_CATEGORIES.map` e deixar `/:slug` → `DynamicCategory` resolver tudo |
| `artifacts/brasilia-agora/src/App.tsx` | 128-141 | `DynamicCategory` passa `settings.categories` para o `resolveCategoryRoute` |
| `artifacts/brasilia-agora/src/pages/CategoryArchivePage.tsx` | 125-134 | Placeholder deixa de ser tratado como artigo; expor `isEmpty` para o `CategoryPage` |
| `artifacts/brasilia-agora/src/components/CategoryPage.tsx` | 68-110 | Estado vazio renderiza card **sem** `<Link>` |
| `artifacts/brasilia-agora/src/pages/Home.tsx` | 710, 712 | `mais-lidas` e `ultimas` passam a usar `ConfigurableBlock` |
| `artifacts/brasilia-agora/src/pages/Home.tsx` | 529-534, 651-657 | `href` de "Ver mais" fica `undefined` quando o bloco não tem categoria |
| `artifacts/brasilia-agora/src/hooks/useSite.ts` | — | Garantir que `categories` chega tipado ao `settings` do cliente (o `/api/site` já publica) |

### Removidos

| Path | Justificativa |
|---|---|
| `artifacts/brasilia-agora/src/components/MostRead.tsx` | Mock (F-14) |
| `artifacts/brasilia-agora/src/components/DestaquesListaBadge.tsx` | Mock (F-14) |
| `artifacts/brasilia-agora/src/components/MaisLidasSection.tsx` | Mock órfão — nenhuma referência no repositório |
| `artifacts/brasilia-agora/src/components/DestaquesSection.tsx` | idem |
| `artifacts/brasilia-agora/src/components/EsportesSection.tsx` | idem |
| `artifacts/brasilia-agora/src/components/SegurancaSection.tsx` | idem |
| `artifacts/brasilia-agora/src/components/DestaquesListaGrande.tsx` | idem |

> **Atenção aos assets.** Os mocks importam `src/assets/images/*.webp`
> (`hero`, `traffic`, `hospital`, `bus`, `students`, `police`, `festival`,
> `brasil`, `politica_feat`). Vários **ainda são usados** por `HeroSection.tsx`
> como `FALLBACK_IMGS` (`HeroSection.tsx:59`). **Não apagar os assets** neste
> PRD — só os componentes.

### Não tocados (importante)

`artifacts/api-server/**` — este PRD **não muda o backend**. `getArticle`
continua aceitando id ou slug (é o que permite o 301 funcionar sem quebrar link
histórico). O `/api/articles/:id` já responde 404 corretamente
(`routes/articles.ts:107-110`) e é essa resposta que o middleware passa a
respeitar.

---

## 13. Alterações propostas

### 13.1 `src/lib/ssrRoutes.ts` — vocabulário de rota

```ts
export type SsrRouteKind =
  | "home"
  | "article"
  | "category"
  | "static"          // institucional em allowlist: existe, 200, sem SSR (por ora)
  | "trailing-slash"  // duplicata: 301 para o path sem a barra
  | "unknown";        // rota de página que não corresponde a nada: 404

/** Institucionais que EXISTEM e são servidas pela SPA. Espelha as rotas
 *  declaradas em App.tsx e o RESERVED_PATHS de categoryRoutes.ts. */
export const STATIC_PAGE_PATHS: ReadonlySet<string> = new Set([
  "/arquivo", "/contato", "/privacidade", "/termos",
]);
```

`classifySsrPath` passa a devolver `null` **apenas** para o que não é rota de
página (`/api/*`, `/admin*`, path com extensão). Tudo o mais recebe um `kind`.

### 13.2 `src/lib/categoryRoutes.ts` — superfície de editorias do blog

```ts
/** Uma editoria cadastrada no painel (settings.categories). */
export interface CategoryLike {
  slug: string;
  name?: string;
  visible?: boolean;
  color?: string;
}

/**
 * A superfície de editorias DESTE blog: o que ele declara existir.
 * Ordem de autoridade:
 *   1. settings.categories (cadastro do painel → Categorias)
 *   2. menuItems internos e visíveis (achatados 1 nível)
 *   3. FIXED_CATEGORIES — SOMENTE quando 1 e 2 não produzem nada
 *
 * O passo 3 é a rede de segurança do blog que nunca cadastrou taxonomia
 * (o sp011 nasceu assim). Ele NÃO é mais um fallback por path: se o blog
 * declara qualquer editoria, a lista dele é a lista inteira.
 */
export function blogCategorySurface(
  menuItems: readonly MenuItemLike[] | undefined,
  categories: readonly CategoryLike[] | undefined,
): CategoryRoute[]
```

`resolveCategoryRoute(pathOnly, menuItems, categories?)` passa a consultar
`blogCategorySurface`. Assinatura **retrocompatível**: sem o 3º parâmetro o
comportamento é o de hoje, então nenhum chamador quebra no typecheck enquanto a
migração acontece.

### 13.3 `src/lib/routeDecision.ts` (novo) — a decisão

```ts
export type PageDecision =
  | { status: 200; kind: "home" | "article" | "category" | "static"; noindex?: boolean }
  | { status: 301; location: string }
  | { status: 404 }
  | { status: 200; kind: "passthrough" };   // API fora → degradação (B15)

/** Artigo: o dado vem de GET /api/articles/:id, já resolvido pelo middleware. */
export function decideArticle(
  requested: string,
  lookup:
    | { ok: true; slug: string | null; id: string }
    | { ok: false; reason: "not_found" }
    | { ok: false; reason: "unavailable" },
): PageDecision {
  if (!lookup.ok) {
    return lookup.reason === "not_found" ? { status: 404 } : { status: 200, kind: "passthrough" };
  }
  const canonical = lookup.slug && lookup.slug.trim() ? lookup.slug : lookup.id;
  if (canonical !== requested) {
    return { status: 301, location: `/artigo/${encodeURIComponent(canonical)}` };
  }
  return { status: 200, kind: "article" };
}

/** Editoria: `declared` sai de blogCategorySurface; `articleCount` do /api/articles. */
export function decideCategory(
  declared: boolean,
  lookup: { ok: true; total: number } | { ok: false; reason: "unavailable" },
): PageDecision {
  if (!lookup.ok) return { status: 200, kind: "passthrough" };
  if (declared)          return { status: 200, kind: "category", noindex: lookup.total === 0 };
  if (lookup.total > 0)  return { status: 200, kind: "category", noindex: true };
  return { status: 404 };
}
```

### 13.4 `vite.config.ts` — executar a decisão

**a) `fetchJson` passa a distinguir "não existe" de "não deu para saber".**

```ts
type Fetched<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "unavailable" };

async function fetchJson<T>(u: string): Promise<Fetched<T>> {
  try {
    const r = await fetch(u);
    if (r.status === 404) return { ok: false, reason: "not_found" };
    if (!r.ok)            return { ok: false, reason: "unavailable" };
    return { ok: true, data: (await r.json()) as T };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
```

> **Esta é a mudança mais delicada do PRD.** Hoje `fetchJson` devolve `null` nos
> dois casos, e é por isso que o sistema não pode distinguir "artigo não existe"
> de "a `api` do blog caiu". Sem esta distinção, um restart da `api` durante um
> rastreamento faria o site devolver 404 para o acervo inteiro.

**b) `sendHtml` ganha status.**

```ts
function sendHtml(res: ServerResponse, html: string, cacheControl: string, status = 200): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", cacheControl);
  res.setHeader("Content-Length", String(Buffer.byteLength(html)));
  res.end(html);
}
```

**c) `noindex` no `<head>`.** `applyHead` (`vite.config.ts:156-188`) já é o funil
de **todo** HTML servido. Acrescentar:

```ts
// O template traz <meta name="robots" content="index, follow">.
// Página que não deve ser indexada reescreve o valor no MESMO lugar —
// nunca acrescenta uma segunda tag robots (duas tags = comportamento indefinido).
.replace(/(<meta name="robots" content=")[^"]*(")/, `$1${f.robots ?? "index, follow"}$2`)
```

**d) `handleSsr` vira o roteador.** Estrutura alvo (pseudocódigo fiel):

```ts
const route = isReadRequest(req) ? classifySsrPath(pathOnly) : null;
if (!route) { next(); return; }

if (route.kind === "trailing-slash") {
  res.statusCode = 301;
  res.setHeader("Location", route.canonicalPath);
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.end();
  return;
}
if (route.kind === "static") { next(); return; }          // spaHeadPlugin, 200
if (route.kind === "unknown") { serveShell(req, res, 404); return; }

const cached = cacheLookup(cacheKey);                      // agora tri-estado
if (cached) { replay(cached); if (cached.stale) revalidate(...); return; }

const outcome = await renderRoute(route, pathOnly, origin); // { decision, html? }
switch (outcome.decision.status) {
  case 301: res.statusCode = 301; res.setHeader("Location", outcome.decision.location); res.end(); break;
  case 404: serveShell(req, res, 404); break;
  default:  outcome.html ? sendHtml(res, outcome.html, cacheControl) : next();
}
cacheSet(cacheKey, outcome, ttl);
```

**e) `spaHeadPlugin` aceita status.** Extrair o corpo de `handleSpaRoute` numa
função `serveShell(req, res, status)` exportada dentro do módulo, para que o
`ssrPlugin` a use ao responder 404 com o `<head>` do blog certo + `noindex`.

**f) Cache de HTML tri-estado.** A entrada passa a ser
`{ kind: "html" | "redirect" | "notFound", html?, location?, at, ttl }`. TTL do
`notFound` e do `redirect`: **60 s** (o mesmo `PAGE_TTL_MS`) — curto o bastante
para um artigo publicado agora aparecer rápido, longo o bastante para um bot não
martelar a `api`. `revalidate()` (`vite.config.ts:771-790`) passa a lidar com os
três casos em vez de só `null → delete`.

### 13.5 `App.tsx` — o cliente concorda com o servidor

```diff
-        {FIXED_CATEGORIES.map((c) => (
-          <Route key={c.path} path={c.path}>
-            <CategoryPage category={c.label} slug={c.slug} color={c.color} />
-          </Route>
-        ))}
         <Route path="/artigo/:slug" component={ArtigoPage} />
         <Route path="/arquivo" component={Archive} />
         ...
         <Route path="/:slug"><DynamicCategory Page={CategoryPage} /></Route>
```

`DynamicCategory` passa a chamar
`resolveCategoryRoute(/${slug}, settings?.menuItems, settings?.categories)`.

> **Por que remover as rotas fixas:** hoje o servidor pode responder 404 para
> `/politica` e o cliente, ao hidratar, ainda renderizaria a página de editoria —
> servidor e cliente discordando sobre o que existe. `categoryRoutes.ts` é a
> fonte única exatamente para impedir isso (`categoryRoutes.ts:3-12`).

### 13.6 Estado vazio da editoria sem link

`CategoryArchivePage.tsx`: em vez de fabricar um artigo, passar
`emptyMessage={t("category.empty")}` para o `CategoryPage`, que renderiza um
bloco estático quando `articles.length === 0` e `!loading`. O tipo
`CategoryPageProps.featuredArticle` passa a ser opcional.

### 13.7 Blocos mock fora

```diff
   if (block.id === "hero")       return <HeroSection variant={block.layout} />;
-  if (block.id === "mais-lidas") return <MostRead />;
+  if (block.id === "mais-lidas")
+    return <ConfigurableBlock block={{ ...block, source: "most_read", layout: block.layout ?? "compact" }}
+                              getArticles={getArticles} preview={preview} />;
   if (block.id === "colunistas") return <Suspense fallback={null}><ColumnistsSection limit={4} /></Suspense>;
-  if (block.id === "ultimas")    return <DestaquesListaBadge />;
+  if (block.id === "ultimas")
+    return <ConfigurableBlock block={{ ...block, source: "latest", layout: block.layout ?? "lista" }}
+                              getArticles={getArticles} preview={preview} />;
```

`ConfigurableBlock` já devolve `null` quando não há artigos (`Home.tsx:665`) —
blog vazio deixa de exibir o bloco, em vez de exibir manchetes falsas.

### 13.8 "Ver mais" sem categoria

```diff
-  const href = `/${cat}`;
+  // Bloco de "últimas"/"mais lidas" (ou sem categoria) não tem página de
+  // destino: o "/geral" que saía daqui era uma rota que não existe em blog
+  // nenhum da rede.
+  const hasCategory = block.source !== "latest" && block.source !== "most_read" && !!block.category;
+  const href = hasCategory ? `/${block.category}` : undefined;
```

Os componentes `SectionBlock*` e `SectionHeaderClassic` passam a não renderizar
o "Ver mais" quando `href` é `undefined` — o `SectionBlockMini`
(`Home.tsx:529-531`) e o `ZoneSectionHeader` já tratam `href` opcional; os
demais precisam do mesmo guard.

---

## 14. Regras de negócio

| # | Regra | Justificativa |
|---|---|---|
| RN-1 | **Falha de infraestrutura nunca vira 404.** Só um `404` explícito da `api` do blog autoriza um `404` na borda. Timeout, 5xx, `503 db_unavailable` e `ECONNREFUSED` → 200 com shell. | O `app.ts:171-186` responde `503` quando o banco não hidratou; um restart não pode desindexar o acervo. |
| RN-2 | **Uma editoria existe se o blog a declara OU se ela tem conteúdo.** Declarada = `settings.categories` ∪ `menuItems` internos visíveis. | Protege URL histórica (blog que mudou de taxonomia) sem manter viva a editoria de outro portal. |
| RN-3 | **Editoria declarada porém vazia responde 200 + `noindex`**, não 404. | Ela existe no menu; devolver 404 numa rota linkada pelo próprio cabeçalho é pior que uma página vazia fora do índice. |
| RN-4 | **A URL canônica de um artigo é `/artigo/<slug>`**; quando `slug` é nulo/vazio, é `/artigo/<id>`. Um só valor, calculado num só lugar. | Já é o que o canonical do SSR faz (`vite.config.ts:669`); o 301 apenas passa a impor. |
| RN-5 | **O identificador antigo nunca deixa de resolver.** UUID continua aceito pelo backend; muda de 200 para 301. | Link externo/histórico não pode quebrar (§23). |
| RN-6 | **Nenhuma página do site publica link para URL que responderia 404.** | Link interno para 404 aparece no GSC como erro de rastreamento — trocar soft-404 por hard-404 linkado seria piorar. |
| RN-7 | **`noindex` sempre reescreve a tag `robots` existente**, nunca acrescenta uma segunda. | Duas tags `robots` no mesmo documento têm resolução indefinida entre buscadores. |
| RN-8 | **`FIXED_CATEGORIES` só entra quando o blog não declara nada.** | O sp011 (blog-mãe, taxonomia deliberadamente vazia — `CLAUDE.md §10`) depende dela. Remover a tabela derruba o sp011. |
| RN-9 | **O cliente e o servidor usam a MESMA função** para decidir o que é editoria. | Invariante já registrada em `categoryRoutes.ts:3-12`; discordância = hidratação quebrada. |

---

## 15. Regras de URL

| Padrão | Existe? | Status | Canônica |
|---|---|---|---|
| `/` | sim | 200 | `/` |
| `/artigo/<slug>` | se o artigo existe | 200 | ela mesma |
| `/artigo/<uuid>` | se o artigo existe | 301 | `/artigo/<slug>` |
| `/artigo/<uuid>` de artigo **sem** slug | sim | 200 | ela mesma |
| `/artigo/<qualquer-outro>` | não | 404 | — |
| `/<editoria-declarada>` | sim | 200 (+`noindex` se vazia) | ela mesma |
| `/<editoria-não-declarada-com-artigos>` | histórica | 200 + `noindex` | ela mesma |
| `/<editoria-não-declarada-vazia>` | não | 404 | — |
| `/arquivo`, `/contato`, `/privacidade`, `/termos` | sim | 200 | ela mesma |
| `/admin/**` | sim | 200 | — (`Disallow` no robots) |
| `/<path>/` (barra final) | duplicata | 301 | `/<path>` |
| `/a/b`, `/a/b/c` | não | 404 | — |
| `/*.ext` | asset | inalterado | — |
| `/api/**` | API | inalterado | — |

**Não muda:** nenhum path de URL existente é renomeado. O PRD altera **status**,
não **forma**, com a única exceção do 301 de barra final.

---

## 16. Regras HTTP

| Status | Quando | Cache-Control | Corpo |
|---|---|---|---|
| **200** | rota existe | `public, max-age=30/60, stale-while-revalidate=…` (inalterado) | SSR ou shell |
| **200 + `noindex`** | editoria que existe mas não deve ser indexada (RN-3, B7b) | idem | SSR |
| **301** | `/artigo/<uuid>` → slug; barra final | `public, max-age=3600` | vazio, `Location:` absoluto-relativo (`/artigo/…`) |
| **404** | rota de página que não corresponde a nada | `public, max-age=60` | shell com `<head>` do blog + `noindex` |
| **passthrough 200** | API do blog indisponível (RN-1) | `no-cache, must-revalidate` | shell |

**410 não é usado.** O PDF sugere "404/410"; `410 Gone` afirma remoção
permanente e definitiva, o que não é verdade para `/politica` num blog que pode
cadastrar essa editoria amanhã, nem para um artigo despublicado que pode voltar.
`404` é o status correto e reversível.

**`HEAD`** segue o mesmo caminho de `GET` (`isReadRequest`,
`vite.config.ts:430-433`): mesmo status, mesmos headers, sem corpo.

---

## 17. Canonical

- **Nada muda no que já funciona.** O canonical do artigo continua saindo de
  `vite.config.ts:669,685-687` (slug, ou `article.canonicalUrl` quando externo).
  O canonical da editoria continua `origin + route.path` (`:753`).
- **O que muda é a redundância:** com o 301, o canonical deixa de ser a única
  defesa contra a duplicação UUID/slug — passa a ser confirmação.
- **Página 404 não emite canonical.** Emitir canonical numa página de erro
  convida a indexação.
- **Página com `noindex` mantém o canonical** apontando para ela mesma. Não
  usar `noindex` + `canonical` para outra URL (sinais contraditórios).
- **`spaHeadPlugin` continua sem canonical** nas institucionais neste PRD — isso
  é P1-1, deliberadamente fora de escopo (§10).

---

## 18. Sitemap

Este PRD **não altera** `routes/sitemap.ts` nem `routes/sitemap-news.ts`.
Impactos a registrar para o P0-2:

1. Depois desta entrega, o sitemap geral estará anunciando **11 editorias que
   passarão a responder 404** (`/politica`, `/cidade`, `/seguranca`,
   `/transporte`, `/saude`, `/educacao`, `/cultura`, `/esportes`, `/brasil`,
   `/mundo`, `/colunas`). Isso é **conhecido e aceito por 1 deploy**: hoje elas já
   são páginas vazias sem valor, e o sitemap geral não é a fonte relevante de
   descoberta do OleySports (ele não tem artigo nenhum — F-01).
2. **O P0-2 deve ir no deploy imediatamente seguinte**, e é ele que remove essas
   entradas. Se houver qualquer atraso previsto entre os dois, a mitigação
   mínima é rodar o P0-2 **junto** — o item é pequeno (§36).
3. Quando o P0-2 for implementado, a regra de `<loc>` **tem que ser a mesma
   `canonicalArticlePath` deste PRD** (RN-4). Um sitemap que publicasse UUID
   viraria uma lista de 301.

---

## 19. Google News sitemap

`/api/sitemap-news.xml` já usa `a.slug || a.id` (`sitemap-news.ts:39`) — a mesma
regra da RN-4. **Nenhuma URL dele passa a redirecionar ou a 404 por causa deste
PRD.** Nenhuma alteração necessária.

Verificação obrigatória pós-deploy (§28, DoD): cada `<loc>` do news sitemap
responde **200**, nunca 301 nem 404.

---

## 20. Metadata

| O que | Antes | Depois |
|---|---|---|
| `<title>` / `description` / OG das rotas que existem | inalterado | inalterado |
| `<meta name="robots">` | sempre `index, follow` (vem do `index.html`) | `noindex, follow` em 404 e em editoria não indexável |
| `<link rel="canonical">` | ausente no fallback SPA | ausente (P1-1) — **exceto** que a página 404 explicitamente não deve ter |
| `<head>` da resposta 404 | shell com a marca do blog | idem, + `noindex` |

O `applyHead` (`vite.config.ts:156-188`) continua sendo o funil único de todo
HTML servido — inclusive das respostas 404. É isso que garante que uma página de
erro do OleySports não saia com a marca do blog que buildou a imagem.

---

## 21. Structured data

**Nenhuma mudança.** `NewsArticle` e `BreadcrumbList` continuam saindo de
`pages/Artigo.tsx:525-580`, no HTML SSR.

Um efeito colateral positivo: com o 301, o JSON-LD do artigo deixa de ser
servido em duas URLs distintas, e o `mainEntityOfPage.@id` (`Artigo.tsx:552`)
passa a coincidir sempre com a URL da resposta.

**Não-regressão obrigatória:** a contagem de páginas com schema não pode cair.
Verificar em §29.

---

## 22. Links internos

Três fontes de link inválido são eliminadas:

| Fonte | Linhas | Antes | Depois |
|---|---|---|---|
| Estado vazio da editoria | `CategoryPage.tsx:77` + `CategoryArchivePage.tsx:126` | `<a href="/artigo/__placeholder__">` | bloco estático, sem `<a>` |
| Bloco mock "Mais Lidas" | `MostRead.tsx:26` via `Home.tsx:710` | 5 `<a>` para artigos inexistentes | links reais para artigos do blog |
| "Ver mais" de bloco sem categoria | `Home.tsx:533,653` | `<a href="/geral">` | sem link |

Todos os demais construtores de link já usam `slug || id` (varredura completa em
`pages/`, `components/` e `components/blocks/`) — nenhum deles precisa mudar.

---

## 23. Compatibilidade com URLs existentes

**Nenhuma URL para de funcionar. Nenhuma URL muda de forma.**

| Caso | Antes | Depois | Quebra? |
|---|---|---|---|
| Link externo para `/artigo/<slug>` | 200 | 200 | não |
| Link externo para `/artigo/<uuid>` | 200 | **301** → slug | não (o leitor chega ao mesmo texto) |
| Link externo para `/politica` no OleySports | 200 (página vazia) | **404** | sim, e é o objetivo — a página nunca teve conteúdo |
| Link externo para `/esportes` no OleySports **com** artigos legados | 200 | 200 + `noindex` | não (RN-2) |
| Link do `sitemap-news` | 200 | 200 | não |
| Link do `/api/amp/artigos/<uuid>` | 200 | 200 (backend não muda) | não |
| Link compartilhado em rede social (`socialOgPlugin`) | 200 | 200 | não — o plugin roda **antes** do `ssrPlugin` e continua respondendo primeiro |
| `oleysports.midia.run/artigo/<slug>` | 301 → domínio novo | 301 → domínio novo | não (Caddy, fora deste PRD) |
| Push de artigo da central (`POST /api/ingest`) | 200 | 200 | não — `/api/*` é excluído do middleware (`vite.config.ts:864`) e o Caddy roteia direto para o `api` |

**Cadeia de redirect a evitar:** um visitante que chegue em
`oleysports.midia.run/artigo/<uuid>` fará 301 (Caddy, para o domínio novo) + 301
(este PRD, para o slug) = **dois hops**. Aceitável (o Google segue até 5), mas é
mais uma razão para o P2-5 (limpar `canonical_url` legado) e para monitorar.

---

## 24. Migração

**Não há migração de dados.** Nenhuma alteração de schema, nenhum backfill,
nenhum UPDATE.

O que existe é uma **migração de índice**, que acontece sozinha e deve ser
observada:

1. O Google reprocessa as URLs que passaram a 404 e as remove do índice ao longo
   de semanas. É o resultado desejado.
2. As URLs UUID indexadas consolidam no slug via 301.
3. No GSC, esperar aumento temporário em "Não encontrada (404)" — **é sinal de
   sucesso, não de regressão**, desde que as URLs listadas sejam as de §15 e
   nenhuma delas seja artigo ou editoria real.
4. **Nenhuma ação de remoção manual no GSC.** A ferramenta de remoção é
   temporária (6 meses) e desnecessária quando o 404 é honesto.

---

## 25. Plano de implementação

### Etapa 0 · Baseline em produção (nada muda)

Rodar o bloco de `docs/PRD-SEO-TECHNICAL-OLEYSPORTS.md` §15.2 na VPS e salvar a
saída. Objetivo: provar que repositório e produção concordam antes de mexer.
**Se `/geral` não responder 200, ou o sitemap já tiver artigos, parar e revisar a
análise.**

### Etapa 1 · Parar de publicar links inválidos (sem mudar status nenhum)

Deploy independente, risco quase zero, ganho imediato.

1. `Home.tsx:710,712` → `mais-lidas` e `ultimas` passam a `ConfigurableBlock`
   (§13.7).
2. Remover os 7 componentes mock (§12). **Não remover os assets `.webp`.**
3. `CategoryArchivePage.tsx` + `CategoryPage.tsx` → estado vazio deixa de ser
   link (§13.6).
4. `Home.tsx:529-534,651-657` → "Ver mais" sem categoria fica sem link (§13.8).
5. Testes: estender `homeBlocks.test.ts` para o `href` de bloco sem categoria.

**Aceite da etapa:** `curl -s https://oleysports.com.br/ | grep -c 'Eixão\|Morar
DF\|IDEB'` = **0**; `curl -s https://oleysports.com.br/politica | grep -c
'__placeholder__'` = **0**; `curl -s https://oleysports.com.br/ | grep -c
'href="/geral"'` = **0**.

### Etapa 2 · Superfície de editorias por blog

1. `categoryRoutes.ts` → `CategoryLike`, `blogCategorySurface()`, 3º parâmetro em
   `resolveCategoryRoute` (§13.2).
2. `App.tsx` → remover `FIXED_CATEGORIES.map`; `DynamicCategory` passa
   `settings.categories` (§13.5).
3. `vite.config.ts` → `renderCategory` passa `site.categories` para o
   `resolveCategoryRoute`.
4. Testes de precedência em `categoryRoutes.test.ts`.

**Ainda sem 404** — nesta etapa `/politica` apenas deixa de ser reconhecida como
editoria e passa a cair no fallback SPA (comportamento de hoje para `/geral`).
Separar assim permite validar a superfície **antes** de ligar o status.

**Aceite da etapa:** no OleySports, `/futebol` continua SSR (`grep -c "<h1"` ≥ 1)
e `/politica` deixa de ter H1 no HTML servido. **No sp011 (canário obrigatório),
`/politica` continua SSR** — é a prova da RN-8.

### Etapa 3 · Vocabulário de resposta: `fetchJson` tri-estado + `sendHtml(status)` + `noindex`

1. `fetchJson` (§13.4a) — **a mudança de maior risco**; fazer sozinha, sem
   nenhuma mudança de comportamento visível.
2. `sendHtml` com `status` (§13.4b) e `serveShell(req,res,status)` extraído do
   `spaHeadPlugin` (§13.4e).
3. `applyHead` com `robots` (§13.4c).
4. Cache tri-estado (§13.4f).

**Aceite da etapa:** nenhum status muda; typecheck e testes limpos; site idêntico
ao baseline. É refatoração pura.

### Etapa 4 · Ligar o 404

1. `ssrRoutes.ts` → novos `kind`s + `STATIC_PAGE_PATHS` (§13.1).
2. `routeDecision.ts` novo (§13.3) + testes (§27).
3. `handleSsr` executa a decisão (§13.4d).

**Aceite da etapa:** tabela §27 inteira verde na VPS.

### Etapa 5 · Ligar o 301 de UUID → slug

`decideArticle` já está pronto da Etapa 4; aqui só se ativa o ramo 301 e se
verifica em produção com um artigo real.

**Aceite:** `curl -sI https://oleysports.com.br/artigo/<uuid>` → `301` +
`Location: /artigo/<slug>`; `curl -sI .../artigo/<slug>` → `200`.

### Etapa 6 · Barra final (opcional, dropável)

`classifySsrPath` devolve `trailing-slash` com o path normalizado; `handleSsr`
responde 301. **Se qualquer coisa nas etapas 1-5 escorregar, esta etapa sai** —
ela é a de menor valor do PRD.

### Etapa 7 · Rollout

Procedimento padrão do `CLAUDE.md §6` (bump de `BLOG_IMAGE_VERSION` builda
`api` **e** `web`; o `web` sozinho dispara build implícito do `api`):

```bash
cd /opt/sp011
git pull
V=$(grep -m1 '^BLOG_IMAGE_VERSION=' .env | cut -d= -f2); N="v$((${V#v}+1))"
sed -i "s|^BLOG_IMAGE_VERSION=.*|BLOG_IMAGE_VERSION=$N|" .env
grep '^BLOG_IMAGE_VERSION=' .env
docker compose build api web
docker compose up -d api web
```

**Canário duplo, obrigatório neste PRD:** o `sp011` (que valida a RN-8 — blog sem
taxonomia declarada) **e** o `oleysports` (que valida tudo o mais). Só depois os
demais, em paralelo.

---

## 26. Estratégia de testes

### 26.1 Nível unitário — `node --test` via `tsx`, sem rede e sem banco

Todo o comportamento novo mora em funções puras (`routeDecision.ts`,
`ssrRoutes.ts`, `categoryRoutes.ts`). Isso é deliberado: o middleware do
`vite.config.ts` não é testável, e é justamente por isso que `classifySsrPath` já
foi extraída um dia (`ssrRoutes.ts:5-7`). **Nenhuma regra deste PRD pode nascer
dentro do `vite.config.ts`.**

```
cd artifacts/brasilia-agora
npx tsx --test src/lib/routeDecision.test.ts \
                src/lib/ssrRoutes.test.ts \
                src/lib/categoryRoutes.test.ts \
                src/lib/homeBlocks.test.ts
```

### 26.2 Nível de integração — VPS, `curl`

A tabela de §27 vira um script de shell rodado no canário e no OleySports antes e
depois de cada etapa.

### 26.3 Regressão

```
pnpm exec tsc -b
cd artifacts/api-server      && pnpm run typecheck && npx tsx --test test/*.test.ts
cd artifacts/brasilia-agora  && pnpm run typecheck && npx tsx --test "src/**/*.test.ts"
```

Baseline a superar: 43 testes verdes em `ssrRoutes` + `categoryRoutes` +
`homeBlocks`; typecheck limpo nos dois pacotes (medido em 19/08/2026).

### 26.4 O que NÃO é testável nesta máquina

`vite build` não roda no Windows (`CLAUDE.md §14`). Portanto o HTML servido só é
verificável na VPS. Todo critério de aceite deste PRD que envolva resposta HTTP
está escrito como comando `curl` para rodar lá.

---

## 27. Casos de teste

### 27.1 `decideArticle` (unitário)

| # | `requested` | lookup | Esperado |
|---|---|---|---|
| A-1 | `futebol-x` | ok, slug=`futebol-x`, id=`uuid` | `200 article` |
| A-2 | `uuid` | ok, slug=`futebol-x`, id=`uuid` | `301 /artigo/futebol-x` |
| A-3 | `uuid` | ok, slug=`null`, id=`uuid` | `200 article` |
| A-4 | `uuid` | ok, slug=`""`, id=`uuid` | `200 article` |
| A-5 | `nao-existe` | not_found | `404` |
| A-6 | `__placeholder__` | not_found | `404` |
| A-7 | `pol-2` | not_found | `404` |
| A-8 | `qualquer` | unavailable | `200 passthrough` |
| A-9 | `slug com acento/encode` | ok, slug igual | `200 article` (sem 301 espúrio por encoding) |

### 27.2 `decideCategory` (unitário)

| # | `declared` | lookup | Esperado |
|---|---|---|---|
| C-1 | true | ok, total=12 | `200 category`, `noindex` ausente |
| C-2 | true | ok, total=0 | `200 category`, `noindex: true` |
| C-3 | false | ok, total=7 | `200 category`, `noindex: true` |
| C-4 | false | ok, total=0 | `404` |
| C-5 | qualquer | unavailable | `200 passthrough` |

### 27.3 `blogCategorySurface` (unitário)

| # | `categories` | `menuItems` | Esperado |
|---|---|---|---|
| S-1 | 8 slugs do Oley | menu do Oley | 8 rotas; `/politica` **ausente** |
| S-2 | vazio | menu do Oley | 8 rotas do menu; `/politica` **ausente** |
| S-3 | vazio | vazio | as 13 `FIXED_CATEGORIES` (rede de segurança, RN-8) |
| S-4 | vazio | só links externos (`https://…`) | as 13 `FIXED_CATEGORIES` |
| S-5 | 8 slugs, um `visible: false` | menu do Oley | a invisível não entra pelo cadastro, mas entra se estiver no menu visível |
| S-6 | com `outros` | menu com `/outros` | sem duplicata |

### 27.4 `classifySsrPath` (unitário)

| # | path | Esperado |
|---|---|---|
| P-1 | `/` , `//` , `/index.html` | `home` |
| P-2 | `/artigo/abc` | `article`, slug `abc` |
| P-3 | `/futebol` | `category` |
| P-4 | `/contato` | `static` |
| P-5 | `/a/b` | `unknown` |
| P-6 | `/futebol/` | `trailing-slash` → `/futebol` |
| P-7 | `/admin`, `/admin/artigos` | `null` (nunca SSR — regressão do teste existente) |
| P-8 | `/favicon.jpg`, `/assets/x.js` | `null` |
| P-9 | `/api/site` | `null` |

### 27.5 Integração na VPS (`curl`), OleySports

| # | Comando | Esperado |
|---|---|---|
| I-1 | `curl -o /dev/null -w '%{http_code}' $D/` | `200` |
| I-2 | `curl -o /dev/null -w '%{http_code}' $D/futebol` | `200` |
| I-3 | `curl -o /dev/null -w '%{http_code}' $D/politica` | `404` |
| I-4 | `curl -o /dev/null -w '%{http_code}' $D/geral` | `404` |
| I-5 | `curl -o /dev/null -w '%{http_code}' $D/artigo/__placeholder__` | `404` |
| I-6 | `curl -o /dev/null -w '%{http_code}' $D/artigo/pol-2` | `404` |
| I-7 | `curl -o /dev/null -w '%{http_code}' $D/rota-inventada` | `404` |
| I-8 | `curl -o /dev/null -w '%{http_code}' $D/a/b` | `404` |
| I-9 | `curl -o /dev/null -w '%{http_code}%{redirect_url}' $D/artigo/<uuid>` | `301` + `/artigo/<slug>` |
| I-10 | `curl -o /dev/null -w '%{http_code}' $D/artigo/<slug>` | `200` |
| I-11 | `curl -o /dev/null -w '%{http_code}' $D/contato` | `200` |
| I-12 | `curl -I -X HEAD $D/artigo/nao-existe` | `404`, sem corpo |
| I-13 | `curl -s $D/politica \| grep -c noindex` | `1` |
| I-14 | `curl -s $D/futebol \| grep -c noindex` | `0` (editoria com conteúdo) |
| I-15 | `curl -s $D/ \| grep -c 'href="/geral"'` | `0` |
| I-16 | `curl -s $D/ \| grep -c 'Eixão\|Morar DF\|IDEB'` | `0` |
| I-17 | `curl -s $D/futebol \| grep -c '__placeholder__'` | `0` |
| I-18 | `for u in $(curl -s $D/api/sitemap-news.xml \| grep -oP '(?<=<loc>)[^<]+'); do curl -o /dev/null -w "%{http_code} $u\n" "$u"; done` | todos `200` |

### 27.6 Canário sp011 (RN-8)

| # | Comando | Esperado |
|---|---|---|
| N-1 | `curl -o /dev/null -w '%{http_code}' https://sp011.com.br/politica` | `200` |
| N-2 | `curl -s https://sp011.com.br/politica \| grep -c "<h1"` | ≥ 1 |
| N-3 | `curl -o /dev/null -w '%{http_code}' https://sp011.com.br/futebol` | `404` (não é editoria do sp011) |
| N-4 | `curl -s https://sp011.com.br/api/site \| grep -o '"siteName":"[^"]*"'` | nome do sp011 |

### 27.7 Falha de infraestrutura (RN-1) — teste manual controlado

Em **ambiente de teste**, nunca em produção: parar o container `api` de um blog e
confirmar que `/` e `/artigo/<slug>` respondem **200** (shell), não 404.

---

## 28. Critérios de aceite

Todos verificáveis por comando. `$D = https://oleysports.com.br`.

1. `GET $D/artigo/__placeholder__` retorna **HTTP 404**.
2. `GET $D/geral` retorna **HTTP 404**.
3. `GET $D/politica` retorna **HTTP 404** no OleySports **e HTTP 200 no sp011**.
4. `GET $D/rota-inventada` e `GET $D/a/b` retornam **HTTP 404**.
5. `GET $D/artigo/<uuid>` retorna **HTTP 301** com `Location: /artigo/<slug>`.
6. `GET $D/artigo/<slug>` retorna **HTTP 200** com `<h1>` e
   `<link rel="canonical">` no HTML **sem executar JavaScript**.
7. `GET $D/futebol` retorna **HTTP 200**, com `<h1>` e **sem** `noindex`.
8. `GET $D/tenis` (editoria declarada e vazia) retorna **HTTP 200 com `noindex`**.
9. `curl -s $D/ | grep -c 'Eixão\|Morar DF\|IDEB\|GDF'` retorna **0**.
10. `curl -s $D/ | grep -c 'href="/geral"'` retorna **0**.
11. `curl -s $D/politica` (antes da Etapa 4) e qualquer editoria vazia não contêm
    a string `__placeholder__`.
12. Toda `<loc>` de `/api/sitemap-news.xml` responde **200** (nem 301, nem 404).
13. `HEAD` de qualquer rota devolve o **mesmo status** que `GET`.
14. Com o container `api` parado (ambiente de teste), nenhuma rota devolve 404.
15. Suíte de testes: **≥ 35 casos novos**, todos verdes; typecheck limpo nos dois
    pacotes.
16. `curl -s https://<dominio>/api/site | grep -o '"siteName":"[^"]*"'` devolve o
    nome certo em **cada um dos 11 domínios** (diagnóstico de mistura de blogs).

---

## 29. Não regressões obrigatórias

Verificar **em todos os blogs** depois do rollout:

| # | Invariante | Como verificar |
|---|---|---|
| NR-1 | **SSR continua ativo** em home, artigo e editoria | `curl -s $D/ \| grep -c '<h1'` ≥ 1 e `grep -c '__SSR_DATA__'` = 1 |
| NR-2 | **Artigo continua entregando conteúdo no HTML inicial** | `curl -s $D/artigo/<slug> \| grep -c '<article'` ≥ 1 |
| NR-3 | **`NewsArticle` + `BreadcrumbList` continuam presentes e válidos** | `curl -s $D/artigo/<slug> \| grep -c 'application/ld+json'` = 2; Rich Results Test verde |
| NR-4 | **`/api/sitemap-news.xml` continua funcionando** | `grep -c '<loc>'` > 0 |
| NR-5 | **`robots.txt` continua dinâmico e correto** | `curl -s $D/robots.txt` cita os dois sitemaps do host certo |
| NR-6 | **Headers de segurança presentes** | `curl -sI $D/` mostra HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP report-only |
| NR-7 | **Cache de HTML + SWR continuam funcionando** | 2º `curl` da home com TTFB < 100 ms |
| NR-8 | **Painel `/admin` funciona e continua fora do SSR** | login OK; `curl -s $D/admin \| grep -c '__SSR_DATA__'` = 0 |
| NR-9 | **`POST /api/ingest` continua entregando** | painel central → Entregas sem `failed`/`dead` novos |
| NR-10 | **AMP continua respondendo** | `curl -o /dev/null -w '%{http_code}' $D/api/amp/artigos/<slug>` = 200 |
| NR-11 | **Compartilhamento social continua com OG certo** | `curl -s -A 'facebookexternalhit/1.1' $D/artigo/<slug> \| grep -c 'og:title'` ≥ 1 |
| NR-12 | **Nenhum blog perdeu suas editorias** | em cada domínio, cada item do menu principal responde 200 |
| NR-13 | **Analytics não quebrou** | painel → Analytics registra pageview novo depois do deploy |
| NR-14 | **Identidade por blog** | `siteName` correto nos 11 domínios |

**NR-12 é o mais importante e o mais fácil de errar.** Roteiro:

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

## 30. Performance

**Custo adicional: essencialmente zero.**

- **404 e 301 não fazem trabalho novo.** As chamadas de API que decidem já
  aconteciam (`renderArticle` e `renderCategory` já faziam o fetch —
  `vite.config.ts:653-655`, `:720-726`). O que muda é o que se faz com a
  resposta.
- **404 e 301 economizam.** Um 404 dispensa o `renderToString`; um 301 dispensa
  o render inteiro.
- **Cache tri-estado** faz um bot que martela URLs inexistentes bater na `api` no
  máximo 1×/60 s por path — hoje ele paga um `fetch` a cada requisição.
- **`mem_limit: 768m` do container `web`:** as entradas `notFound`/`redirect` são
  minúsculas (sem `html`) e entram no mesmo teto de 200 entradas + LRU
  (`vite.config.ts:497-499`). Nenhuma pressão nova.
- **`sharp`/proxy de imagem:** não tocado. As travas de `imageTransform.ts`
  (`sharp.concurrency(2)`, cache 32 MB, semáforo de 2) ficam como estão — foram
  elas que resolveram os OOM-kills de 12-13/08.
- **Remoção dos 7 mocks:** reduz o bundle (7 componentes + imports de `.webp`
  que só eles usavam). Ganho pequeno e bem-vindo.

---

## 31. Segurança

- **Nenhum header de segurança é alterado.** O `Caddyfile` não é tocado.
- **Nenhuma superfície nova é exposta.** O PRD só **restringe** o que responde
  200.
- **`/admin` continua fora do SSR** — invariante explícita de `ssrRoutes.ts:37`
  (*"Painel JAMAIS renderiza no servidor"*), coberta pelo teste P-7.
- **`Location` do 301 é sempre um path relativo à raiz** (`/artigo/…`), montado a
  partir do `slug` **vindo do banco**, nunca do input do usuário. Isso fecha
  *open redirect* por construção.
- **`encodeURIComponent` no `Location`** e no `fetch` de `/api/articles/:id` — o
  código atual interpola o slug cru (`vite.config.ts:654`), o que é
  endurecimento gratuito ao passar por ali.
- **Nenhum segredo tocado.** `SESSION_SECRET` e `SETTINGS_ENCRYPTION_KEY`
  intocados (`CLAUDE.md §13`).
- **Rate limiting de 404:** não é necessário — o cache de 60 s por path já limita
  o amplificador, e o `spaHeadPlugin` não consulta banco.

---

## 32. Observabilidade

O container `web` é `vite preview`; não há logger estruturado nele hoje. Sem
inventar infraestrutura nova, o mínimo viável:

1. **Contadores em memória** no `ssrPlugin`, expostos num endpoint interno
   (`/__ssr-stats`, **não** roteado pelo Caddy — só alcançável de dentro da rede
   docker): `{ ok, notFound, redirect, passthrough, apiUnavailable }` por `kind`
   de rota.
2. **`console.warn` amostrado** (1 a cada N) quando a decisão for `passthrough`
   por `apiUnavailable` — esse é o sintoma de RN-1 sendo exercida, e ele **não
   pode passar despercebido**: significa que a `api` do blog está instável.
3. **Fonte de verdade externa:** o Google Search Console. Depois do deploy,
   acompanhar semanalmente "Não encontrada (404)" e conferir que a lista bate com
   §15.

Se qualquer coisa acima virar escopo demais, o item 2 é o **inegociável**: sem
ele, uma `api` instável degrada silenciosamente para 200-shell e ninguém fica
sabendo.

---

## 33. Logs

| Evento | Nível | Conteúdo | Amostragem |
|---|---|---|---|
| `ssr.notFound` | debug | `path`, `kind` | 1/50 |
| `ssr.redirect` | debug | `from`, `to` | 1/50 |
| `ssr.apiUnavailable` | **warn** | `path`, `upstream`, `reason` | 1/10 |
| `ssr.renderError` | error | `path`, mensagem | sempre |

**Nunca logar:** query string completa, cookies, headers de autenticação, IP.
O `pino` do `api-server` já serializa `req.url.split("?")[0]` de propósito
(`app.ts:105-107`) — seguir a mesma disciplina no `web`.

---

## 34. Rollback

**Granularidade:** um commit por etapa (§25). Cada etapa é revertível sozinha.

```bash
# 1. reverter o commit
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

- Qualquer item de §29 falhando (especialmente NR-12: editoria do menu em 404).
- 404 em URL de artigo real.
- Aumento de erro 5xx no `web`.
- Queda de pageviews no painel de Analytics de qualquer blog.

**Cuidado operacional:** não rodar `docker image prune` enquanto o canário não
estabilizar — a tag anterior é o rollback. E **nunca**
`docker system prune --volumes` (`CLAUDE.md §13`).

---

## 35. Riscos

| # | Risco | Prob. | Sev. | Mitigação |
|---|---|---|---|---|
| K-1 | **404 numa editoria real de algum blog** (RN-2/RN-8 mal implementadas) | Média | **Alta** | Etapa 2 separada da Etapa 4; canário duplo sp011 + oleysports; NR-12 varrendo o menu de todos os 11 domínios |
| K-2 | **`api` instável vira 404 em massa** | Baixa | **Crítica** | RN-1 + `fetchJson` tri-estado (Etapa 3 isolada); teste 27.7; log `warn` de §33 |
| K-3 | Cliente e servidor discordarem sobre o que é editoria (hidratação quebrada) | Média | Média | Uma única função (`blogCategorySurface`) usada pelos dois; remoção das rotas fixas do `App.tsx`; invariante já registrada em `categoryRoutes.ts:3-12` |
| K-4 | Sitemap anunciando as 11 editorias que passam a 404 | **Alta** | Baixa | Conhecido e aceito por 1 deploy (§18); P0-2 na sequência imediata |
| K-5 | Bloco "Mais Lidas" some da home de blog novo (sem views registradas) | Média | Baixa | `ConfigurableBlock` cai para `latest` quando não há views; e sumir é melhor que exibir Brasília falsa |
| K-6 | Barra final quebrar alguma rota | Baixa | Média | Etapa 6 é dropável; `classifySsrPath` já ignorava barra final de propósito (`ssrRoutes.ts:29-35`) — o 301 elimina a ambiguidade em vez de mantê-la |
| K-7 | Regressão no `socialOgPlugin` (crawler de rede social) | Baixa | Média | Ele roda **antes** do `ssrPlugin` e não é tocado; NR-11 |
| K-8 | Rollout de ~20 min afetando 11 blogs | Alta | Baixa | Procedimento padrão `CLAUDE.md §6`; blogs em paralelo |
| K-9 | Remover um asset `.webp` ainda usado pelo `HeroSection` | Média | Baixa | §12 proíbe explicitamente apagar assets; typecheck pega o import quebrado |
| K-10 | Análise baseada só em leitura de código (build não roda no Windows) | Certa | Média | Etapa 0 (baseline em produção) antes de escrever qualquer linha |

---

## 36. Dependências

**Deste PRD para fora — nada.** Ele não depende de nenhum outro item do roadmap,
de nenhuma migração e de nenhuma decisão de produto.

**De fora para este PRD:**

| Item | Relação |
|---|---|
| **P0-2 · Sitemap** | Deve vir **logo depois**. Enquanto não vier, o sitemap geral anuncia 11 editorias que passam a 404 (§18). Se houver risco de atraso, rodar junto. |
| P1-1 · Metadata por rota | Depende da allowlist de rotas estáticas criada aqui. |
| P1-2 · SSR das institucionais | Depende do `kind: "static"` criado aqui. |
| P1-6 · Página 404 visual | Depende do status 404 criado aqui. |
| P1-3 · Breadcrumb | **Independente.** Pode ir antes, depois ou junto. |
| P2-1 · `UNIQUE` em `slug` | **Independente**, mas reduz o risco residual de F-16 no 301. |

**Dados que ajudam a dimensionar (não bloqueiam):** E-1 (artigos sem slug) e E-4
(total de publicados), em `docs/PRD-SEO-TECHNICAL-OLEYSPORTS.md` §16.

---

## 37. Edge cases

| # | Caso | Tratamento |
|---|---|---|
| X-1 | Artigo com `slug` vazio, requisitado pelo UUID | Sem 301 (a URL canônica **é** o UUID). `decideArticle` caso A-4. |
| X-2 | Dois artigos com o mesmo slug (F-16, sem `UNIQUE`) | `getArticle` devolve um arbitrário. O 301 leva o UUID do outro para o slug **errado**. Mitigação: P2-1. Enquanto isso, o 301 não piora o quadro — a URL do slug já era ambígua. Medir com E-2 antes da Etapa 5. |
| X-3 | Artigo despublicado depois de indexado | `/api/articles/:id` devolve 404 (`routes/articles.ts:108`) → 404. Correto. Se voltar, volta a 200. |
| X-4 | Artigo com `canonicalUrl` externo | Não muda: o SSR já respeita o campo (`vite.config.ts:685`). O 301 ainda leva UUID→slug; a página então declara canonical externo. Consistente. |
| X-5 | Slug com caractere que precisa de encoding | `encodeURIComponent` no `Location` e no `fetch`; teste A-9 garante que não nasce 301 em loop por diferença de encoding. |
| X-6 | Requisição com `?utm_source=…` | A query não entra na decisão (`pathOnly` já é `split("?")[0]`, `vite.config.ts:806`). O `Location` do 301 **preserva** a query (acrescentar explicitamente — hoje `sendHtml` não lida com query). |
| X-7 | `//` no início do path | `classifySsrPath` já trata `//` como home (`ssrRoutes.ts:31`). Manter. |
| X-8 | Path com `..` ou encoding malicioso | Não vira filesystem em lugar nenhum; cai em `unknown` → 404. |
| X-9 | Blog recém-instalado (wizard incompleto) | `/api/site` devolve `503 setup_required` (`app.ts:172`) → `unavailable` → **200 passthrough**. O visitante vê a SPA que redireciona para `/admin/setup`. **Nunca 404.** |
| X-10 | Blog sem `settings.categories` e sem menu | RN-8: cai em `FIXED_CATEGORIES`. Comportamento idêntico ao de hoje. |
| X-11 | Editoria com o mesmo path de rota reservada (`/contato` cadastrado como editoria) | `RESERVED_PATHS` (`categoryRoutes.ts:50`) já vence. Continua. |
| X-12 | `HEAD` numa rota 301 | Status 301 + `Location`, sem corpo. `isReadRequest` já cobre. |
| X-13 | Bot pedindo milhares de URLs inexistentes | Cache de 60 s por path + teto de 200 entradas com LRU. Sem consulta a banco. |
| X-14 | Editoria que ganha o primeiro artigo | Sai de `noindex` em ≤ 60 s (TTL do cache de página). |
| X-15 | Blog com idioma `en` (ksports) | `/artigo/` continua sendo o prefixo (é o path real do App, não uma palavra traduzida). Nada muda. |
| X-16 | Preview do admin (Home + menu → Templates) | `preview: true` continua exibindo amostras "EXEMPLO"; os blocos `mais-lidas`/`ultimas` passam a mostrar artigos reais amostrados, nunca os mocks. |

---

## 38. Definition of Done

### Código

- [ ] `src/lib/routeDecision.ts` criado, **puro**, sem `IncomingMessage` e sem React.
- [ ] `src/lib/ssrRoutes.ts` com os novos `kind`s e `STATIC_PAGE_PATHS`.
- [ ] `src/lib/categoryRoutes.ts` com `blogCategorySurface()` e o 3º parâmetro
      retrocompatível em `resolveCategoryRoute`.
- [ ] `vite.config.ts`: `fetchJson` tri-estado, `sendHtml(status)`, `serveShell`,
      `applyHead` com `robots`, cache tri-estado, `handleSsr` executando a decisão.
- [ ] `App.tsx` sem o `FIXED_CATEGORIES.map`; `DynamicCategory` recebendo
      `settings.categories`.
- [ ] `CategoryArchivePage.tsx` / `CategoryPage.tsx`: estado vazio sem `<Link>`.
- [ ] `Home.tsx`: `mais-lidas` e `ultimas` em `ConfigurableBlock`; "Ver mais" sem
      categoria sem link.
- [ ] 7 componentes mock removidos; **assets `.webp` preservados**.
- [ ] Nenhuma regra de negócio escrita dentro do `vite.config.ts`.

### Testes

- [ ] `routeDecision.test.ts` com os casos 27.1, 27.2 e 27.3.
- [ ] `ssrRoutes.test.ts` estendido com 27.4 (incluindo P-7, o painel).
- [ ] `categoryRoutes.test.ts` estendido com a precedência.
- [ ] `homeBlocks.test.ts` estendido com o `href` de bloco sem categoria.
- [ ] **≥ 35 casos novos**, todos verdes.
- [ ] `pnpm exec tsc -b` limpo; `pnpm run typecheck` limpo nos dois pacotes.
- [ ] Suíte completa dos dois pacotes verde (baseline: 43 verdes em 19/08/2026).

### Deploy

- [ ] Um commit por etapa, mensagem em pt-BR, direto na `main`.
- [ ] Rollout do `CLAUDE.md §6` com bump de `BLOG_IMAGE_VERSION` e
      `build api web` **juntos**.
- [ ] **Canário duplo:** sp011 (RN-8) e oleysports, verificados antes dos demais.
- [ ] Demais 9 blogs em paralelo.

### Verificação

- [ ] Baseline da Etapa 0 salvo **antes** de qualquer mudança.
- [ ] Tabela 27.5 (OleySports) inteira verde.
- [ ] Tabela 27.6 (canário sp011) inteira verde.
- [ ] §28: os 16 critérios de aceite verificados por comando e a saída registrada.
- [ ] §29: as 14 não-regressões verificadas; **NR-12 varrendo os 11 domínios**.
- [ ] `curl -s https://<dominio>/api/site | grep -o '"siteName":"[^"]*"'` correto
      nos 11 domínios.
- [ ] Painel central → Entregas sem `failed`/`dead` novos após o deploy.

### Documentação

- [ ] `CLAUDE.md` atualizado: a superfície de editorias por blog e a regra
      "falha de infra nunca vira 404" viram invariantes (§17 do CLAUDE.md).
- [ ] `docs/PRD-SEO-TECHNICAL-OLEYSPORTS.md` com o P0-1 marcado como entregue e
      as métricas M-3…M-7 medidas.
- [ ] GSC: URLs de §15 inspecionadas com "Testar URL ativa"; sitemap reenviado
      **depois** do P0-2.
