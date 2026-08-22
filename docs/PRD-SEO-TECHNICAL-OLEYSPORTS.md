# PRD Técnico — Auditoria SEO e Arquitetural OleySports

> **Status:** Proposto · **Data:** 2026-08-19 · **Origem:** auditoria cruzada
> PDF × código-fonte · **Repositório:** `sp011` (monorepo da rede de blogs)
> **Fonte externa:** `2026-08-19 — Relatório Comparativo SEO — BeeSports vs
> OleySports — Revisado.pdf` (snapshot público de **13/08/2026**)
>
> **Regra de leitura deste documento:** o repositório é a fonte de verdade sobre
> implementação. O PDF é evidência de comportamento público observado em
> 13/08/2026 e fonte de hipóteses. Onde os dois divergem, o documento diz
> explicitamente qual está certo e por quê.

---

## 1. Título

PRD Técnico — Auditoria SEO e Arquitetural OleySports.

---

## 2. Resumo executivo

### Estado atual

O OleySports roda a **imagem Docker compartilhada da rede** (`blog-api` /
`blog-web`, os mesmos binários dos outros 10 blogs). Não existe código
específico do OleySports: tudo o que o distingue está em `settings`, no banco
dele. Isso significa que **todo defeito encontrado aqui é um defeito da rede
inteira** — e que toda correção nasce aplicada a 11 domínios.

O PDF acertou o diagnóstico macro: o OleySports entrega SSR real, tem schema em
artigos, headers de segurança de borda e uma superfície grande e rastreável. Ele
também acertou os dois P0 (rotas 200 sem conteúdo e duplicação slug/UUID) — mas
**errou a causa dos dois** e, mais grave, **deu 2/2 em "Robots e sitemaps" para
um sitemap que não contém um único artigo**.

### Principais problemas (confirmados no código)

1. **`/api/sitemap.xml` não lista nenhum artigo.** `routes/sitemap.ts:36` chama
   `store.getArticles()`, que é um **stub legado que retorna `[]`**
   (`lib/store.ts:1332`, comentado como *"Legacy stubs"* desde 2026-06-22,
   commit `51bfc2f`). O sitemap geral publica apenas 14 rotas estáticas — e essas
   14 são as **editorias do sp011** (`/politica`, `/cidade`, `/seguranca`…),
   hardcoded, todas vazias no OleySports. As editorias reais do blog
   (`/futebol`, `/copa-do-mundo`, `/f1`…) **não estão em sitemap nenhum**. Só o
   `/api/sitemap-news.xml` consulta o banco de verdade, e ele cobre apenas 48 h.
2. **Nada no sistema sabe responder 404.** O middleware `spaHeadPlugin`
   (`vite.config.ts:849-890`) devolve **HTTP 200 + shell da SPA para qualquer
   path sem extensão**. Artigo inexistente, editoria inexistente, rota
   inventada: tudo 200. Não existe um único `noindex` no frontend do blog.
3. **A rede publica links para um artigo que não existe.** A página de editoria
   vazia monta um card de placeholder com `id: "__placeholder__"`
   (`CategoryArchivePage.tsx:126`) e esse card é renderizado dentro de um
   `<Link href={/artigo/${art.slug || art.id}}>` (`CategoryPage.tsx:77`). É daí
   que sai o link **crawlável** `/artigo/__placeholder__` que o PDF encontrou.
4. **O bloco "Mais Lidas" da home é um mock de Brasília.**
   `components/MostRead.tsx` é uma lista **hardcoded** de 5 manchetes falsas do
   DF ("Câmara Legislativa aprova…", "Obras no Eixão…", "dengue no DF…") que
   linka para `/artigo/pol-2`, `/artigo/df-3`, `/artigo/sau-1`, `/artigo/df-4`,
   `/artigo/tec-4` — cinco artigos inexistentes. O template de produção do
   OleySports (`deploy/oleysports/template_final.sql`) tem esse bloco
   **`visible: true`, na posição 1 da home**.
5. **`/artigo/<uuid>` e `/artigo/<slug>` servem o mesmo artigo com 200.**
   `articleService.getArticle()` resolve por `id` **OU** `slug`
   (`articleService.ts:275`) e não existe redirect. O canonical do SSR aponta
   para o slug, o que atenua — mas não elimina — a duplicação.
6. **13 editorias do sp011 respondem 200 em qualquer blog da rede.**
   `FIXED_CATEGORIES` (`lib/categoryRoutes.ts:30-44`) é uma tabela fixa, e o
   `resolveCategoryRoute` a consulta **antes** do menu do portal. No OleySports,
   `/politica`, `/cidade`, `/economia`, `/esportes` etc. renderizam página de
   editoria completa, com H1, canonical e zero artigos — e é exatamente aí que o
   link do placeholder aparece.
7. **O breadcrumb do OleySports aponta para a home.** `lib/categoryRoute.ts`
   (singular — arquivo diferente do `categoryRoutes.ts`) é outro mapa hardcoded
   do sp011. Para **todas** as categorias do OleySports (`futebol`, `f1`,
   `copa-do-mundo`, `volei`, `tenis`, `futebol-americano`, `e-sports`, `outros`)
   ele devolve `"/"`. Resultado: no `BreadcrumbList` JSON-LD os itens de posição
   1 e 2 apontam para a mesma URL — breadcrumb semanticamente inválido em ~todos
   os artigos, e o link visível "categoria" leva à home.

### Principais vantagens (confirmadas — preservar)

- **SSR real** de home, artigo e editoria (`vite.config.ts:463-846`), com cache
  em memória e *stale-while-revalidate* de servidor. Título, description,
  canonical, `article:*`, H1, corpo e links saem no primeiro response.
- **`NewsArticle` + `BreadcrumbList`** renderizados no HTML do artigo
  (`pages/Artigo.tsx:525-580`) — o "224/250 com schema" do PDF é real.
- **`robots.txt` dinâmico por host** (`vite.config.ts:1004-1027`), anunciando os
  dois sitemaps internos corretos, sem referência a domínio morto.
- **Headers de segurança de borda** no Caddy (`Caddyfile`, snippet `(blog)`):
  HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy` e CSP *report-only*.
- **Imagens com `loading="lazy"` quase universal**, `srcset`/`sizes` calculados e
  proxy de redimensionamento próprio (`lib/newsImage.ts`, `lib/imageTransform.ts`).

### Conclusão sobre o PDF

| Veredito | Itens |
|---|---|
| **Certo, e a causa está no código** | OLEY-01 (parcialmente — ver §7), OLEY-02, OLEY-03, OLEY-04 |
| **Certo no sintoma, errado no diagnóstico** | OLEY-01 para `/contato`, `/termos`, `/privacidade`, `/arquivo`: **não são thin routes**, são páginas institucionais reais servidas sem SSR. A recomendação do PDF (404/410 ou noindex) as destruiria. |
| **Contradito pelo repositório** | "Robots e sitemaps **2/2**" e "Sitemaps: geral e Google News funcionais". O sitemap geral está vazio de artigos desde 22/06/2026. |
| **Superestimado** | OLEY-06 (peso): 197 KB de DOM → 39 KB codificados (Caddy `encode gzip zstd`); as 69 imagens são elementos, quase todos `lazy`. Não há problema mensurável de download. |
| **Corretamente classificado como não-problema** | OLEY-05 (hreflang) e OLEY-07 (autoridade). |
| **Não visto pelo PDF** | Sitemap vazio, mock "Mais Lidas", editorias fixas do sp011, breadcrumb apontando para a home, ausência total de `noindex`/404. |

### Nível geral de urgência

**Alto, com janela crítica.** O OleySports migrou de `oleysports.midia.run` para
`oleysports.com.br` em **14/08/2026** — um dia depois do snapshot
(`deploy/README.md:141`, `CLAUDE.md §4`). O domínio novo está sendo indexado
**do zero agora**, e o que o Google encontra é: nenhum artigo no sitemap geral,
13 editorias vazias indexáveis, manchetes falsas de Brasília na primeira dobra e
URLs que retornam 200 para conteúdo que não existe. Esse é exatamente o perfil
que já rendeu à rede um flag de **"Páginas enganosas"** no Search Console do
`resenhavip` (`CLAUDE.md §19.3`). Corrigir a camada de resolução de URL antes que
o índice do domínio novo se consolide é a decisão de maior valor disponível.

---

## 3. Contexto

### Origem da auditoria

Auditoria pública *read-only* de 13/08/2026, comparando `beesportes.com.br` e
`oleysports.midia.run`. Metodologia: crawl same-host de até 250 URLs por domínio
+ DataForSEO (OnPage, SERP, Labs, Backlinks). Lighthouse indisponível
(`40400`). GSC próprio fora de escopo.

### Data do snapshot × estado do repositório

- Snapshot: **13/08/2026**, domínio `oleysports.midia.run`.
- `git log` desde 12/08: **nenhum commit alterou** a camada de rotas, sitemap,
  canonical, status HTTP ou JSON-LD. Os commits do período são taxonomia da
  central (`b555965`, `da6d1fc`, `cc05af5`), GTM no HTML servido (`20e01a6`),
  recorte de capa (`270d215`) e Cloudflare/`credito.vc` (`32d806c`, `46e8158`).
- **Portanto:** nenhum finding do PDF sobre estrutura de URL foi corrigido entre
  o snapshot e hoje. Tudo o que ele viu continua no ar.
- **Mudança relevante fora do código:** migração de domínio em 14/08/2026, com
  `oleysports.midia.run` → 301 para `oleysports.com.br` preservando `/api/*`
  (`deploy/README.md`, seção "Domínio próprio depois").

### Diferença entre análise externa e análise do código

O crawler enxerga *resposta*; o repositório mostra *causa*. Três exemplos desta
auditoria:

| O que o PDF viu | O que o código explica |
|---|---|
| `/artigo/__placeholder__` responde 200 | É o **card de estado vazio** de uma editoria sem artigos, e ele é um `<Link>`. A URL existe porque a rede *publica* esse link. |
| Seis rotas "thin" com 4 palavras | Quatro delas são páginas institucionais completas, só que **CSR-only** (o SSR cobre apenas home/artigo/editoria). |
| Dois sitemaps XML funcionais → 2/2 | O sitemap geral chama um **stub que devolve lista vazia**; ele nunca teve artigo nenhum desde 22/06/2026. |

---

## 4. Arquitetura atual

### 4.1 Stack

| Camada | Implementação |
|---|---|
| Monorepo | pnpm workspaces, TypeScript 5.9, `tsc --build` para `lib/*` |
| Backend do blog | `artifacts/api-server` — Express + Drizzle, bundle esbuild, `node --env-file` |
| Frontend do blog | `artifacts/brasilia-agora` (`@workspace/sbc-agora`) — React 19 + Vite 7 + wouter + Tailwind 4 |
| Banco | Postgres (Supabase no sp011; `pg-blogs` local nos replicados, credencial em `db-config.enc`) |
| Borda | Caddy (`Caddyfile`, snippet `(blog)`), HTTPS automático, `encode gzip zstd` |
| Runtime de produção do frontend | `vite preview` — **não** é servidor Node próprio; toda a lógica de servidor vive em **plugins do Vite** com `configurePreviewServer` |

### 4.2 Renderização — quem responde o quê

O `vite.config.ts` registra os middlewares nesta ordem (linhas 1089-1093):

```
staticCachePlugin → socialOgPlugin → seoTextPlugin → ssrPlugin → spaHeadPlugin → estático
```

| Rota | Middleware | Modo | Status |
|---|---|---|---|
| `/` | `ssrPlugin.renderHome` | **SSR** (100 artigos + pools por categoria) | 200 |
| `/artigo/:slug` (existe) | `ssrPlugin.renderArticle` | **SSR** | 200 |
| `/artigo/:slug` (não existe) | `ssrPlugin` → `null` → `spaHeadPlugin` | shell SPA | **200** ⚠ |
| `/:slug` (editoria válida) | `ssrPlugin.renderCategory` | **SSR** | 200 |
| `/:slug` (não é editoria) | `ssrPlugin` → `null` → `spaHeadPlugin` | shell SPA | **200** ⚠ |
| `/contato`, `/termos`, `/privacidade`, `/arquivo` | `spaHeadPlugin` | shell SPA (CSR) | 200 |
| `/robots.txt`, `/llms.txt` | `seoTextPlugin` | texto dinâmico por host | 200 |
| `/admin/**` | `spaHeadPlugin` | shell SPA | 200 (bloqueado no `robots.txt`) |
| crawler social em `/artigo/*` | `socialOgPlugin` | HTML de OG mínimo + `location.replace` | 200 |

`classifySsrPath` (`src/lib/ssrRoutes.ts`) decide o que é candidato a SSR. Ela é
importada **tanto pelo `vite.config.ts` quanto pelo App**, e tem testes
(`ssrRoutes.test.ts`, 6 casos — todos passando).

### 4.3 Sistema de rotas do App

`src/App.tsx` (wouter):

- 13 rotas fixas geradas por `FIXED_CATEGORIES.map(...)` (`App.tsx:322-326`);
- `/artigo/:slug`, `/arquivo`, `/contato`, `/privacidade`, `/termos`;
- `/:slug` → `DynamicCategory`, que resolve o slug contra `settings.menuItems`;
- fallback `<Route component={NotFound} />`.

`RESERVED_PATHS` (`categoryRoutes.ts:50`) impede que `/artigo`, `/arquivo`,
`/contato`, `/privacidade` e `/termos` sejam capturados como editoria.

### 4.4 Conteúdo e identificadores

- `articles.id` = `randomUUID()` (`articleService.ts:334`).
- `articles.slug` = `slugify(slug fornecido) || slugify(title)`, com
  desambiguação por sufixo `-2`, `-3`… em laço até 50
  (`articleService.ts:342-352`).
- **`slug` é `text` NULO-permitido e SEM `UNIQUE`**
  (`lib/db/src/schema/articles.ts:39`; só um índice não-único
  `articles_slug_idx` na linha 70).
- Resolução pública: `getArticle(idOrSlug)` → `or(eq(id), eq(slug))`
  (`articleService.ts:271-278`). **Uma rota, dois identificadores, sem redirect.**
- Todos os construtores de link internos usam `slug || id` (ou `slug ?? id`) —
  exceto os dois blocos mock (§9, F-14).

### 4.5 Metadata

| Página | Onde é gerada | title | description | canonical |
|---|---|---|---|---|
| Home | `ssrPlugin.renderHome` → `rewriteHeadMeta` (`vite.config.ts:190-207`) | `siteName — tagline` | `seoDescription \|\| tagline \|\| siteName` | `origin + "/"` ✔ |
| Artigo | `ssrPlugin.renderArticle` (`vite.config.ts:672-707`) | `título — siteName` | `subtitle` (160 ch) ✔ | `article.canonicalUrl \|\| origin + /artigo/<slug>` ✔ |
| Editoria | `ssrPlugin.renderCategory` (`vite.config.ts:744-756`) | `categoryTitle(label, siteName)` ✔ | **`meta.seoDescription`** ⚠ (igual para todas) | `origin + route.path` ✔ |
| Institucional / qualquer outra | `spaHeadPlugin` → `rewriteHeadMeta` | `siteName — tagline` ⚠ | `seoDescription` ⚠ | **nenhum** ⚠ |

No cliente, `components/SEOHead.tsx` reescreve `title`/`description`/OG a partir
de `settings` e mantém um `<link rel="canonical">` sincronizado com
`window.location.origin + location` (`SEOHead.tsx:125-137`); `pages/Artigo.tsx`
sobrescreve depois com o canonical do slug (`Artigo.tsx:235-245`). Nada disso
existe para um crawler que não executa JS.

### 4.6 Sitemap e robots

| Recurso | Arquivo | Fonte de dados | Conteúdo real |
|---|---|---|---|
| `/api/sitemap.xml` | `api-server/src/routes/sitemap.ts` | `store.getArticles()` | **14 rotas estáticas do sp011. Zero artigos.** |
| `/api/sitemap-news.xml` | `api-server/src/routes/sitemap-news.ts` | `db.select()` direto, `publishedAt >= now-48h`, `limit 1000` | funcional ✔ |
| `/robots.txt` | `vite.config.ts:1004` (`buildRobotsTxt`) | só o `Host` da requisição | correto ✔ |
| `/llms.txt` | `vite.config.ts:968` (`buildLlmsTxt`) | `/api/site` (menu do blog) | correto ✔ |

### 4.7 Structured data

| Página | JSON-LD |
|---|---|
| Artigo (`pages/Artigo.tsx:525-580`) | `NewsArticle` + `BreadcrumbList` ✔ |
| AMP (`routes/amp.ts:88-105`) | `NewsArticle` ✔ |
| **Home** | nenhum |
| **Editoria** | nenhum |
| **Institucionais** | nenhum |

Verificado por varredura: `grep -rn "ld+json"` retorna exatamente esses três
pontos no repositório inteiro.

### 4.8 Infraestrutura identificável no repositório

- `Caddyfile` — snippets `(blog)` e `(blog-cf)`; headers de segurança; CSP
  *report-only*; `import /etc/caddy/sites/*.caddy`. O arquivo por blog
  (`caddy/sites/oleysports.caddy`) vive **na VPS**, não no repo.
- `deploy/blog-template/compose.yml` — `mem_limit`, `cap_drop`,
  `no-new-privileges`, healthcheck.
- `deploy/oleysports/` — `GO_LIVE.md`, `template_final.sql` (22 blocos),
  `sources_pt.sql`, `backfill_50.sql`, artes sociais.
- `.github/workflows/security.yml` — **único** workflow. **Não há CI de build,
  typecheck, teste ou lint.**

---

## 5. Auditoria PDF × Código

Matriz de rastreabilidade. `Status` usa a classificação pedida no prompt.

| ID | Afirmação do PDF | Evidência no código | Status | Impacto real |
|---|---|---|---|---|
| **OLEY-01a** | `/artigo/__placeholder__` responde 200 com cara de artigo | `CategoryArchivePage.tsx:126` cria o card; `CategoryPage.tsx:77` o embrulha em `<Link href={/artigo/...}>`; `vite.config.ts:817-820` devolve 200 quando o SSR recusa | **CONFIRMADO** (causa raiz identificada) | Alto |
| **OLEY-01b** | `/geral` é rota vazia 200 | `Home.tsx:533` e `Home.tsx:653`: `const cat = block.category ?? "geral"`, `href = /${cat}`. O template do Oley tem 3 blocos visíveis sem categoria (`list-os-ultimas`, `content-os-recentes`, `content-os-mais`) | **CONFIRMADO** | Médio |
| **OLEY-01c** | `/contato`, `/termos`, `/privacidade`, `/arquivo` são "rotas vazias" | São páginas reais: `Contato.tsx` (142 linhas, H1), `Termos.tsx` (190), `Privacidade.tsx` (451), `Archive.tsx` (387). **Não têm SSR** — `classifySsrPath` só cobre home/artigo/editoria | **PARCIALMENTE CONFIRMADO — DIAGNÓSTICO DO PDF INCORRETO** | Médio |
| **OLEY-02** | Duplicação slug/UUID | `articleService.ts:275`: `or(eq(id), eq(slug))`. Sem 301. Canonical do SSR aponta para o slug (`vite.config.ts:669`) | **CONFIRMADO, com atenuação** | Alto |
| **OLEY-02b** | "Title padrão compartilhado por 7 URLs" | `spaHeadPlugin` → `rewriteHeadMeta`: toda rota sem SSR recebe `siteName — tagline` | **CONFIRMADO** | Médio |
| **OLEY-02c** | "26 URLs com description `Notícia. Agora. Sempre.`" | `metaFromSitePayload` (`vite.config.ts:111`): `seoDescription \|\| tagline \|\| siteName`. `"Notícia. Agora. Sempre."` é a `tagline` do OleySports no banco | **CONFIRMADO** | Médio |
| **OLEY-03** | Categoria com title certo e description genérica | `vite.config.ts:750`: `description: meta.seoDescription` para toda editoria | **CONFIRMADO** | Médio |
| **OLEY-04** | Schema em artigo, ausente em home/categoria | Varredura `ld+json`: só `Artigo.tsx` e `amp.ts` | **CONFIRMADO** | Médio |
| **OLEY-04b** | "224/250 páginas com NewsArticle/BreadcrumbList" (contado como vantagem) | Presente — mas o `BreadcrumbList` é **inválido** no OleySports: `categoryRoute()` devolve `/` para todas as categorias do blog (`lib/categoryRoute.ts:1-17`) | **CONFIRMADO NA PRESENÇA, CONTRADITO NA QUALIDADE** | Médio |
| **OLEY-05** | hreflang ausente | Correto no HTML inicial. No cliente, `Artigo.tsx:247-248` injeta `hreflang=pt-BR` e `x-default` **apontando para a própria URL** — auto-referência inútil num site monolíngue | **NÃO APLICÁVEL NO MOMENTO** | Nulo |
| **OLEY-06** | HTML/DOM pesado (197 KB DOM, 39 KB codificados, 69 imagens) | `__SSR_DATA__` de ~70 KB medido e documentado (`vite.config.ts:588-597`), corte deliberado em 100 artigos; imagens `lazy` em ~todos os componentes | **PARCIALMENTE CONFIRMADO — sem problema mensurável** | Baixo |
| **OLEY-07** | Autoridade/backlinks não confirmados | Não verificável no repositório | **VALIDAÇÃO EXTERNA NECESSÁRIA** | — |
| **PDF-SEC** | Headers de segurança são vantagem do Oley | `Caddyfile`, snippet `(blog)` | **CONFIRMADO — DEPENDE DE INFRAESTRUTURA/DEPLOY** | — |
| **PDF-SSR** | SSR é vantagem do Oley | `vite.config.ts:463-846` | **CONFIRMADO — PRESERVAR** | — |
| **PDF-SITEMAP** | "Robots e sitemaps 2/2 · dois sitemaps XML internos funcionais" | `routes/sitemap.ts:36` → `store.getArticles()` → `lib/store.ts:1332` → `[]` | **CONTRADITO PELO REPOSITÓRIO** | **Alto** |

---

## 6. Findings confirmados

### F-01 · `/api/sitemap.xml` não contém artigo nenhum · **P0**

**Evidência.** `artifacts/api-server/src/routes/sitemap.ts:36-37`:

```ts
const articles = store
  .getArticles()
  .filter((a) => a.status === "published");
```

`artifacts/api-server/src/lib/store.ts:1330-1333`:

```ts
// ── Legacy stubs (kept for backward compatibility) ────────────────────────
// Articles are now managed exclusively by articleService + DB.
getArticles: (): Article[] => [],
```

**Datação.** O sitemap foi escrito em `8654357`/`93ff746` (18/06/2026), quando
`store.getArticles()` ainda lia artigos. Em `51bfc2f` (**22/06/2026**) os artigos
migraram para `articleService` + banco e o método virou stub. O sitemap não foi
migrado junto. **O OleySports nunca teve um artigo no sitemap geral.**

**Agravante.** As 14 rotas estáticas são hardcoded do sp011
(`sitemap.ts:6-20`): `/politica`, `/cidade`, `/seguranca`, `/transporte`,
`/saude`, `/educacao`, `/cultura`, `/esportes`, `/brasil`, `/mundo`, `/colunas`,
`/arquivo`, `/contato`. **Nenhuma existe editorialmente no OleySports**, e as
que existem (`/futebol`, `/copa-do-mundo`, `/volei`, `/tenis`, `/f1`,
`/futebol-americano`, `/e-sports`, `/outros`) não estão lá. Isso viola
diretamente a invariante do `CLAUDE.md §13`: *"nunca hardcodar conteúdo por blog
na imagem compartilhada"*.

**Impacto.** Descoberta de conteúdo depende 100% de links internos. O acervo além
do alcance da home + editorias fica invisível ao rastreador, e o sitemap
"positivo" do relatório está, na prática, empurrando 11 URLs vazias.

**Confiança:** Alta (leitura direta do código, sem ambiguidade).

---

### F-02 · Qualquer URL inexistente responde HTTP 200 (soft-404 sistêmico) · **P0**

**Evidência.** `artifacts/brasilia-agora/vite.config.ts:849-890` (`spaHeadPlugin`):

```ts
if (!isReadRequest(req) || pathOnly.startsWith("/api/") || /\.[a-zA-Z0-9]+$/.test(pathOnly)) {
  next(); return;
}
...
sendHtml(res, html, "no-cache, must-revalidate");   // sempre 200
```

E `vite.config.ts:817-820` (`handleSsr`): quando o SSR devolve `null` (artigo
inexistente — `:656`; slug que não é editoria — `:718`), chama `next()`, que cai
exatamente nesse `spaHeadPlugin`.

**Validado localmente.** Simulação com o menu real do OleySports
(`deploy/oleysports/template_final.sql`) sobre as funções puras
`classifySsrPath` + `resolveCategoryRoute`:

```
/geral                       -> SPA fallback 200 (soft-404)
/rota-que-nao-existe         -> SPA fallback 200 (soft-404)
/artigo/__placeholder__      -> SSR se o artigo existir; senao SPA 200
/futebol                     -> SSR editoria 200 (slug=futebol)
/politica                    -> SSR editoria 200 (slug=politica)   <-- editoria do sp011
```

**Complemento.** Não existe **nenhum** `noindex` no frontend do blog
(`grep -rn "noindex" artifacts/brasilia-agora/` → vazio). O `index.html` traz
`<meta name="robots" content="index, follow">` e o `spaHeadPlugin` não o
reescreve. E a página 404 do App (`pages/not-found.tsx`) é o scaffold do Vite,
em inglês, com o texto *"Did you forget to add the page to the router?"*.

**Confiança:** Alta.

---

### F-03 · A rede publica o link `/artigo/__placeholder__` · **P0**

**Evidência.** `artifacts/brasilia-agora/src/pages/CategoryArchivePage.tsx:125-134`:

```ts
const placeholder: CategoryArticle = {
  id:       "__placeholder__",
  title:    t("category.empty"),
  ...
};
const featured = articles[0] ?? placeholder;
```

`artifacts/brasilia-agora/src/components/CategoryPage.tsx:75-77`:

```tsx
{[featuredArticle, second].filter(Boolean).map((art, idx) => art && (
  <Link key={art.id} href={`/artigo/${art.slug || art.id}`} className="group block">
```

**Cadeia causal completa.** Editoria sem artigos → `featured = placeholder` →
`art.slug` é `undefined` → `art.id` = `"__placeholder__"` → link crawlável
`/artigo/__placeholder__` → `renderArticle` não acha → `spaHeadPlugin` → **200**.

E o que gera editorias sem artigos no OleySports são as `FIXED_CATEGORIES` do
sp011 (F-04). O `/artigo/__placeholder__` do PDF **não é um artigo de teste
esquecido**: é uma consequência estrutural, e ela se repete em toda editoria
vazia de qualquer blog da rede.

**Confiança:** Alta.

---

### F-04 · 13 editorias do sp011 respondem 200 em todo blog da rede · **P0**

**Evidência.** `artifacts/brasilia-agora/src/lib/categoryRoutes.ts:30-44` define
`FIXED_CATEGORIES` com `politica, cidade, seguranca, transporte, saude,
educacao, cultura, esportes, colunas, brasil, mundo, economia, tecnologia`.
`resolveCategoryRoute` (`:88-107`) consulta essa tabela **antes** do menu:

```ts
const fixed = FIXED_CATEGORIES.find((c) => c.path === p);
if (fixed) return fixed;
```

`App.tsx:322-326` cria as 13 rotas no cliente; `vite.config.ts:717` faz o SSR
delas. No OleySports (categorias `copa-do-mundo, futebol, volei, tenis, f1,
futebol-americano, e-sports, outros`) as 13 estão **vazias** — mas retornam
página completa, com `<h1>POLÍTICA</h1>`, canonical próprio, e o card
placeholder de F-03. Onze delas ainda são **anunciadas no sitemap** (F-01).

**Nota de arquitetura.** A tabela não pode simplesmente ser esvaziada: o sp011
depende dela (é o blog-mãe, com taxonomia vazia de propósito — `CLAUDE.md §10`).
A correção é de **precedência**, não de remoção. Detalhe no PRD P0-1.

**Confiança:** Alta.

---

### F-05 · `/artigo/<uuid>` e `/artigo/<slug>` servem o mesmo artigo com 200 · **P0**

**Evidência.** `artifacts/api-server/src/lib/articleService.ts:271-278`:

```ts
async getArticle(idOrSlug: string): Promise<Article | null> {
  const rows = await db.select().from(articlesTable)
    .where(or(eq(articlesTable.id, idOrSlug), eq(articlesTable.slug, idOrSlug)))
    .limit(1);
```

O mesmo em `routes/amp.ts:51-56`. Não há **nenhum** `res.redirect` em rota
pública no repositório.

**Atenuação real (o PDF não viu).** O SSR calcula
`url = origin + "/artigo/" + (article.slug ?? article.id)`
(`vite.config.ts:669`) e emite esse canonical **mesmo quando a requisição chegou
pelo UUID** (`vite.config.ts:685-687`). O cliente reforça em
`Artigo.tsx:235-245`. Então a URL UUID já é auto-declarada não-canônica.

**O que continua quebrado:** 200 em vez de 301 → crawl budget gasto, e a
consolidação depende do Google respeitar o canonical (sinal, não diretiva). O
canonical **desaparece** se o SSR falhar e a rota cair no `spaHeadPlugin`, que
não emite canonical nenhum.

**Origem prática das URLs UUID:** links internos usam `slug || id`, então elas só
aparecem quando `slug` é nulo/vazio. Três caminhos produzem isso:
(a) `migrateFromStore` (`articleService.ts:531`) insere **sem** slug;
(b) `updateArticle` (`:420`) aceita slug vazio; (c) título que `slugify` reduz a
string vazia (`:342`). **Quantos artigos do OleySports estão nessa situação é
pergunta de banco — ver §16, E-1.**

**Confiança:** Alta no mecanismo; média na dimensão (o PDF fala em 4 pares).

---

### F-06 · Description de editoria é a description global do site · **P1**

**Evidência.** `vite.config.ts:744-756`, `renderCategory`:

```ts
title: categoryTitle(route.label, meta.siteName),   // ✔ específico
description: meta.seoDescription,                    // ⚠ igual em todas
```

Todas as editorias do OleySports servem `Notícia. Agora. Sempre.` como
description — o que o PDF mediu em 26 URLs.

**Confiança:** Alta.

---

### F-07 · Home e editorias sem JSON-LD · **P1**

**Evidência.** `grep -rn "ld+json" artifacts/` → 3 ocorrências, todas em artigo
(`Artigo.tsx:590`, `:596`) e AMP (`amp.ts:137`). Não há `Organization`,
`WebSite`, `CollectionPage` nem `ItemList` em lugar nenhum.

**Confiança:** Alta.

---

## 7. Findings parcialmente confirmados

### F-08 · `/contato`, `/termos`, `/privacidade`, `/arquivo` — sintoma certo, causa errada · **P1**

O PDF classificou as quatro como *"rotas vazias"* com 4 palavras e recomendou
`404/410 ou noindex`. **Seguir essa recomendação apagaria páginas legítimas** —
inclusive a Política de Privacidade, que é obrigação de LGPD e sustenta o banner
de consentimento (`docs/LGPD.md`).

O que existe de fato:

| Rota | Componente | Linhas | H1 | SSR? |
|---|---|---|---|---|
| `/contato` | `pages/Contato.tsx` | 142 | `Fale Conosco` (`:60`) | **não** |
| `/termos` | `pages/Termos.tsx` | 190 | 3 variantes (`:30`, `:55`, `:122`) | **não** |
| `/privacidade` | `pages/Privacidade.tsx` | 451 | `Política de Privacidade` (`:332`) | **não** |
| `/arquivo` | `pages/Archive.tsx` | 387 | `:156` | **não** |

**Causa real:** `classifySsrPath` só reconhece `home`, `article` e `category`.
As institucionais caem no `spaHeadPlugin`, que serve o `index.html` — cujo
`<body>` é literalmente `<div id="root"></div>` (`index.html:129`). O crawler
sem execução de JS lê 0 palavras e nenhum H1.

**Correção correta:** ampliar o SSR (ou prerender no build) para essas rotas +
metadata própria por rota. **Não** noindex, **não** 410.

**Status:** `PARCIALMENTE CONFIRMADO — DIAGNÓSTICO DO PDF INCORRETO`
· Impacto: Médio · Esforço: Médio · Confiança: Alta.

---

### F-09 · Peso de HTML/DOM · **P2, sem ação imediata**

O PDF mediu 197.240 B de DOM, 39.268 B codificados, 69 imagens e OnPage 98,90 —
e recomendou reduzir markup/hidratação.

O que o código mostra:

- O `__SSR_DATA__` é o maior bloco e **já foi medido e cortado** de propósito:
  511 B/artigo, teto de 100 artigos, com um comentário registrando que subir para
  150 engordou a home em 16,5 KB (`vite.config.ts:588-597`).
- O JSON foi movido **para o fim do `<body>`**, atrás do `#root`, justamente para
  não atrasar o CSS render-blocking (`vite.config.ts:534-552`).
- As imagens são `loading="lazy"` em praticamente todos os componentes
  (`ArticleCard`, `NewsCard`, `HeroSection`, todos os `SectionBlock*`,
  `CategoryPage`, `ArtigosRelacionados`, `Footer`, `Header`).
- 197 KB → 39 KB codificados = **compressão de 5:1**, normal para HTML.

**Conclusão:** não há problema mensurável de download. O item volta à mesa
**só depois** de uma medição própria de Core Web Vitals em mobile real (§16,
E-9) — não por número de DOM. Priorizar micro-otimização aqui, antes de
F-01…F-05, seria inverter a ordem.

**Status:** `PARCIALMENTE CONFIRMADO` · Impacto: Baixo · Esforço: Alto ·
Confiança: Média.

---

## 8. Findings não aplicáveis ou contraditos

### F-10 · "Robots e sitemaps 2/2" — **CONTRADITO PELO REPOSITÓRIO**

O PDF deu a pontuação máxima ao OleySports nessa dimensão e listou "Sitemaps:
geral e Google News funcionais e anunciados no robots" entre os pontos fortes.

O `robots.txt` está de fato correto (dinâmico por host, sem domínio morto,
anunciando os dois sitemaps — `vite.config.ts:1004-1027`). O
`/api/sitemap-news.xml` também (consulta o banco de verdade). Mas o **sitemap
geral está vazio de artigos há quase dois meses** (F-01). O crawler do PDF
verificou que o XML era válido e estava anunciado; não verificou o que havia
dentro. Essa é a maior divergência entre o relatório e o código, e ela **inverte
o sinal**: o que o PDF contou como vantagem é um P0.

### F-11 · Hreflang — **NÃO APLICÁVEL NO MOMENTO**

O OleySports é monolíngue pt-BR: `settings.siteLanguage = "pt-BR"`, um único
domínio, nenhuma versão regional. O sistema **suporta** `en` (`lib/i18n.ts`,
usado pelo ksports), mas isso é *outro blog, outro banco, outro domínio* — não é
uma versão alternativa do mesmo conteúdo.

Observação adicional que o PDF não podia ver: `Artigo.tsx:246-260` já injeta,
**no cliente**, `<link rel="alternate" hreflang="pt-BR">` e `hreflang="x-default"`
apontando **ambos para a própria URL**. É auto-referência sem par — inofensiva,
mas ruído. Se o item for mexido algum dia, a ação correta é **remover**, não
adicionar.

**Ação:** nenhuma. Registrar a decisão como "não aplicável" e reavaliar apenas se
o OleySports ganhar versão em outro idioma/região.

### F-12 · Autoridade, backlinks, tráfego — **VALIDAÇÃO EXTERNA NECESSÁRIA**

`items_count: 0` no DataForSEO Labs e `result_count: 0` no backlinks summary são
lacunas de medição, não fatos sobre o site. Nada disso é endereçável por código.
Ver §16.

### F-13 · Problemas do BeeSports — **FORA DE ESCOPO POR DEFINIÇÃO**

BEE-01 (shell SPA), BEE-02 (robots apontando para `brasilia-agora.replit.app`),
BEE-03 (sitemap sem artigos), BEE-04 (metadata genérica), BEE-05 (sem JSON-LD)
**não viram tarefa do OleySports**. Duas observações de valor comparativo:

- **BEE-02 é a mesma classe de problema que o `CLAUDE.md §13` já resolveu aqui:**
  o `seoTextPlugin` foi criado exatamente porque `robots.txt`/`llms.txt`
  estáticos na imagem compartilhada anunciavam a marca e o sitemap de outro
  portal. O OleySports está imune — **preservar**.
- **BEE-03 (sitemap sem artigos) é literalmente o mesmo defeito de F-01.** O PDF
  cobrou isso do BeeSports como P0 e deu 2/2 ao OleySports — que tem o mesmo
  problema, só que escondido atrás de um XML bem-formado.

---

## 9. Problemas adicionais encontrados no repositório

### F-14 · Bloco "Mais Lidas" da home é um mock hardcoded de Brasília · **P0**

`artifacts/brasilia-agora/src/components/MostRead.tsx:8-14`:

```ts
const maisLidas = [
  { id: "pol-2", rank: 1, title: "Câmara Legislativa aprova projeto que cria o programa Morar DF", img: heroImg },
  { id: "df-3",  rank: 2, title: "Obras no Eixão alteram trânsito neste fim de semana em Brasília", img: trafficImg },
  { id: "sau-1", rank: 3, title: "Hospitais do DF registram queda nos casos de dengue em maio", img: hospitalImg },
  { id: "df-4",  rank: 4, title: "GDF anuncia mais 124 ônibus para reforçar o transporte público", img: busImg },
  { id: "tec-4", rank: 5, title: "Escolas públicas do DF alcançam melhores índices no IDEB 2023", img: studentsImg },
];
```

Cada item vira `<Link href={/artigo/${item.id}}>` (`MostRead.tsx:26`).

`artifacts/brasilia-agora/src/pages/Home.tsx:710`:

```ts
if (block.id === "mais-lidas") return <MostRead />;
```

E `deploy/oleysports/template_final.sql`, bloco de ordem **1**:
`{"id": "mais-lidas", "name": "Mais Lidas", "visible": true}`.

**Consequência no OleySports:** a home de um portal de esporte publica, na
primeira dobra, **cinco manchetes falsas sobre a Câmara Legislativa do DF, o
Eixão, dengue, ônibus do GDF e o IDEB**, com imagens de stock do sp011, linkando
para cinco URLs que não existem (`/artigo/pol-2`, `/artigo/df-3`,
`/artigo/sau-1`, `/artigo/df-4`, `/artigo/tec-4`) — todas HTTP 200 por F-02.

**Gêmeo dormente:** `components/DestaquesListaBadge.tsx` é o mesmo padrão (mock
de artigos do DF, links por `item.id`, textos em pt-BR hardcoded fora do
`i18n.ts`) e está ligado ao bloco `ultimas` (`Home.tsx:712`). No template do
OleySports ele está `visible: false`, mas **um clique no painel o liga**.

**Existe substituto pronto:** `components/blocks/PortalZoneBlocks.tsx:594`
(`SidebarMostRead`) já monta "mais lidas" **reais**, ordenadas por
`sortByViews`, com `href={/artigo/${a.slug ?? a.id}}`.

**Por que isto é P0 e não cosmético:** conteúdo fabricado, sem relação com o
nicho do site, na dobra principal, com links para páginas inexistentes que
respondem 200, é a assinatura exata do padrão que o Search Console classificou
como **"Páginas enganosas"** no `resenhavip` (`CLAUDE.md §19.3`). Some-se a isso
que o backfill replica o mesmo texto em até 7 domínios (`CLAUDE.md §9`).

**Impacto: Alto · Esforço: Baixo · Confiança: Alta.**

---

### F-15 · `categoryRoute()` derruba o breadcrumb de todo artigo do OleySports · **P1**

`artifacts/brasilia-agora/src/lib/categoryRoute.ts:1-17` é um `ROUTE_MAP`
hardcoded com as editorias do sp011. Fallback: `return ROUTE_MAP[key] ?? "/"`.

Validado localmente:

```
futebol              -> /
copa-do-mundo        -> /
volei                -> /
tenis                -> /
f1                   -> /
futebol-americano    -> /
e-sports             -> /
outros               -> /
esportes             -> /esportes     <- única que casa, e não é editoria do Oley
```

Usado em dois lugares de `pages/Artigo.tsx`:

- `:572` — `BreadcrumbList` JSON-LD, item de posição 2
  (`item: ${origin}${categoryRoute(article.category)}`);
- `:627` — o link visível do breadcrumb.

**Consequência:** em ~todos os artigos do OleySports o `BreadcrumbList` tem
`ListItem` 1 (`Início` → `origin/`) e `ListItem` 2 (`FUTEBOL` → `origin/`)
apontando para a **mesma URL**. Breadcrumb semanticamente inválido, e a trilha
visível leva o leitor de volta à home em vez da editoria. É um caso em que o PDF
contou o schema como vantagem sem poder inspecionar a qualidade.

**Confusão de nomes agravante:** existem dois arquivos quase homônimos —
`lib/categoryRoute.ts` (mapa morto do sp011) e `lib/categoryRoutes.ts` (fonte de
verdade compartilhada com o SSR, com testes). O primeiro deve ser **eliminado**
em favor do segundo.

**Impacto: Médio · Esforço: Baixo · Confiança: Alta.**

---

### F-16 · `articles.slug` sem `UNIQUE` no banco · **P2**

`lib/db/src/schema/articles.ts:39,70`: `slug: text("slug")` + índice
**não-único** `articles_slug_idx`. A desambiguação é feita em código
(`articleService.ts:342-352`), num laço `SELECT` → `INSERT` que é **TOCTOU**:
duas ingestões simultâneas do `deliveryWorker` podem gravar o mesmo slug.

Se acontecer, `getArticle(slug)` faz `.limit(1)` **sem `ORDER BY`** — devolve uma
linha arbitrária e o outro artigo fica inacessível pela URL amigável. O próprio
comentário em `articleService.ts:336` reconhece o sintoma ("getArticle(slug)
resolver sempre o artigo mais antigo") e trata só o caminho feliz.

**Impacto: Médio · Esforço: Baixo (índice único parcial + tratamento de
conflito) · Confiança: Alta no risco, desconhecida na ocorrência (§16, E-2).**

---

### F-17 · Página 404 é o scaffold do Vite, em inglês · **P1**

`artifacts/brasilia-agora/src/pages/not-found.tsx` inteiro:

```tsx
<h1 className="text-2xl font-bold text-gray-900">404 Page Not Found</h1>
<p className="mt-4 text-sm text-gray-600">Did you forget to add the page to the router?</p>
```

Sem header, sem footer, sem link para a home, sem `i18n`, e **com HTTP 200**
(F-02). É o que um leitor brasileiro vê ao errar uma URL no OleySports.

**Impacto: Médio (UX + qualidade percebida) · Esforço: Baixo · Confiança: Alta.**

---

### F-18 · `publisher.logo` do JSON-LD aponta para asset da imagem compartilhada · **P1**

`pages/Artigo.tsx:545-549` e `routes/amp.ts:101`:

```ts
logo: { "@type": "ImageObject", url: `${origin}/favicon.jpg` }
```

`/favicon.jpg` é arquivo **estático do build** (`public/favicon.jpg`) — a marca
do blog que gerou a imagem Docker, não a do OleySports. O `origin` está certo
(vem da requisição), mas o **conteúdo** da imagem não. As settings já publicam a
logo real como URL (`/api/site-asset/logo`), usada em toda a UI. É a mesma classe
de violação do `CLAUDE.md §13` que já foi corrigida no `robots.txt`, no
`llms.txt`, no `publisherName` do AMP e no `<head>`.

**Impacto: Baixo-Médio · Esforço: Baixo · Confiança: Alta.**

---

### F-19 · `dateModified` sempre igual a `datePublished` · **P2**

`pages/Artigo.tsx:534-535`: `datePublished: article.publishedAt, dateModified:
article.publishedAt`. A coluna `articles.updatedAt` existe e é mantida — o AMP já
a usa corretamente (`amp.ts:70`). Só o JSON-LD do site não.

**Impacto: Baixo · Esforço: Baixo · Confiança: Alta.**

---

### F-20 · `/sitemap.xml` e `/sitemap_index.xml` na raiz — comportamento a confirmar · **P2**

Nenhum dos dois existe em `public/`. Paths com extensão não entram no
`spaHeadPlugin` (`vite.config.ts:864`) nem no `ssrPlugin` (`ssrRoutes.ts:39`) —
caem no estático do `vite preview`. Se o fallback do `vite preview` responder
`index.html` com 200, o OleySports repete o defeito **BEE-02**. Se responder 404,
está correto.

**Não é determinável só pelo repositório.** Classificação: `PRECISA DE TESTE EM
RUNTIME`. Comando em §15.2.

---

### F-21 · `/api/sitemap-news.xml` não filtra `publishedAt` no futuro · **P3**

`routes/sitemap-news.ts:31`: `gte(articlesTable.publishedAt, cutoff)` — sem teto
superior. Um artigo agendado (a central grava `deliveries.scheduledAt` futuro,
`CLAUDE.md §10`) com `status = published` e data futura entra no sitemap de
notícias antes da publicação.

**Impacto: Baixo · Esforço: Baixo · Confiança: Média.**

---

### F-22 · `/api/sitemap.xml` sem `Cache-Control` e sem limite de tamanho · **P3**

O `sitemap-news` tem `public, max-age=900` (`sitemap-news.ts:62`); o sitemap
geral não tem header nenhum. Quando F-01 for corrigido e ele voltar a listar
milhares de artigos, isso vira custo por requisição — e o limite de 50.000 URLs /
50 MB do protocolo passa a valer.

---

### F-23 · Zero cobertura de teste na camada de SEO · **P1**

87 arquivos de teste no monorepo. **Nenhum** cobre: geração de sitemap, `<head>`
servido, status HTTP por rota, canonical ou JSON-LD. `ssrRoutes.test.ts` testa a
**classificação** de path (e passa, 6/6), mas não o que o middleware responde.

Consequência direta: F-01 (sitemap vazio) passou dois meses despercebido, e um
teste de 5 linhas o teria pego.

**Impacto: Alto (previne regressão de tudo o que este PRD propõe) · Esforço:
Médio · Confiança: Alta.**

---

### F-24 · Não há CI de build/typecheck/teste · **P2**

`.github/workflows/` contém apenas `security.yml`. `pnpm run typecheck` e os
testes rodam só na mão. (Ambos passam hoje — validado em §15.1.)

---

### F-25 · Herança do domínio antigo · **P2 · DEPENDE DE PRODUÇÃO**

`oleysports.midia.run` faz 301 para `oleysports.com.br`, **exceto `/api/*`**
(`deploy/README.md`, passo B — exclusão deliberada, para não quebrar o
`POST /api/ingest`). Efeito colateral: `https://oleysports.midia.run/api/sitemap.xml`
continua respondendo, e o `base` é montado de `req.get("host")`
(`sitemap.ts:34`) — ou seja, o host **antigo** publica um sitemap de URLs que
redirecionam. Baixo risco (o `robots.txt` do host antigo é 301), mas registrar.

Risco correlato a verificar no banco: artigos com `canonicalUrl` gravado
apontando para o domínio antigo — o SSR respeita esse campo acima de tudo
(`vite.config.ts:685`). Ver §16, E-3.

---

## 10. Pontos positivos a preservar

Estes itens são **não-regressões obrigatórias** de qualquer mudança deste PRD.

| # | O que | Onde | Por quê |
|---|---|---|---|
| P-1 | SSR de home, artigo e editoria | `vite.config.ts:463-846` | É a vantagem estrutural do OleySports sobre o BeeSports. Nenhuma correção pode aumentar dependência de JS. |
| P-2 | Cache de HTML + SWR de servidor | `vite.config.ts:481-505`, `:771-790` | Derruba TTFB para ~0 nos hits; o `mem_limit: 768m` do container `web` exige o teto de 200 entradas + LRU. |
| P-3 | `NewsArticle` + `BreadcrumbList` no artigo | `Artigo.tsx:525-580` | Base do "224/250 com schema". Corrigir F-15 **sem** remover o schema. |
| P-4 | `robots.txt` e `llms.txt` dinâmicos por host | `vite.config.ts:1029-1085` | Já resolvem, para estes dois arquivos, a classe de problema do BEE-02. |
| P-5 | Headers de segurança no Caddy | `Caddyfile`, `(blog)` | Não remover nenhum. CSP segue *report-only* até canário limpo (PRD-08). |
| P-6 | `/api/sitemap-news.xml` lendo o banco | `sitemap-news.ts:26-35` | É o único sitemap que funciona hoje; usar como modelo para F-01. |
| P-7 | Canonical do artigo já apontando para o slug | `vite.config.ts:669,685-687` | Atenua F-05 hoje. Manter enquanto o 301 não existir — e depois também. |
| P-8 | Imagens `lazy` + `srcset` + proxy com semáforo | `lib/newsImage.ts`, `lib/imageTransform.ts` | Já houve OOM-kill por `sharp` (12-13/08). Não mexer nas travas. |
| P-9 | `classifySsrPath` isolada e testada | `lib/ssrRoutes.ts` + teste | É onde a mudança de status HTTP deve entrar, justamente por ser testável. |
| P-10 | `sanitizeArticleHtml` isomórfico | `lib/sanitize.ts` | Nunca retornar `""` no servidor (React #418). |

---

## 11. Roadmap

### P0 — bloqueadores de indexação

---

#### **P0-1 · Resolução de URL e status HTTP** → *detalhado em `docs/PRD-P0-OLEYSPORTS-RESOLUCAO-URL-E-SOFT-404.md`*

- **Problema.** Nada no sistema responde 404 (F-02); a rede publica um link para
  um artigo inexistente (F-03); 13 editorias de outro blog respondem 200 e vazias
  (F-04); UUID e slug servem o mesmo artigo sem redirect (F-05); a home publica 5
  manchetes falsas com 5 links mortos (F-14).
- **Evidência.** `vite.config.ts:817-820,849-890`; `CategoryArchivePage.tsx:126`;
  `CategoryPage.tsx:77`; `categoryRoutes.ts:30-44`; `articleService.ts:275`;
  `MostRead.tsx:8-26` + `Home.tsx:710`.
- **Impacto:** Alto · **Esforço:** Médio · **Confiança:** Alta.
- **Solução.** Ver PRD dedicado. Em resumo: `spaHeadPlugin` e `ssrPlugin` passam
  a emitir `404` para rota que não existe; empty state deixa de ser link;
  `/artigo/<uuid>` vira `301` para o slug; a superfície de editorias passa a ser
  a do blog (`settings.categories` → menu → fixas), não a tabela do sp011; blocos
  mock saem do renderizador.
- **Dependências.** Nenhuma. É a raiz das demais.
- **Riscos.** Um 404 indevido tira página real do índice — mitigado por allowlist
  explícita + tabela de testes por rota.

---

#### **P0-2 · Sitemap geral volta a listar artigos e as editorias reais do blog**

- **Problema.** F-01: `store.getArticles()` é stub `[]`; as 14 rotas estáticas
  são as do sp011.
- **Evidência.** `routes/sitemap.ts:6-20,36-37`; `lib/store.ts:1330-1333`.
- **Impacto:** Alto · **Esforço:** Baixo · **Confiança:** Alta.
- **Solução recomendada.**
  1. Trocar `store.getArticles()` por consulta direta ao banco, no molde do
     `sitemap-news.ts`: `db.select({ slug, id, updatedAt, publishedAt })
     .from(articlesTable).where(eq(status,"published"))`, ordenado por
     `publishedAt desc`.
  2. `<loc>` usa **`slug || id`** — a mesma regra dos links internos e do
     canonical. Nunca emitir URL que o P0-1 redirecionaria.
  3. Trocar `STATIC_PAGES` hardcoded por: `/` + as editorias **deste** blog,
     derivadas de `store.getSettings().categories` (cadastro do painel) com
     fallback para os `menuItems` internos e visíveis — a mesma cascata que
     `seoLinksFromSite` (`vite.config.ts:943`) e `resolveCategoryRoute` já usam.
  4. Só incluir editoria com **pelo menos 1 artigo publicado** (o
     `/api/categories` já calcula essa contagem — `routes/articles.ts:19-27`).
  5. Adicionar `Cache-Control: public, max-age=900` e teto de 50.000 URLs
     (acima disso, sitemap index — hoje irreal, mas registrar o limite).
  6. Excluir artigo com `canonicalUrl` externo (canônico noutro domínio não entra
     no sitemap deste).
- **Arquivos.** `artifacts/api-server/src/routes/sitemap.ts`;
  `artifacts/api-server/src/lib/store.ts` (opcional: apagar o stub, para que
  qualquer outro consumidor quebre no typecheck em vez de silenciosamente).
- **Dependências.** **Depois do P0-1** — o sitemap não pode publicar uma URL cujo
  status o P0-1 vai mudar. Se o P0-1 escorregar, este item ainda pode ir sozinho
  (só adiciona URLs válidas), mas as editorias vazias precisam sair na mesma leva.
- **Riscos.** Sitemap grande de repente → pico de crawl. Aceitável e desejável.
- **Aceite.**
  - `curl -s https://oleysports.com.br/api/sitemap.xml | grep -c "<loc>"` > 200;
  - toda `<loc>` de artigo bate com `slug || id` do banco;
  - nenhuma `<loc>` para `/politica`, `/cidade`, `/seguranca`, `/transporte`,
    `/educacao`, `/brasil`, `/mundo`, `/colunas`, `/tecnologia`;
  - `<loc>` presente para `/futebol` e demais editorias com artigo.
- **Regressão.** `/api/sitemap-news.xml` inalterado; `robots.txt` continua
  anunciando os dois.

---

### P1 — alto valor

#### **P1-1 · Metadata própria por rota**

- **Problema.** F-06 (editoria herda a description do site) + F-08 (institucional
  sem canonical) + "title padrão em 7 URLs" do PDF.
- **Solução.**
  - Editoria: `description` a partir de `settings.categories[].description`
    (campo novo, editável no painel → Categorias), com fallback para um texto
    derivado do rótulo + nome do portal. **Não inventar texto editorial no
    código** — o campo é de produto (§17, R-9).
  - Institucionais: `<link rel="canonical">` no `spaHeadPlugin` (hoje ele passa
    `extraTags` vazio, `vite.config.ts:870`) + title/description por rota, via um
    mapa `path → chave de i18n`.
- **Arquivos.** `vite.config.ts` (`renderCategory`, `spaHeadPlugin`);
  `lib/adminApi.ts` + `pages/admin/CategoriesManager.tsx` (campo novo);
  `lib/store.ts` (tipo de `categories`).
- **Impacto:** Médio · **Esforço:** Médio · **Confiança:** Alta.
- **Aceite.** `curl` sem JS em `/futebol`, `/contato` e `/termos` retorna
  `description` distinta entre si e um `<link rel="canonical">` correto.

#### **P1-2 · SSR (ou prerender) das páginas institucionais**

- **Problema.** F-08.
- **Solução.** Estender `classifySsrPath` com um `kind: "static"` e uma allowlist
  explícita (`/contato`, `/termos`, `/privacidade`, `/arquivo`), importando as
  páginas estaticamente no `entry-server.tsx` — o mesmo mecanismo já usado para
  `Artigo` e `CategoryArchivePage` (`entry-server.tsx:34`). `/arquivo` precisa de
  seed de dados como a editoria.
- **Dependências.** P0-1 (a allowlist de rotas válidas é a mesma tabela).
- **Impacto:** Médio · **Esforço:** Médio · **Confiança:** Alta.
- **Aceite.** `curl -s https://oleysports.com.br/contato | grep -c "<h1"` ≥ 1.

#### **P1-3 · Corrigir o breadcrumb (F-15)**

- **Solução.** Apagar `lib/categoryRoute.ts` e resolver o path da editoria pela
  fonte única: `settings.categories` → `menuItems` → `FIXED_CATEGORIES` (a mesma
  cascata de `resolveCategoryRoute`). Quando a categoria do artigo não tiver
  página, **omitir o `ListItem` de posição 2** em vez de apontar para `/`.
- **Arquivos.** `pages/Artigo.tsx:572,627`; `lib/categoryRoute.ts` (remover);
  `lib/categoryRoutes.ts` (nova função `categoryPathFor(slug, settings)`).
- **Impacto:** Médio · **Esforço:** Baixo · **Confiança:** Alta.
- **Aceite.** Rich Results Test aprova o `BreadcrumbList` de um artigo de
  `/futebol` com item 2 → `https://oleysports.com.br/futebol`.

#### **P1-4 · `WebSite` + `Organization` na home; `CollectionPage`/`ItemList` na editoria (F-07)**

- **Solução.** JSON-LD montado no SSR (não no cliente), a partir de `settings`:
  `Organization` (name, url, logo de `/api/site-asset/logo`, `sameAs` das redes
  cadastradas) e `WebSite` (com `potentialAction: SearchAction` **só se** houver
  busca real). Na editoria, `CollectionPage` + `ItemList` com os itens
  efetivamente renderizados + `BreadcrumbList`.
- **Regra.** Não adicionar schema por adicionar: `ItemList` só com itens
  visíveis; `SearchAction` só com endpoint de busca real.
- **Dependências.** P1-3 (mesma resolução de path) e P0-1 (editoria vazia não
  deve nem existir para receber `ItemList`).
- **Impacto:** Médio · **Esforço:** Médio · **Confiança:** Alta.

#### **P1-5 · `publisher.logo` real (F-18) e `dateModified` real (F-19)**

- **Solução.** `logo.url` = `${origin}/api/site-asset/logo` quando
  `settings.logoBase64` existir; fallback para o favicon das settings; só então o
  estático. `dateModified: article.updatedAt ?? article.publishedAt`.
- **Arquivos.** `pages/Artigo.tsx:534-549`; `routes/amp.ts:99-103`.
- **Impacto:** Baixo-Médio · **Esforço:** Baixo · **Confiança:** Alta.

#### **P1-6 · Página 404 de verdade (F-17)**

- **Solução.** Reescrever `pages/not-found.tsx` com `TopBar`/`Header`/`Footer`,
  `useT()`, link para a home e para as editorias principais. O status 404 vem do
  P0-1 (servidor); esta é a camada visual.
- **Impacto:** Médio · **Esforço:** Baixo · **Confiança:** Alta.

#### **P1-7 · Testes da camada de SEO (F-23)**

Ver §14.

---

### P2 — melhoria

| ID | Item | Referência |
|---|---|---|
| P2-1 | `UNIQUE` parcial em `articles.slug` (`WHERE slug IS NOT NULL AND slug <> ''`) + `ORDER BY created_at` no `getArticle` + tratamento de conflito no insert | F-16 |
| P2-2 | Confirmar o comportamento de `/sitemap.xml` e `/sitemap_index.xml` na raiz; se responderem 200, redirecionar 301 para `/api/sitemap.xml` | F-20 |
| P2-3 | `Cache-Control` e teto de 50k URLs no sitemap geral | F-22 |
| P2-4 | CI mínimo: `pnpm run typecheck` + `node --test` por pacote em PR/push | F-24 |
| P2-5 | Auditar `articles.canonicalUrl` do OleySports em busca de resíduo de `oleysports.midia.run` | F-25 |
| P2-6 | Revisitar peso de DOM **depois** de medir Core Web Vitals em mobile real | F-09 |

### P3 — opcional / futuro

| ID | Item | Justificativa |
|---|---|---|
| P3-1 | Remover o `hreflang` auto-referente do `Artigo.tsx:246-260` | F-11. Só faz sentido junto de outra mexida no `<head>` do artigo; sozinho não paga o deploy. |
| P3-2 | Filtrar `publishedAt <= now()` no sitemap de notícias | F-21. Só vira problema quando o agendamento for usado com frequência. |
| P3-3 | Variação de reescrita por blog (anti-duplicação entre domínios) | `CLAUDE.md §9` / §19.3. Não é finding desta auditoria, mas é o vizinho direto do F-14 e já está na fila do usuário. |

---

## 12. Matriz de prioridade

| ID | Problema | Prioridade | Impacto | Esforço | Confiança | Dependências |
|---|---|---|---|---|---|---|
| P0-1 | Soft-404 sistêmico, placeholder, UUID↔slug, editorias alheias, blocos mock | **P0** | Alto | Médio | Alta | — |
| P0-2 | Sitemap geral sem artigos e com rotas do sp011 | **P0** | Alto | Baixo | Alta | P0-1 (ordem preferencial) |
| P1-1 | Metadata por rota (editoria + institucional + canonical no fallback) | P1 | Médio | Médio | Alta | P0-1 |
| P1-2 | SSR das institucionais | P1 | Médio | Médio | Alta | P0-1 |
| P1-3 | Breadcrumb apontando para a home | P1 | Médio | Baixo | Alta | — |
| P1-4 | `WebSite`/`Organization`/`CollectionPage` | P1 | Médio | Médio | Alta | P1-3, P0-1 |
| P1-5 | `publisher.logo` e `dateModified` | P1 | Baixo-Médio | Baixo | Alta | — |
| P1-6 | Página 404 real | P1 | Médio | Baixo | Alta | P0-1 |
| P1-7 | Testes de sitemap/status/head | P1 | Alto (anti-regressão) | Médio | Alta | P0-1, P0-2 |
| P2-1 | `UNIQUE` em `slug` | P2 | Médio | Baixo | Alta | — |
| P2-2 | `/sitemap.xml` na raiz | P2 | Baixo | Baixo | **Média** (precisa runtime) | — |
| P2-3 | Cache/limite do sitemap | P2 | Baixo | Baixo | Alta | P0-2 |
| P2-4 | CI de typecheck/teste | P2 | Médio | Baixo | Alta | — |
| P2-5 | Resíduo de `canonicalUrl` do domínio antigo | P2 | Médio | Baixo | **Média** (precisa banco) | — |
| P2-6 | Peso de DOM | P2 | Baixo | Alto | Média | medição própria (E-9) |
| P3-1 | Remover hreflang auto-referente | P3 | Nulo | Baixo | Alta | — |
| P3-2 | Filtro de data futura no news sitemap | P3 | Baixo | Baixo | Média | — |
| P3-3 | Variação de reescrita por blog | P3 | Alto (rede) | Alto | Média | fora deste PRD |

---

## 13. Dependências entre mudanças

```
P0-1  Resolução de URL e status HTTP
  ├─→ P0-2  Sitemap  (o sitemap só pode publicar URLs cujo status é definitivo)
  ├─→ P1-1  Metadata por rota  (precisa saber quais rotas existem)
  ├─→ P1-2  SSR das institucionais  (mesma allowlist de rotas válidas)
  ├─→ P1-6  Página 404 visual  (o status vem do servidor, o visual vem daqui)
  └─→ P1-7  Testes  (os testes codificam o contrato que o P0-1 estabelece)

P1-3  Breadcrumb (fonte única de path de editoria)
  └─→ P1-4  CollectionPage / BreadcrumbList da editoria

P0-2  Sitemap
  └─→ P2-3  Cache-Control e limite de 50k
```

**Regras de ordem, e por quê:**

1. **Status HTTP antes de sitemap.** Publicar no sitemap uma URL que em seguida
   passará a responder 404 ou 301 gasta crawl budget duas vezes e gera erro no
   GSC. O inverso (corrigir status e só então publicar) é limpo.
2. **Superfície de editorias antes de metadata de editoria.** Não faz sentido
   escrever description para `/politica` num blog de esporte; primeiro decide-se
   que ela não existe.
3. **Fonte única de path de editoria antes de qualquer schema de coleção.**
   `BreadcrumbList` e `CollectionPage` precisam do mesmo path.
4. **Testes junto, não depois.** F-23 é a razão de F-01 ter durado dois meses.

---

## 14. Estratégia de testes

Runner: `node --test` via `tsx` (vitest não roda no Windows — `CLAUDE.md §14`).
Imports relativos com extensão `.ts` explícita.

### 14.1 Unitários (funções puras — já é o padrão do repo)

| Arquivo de teste | O que cobre |
|---|---|
| `artifacts/brasilia-agora/src/lib/ssrRoutes.test.ts` *(estender)* | Novo `kind` de rota estática; path reservado; path desconhecido → `null`. |
| `artifacts/brasilia-agora/src/lib/categoryRoutes.test.ts` *(estender)* | `categoryPathFor(slug, settings)`: casa `settings.categories`, casa menu, cai em `FIXED_CATEGORIES`, e **devolve `null`** quando não há página (F-15). |
| **novo** `artifacts/api-server/test/sitemapXml.test.ts` | Geração de XML a partir de lista injetada: `<loc>` usa `slug \|\| id`; `draft` fora; `canonicalUrl` externo fora; escape de `&`, `<`, `"`; `lastmod` em ISO-date. |
| **novo** `artifacts/api-server/test/sitemapStatic.test.ts` | Rotas estáticas derivadas de `settings` fictícias: só editorias com contagem > 0; nenhuma editoria do sp011 num blog que não as tem. |
| **novo** `artifacts/brasilia-agora/src/lib/articleUrl.test.ts` | `canonicalArticlePath(article)` e `shouldRedirectToSlug(requested, article)`: UUID → redireciona; slug → não; slug vazio → não; artigo sem slug → não. |

### 14.2 Integração / rota (api-server)

Molde: `artifacts/api-server/test/routesAds.test.ts` (já monta o Express com stubs).

- `GET /api/sitemap.xml` com 3 publicados + 1 draft → 3 `<loc>` de artigo,
  `Content-Type: application/xml`, `Cache-Control` presente.
- `GET /api/sitemap.xml` com zero artigos → XML válido, só a home.
- `GET /api/articles/:id` com UUID e com slug → mesmo `article.id`.
- `GET /api/articles/inexistente` → **404** (já é o comportamento; blindar).

### 14.3 Testes de status HTTP (novos — a lacuna mais séria)

O `web` roda `vite preview`; os middlewares são funções dentro do
`vite.config.ts`. **Pré-requisito:** extrair a lógica de decisão para `src/lib/`
(puro, sem `IncomingMessage`), como já foi feito com `classifySsrPath`. Aí os
testes rodam sem subir servidor:

```
decideResponse({ path, method, articleExists, categoryExists, requestedIsUuid })
  → { status: 200 | 301 | 404, location?, ssr: boolean }
```

Casos obrigatórios:

| Entrada | Esperado |
|---|---|
| `/` | 200, SSR home |
| `/artigo/<slug-existente>` | 200, SSR |
| `/artigo/<uuid-do-mesmo-artigo>` | **301** → `/artigo/<slug>` |
| `/artigo/nao-existe` | **404** |
| `/artigo/__placeholder__` | **404** |
| `/futebol` (com artigos) | 200, SSR |
| `/futebol` (sem artigos) | 200 + `noindex` (decisão do P0-1) |
| `/politica` (editoria não pertence ao blog) | **404** |
| `/geral` | **404** |
| `/contato` | 200 (allowlist) |
| `/admin` | 200 |
| `/favicon.jpg` | passa adiante (estático) |
| `HEAD /artigo/nao-existe` | **404**, sem corpo |

### 14.4 Regressão obrigatória (executar antes e depois)

```
pnpm exec tsc -b                                   # libs
cd artifacts/api-server      && pnpm run typecheck && npx tsx --test test/*.test.ts
cd artifacts/brasilia-agora  && pnpm run typecheck && npx tsx --test "src/**/*.test.ts"
```

**Baseline verificado em 19/08/2026:** typecheck limpo nos dois pacotes;
`ssrRoutes` + `categoryRoutes` + `homeBlocks` = 43 testes, 43 passando.

---

## 15. Plano de validação SEO

### 15.1 Validação local (feita nesta auditoria)

| O que | Comando | Resultado em 19/08/2026 |
|---|---|---|
| Typecheck api-server | `cd artifacts/api-server && pnpm run typecheck` | ✔ limpo |
| Typecheck frontend | `cd artifacts/brasilia-agora && pnpm run typecheck` | ✔ limpo |
| Testes de rota/categoria/blocos | `npx tsx --test src/lib/ssrRoutes.test.ts src/lib/categoryRoutes.test.ts src/lib/homeBlocks.test.ts` | ✔ 43/43 |
| Simulação de resolução com o menu real do Oley | script sobre `classifySsrPath` + `resolveCategoryRoute` + `categoryRoute` | ✔ reproduz F-02, F-04 e F-15 |

**Limitação registrada:** `vite build` **não roda no Windows** (o
`pnpm-workspace.yaml` exclui os binários win32 de rollup/esbuild/lightningcss —
`CLAUDE.md §14`). Portanto **nenhum HTML servido foi inspecionado localmente**;
tudo o que este PRD afirma sobre HTML servido vem da leitura do middleware, não
de execução. Validação de resposta real = na VPS (§15.2), conforme a preferência
registrada de nunca validar por DevTools.

### 15.2 Validação em produção (VPS) — antes e depois

Bloco pronto para colar (só leitura; não altera nada):

```bash
cd /opt/sp011
D=https://oleysports.com.br

echo "-- status por rota ---------------------------"
for p in / /futebol /copa-do-mundo /politica /geral /contato /termos \
         /privacidade /arquivo /artigo/__placeholder__ /artigo/pol-2 \
         /rota-que-nao-existe /sitemap.xml /sitemap_index.xml; do
  printf '%-28s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "$D$p")"
done

echo "-- sitemap geral -----------------------------"
curl -s "$D/api/sitemap.xml" | grep -c '<loc>'
curl -s "$D/api/sitemap.xml" | grep -c '/artigo/'

echo "-- sitemap de noticias -----------------------"
curl -s "$D/api/sitemap-news.xml" | grep -c '<loc>'

echo "-- robots ------------------------------------"
curl -s "$D/robots.txt"

echo "-- head da home (sem JS) ---------------------"
curl -s "$D/" | grep -oE '<title>[^<]*</title>|<link rel="canonical"[^>]*>|<meta name="description"[^>]*>'

echo "-- head e schema de uma editoria -------------"
curl -s "$D/futebol" | grep -oE '<title>[^<]*</title>|<link rel="canonical"[^>]*>|<meta name="description"[^>]*>'
curl -s "$D/futebol" | grep -c 'application/ld+json'

echo "-- artigo: UUID vs slug ----------------------"
S=$(curl -s "$D/api/articles?limit=1&sort=recent" | grep -oE '"slug":"[^"]*"' | head -1 | cut -d'"' -f4)
I=$(curl -s "$D/api/articles?limit=1&sort=recent" | grep -oE '"id":"[^"]*"'   | head -1 | cut -d'"' -f4)
echo "slug=$S id=$I"
curl -s -o /dev/null -w 'slug -> %{http_code}\n' "$D/artigo/$S"
curl -s -o /dev/null -w 'uuid -> %{http_code} %{redirect_url}\n' "$D/artigo/$I"
curl -s "$D/artigo/$I" | grep -oE '<link rel="canonical"[^>]*>'

echo "-- mock Mais Lidas na home -------------------"
curl -s "$D/" | grep -c 'Eixao\|Morar DF\|IDEB'

echo "-- headers de seguranca ----------------------"
curl -sI "$D/" | grep -iE 'strict-transport|x-content-type|referrer-policy|permissions-policy|content-security'
```

**Baseline esperado (antes das correções):** `/geral`, `/politica`,
`/artigo/__placeholder__`, `/artigo/pol-2` e `/rota-que-nao-existe` respondem
**200** (F-02/F-04); `grep -c '/artigo/'` no sitemap geral dá **0** (F-01); o
`grep -c` do mock dá **≥ 1** (F-14). Se algum desses divergir, repositório e
produção estão fora de sincronia e a análise precisa ser revisitada antes de
implementar.

### 15.3 Depois de cada entrega

- Reexecutar o bloco acima e diferenciar contra o baseline.
- Extrair os `<script type="application/ld+json">` de home, editoria e artigo e
  validar no **Rich Results Test** e no **Schema Markup Validator**.
- GSC → Inspeção de URL → "Testar URL ativa" numa editoria, num artigo e numa URL
  que deve 404.
- GSC → Sitemaps → reenviar `/api/sitemap.xml` e conferir "URLs descobertas".

---

## 16. Validações externas necessárias

Nada abaixo é decidível pelo repositório. Registrar como pendência; **não**
transformar em bug técnico.

| # | Pergunta | Onde responder | Bloqueia o quê |
|---|---|---|---|
| E-1 | Quantos artigos do OleySports têm `slug` NULL ou `''`? | `docker compose exec -T pg-blogs psql -U postgres -d oleysports -c "SELECT count(*) FROM articles WHERE slug IS NULL OR slug='';"` | dimensiona F-05 e F-16 |
| E-2 | Há slugs duplicados? | `... -c "SELECT slug, count(*) FROM articles WHERE slug<>'' GROUP BY 1 HAVING count(*)>1;"` | decide urgência do P2-1 |
| E-3 | Há `canonical_url` apontando para `oleysports.midia.run`? | `... -c "SELECT count(*) FROM articles WHERE canonical_url ILIKE '%midia.run%';"` | F-25 / P2-5 |
| E-4 | Quantos artigos publicados existem no total? | `... -c "SELECT count(*) FROM articles WHERE status='published';"` | dimensiona o ganho do P0-2 |
| E-5 | `/sitemap.xml` e `/sitemap_index.xml` na raiz respondem 200 ou 404? | bloco de §15.2 | F-20 / P2-2 |
| E-6 | GSC do `oleysports.com.br` verificado? Quantas URLs indexadas, "Rastreada — não indexada" e "Página alternativa com tag canônica adequada"? | Search Console | mede o dano real de F-02/F-05 |
| E-7 | A mudança de endereço `oleysports.midia.run` → `oleysports.com.br` foi comunicada no GSC? | Search Console → Mudança de endereço | recuperação da migração de 14/08 |
| E-8 | O OleySports está no Google Publisher Center / Google News? | Publisher Center | valida o `sitemap-news` |
| E-9 | Core Web Vitals em mobile real (CrUX) | PageSpeed Insights com dados de campo | única base legítima para reabrir F-09 |
| E-10 | Perfil de backlinks e presença de marca na SERP | DataForSEO/Ahrefs com dados válidos | OLEY-07 — permanece lacuna de medição |
| E-11 | Há flag de Safe Browsing / "Páginas enganosas" no `oleysports.com.br`? | Search Console → Segurança e ações manuais | reforça a urgência do F-14 |

---

## 17. Riscos

| # | Risco | Probabilidade | Severidade | Mitigação |
|---|---|---|---|---|
| R-1 | Um 404 mal calibrado tira do índice página que existe | Média | **Alta** | Allowlist explícita de rotas válidas + tabela de testes de status (§14.3) + baseline de §15.2 antes/depois |
| R-2 | Mudança na imagem compartilhada quebra outro blog da rede | Média | Alta | A superfície de editorias passa a ser derivada de `settings`; blog sem `settings.categories` (o sp011, taxonomia vazia de propósito) precisa de fallback para `menuItems` + `FIXED_CATEGORIES`. **Testar o sp011 no canário.** |
| R-3 | Remover o bloco `mais-lidas` deixa buraco visual na home | Alta | Baixa | Substituir por "mais lidas" **reais** (`SidebarMostRead`, `PortalZoneBlocks.tsx:594`, já ordena por `sortByViews`), não apenas apagar |
| R-4 | 301 UUID→slug quebra link externo/histórico | Baixa | Média | 301 preserva o link; só muda o destino. Nunca 404 num UUID que resolve. |
| R-5 | Sitemap grande derruba o `api` (`mem_limit`) | Baixa | Média | `select` de 4 colunas (molde do `sitemap-news`), `Cache-Control: 900`, teto de 50k |
| R-6 | Rollout da imagem custa ~20 min e afeta 11 blogs | Alta | Baixa | Procedimento padrão do `CLAUDE.md §6`: bump + `build api web` + sp011 + canário + demais em paralelo |
| R-7 | O `Caddyfile` é bind de arquivo único | Média | Média | Se algum item tocar o `Caddyfile`, exigir `up -d --force-recreate caddy` (`CLAUDE.md §5`) |
| R-8 | Análise baseada em código, sem HTML servido inspecionado localmente | Certa | Média | §15.2 roda **antes** de implementar, para confirmar o baseline |
| R-9 | Escrever texto editorial de categoria no código | Média | Média | Description de editoria é **campo de produto** no painel, não literal no bundle. O código só provê o fallback estrutural. |

---

## 18. Rollback

- **Código:** commit direto na `main` (`CLAUDE.md §18`), um commit por item do
  roadmap. Rollback = `git revert <sha>` + bump de `BLOG_IMAGE_VERSION` + build.
- **Imagem:** cada blog fixa `BLOG_IMAGE_TAG` no `.env` próprio. Rollback de um
  blog só = `sed -i` da tag anterior + `docker compose up -d` no dir do blog. A
  tag anterior continua no host (não há registry) — **não podar imagens antes do
  canário estabilizar**.
- **Banco:** nenhuma alteração de dados neste roadmap, exceto P2-1 (índice
  único). Rollback = `DROP INDEX`.
- **Sinal de rollback:** queda abrupta de URLs indexadas no GSC, ou aparecimento
  de 404 em URL que existia (comparar com o baseline de §15.2).

---

## 19. Métricas técnicas de sucesso

Todas verificáveis por `curl`/SQL/GSC. **Nenhuma meta de tráfego.**

| # | Métrica | Baseline (19/08/2026) | Alvo |
|---|---|---|---|
| M-1 | `<loc>` de artigo em `/api/sitemap.xml` | **0** | = nº de artigos publicados com slug |
| M-2 | `<loc>` de editoria inexistente no blog | 11 | **0** |
| M-3 | Status de `/artigo/__placeholder__` | 200 | **404** |
| M-4 | Status de `/geral` e de rota inventada | 200 | **404** |
| M-5 | Status de `/politica` no OleySports | 200 | **404** |
| M-6 | Status de `/artigo/<uuid>` | 200 | **301** → `/artigo/<slug>` |
| M-7 | Ocorrências de "Eixão"/"Morar DF"/"IDEB" no HTML da home | ≥ 1 | **0** |
| M-8 | Páginas com `description` idêntica à do site | ~26 | **≤ 1** (só a home) |
| M-9 | `<h1>` no HTML servido de `/contato` sem JS | 0 | **1** |
| M-10 | `<link rel="canonical">` presente em toda rota 200 | ausente nas institucionais | **100%** |
| M-11 | JSON-LD válido no Rich Results Test para home, editoria e artigo | só artigo, com breadcrumb inválido | **3/3 válidos** |
| M-12 | Testes automatizados cobrindo sitemap, status e `<head>` | 0 | **≥ 20 casos** |
| M-13 | GSC → "Rastreada — não indexada" | desconhecido (E-6) | tendência de queda em 60 dias |

---

## 20. Definição de pronto

Um item do roadmap está pronto quando **todos** os quadrados abaixo estiverem
marcados.

- [ ] Código commitado direto na `main`, mensagem em pt-BR descrevendo a entrega.
- [ ] `pnpm exec tsc -b` limpo; `pnpm run typecheck` limpo nos dois pacotes.
- [ ] Testes novos escritos **antes ou junto** da mudança, e a suíte inteira
      passando (`node --test` em `api-server` e `brasilia-agora`).
- [ ] Bloco de rollout do `CLAUDE.md §6` executado: bump de
      `BLOG_IMAGE_VERSION`, `build api web`, sp011, **canário**, demais em
      paralelo.
- [ ] Bloco de verificação de §15.2 executado na VPS e diferenciado contra o
      baseline — **no OleySports e no canário**.
- [ ] Nenhuma não-regressão da §10 violada (SSR ativo, schema de artigo válido,
      `sitemap-news` funcionando, headers de segurança presentes).
- [ ] `curl -s https://<dominio>/api/site | grep -o '"siteName":"[^"]*"'` em cada
      domínio afetado devolve o nome certo (diagnóstico de mistura de blogs,
      `CLAUDE.md §6`).
- [ ] Métricas de §19 tocadas pelo item medidas e registradas.
- [ ] `CLAUDE.md` atualizado se a mudança criar invariante nova.

---

## 21. Ordem recomendada de implementação

A ordem sai da arquitetura, não do PDF: **primeiro o sistema aprende a dizer o
que existe; depois publica isso; depois descreve; depois estrutura.**

```
Etapa 0 · Baseline em producao                       (§15.2, sem alterar nada)
   └─ confirma que repositorio e producao concordam antes de qualquer mudanca

Etapa 1 · P0-1 — Resolucao de URL e status HTTP      → PRD dedicado
   1a. Retirar MostRead/DestaquesListaBadge do renderizador          (F-14)
   1b. Empty state da editoria deixa de ser link                     (F-03)
   1c. Superficie de editorias = as do blog, nao as do sp011         (F-04)
   1d. 404 para artigo/editoria/rota inexistente                     (F-02)
   1e. 301 de /artigo/<uuid> para /artigo/<slug>                     (F-05)
   └─ rollout + canario + verificacao

Etapa 2 · P0-2 — Sitemap geral                                       (F-01)
   └─ artigos do banco + editorias reais + Cache-Control
   └─ reenviar no GSC

Etapa 3 · P1-3 + P1-5 — Fonte unica de path e dados corretos no schema
   └─ breadcrumb, publisher.logo, dateModified   (mudancas pequenas, mesmo deploy)

Etapa 4 · P1-2 + P1-6 — SSR das institucionais + pagina 404 real
   └─ o crawler passa a ver conteudo em /contato, /termos, /privacidade, /arquivo

Etapa 5 · P1-1 — Metadata por rota
   └─ campo de description por editoria no painel + canonical no fallback SPA

Etapa 6 · P1-4 — Schema de home e colecao
   └─ Organization/WebSite + CollectionPage/ItemList

Etapa 7 · P1-7 + P2-4 — Fechar a malha
   └─ testes de sitemap/status/head + CI de typecheck e teste

Etapa 8 · P2/P3 — Higiene
   └─ UNIQUE em slug, /sitemap.xml na raiz, canonicalUrl legado, hreflang
   └─ reabrir peso de DOM SOMENTE com Core Web Vitals de campo em maos
```

**Por que as Etapas 1 e 2 não podem ser invertidas:** o sitemap é a declaração
pública de "estas URLs existem e valem a pena". Declarar isso antes de decidir o
que existe (Etapa 1) significa publicar, com autoridade de sitemap, URLs que em
seguida vão 301 ou 404 — o pior dos dois mundos num domínio que está sendo
indexado do zero desde 14/08/2026.
