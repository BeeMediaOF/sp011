# PRD Técnico V2 — Auditoria SEO e Arquitetural OleySports

> **Status:** Proposto · **Data:** 2026-08-20 · **Versão:** 2
>
> **P0 ENTREGUE em 2026-08-21** (imagem `v98`, rede inteira): `F-26`, `F-02`,
> `F-20`, `F-03`, `F-04`, `F-05`, `F-01` e `F-22` estão fechados. Detalhes,
> desvios e validação em `docs/IMPLEMENTACAO-P0-OLEYSPORTS-RELATORIO.md`.
> O restante do roadmap (P1, P2, P3) segue **proposto**.
>
> **Supersede a versão anterior após revalidação adversarial de 19/20-08-2026.**
> Documento anterior: `docs/PRD-SEO-TECHNICAL-OLEYSPORTS.md` (preservado como
> histórico da análise — **não** apagar).
>
> **Origem:** auditoria cruzada PDF × código (19/08) + **revalidação adversarial
> com runtime de produção** (19-20/08, `docs/REVALIDACAO-PRDS-OLEYSPORTS.md`).
>
> **Ordem de autoridade aplicada:** runtime confirmado > código atual >
> dados/configuração atual > git history > PDF snapshot > inferência.
>
> **Estado do repositório na redação:** branch `main`, HEAD `b555965`
> (18/08/2026). Produção confirmada como ≥ `20e01a6` (17/08/2026) pela presença
> do GTM injetado no servidor no HTML servido. **Não há gap HEAD × deploy na
> camada auditada.**
>
> **Nenhuma linha de código, banco, configuração ou infraestrutura foi alterada
> na produção deste documento.**

---

## 1. Título

PRD Técnico V2 — Auditoria SEO e Arquitetural OleySports (consolidado após
revalidação com runtime).

---

## 2. O que mudou da V1 para a V2

Esta seção existe para quem leu a V1. É a lista completa das correções.

| # | Mudança | Origem |
|---|---|---|
| 1 | **Novo finding P0: `F-26` — divergência de conteúdo por User-Agent em `/artigo/*`.** Googlebot recebe ~3 KB; navegador recebe ~86 KB | Revalidação §7.2 |
| 2 | **`F-14` (mock "Mais Lidas") rebaixado de P0 para P2** — o mock **não chega** à produção | Revalidação §11.2 |
| 3 | **`F-20` sobe de P2 para P0** e cresce: não é só `/sitemap.xml`, é toda a classe de paths com extensão | Revalidação §6.1 |
| 4 | **`F-08` deixa de acusar o PDF de erro.** O PDF observou corretamente HTML thin; o código revela a causa (CSR-only) | Revalidação §5.1 |
| 5 | **`F-10` deixa de ser "PDF contradito"** → "endpoint funcional, inventário editorial incorreto" | Revalidação §5.2 |
| 6 | **`F-09` deixa de dizer "não há problema mensurável"** → "não há evidência suficiente para priorizar" | Revalidação §5.3 |
| 7 | **`F-23` deixa de dizer "zero cobertura"** → "nenhuma cobertura **dedicada**"; existem 3 suites e 156 testes verdes | Revalidação §4 |
| 8 | **Sai a causalidade com "Páginas enganosas".** Fica: precedente interno, causa não comprovada, sem evidência de alerta no oleysports.com.br | Revalidação §11.1 |
| 9 | **Sai "indexado do zero"** → "período sensível de migração/indexação"; o 301 preserva path e transfere sinais | Revalidação §11.4 |
| 10 | **Sai "todo defeito aqui é um defeito da rede inteira"** → o código é compartilhado; o impacto depende de settings e dados de cada blog | Revalidação §11.3 |
| 11 | **`F-05` tem impacto reduzido** de Alto para Médio: **0 de 640** artigos publicados estão sem slug | Revalidação §8.1 |
| 12 | **`F-15` passa de "~todos" para `640/640`**, com impacto atual reduzido enquanto F-26 existir | Revalidação §4, §7.2 |
| 13 | **`F-21` tem a causa corrigida:** o ingest grava sempre `now`; só o admin cria data futura. 0 ocorrências | Revalidação §4 |
| 14 | **Dois findings novos menores:** `F-27` (`twitter:site` fixo de outro blog) e `F-28` (42 artigos em slugs de categoria corrompidos) | Revalidação §8.3 + §"escopo do plugin" |
| 15 | **P0-1 e P0-2 viram uma entrega única e atômica** (`P0`), agora com sitemap, UA e fallback de arquivos dentro | Revalidação §10.6 |
| 16 | **Invariante `P-3` ganha ressalva:** o schema do artigo existe, mas **não é entregue ao Googlebot** hoje | Revalidação §7.2 |

---

## 3. Resumo executivo

### 3.1 Estado atual

O OleySports roda a **imagem Docker compartilhada da rede** (`blog-api` /
`blog-web`, os mesmos binários dos outros 10 blogs). Não existe código
específico do OleySports: tudo o que o distingue está em `settings`, no banco
dele.

Disso decorre uma distinção que a V1 borrou e que a revalidação mediu:

> **A implementação defeituosa é compartilhada pelos 11 blogs. O impacto
> observável depende de `settings` e dos dados de cada blog.**

Três provas dessa distinção, todas medidas em produção:

| Defeito | Código | Impacto observado |
|---|---|---|
| Mock "Mais Lidas" (`F-14`) | compartilhado nos 11 | **zero** blogs vivos afetados |
| `FIXED_CATEGORIES` vazando (`F-04`) | compartilhado nos 11 | Oley: **13** editorias fantasmas · sp011: só `/colunas` e `/brasil` |
| Sitemap com stub (`F-01`) | compartilhado nos 11 | **todos**, sem exceção |

### 3.2 Os cinco problemas de topo (todos confirmados em runtime)

1. **Googlebot e bingbot não recebem o site.** (`F-26`, **novo**) O
   `socialOgPlugin` os trata como crawlers sociais. O mesmo artigo devolve
   **85.961 bytes** a um navegador e **2.953 bytes** ao Googlebot: um stub com
   `<h1>`, um parágrafo e uma imagem — **sem corpo, sem links internos, sem
   `NewsArticle`, sem `BreadcrumbList`**. Escopo: só `/artigo/*` (home e
   editorias são idênticas para os dois). É o achado de maior alcance da
   auditoria inteira e nem o PDF nem a V1 o enxergaram.
2. **`/api/sitemap.xml` não contém um único artigo.** (`F-01`) Runtime: **14
   `<loc>`, 0 com `/artigo/`**, 1.929 bytes; e as 12 editorias publicadas são as
   do **sp011**, que não existem editorialmente aqui. O acervo real são **640**
   artigos publicados.
3. **Nada no sistema sabe responder 404.** (`F-02`, `F-20`) Runtime: **18 de 18**
   paths testados devolvem 200, incluindo `/rota-inventada-xyz` e
   `/caminho/de/dois`. E a classe é maior do que a V1 descreveu: paths **com
   extensão** também devolvem 200 + HTML — `/sitemap.xml`, `/manifest.json`,
   `/wp-login.php`, `/nada.xml` e até `/assets/inexistente.js`.
4. **A rede publica o link `/artigo/__placeholder__`.** (`F-03`, `F-04`)
   Confirmado no HTML servido das **13** editorias fixas do sp011 que respondem
   no OleySports: `<a href="/artigo/__placeholder__" class="group block">`.
5. **`/artigo/<uuid>` e `/artigo/<slug>` servem o mesmo artigo com 200.**
   (`F-05`) Confirmado: 85.961 B e 85.967 B, mesmo artigo, sem redirect.

### 3.3 O que a revalidação **refutou**

O `F-14` da V1 — *"a home publica 5 manchetes falsas de Brasília"* — **está
errado**. O bloco `mais-lidas` do template está em `area: "sidebar"`, e
`PortalZoneBlocks.tsx:765` intercepta esse caso e renderiza `SidebarMostRead`
com artigos **reais**. No HTML servido, as 5 manchetes e os 5 links mortos
aparecem **0 vezes**; nenhum blog vivo da rede exibe o mock. Foi um falso
positivo da V1, classificado como P0 e usado como argumento de risco. Está
corrigido aqui, e todo argumento de urgência apoiado nele foi removido.

### 3.4 O que a revalidação **destravou**

A checagem de unicidade de slug passou **limpa**: dos **640** artigos
publicados, **0** sem slug, **0** slugs duplicados, **0** colisões slug↔id de
outro artigo. O `301` de UUID→slug é seguro do ponto de vista dos dados atuais.
`F-16` (`UNIQUE` em `slug`) continua **P2 preventivo** e **não** é pré-condição.

### 3.5 Principais vantagens (confirmadas — preservar)

- **SSR real** de home, artigo e editoria, com cache em memória e
  *stale-while-revalidate* de servidor (`vite.config.ts:463-846`).
- **`NewsArticle` + `BreadcrumbList`** no HTML do artigo (`Artigo.tsx:525-580`)
  — **com a ressalva de `F-26`: hoje o Googlebot não os recebe.**
- **`robots.txt` dinâmico por host**, anunciando os dois sitemaps corretos, sem
  domínio morto (`vite.config.ts:1004-1027`) — confirmado em runtime.
- **Headers de segurança de borda** no Caddy (snippet `(blog)`): HSTS,
  `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, CSP *report-only*.
- **Imagens `lazy`**: medido em produção — **71 de 76** `<img>` da home com
  `loading="lazy"`, `srcset`/`sizes` calculados, proxy de redimensionamento
  próprio com travas de memória.

### 3.6 Conclusão sobre o PDF (reescrita)

| Veredito | Itens |
|---|---|
| **Certo, e a causa está no código** | OLEY-01a (placeholder), OLEY-01b (`/geral`), OLEY-02 (slug/UUID), OLEY-03, OLEY-04 |
| **Observação correta; o PDF não tinha como ver a causa** | OLEY-01c (`/contato`, `/termos`, `/privacidade`, `/arquivo`): o HTML inicial **é** thin (7.866–7.871 B, `<body>` = `<div id="root"></div>`, sem canonical, title e description idênticos aos do site). O conteúdo real existe, mas só em CSR. **A recomendação do PDF de conteúdo/metadata próprios permanece válida**; o ramo "404/410" da bifurcação dele é o que não se aplica |
| **Funcional como endpoint, incorreto como inventário editorial** | "Robots e sitemaps 2/2". O `robots.txt` está certo, o XML é válido e está anunciado — o crawler mediu a dimensão que dava para medir. O que está errado é o **conteúdo**: 0 artigos de 640, e 12 das 14 URLs são de outro portal |
| **Sem evidência suficiente para priorizar** | OLEY-06 (peso): medido 219.001 B → **44.122 B** comprimidos, 71/76 imagens `lazy`. Sobre **download** não há problema. Sobre DOM, hidratação, LCP, INP e CLS **não houve medição** — e portanto não há conclusão |
| **Corretamente classificado como não-problema** | OLEY-05 (hreflang) e OLEY-07 (autoridade) |
| **Não visto pelo PDF** | Sitemap vazio, editorias fixas do sp011, breadcrumb apontando para a home, ausência de `noindex`/404, fallback de arquivos, **e a divergência por User-Agent (`F-26`)** |

### 3.7 Nível geral de urgência

**Alto, com janela sensível.** O OleySports migrou de `oleysports.midia.run`
para `oleysports.com.br` em 14/08/2026. Verificado em runtime: o host antigo faz
**301 preservando o path** (`/futebol` → `.com.br/futebol`), que é o mecanismo
padrão de migração e **transfere sinais**. Portanto a redação correta é
**período sensível de migração/indexação** — não "indexado do zero".

O que o Google encontra hoje nesse período: **nenhum artigo no sitemap geral**,
13 editorias vazias indexáveis com link para um artigo inexistente, URLs que
respondem 200 para conteúdo que não existe — e, em `/artigo/*`, **um stub de
3 KB no lugar da matéria**.

**Sobre "Páginas enganosas":** existe precedente interno de alerta em outro
domínio da rede (`resenhavip`, `CLAUDE.md §19.3`), cuja causa **não foi
comprovada** — o próprio `CLAUDE.md` registra a hipótese como provável, não como
conclusão. **Não há, nesta auditoria, evidência de que `oleysports.com.br`
tenha qualquer alerta** (isso exigiria o GSC do domínio — E-6/E-11).

---

## 4. Contexto

### 4.1 Origem

- **PDF:** auditoria pública read-only de **13/08/2026**, comparando
  `beesportes.com.br` e `oleysports.midia.run`. Crawl same-host de até 250 URLs
  + DataForSEO. Lighthouse indisponível. GSC próprio fora de escopo.
- **Auditoria V1 (19/08):** leitura de repositório, sem runtime.
- **Revalidação adversarial (19-20/08):** produção alcançada por `curl`
  read-only em `oleysports.com.br`, `sp011.com.br`, `credito.vc`,
  `ocomandantenews.com.br` e no host antigo. Somente GET/HEAD. Dados via API
  pública (`/api/articles?limit=all`, `/api/articles/categories`, `/api/site`).

### 4.2 Limitações registradas

| Limitação | Consequência |
|---|---|
| **O PDF não pôde ser relido** (não está no repositório) | As citações vêm da V1 e do prompt de revalidação. Onde a redação final depende da letra do PDF, está sinalizado |
| **Banco não foi consultado** | Contagens de rascunho/despublicado e o campo `canonicalUrl` **não** são visíveis pela API pública. Ver E-3 e E-12 |
| **`vite build` não roda no Windows** (`CLAUDE.md §14`) | Nenhum HTML foi gerado localmente; toda afirmação sobre HTML servido vem de resposta HTTP real de produção |
| **Sem GSC** | Nada aqui afirma indexação, penalidade ou ação manual |

### 4.3 Diferença entre análise externa, análise de código e runtime

| O que o PDF viu | O que o código explicou | O que o runtime provou |
|---|---|---|
| `/artigo/__placeholder__` responde 200 | É o card de estado vazio de editoria sem artigos, e ele é um `<Link>` | O `<a href="/artigo/__placeholder__">` está no HTML das **13** editorias |
| Seis rotas "thin" com 4 palavras | Quatro são páginas institucionais reais, mas **CSR-only** | HTML inicial de 7.866–7.871 B, **0** `<h1>`, **0** canonical |
| Dois sitemaps XML funcionais → 2/2 | O geral chama um **stub que devolve `[]`** | 14 `<loc>`, **0** artigos, editorias do sp011 |
| — (não podia ver) | — (a V1 não viu) | **Googlebot recebe 2.953 B; navegador recebe 85.961 B** |

---

## 5. Arquitetura atual

### 5.1 Stack

| Camada | Implementação |
|---|---|
| Monorepo | pnpm workspaces, TypeScript 5.9, `tsc --build` para `lib/*` |
| Backend do blog | `artifacts/api-server` — Express + Drizzle, bundle esbuild |
| Frontend do blog | `artifacts/brasilia-agora` — React 19 + Vite 7 + wouter + Tailwind 4 |
| Banco | Postgres (Supabase no sp011; `pg-blogs` nos replicados) |
| Borda | Caddy, snippet `(blog)`: `/api/*` → `<id>-api:8080`; resto → `<id>-web:3000` |
| Runtime do frontend em produção | **`vite preview`** — não há servidor Node próprio; a lógica de servidor vive em **plugins do Vite** com `configurePreviewServer` |

### 5.2 Cadeia de middlewares (ordem real, `vite.config.ts:1089-1093`)

```
staticCachePlugin → socialOgPlugin → seoTextPlugin → ssrPlugin → spaHeadPlugin → estático (sirv, fallback SPA)
```

| Rota / condição | Quem responde | Status hoje |
|---|---|---|
| `/` | `ssrPlugin.renderHome` | 200 SSR |
| `/artigo/:slug` (existe) **e UA de navegador** | `ssrPlugin.renderArticle` | 200 SSR (85.961 B) |
| `/artigo/:slug` (existe) **e UA Googlebot/bingbot/social** | **`socialOgPlugin`** | **200, stub de 2.953 B** ⚠ `F-26` |
| `/artigo/:slug` (não existe) | `ssrPlugin` → `null` → `spaHeadPlugin` | **200** ⚠ |
| `/:slug` (editoria válida) | `ssrPlugin.renderCategory` | 200 SSR |
| `/:slug` (não é editoria) | `spaHeadPlugin` | **200** ⚠ |
| `/contato`, `/termos`, `/privacidade`, `/arquivo` | `spaHeadPlugin` | 200 (shell CSR) |
| `/robots.txt`, `/llms.txt` | `seoTextPlugin` | 200 correto |
| `/admin/**` (24 rotas) | `spaHeadPlugin` | 200 (`Disallow` no robots) |
| **`/qualquer.ext` inexistente** | **estático do `vite preview`** | **200 `text/html`** ⚠ `F-20` |

**O `preview` não define `appType`** (`vite.config.ts:1195-1198`), então vale o
default `spa`: o servidor estático tem **fallback single-page**, e é ele que
transforma arquivo inexistente em HTML 200.

### 5.3 Sistema de rotas do App

`src/App.tsx`: 13 rotas fixas geradas por `FIXED_CATEGORIES.map(...)`;
`/artigo/:slug`, `/arquivo`, `/contato`, `/privacidade`, `/termos`; `/:slug` →
`DynamicCategory`; fallback `<Route component={NotFound} />`.
`RESERVED_PATHS` (`categoryRoutes.ts:48-50`) protege as 5 rotas reservadas.

### 5.4 Conteúdo e identificadores

- `articles.id` = `randomUUID()`; `articles.slug` = `slugify(...)` com
  desambiguação em laço (TOCTOU — `F-16`).
- `slug` é `text` **NULO-permitido e SEM `UNIQUE`** (`articles.ts:39,70`).
- `getArticle(idOrSlug)` → `or(eq(id), eq(slug))` (`articleService.ts:271-278`).
- **Dados reais (20/08/2026, via API pública):** 640 publicados, 0 sem slug,
  0 duplicados, 0 colisões, 7 slugs com acento e 1 com espaço.

### 5.5 Sitemap e robots

| Recurso | Fonte de dados | Conteúdo real (runtime) |
|---|---|---|
| `/api/sitemap.xml` | `store.getArticles()` — **stub `[]`** desde `51bfc2f` (22/06/2026) | **14 rotas estáticas do sp011, zero artigos**, sem `Cache-Control` |
| `/api/sitemap-news.xml` | `db.select()` real, janela de 48 h | funcional, `public, max-age=900` |
| `/robots.txt` | host da requisição | correto |
| `/llms.txt` | `/api/site` | correto |
| **`/sitemap.xml` (raiz)** | fallback estático | **200 `text/html`** ⚠ |

### 5.6 Structured data

`grep -rn "ld+json"` → 3 pontos: `Artigo.tsx` (2) e `amp.ts` (1). Home,
editoria e institucionais: nenhum. **E, para Googlebot, o artigo também não
tem** (`F-26`).

---

## 6. Matriz consolidada de findings

Legenda de veredito: `C` = confirmado por código · `R` = confirmado por runtime
· `C+R` = ambos · `P` = parcialmente confirmado · `X` = contradito · `?` = não
verificável.

| ID | Finding | Veredito | Evidência decisiva | Impacto | Esforço | Confiança | Prioridade V1 → **V2** |
|---|---|---|---|---|---|---|---|
| **F-26** | **Googlebot/bingbot recebem stub de 3 KB em `/artigo/*`** | `C+R` | 85.961 B × 2.953 B, mesmo artigo; `CRAWLER_RE` em `vite.config.ts:41-42` | **Alto** | Baixo | Alta | — → **P0** |
| **F-01** | `/api/sitemap.xml` sem nenhum artigo | `C+R` | 14 `<loc>`, 0 `/artigo/`; `store.ts:1332` `[]` | Alto | Baixo | Alta | P0 → **P0** |
| **F-02** | Qualquer URL inexistente responde 200 | `C+R` | 18/18 paths = 200 | Alto | Médio | Alta | P0 → **P0** |
| **F-03** | A rede publica `/artigo/__placeholder__` | `C+R` | `<a href="/artigo/__placeholder__">` nas 13 editorias | Alto | Baixo | Alta | P0 → **P0** |
| **F-04** | 13 editorias do sp011 respondem 200 no Oley | `C+R` | 13 conferidas, com `<h1>` e canonical próprios | Alto | Médio | Alta | P0 → **P0** |
| **F-05** | UUID e slug servem o mesmo artigo com 200 | `C+R` | 200/85.961 B e 200/85.967 B | **Médio** (era Alto) | Baixo | Alta | P0 → **P0** |
| **F-20** | Paths com extensão devolvem 200 + HTML | `C+R` | `/sitemap.xml`, `/manifest.json`, `/wp-login.php`, `/assets/inexistente.js` | Médio-Alto | Baixo | Alta | P2 → **P0** |
| **F-22** | Sitemap geral sem `Cache-Control` | `C+R` | geral sem header; news com `max-age=900` | Baixo | Baixo | Alta | P3 → **absorvido no P0** |
| **F-06** | Description de editoria = a do site | `C+R` | todas com `Notícia. Agora. Sempre.` | Médio | Médio | Alta | P1 → **P1** |
| **F-07** | Home e editorias sem JSON-LD | `C+R` | 0 `ld+json` em `/` e `/futebol` | Médio | Médio | Alta | P1 → **P1** |
| **F-08** | Institucionais servidas sem SSR (CSR-only) | `P` | 7.866–7.871 B, 0 `<h1>`, 0 canonical | Médio | Médio | Alta | P1 → **P1** |
| **F-15** | Breadcrumb aponta para a home | `C+R` | JSON-LD pos 1 e 2 = `origin/`; **640/640** | Médio (**menor enquanto F-26 existir**) | Baixo | Alta | P1 → **P1** |
| **F-17** | 404 do App é o scaffold do Vite, em inglês | `P` | **não está no HTML servido**; aparece só após hidratação | Médio (UX) | Baixo | Alta | P1 → **P1** |
| **F-18** | `publisher.logo` = asset da imagem compartilhada | `C+R` | **sha256 do `/favicon.jpg` servido == `public/favicon.jpg` do repo** | Baixo-Médio (**menor enquanto F-26 existir**) | Baixo | Alta | P1 → **P1** |
| **F-23** | Nenhuma cobertura **dedicada** de SEO | `P` | 3 suites relevantes existem; **156 testes passam** | Alto (anti-regressão) | Médio | Alta | P1 → **P1** |
| **F-28** | **42 artigos em slugs de categoria corrompidos** | `R` | `tebol` 39, `copa-do-mndo` 2, `otros` 1 | Médio | Médio | Alta | — → **P1 (dados)** |
| **F-09** | Peso de HTML/DOM | `P` | 219.001 → 44.122 B; 71/76 `lazy`; **sem CWV** | Desconhecido | Alto | **Baixa** | P2 → **P2** |
| **F-14** | Bloco "Mais Lidas" é mock de Brasília | **`X`** | **`PortalZoneBlocks.tsx:765` intercepta**; 0 ocorrências no HTML | **Baixo** | Baixo | Alta | **P0 → P2** |
| **F-16** | `articles.slug` sem `UNIQUE` | `C` | 0 duplicados hoje | Médio (risco) | Baixo | Alta | P2 → **P2** |
| **F-19** | `dateModified` = `datePublished` | `C+R` | ambos `2026-08-19T19:24:40.707Z` | Baixo | Baixo | Média (semântica de `updatedAt`) | P2 → **P2** |
| **F-24** | Sem CI de build/typecheck/teste | `C` | só `security.yml` | Médio | Baixo | Alta | P2 → **P2** |
| **F-25** | Herança do domínio antigo | `R` | 301 preserva path; `midia.run/api/sitemap.xml` ainda 200 | Médio | Baixo | Média | P2 → **P2** |
| **F-27** | **`twitter:site` fixo de outro blog no HTML social** | `C` | `vite.config.ts:241`: `content="@brasiliaagora"` | Baixo | Baixo | Alta | — → **P2** |
| **F-10** | "Robots e sitemaps 2/2" | `P` | endpoint OK, inventário errado | (= F-01) | — | Alta | — → **redação** |
| **F-21** | `sitemap-news` sem teto de data | `P` | **causa da V1 errada**; `ingest.ts:246` grava `now`; 0 ocorrências | Baixo | Baixo | Alta | P3 → **P3** |
| **F-11** | Hreflang | `C` | monolíngue; auto-referência inútil no cliente | Nulo | Baixo | Alta | — → **P3** |
| **F-12** | Autoridade/backlinks | `?` | lacuna de medição | — | — | — | — |
| **F-13** | Findings do BeeSports | — | decisão de escopo | — | — | — | fora |

**Contagem:** 17 confirmados · 5 parcialmente confirmados (F-08, F-09, F-10,
F-17, F-21) · **1 contradito** (F-14) · 1 não verificável (F-12) · 3 novos
(F-26, F-27, F-28).

---

## 7. Findings que mudaram de redação ou de prioridade

Só os que mudaram. Os demais (F-01 a F-07, F-11 a F-13, F-16, F-18, F-22, F-24,
F-25) permanecem como na V1, com a confiança elevada para "código + runtime" e
os números da §6.

---

### F-26 · Googlebot e bingbot não recebem o SSR completo em `/artigo/*` · **P0** · NOVO

**O que acontece.** `CRAWLER_RE` (`vite.config.ts:41-42`) é:

```
/facebookexternalhit|Twitterbot|WhatsApp|LinkedInBot|Slackbot|TelegramBot|
 Discordbot|Pinterest|instagram|Googlebot|bingbot|Applebot|vkShare|W3C_Validator/i
```

`Googlebot`, `bingbot` e `Applebot` — **buscadores** — estão na mesma lista dos
crawlers sociais. O `socialOgPlugin` (`vite.config.ts:330-419`) roda **antes** do
`ssrPlugin`, monta um HTML de Open Graph e encerra a resposta com `res.end(html)`
(status 200 implícito).

**Medição em produção, mesmo artigo, mesma URL:**

| User-Agent | Bytes | `ld+json` | `NewsArticle` | Corpo |
|---|---|---|---|---|
| Chrome (navegador) | **85.961** | 1 | 1 | artigo completo + navegação interna |
| `Googlebot/2.1` | **2.953** | **0** | **0** | `<h1>` + `<p>` + `<img>` |
| `bingbot/2.0` | **3.007** | 0 | 0 | idem |
| `facebookexternalhit` | **3.007** | 0 | 0 | idem |

O corpo integral servido ao Googlebot:

```html
<body>
<h1><a href="…/artigo/manchester-city-nico-gonzalez">Fim de carreira? Nico González…</a></h1>
<p>O meio-campista pode mudar de clube… — Leia mais em nosso site</p>
<img src="https://central.midia.run/api/news/image/…webp" alt="…" style="max-width:100%">
</body>
```

**Escopo:** somente `/artigo/*`. Home (219.001 B) e `/futebol` (209.770 B) são
**idênticas** para Googlebot e navegador.

**Quatro consequências que os dois PRDs precisam absorver:**

1. **O `301` de UUID→slug seria inócuo para buscadores.** O `socialOgPlugin`
   responde antes e devolve 200 com o canonical do slug — nunca o redirect.
   Qualquer `routeDecision` futura é **ignorada** neste caminho.
2. **O "224/250 páginas com `NewsArticle`/`BreadcrumbList`" do PDF descreve o
   que um crawler de UA comum vê.** O Google não recebe schema nenhum em
   artigo. Isso **reduz muito o impacto atual** de `F-15` (breadcrumb inválido)
   e `F-18` (`publisher.logo`): o defeito existe, mas no documento que o
   buscador não lê. O invariante `P-3` da V1 precisa dessa ressalva.
3. **`fetchJson` do plugin não distingue 404 de indisponibilidade**
   (`if (!apiRes.ok) { next(); return; }`) — 404 e 5xx caem no mesmo `next()`.
4. **Divergência técnica substancial por User-Agent.** Entregar ~3 KB sem corpo
   ao buscador e ~86 KB ao usuário na mesma URL é a definição operacional do que
   as políticas de spam do Google descrevem como *cloaking*. **Este documento
   não afirma que exista penalidade aplicada nem ação manual** — isso exigiria o
   GSC do domínio (E-6/E-11). O que se afirma é o fato técnico e o risco.

**Armadilha de diagnóstico registrada.** O UA do "Testar URL ativa" do Search
Console (`Google-InspectionTool`) **não casa** o regex. Dependendo da ferramenta
usada, o teste pode exibir a página completa e **mascarar o defeito**. A
verificação válida é `curl -A 'Googlebot/2.1 (+http://www.google.com/bot.html)'`.

**Impacto: Alto · Esforço: Baixo · Confiança: Alta.**

---

### F-14 · Componentes mock órfãos no bundle · **P2** · REBAIXADO (era P0)

**A afirmação da V1 está errada e é corrigida aqui.** O mock **existe** no
código, mas **não chega à produção**.

| Verificação | Resultado |
|---|---|
| `MostRead.tsx:8-14` tem as 5 manchetes hardcoded? | **Sim**, intactas no HEAD |
| `Home.tsx:710` chama `<MostRead />`? | **Sim** |
| O template do Oley tem `mais-lidas` visível? | **Sim**, `visible: true`, ordem 1 |
| **O bloco tem `area`?** | **`area: "sidebar"`** — a V1 não registrou este campo |
| Quem renderiza blocos com `area`? | `renderZoneItem` → `ZoneBlock`, com `PredefinedBlock` só como **fallback** |
| `ZoneBlock` trata `mais-lidas`? | **Sim** — `PortalZoneBlocks.tsx:765`: `if (block.id === "mais-lidas" && zone === "sidebar") return <SidebarMostRead …>` com `sortByViews` |
| As 5 manchetes aparecem no HTML servido? | **NÃO** — 0 ocorrências |
| Os 5 links mortos aparecem? | **NÃO** — 0 ocorrências |
| O que o bloco exibe? | Artigos **reais** do próprio blog |
| Algum blog vivo exibe o mock? | **Nenhum** (`credito.vc` e `ocomandantenews.com.br` testados) |

**Varredura de todos os templates da rede** (`deploy/*/template_final.sql`):
`oleysports`, `sp011`, `esporteagora`, `resenhavip`, `beeesportes`,
`apostaganha` e `recebabet` têm `mais-lidas` em `area: sidebar` (mock inerte).
`creditovc`, `pontofarma` e `ocomandante` contêm **variantes de template** com
`mais-lidas`/`ultimas` **sem `area` e `visible: true`** — que renderizariam o
mock; mas os dois blogs vivos foram testados e não o exibem.

**O que sobra, e é real:** **código morto perigoso**. Cinco componentes mock que
voltam a aparecer se alguém arrastar o bloco para fora da sidebar no painel, ou
aplicar a variante de template errada em `creditovc`/`pontofarma`/`ocomandante`.
A ação proposta na V1 (trocar por `ConfigurableBlock` e apagar os mocks)
continua **certa** — só não é urgente, **não** entra no rollout crítico de
indexação e **não sustenta** nenhum argumento de "Páginas enganosas".

**Impacto: Baixo · Esforço: Baixo · Confiança: Alta.**

---

### F-20 · Fallback estático transforma arquivo inexistente em HTML 200 · **P0** · ELEVADO (era P2)

A V1 registrou o item como "a confirmar" e restrito a `/sitemap.xml`. Runtime
confirmou, e a classe é maior:

| Path | Resposta | Observação |
|---|---|---|
| `/sitemap.xml` | **200 `text/html`** | shell da SPA |
| `/sitemap_index.xml` | **200** | idem |
| `/manifest.json` | **200 `text/html`** | idem |
| `/wp-login.php` | **200 `text/html`** | idem |
| `/nada.xml`, `/foo.txt`, `/nao-existe.png` | **200 `text/html`** | idem |
| `/assets/inexistente.js` | **200 `text/html`** | **chunk ausente devolve HTML** |

**Causa:** o `spaHeadPlugin` exclui paths com extensão de propósito
(`vite.config.ts:864`), e o `preview` não define `appType`
(`vite.config.ts:1195-1198`) — vale o default `spa`, cujo servidor estático tem
fallback single-page.

**A última linha é a mais séria operacionalmente:** depois de um deploy, um
chunk que não existe mais devolve HTML com 200, e o navegador falha com erro de
MIME em vez de falhar limpo.

**`/sitemap.xml` é o caso de SEO:** é a URL que um buscador sonda **por
convenção**, e ela responde HTML. Isso entra no P0.

**Impacto: Médio-Alto · Esforço: Baixo · Confiança: Alta.**

---

### F-08 · Institucionais servidas sem SSR · **P1** · REESCRITO

A V1 classificou como *"DIAGNÓSTICO DO PDF INCORRETO"* e afirmou que seguir a
recomendação do PDF *"apagaria páginas legítimas"*. **A acusação era injusta e é
retirada.**

| Fato | Evidência (runtime) |
|---|---|
| O HTML inicial **é** thin | `/contato`, `/termos`, `/privacidade`, `/arquivo`: **7.866–7.871 bytes**, `<body>` = `<div id="root"></div>`, **0** texto visível, **0** `<h1>` |
| A metadata **é** genérica | Os quatro: `<title>OleySports — Notícia. Agora. Sempre.</title>`, mesma description, **nenhum canonical** |
| O conteúdo real existe, mas só em CSR | `Contato.tsx` 142 linhas, `Termos.tsx` 190, `Privacidade.tsx` 451, `Archive.tsx` 387 |
| O crawler do PDF **não tinha como** saber | Ele lê o HTML servido; o conteúdo não está lá |

**Redação correta:**

- o PDF **observou corretamente** HTML inicial thin;
- o conteúdo real **existe** no React;
- o crawler sem JS **não via** esse conteúdo;
- a causa revelada pelo repositório é **CSR-only** (`classifySsrPath` só cobre
  home, artigo e editoria);
- a solução adequada é **SSR/prerender + metadata específica por rota**;
- **não** 404, **não** 410.

**A distinção original do PDF é preservada:** ele separa *rota realmente vazia*
(→ noindex/404/410) de *página institucional real* (→ metadata e conteúdo
próprios). É o segundo ramo que se aplica, e nele o PDF está certo.

**Status:** `PARCIALMENTE CONFIRMADO — observação do PDF correta; a causa (CSR-only)
o HTML não mostrava` · Impacto: Médio · Esforço: Médio · Confiança: Alta.

---

### F-09 · Peso de HTML/DOM · **P2 sem ação** · REESCRITO

Medido em produção: **219.001 B → 44.122 B comprimidos** (5:1); **76** `<img>`,
**71** com `loading="lazy"`; TTFB de 1,58 s numa amostra.

Sobre **download**, não há problema. Mas DOM, hidratação, main-thread, memória,
LCP, INP e CLS são dimensões diferentes e **não foram medidas**. Portanto:

> **Não há evidência suficiente para priorizar** — e não "não existe problema".

**Observação de campo, não conclusiva:** durante os testes, uma requisição a
`/f1` com timeout de 20 s caiu para o shell e a repetição devolveu SSR completo
(182.516 B). Isso indica que o caminho de SSR frio **pode** passar de 20 s sob
certas condições. Não é medição de performance — mas **reforça** a regra de que
lentidão/falha nunca pode virar 404 (RN-1 do PRD P0).

**Nenhuma refatoração de DOM entra no P0.** O item só volta à mesa com Core Web
Vitals de campo em mãos (E-9).

---

### F-10 · Sitemap: endpoint × inventário · REDAÇÃO

Não é "PDF contradito". É:

> **Endpoint tecnicamente funcional, inventário editorial incorreto e
> incompleto.**

Runtime, as duas metades:

- **Endpoint:** `HTTP 200`, `Content-Type: application/xml`, XML bem-formado,
  anunciado no `robots.txt` pelo host correto. **O PDF acertou nisso.**
- **Inventário:** **0 artigos** de um acervo de **640**; 12 das 14 URLs são
  editorias de outro portal, que não existem editorialmente aqui.

A pontuação 2/2 mede a dimensão que o crawler conseguia medir. A consequência
apontada pela V1 ("o que o PDF contou como vantagem é um P0") **continua
verdadeira**; a acusação ao PDF sai. **O item continua P0.**

---

### F-15 · Breadcrumb aponta para a home em 640/640 artigos · **P1** · PRECISADO

`lib/categoryRoute.ts` (singular) é um `ROUTE_MAP` hardcoded do sp011 com
`return ROUTE_MAP[key] ?? "/"`. Nenhuma categoria do OleySports casa.
Usado em `Artigo.tsx:572` (item 2 do `BreadcrumbList`) e `Artigo.tsx:627` (link
visível).

Runtime: JSON-LD com posições 1 e 2 apontando ambas para
`https://oleysports.com.br/`, e `<a href="/">FUTEBOL</a>` visível. **640 de 640**
artigos publicados.

**Separar três problemas, como exige a análise pós-F-26:**

| # | Problema | Vale hoje? |
|---|---|---|
| 1 | O breadcrumb **visível** leva o leitor à home em vez da editoria | **Sim** — é UX real, para todo visitante |
| 2 | O `BreadcrumbList` do SSR é semanticamente inválido | **Sim, mas** o buscador não o recebe |
| 3 | **O Googlebot nem recebe esse JSON-LD** (`F-26`) | **Sim** — é o problema estrutural maior |

**Consequência de ordenação:** corrigido o `F-26`, o erro de JSON-LD **passa a
ser visível ao buscador** e precisa ser corrigido **antes ou no mesmo ciclo P1**.
A correção é pequena (esforço Baixo) e pode acompanhar o P0 sem risco.

---

### F-17 · Página 404 é o scaffold do Vite · **P1** · PRECISADO

O texto *"404 Page Not Found / Did you forget to add the page to the router?"*
**não está no HTML servido** (0 ocorrências) — ele aparece **só após a
hidratação**, quando o wouter cai no `<Route component={NotFound}>`. E o status
é 200.

Logo: é **defeito de UX pós-hidratação**, não de HTML servido. Continua P1
(qualidade percebida + o status errado, que o P0 corrige).

---

### F-19 · `dateModified` = `datePublished` · **P2** · CONDICIONADO

`Artigo.tsx:534-535` emite os dois campos com `article.publishedAt`. Runtime
confirma: ambos `2026-08-19T19:24:40.707Z`.

**Mas a correção não é automática.** Antes de escrever `dateModified =
updatedAt`, é obrigatório verificar a **semântica** do campo. Evidência
levantada nesta consolidação:

- `articleService.updateArticle` grava `updatedAt: new Date()` em **toda**
  chamada (`articleService.ts:428`);
- e há chamadas **não editoriais**: `POST /admin/.../migrate-json`
  (`admin.ts:886`) e o reparo de conteúdo quebrado (`admin.ts:636`) atualizam
  centenas de artigos de uma vez.

Uma rotina de manutenção rodada num dia colocaria `dateModified` = aquele dia em
todo o acervo — um sinal de frescor **falso** para o buscador.

**Exigência para o P1-5:** verificar quando `updatedAt` muda; se mudanças
técnicas/administrativas alteram o campo; usar `updatedAt` **apenas** se for
semanticamente apropriado; caso contrário, criar/usar um timestamp editorial
próprio (ex.: gravado só quando `title`/`subtitle`/`content` mudam). Registrado
como **E-12**.

---

### F-21 · `sitemap-news` sem teto de data · **P3** · CAUSA CORRIGIDA

A V1 escreveu que *"a central grava `deliveries.scheduledAt` futuro"*. **A causa
está errada:** `ingest.ts:246` grava `publishedAt: new Date().toISOString()` —
sempre `now`. O agendamento vive em `deliveries.scheduledAt`, do lado da
central, e o artigo só nasce no blog quando a entrega vence.

O único caminho para data futura é **edição manual no admin**
(`articleService.ts:368,413` aceitam `publishedAt` arbitrário). Runtime: **0
artigos** com `publishedAt` futuro.

O finding (falta de teto superior em `sitemap-news.ts:31`) continua válido como
endurecimento. **P3.**

---

### F-23 · Falta cobertura **dedicada** de SEO · **P1** · REESCRITO

Não é "zero cobertura". Existem **3 suites relevantes** e a suíte de
`brasilia-agora` roda com **156 testes verdes** (medido em 19/08):

| Suite | O que cobre |
|---|---|
| `src/lib/ssrRoutes.test.ts` | classificação de path (inclui "o painel NUNCA é renderizado no servidor") |
| `src/lib/categoryRoutes.test.ts` | resolução de editoria (inclui "sem menu, as editorias fixas continuam de pé") |
| `src/lib/gtmSnippet.test.ts` | injeção do GTM no HTML servido |

**A lacuna correta é: não há cobertura dedicada de**

- sitemap;
- status HTTP final;
- canonical;
- JSON-LD;
- **comportamento por User-Agent**;
- fallback de arquivos;
- redirects.

**Impacto: Alto (previne regressão de tudo o que estes PRDs propõem) · Esforço:
Médio · Confiança: Alta.**

---

### F-27 · `twitter:site` fixo de outro blog no HTML social · **P2** · NOVO

`vite.config.ts:241`, dentro de `buildOgHtml`:

```html
<meta name="twitter:site" content="@brasiliaagora">
```

É marca de **outro portal**, embutida na imagem compartilhada e servida por
**todos os 11 blogs** a todo crawler social. É a mesma classe de violação do
`CLAUDE.md §13` ("nenhuma marca embutida na imagem") já corrigida no
`robots.txt`, no `llms.txt` e no `<head>`.

Encontrado ao trazer o `socialOgPlugin` para o escopo (não é auditoria nova).
Correção: sair das `settings` (handle do X/Twitter cadastrado em Redes Sociais)
ou ser **omitido** quando não houver handle — nunca um literal.

**Impacto: Baixo · Esforço: Baixo · Confiança: Alta.**

---

### F-28 · 42 artigos em slugs de categoria corrompidos · **P1 (dados)** · NOVO

Contagens reais do OleySports (API pública, 20/08/2026):

| slug | artigos publicados | provável origem |
|---|---|---|
| `tebol` | **39** | `futebol` |
| `copa-do-mndo` | **2** | `copa-do-mundo` |
| `otros` | **1** | `outros` |

O padrão bate exatamente com o bug já corrigido em `90a0d47` — *"slugify: barra
dupla apagava u, f e dígitos"*. São **42 artigos órfãos de taxonomia**.

**Isto é tarefa de dados, não de código.** Nenhum status HTTP a resolve, e
**nenhuma regra genérica deve ser inventada** para acomodá-la. A tarefa de
higiene está especificada na §10 e no PRD P0 V2 (§"Categorias", Classe 4).

**Dado correlato:** **128 dos 640 artigos (20%)** estão em categorias que o menu
não expõe.

---

## 8. Código compartilhado × impacto por blog

Nenhuma correção destes PRDs é "só do OleySports": a imagem é a mesma nos 11
domínios. Mas o impacto **antes** e **depois** varia por blog, e isso muda o
plano de canário.

| Blog | `settings.categories` | menu | Efeito hoje das `FIXED_CATEGORIES` | Risco na mudança |
|---|---|---|---|---|
| **oleysports** | 9 entradas | 7 editorias | **13 editorias fantasmas** com placeholder | Baixo — é o alvo |
| **sp011** | **ausente** (taxonomia vazia de propósito) | 9 itens, inclui `/geral` | 11 das 13 são editorias **reais** dele; só `/colunas` e `/brasil` são fantasmas | **Alto** — é o canário obrigatório |
| demais 9 | variável | variável | idem Oley, em grau menor | Médio — cobertos pela varredura de menu (NR-12) |

**Números do sp011 que a mudança precisa respeitar (API pública, 20/08):**

| slug | no menu? | artigos publicados |
|---|---|---|
| `politica` | sim | **744** |
| `mundo` | sim | 674 |
| `economia` | sim | 612 |
| `cultura` | sim | 514 |
| **`geral`** | **sim** | **473** |
| `esportes` | sim | 325 |
| `cidade` | sim | 308 |
| `saude` | sim | 210 |
| `tecnologia` | sim | 192 |
| **`seguranca`** | **não** | **163** |
| `aviacao` | não | 27 |
| `nfl` | não | 8 |
| `transporte`, `educacao`, `colunas`, `brasil` | não | **0** |

**Correção de fato registrada:** a V1 do PRD P0 afirma, num comentário de código
proposto, que *"o `/geral` era uma rota que não existe em blog nenhum da rede"*.
**É falso.** No sp011, `/geral` é item de menu com 473 artigos e serve 206 KB de
SSR com `<h1>GERAL</h1>`.

---

## 9. Pontos positivos a preservar (não-regressões obrigatórias)

| # | O que | Onde | Ressalva V2 |
|---|---|---|---|
| P-1 | SSR de home, artigo e editoria | `vite.config.ts:463-846` | — |
| P-2 | Cache de HTML + SWR de servidor | `:481-505`, `:771-790` | Chave inclui host (`:804`) — **verificado**: não há mistura entre blogs |
| P-3 | `NewsArticle` + `BreadcrumbList` no artigo | `Artigo.tsx:525-580` | **Não vale para Googlebot hoje** (`F-26`). Corrigir `F-15` **sem** remover o schema |
| P-4 | `robots.txt` e `llms.txt` dinâmicos por host | `vite.config.ts:1029-1085` | Confirmado em runtime |
| P-5 | Headers de segurança no Caddy | `Caddyfile`, `(blog)` | Não remover nenhum; CSP segue report-only |
| P-6 | `/api/sitemap-news.xml` lendo o banco | `sitemap-news.ts:26-35` | É o modelo do sitemap novo |
| P-7 | Canonical do artigo apontando para o slug | `vite.config.ts:669,685-687` | Manter antes e depois do 301 |
| P-8 | Imagens `lazy` + `srcset` + proxy com semáforo | `newsImage.ts`, `imageTransform.ts` | Não mexer nas travas (OOM-kill de 12-13/08) |
| P-9 | `classifySsrPath` isolada e testada | `lib/ssrRoutes.ts` | É onde a decisão de status deve entrar |
| P-10 | `sanitizeArticleHtml` isomórfico | `lib/sanitize.ts` | Nunca retornar `""` no servidor (React #418) |
| **P-11** | **Preview do compartilhamento social funciona** | `socialOgPlugin` | **Novo.** Ao mexer no plugin, o preview de Facebook/WhatsApp/X **não pode** regredir |
| **P-12** | **`HEAD` responde como `GET`** | `isReadRequest`, `:430-432` | **Novo.** Confirmado em runtime; qualquer status novo vale para HEAD |

---

## 10. Roadmap V2

### P0 — entrega única e atômica

#### **P0 · Indexação, resolução de URL e sitemap** → `docs/PRD-P0-OLEYSPORTS-INDEXACAO-URL-SITEMAP-V2.md`

Substitui o par P0-1 + P0-2 da V1. **Uma release de produção**, com múltiplos
commits internos.

- **Cobre:** `F-26` (unificar buscadores), `F-02`/`F-20` (404 real, inclusive
  arquivos), `F-03`/`F-04` (superfície de editorias e fim do placeholder
  linkável), `F-05` (301 UUID→slug), `F-01`/`F-22` (sitemap geral com artigos,
  editorias reais e `Cache-Control`), `/sitemap.xml` na raiz.
- **Impacto:** Alto · **Esforço:** Médio-Alto · **Confiança:** Alta.
- **Por que atômico (com dados):** o sitemap atual publica 14 URLs; se a
  resolução de URL for corrigida sozinha, **11 dessas 14 (79%)** passam a
  responder 404 — e ficariam anunciadas ao Google numa janela de deploy.
  Anunciar deliberadamente 11 URLs mortas é pior que qualquer ganho de
  faseamento. **Uma mesma release deve mudar a verdade das URLs e o sitemap que
  publica essa verdade.**

### P1 — alto valor, imediatamente após o P0

| ID | Item | Findings | Impacto | Esforço | Dependências |
|---|---|---|---|---|---|
| **P1-3** | **Breadcrumb: fonte única de path de editoria** (apagar `lib/categoryRoute.ts`) | F-15 | Médio | Baixo | **Sobe de prioridade:** depois do P0, o Googlebot passa a receber o JSON-LD inválido. Fazer no mesmo ciclo, ou junto do P0 |
| **P1-5** | `publisher.logo` real + `dateModified` **condicionado à semântica** | F-18, F-19 | Baixo-Médio | Baixo | E-12 antes do `dateModified` |
| **P1-2** | SSR/prerender das institucionais | F-08 | Médio | Médio | P0 (`kind: "static"`) |
| **P1-1** | Metadata própria por rota (description de editoria + canonical nas institucionais) | F-06, F-08 | Médio | Médio | P0; **e o teste "404 não tem canonical"**, senão o P1-1 quebra o P0 |
| **P1-6** | Página 404 de verdade (visual) | F-17 | Médio | Baixo | P0 (o status vem de lá) |
| **P1-4** | `WebSite`/`Organization` na home; `CollectionPage`/`ItemList` na editoria | F-07 | Médio | Médio | P1-3, P0 |
| **P1-7** | Testes dedicados de SEO | F-23 | Alto (anti-regressão) | Médio | escritos **junto** com o P0 |
| **P1-8** | **Higiene de dados: 42 artigos em slugs corrompidos** | F-28 | Médio | Médio | Ver §10.1 |

**Ordem dentro do P1:** P1-3 primeiro (é o que fica visível ao buscador assim
que o P0 entra), depois P1-5, P1-2/P1-1, P1-6, P1-4. P1-7 não é uma etapa: é
parte do P0.

#### 10.1 · P1-8 · Tarefa de higiene/migração de dados (F-28)

**Não executar agora.** Especificação para quando for executada:

1. **Levantamento** (read-only): contagem por slug de categoria em `articles`,
   publicados e não publicados, no OleySports **e** nos demais blogs — o mesmo
   bug de slugify atingiu a rede.
2. **Identificação do destino correto**, caso a caso e por **decisão humana**:
   `tebol → futebol`, `copa-do-mndo → copa-do-mundo`, `otros → outros`.
   **Não** inferir por semelhança de string no código.
3. **Atualização dos artigos:** `UPDATE articles SET category = <destino> WHERE
   category = <corrompido>` — no banco do blog, com contagem **antes e depois**
   e a soma conferida (39 + 2 + 1 = 42).
4. **URLs históricas:** verificar se algum slug corrompido chegou a ser indexado
   (GSC / logs). Hoje eles **não** estão em sitemap nenhum e respondem shell
   200, então a probabilidade é baixa. Se estiverem, definir `301` do slug
   corrompido para o correto **antes** do UPDATE.
5. **Efeito colateral desejado:** depois da migração, o slug corrompido fica com
   **0 artigos** e, pela regra do P0 (não declarada + vazia), passa a responder
   **404** — sem nenhuma linha de código específica.
6. **Validação:** contagem por categoria conferida; `/futebol` ganha 39 artigos;
   `/tebol` responde 404; nenhum artigo perdido (total publicado continua 640).

### P2 — melhoria

| ID | Item | Finding |
|---|---|---|
| P2-1 | `UNIQUE` parcial em `articles.slug` + `ORDER BY` no `getArticle` + tratamento de conflito | F-16 |
| P2-2 | **Limpeza dos componentes mock** (`MostRead`, `DestaquesListaBadge` + 5 órfãos) e das variantes de template que os ligariam | **F-14 (rebaixado)** |
| P2-3 | `twitter:site` a partir de settings, ou omitido | **F-27** |
| P2-4 | CI mínimo: `tsc -b` + `typecheck` + `node --test` por pacote | F-24 |
| P2-5 | Auditar `articles.canonicalUrl` em busca de resíduo de `oleysports.midia.run` | F-25 |
| P2-6 | **Barra final** (`/futebol/` → 301) — **investigativo** | Ver §10.2 |
| P2-7 | Revisitar peso de DOM **somente** com CWV de campo | F-09 |

#### 10.2 · P2-6 · Barra final — por que saiu do P0

Três motivos, o terceiro decisivo:

1. **Não é duplicata de conteúdo.** Runtime: `/futebol` = 209.770 B com
   `<h1>FUTEBOL</h1>`; `/futebol/` = **7.868 B**, shell, **sem** H1 e **sem**
   canonical. É soft-404, não duplicação. A justificativa escrita na V1 estava
   incorreta.
2. **Não vem do PDF nem de nenhum finding P0.** É melhoria oportunista dentro de
   uma mudança já grande.
3. **Contradiz uma decisão deliberada e testada.** `ssrRoutes.ts:35` tem
   `if (p.endsWith("/")) return null;` com o comentário *"SPA responder, como
   antes deste PRD"*, e o teste *"barra final fica com a SPA (o wouter do
   cliente pode casar outra rota)"* (`ssrRoutes.test.ts:16-19`) o protege.
   Mudar isso exige primeiro **entender por que a decisão foi tomada**.

A observação **não** é apagada — só muda de prioridade. Se um dia for feita,
exige teste explícito para `/`, `/artigo/x/`, `/admin/`, assets e `/api/`.

### P3 — opcional / futuro

| ID | Item | Finding |
|---|---|---|
| P3-1 | Remover o `hreflang` auto-referente do `Artigo.tsx:246-260` | F-11 |
| P3-2 | Filtrar `publishedAt <= now()` no sitemap de notícias | F-21 |
| P3-3 | Variação de reescrita por blog (anti-duplicação entre domínios) | `CLAUDE.md §9` |

---

## 11. Matriz de prioridade

| ID | Problema | Prioridade | Impacto | Esforço | Confiança | Dependências |
|---|---|---|---|---|---|---|
| **P0** | Indexação, URL e sitemap (F-26, F-02, F-20, F-03, F-04, F-05, F-01, F-22) | **P0** | Alto | Médio-Alto | Alta | — |
| P1-3 | Breadcrumb / fonte única de path | P1 | Médio | Baixo | Alta | fica **visível** por causa do P0 |
| P1-5 | `publisher.logo` + `dateModified` | P1 | Baixo-Médio | Baixo | Alta (logo) · Média (`dateModified`, ver E-12) | P0 |
| P1-2 | SSR das institucionais | P1 | Médio | Médio | Alta | P0 |
| P1-1 | Metadata por rota | P1 | Médio | Médio | Alta | P0 + teste "404 sem canonical" |
| P1-6 | Página 404 visual | P1 | Médio | Baixo | Alta | P0 |
| P1-4 | Schema de home e coleção | P1 | Médio | Médio | Alta | P1-3, P0 |
| P1-7 | Testes dedicados de SEO | P1 | Alto | Médio | Alta | **dentro** do P0 |
| P1-8 | Higiene dos 42 artigos | P1 | Médio | Médio | Alta | decisão humana de destino |
| P2-1 | `UNIQUE` em `slug` | P2 | Médio | Baixo | Alta | — |
| P2-2 | Limpeza dos mocks | P2 | Baixo | Baixo | Alta | — |
| P2-3 | `twitter:site` | P2 | Baixo | Baixo | Alta | — |
| P2-4 | CI | P2 | Médio | Baixo | Alta | — |
| P2-5 | `canonicalUrl` legado | P2 | Médio | Baixo | **Média** (precisa banco) | E-3 |
| P2-6 | Barra final | P2 | Baixo | Baixo | Média | investigar a decisão original |
| P2-7 | Peso de DOM | P2 | Desconhecido | Alto | **Baixa** | E-9 |
| P3-1..3 | hreflang, data futura, variação de reescrita | P3 | — | — | — | — |

---

## 12. Dependências entre mudanças

```
P0 · Indexação, URL e sitemap  (release atômica)
  ├─ interno: F-26 (UA) ─── habilita e torna visível ──► P1-3, P1-5
  ├─ interno: superfície de editorias ─────────────────► P1-1
  ├─ interno: kind "static" ───────────────────────────► P1-2
  ├─ interno: status 404 ──────────────────────────────► P1-6
  └─ interno: sitemap + /sitemap.xml

P1-3 Breadcrumb (fonte única de path)
  └─► P1-4  CollectionPage / BreadcrumbList da editoria

P1-8 Higiene de dados
  └─► faz /tebol, /copa-do-mndo e /otros virarem 404 SEM código novo
```

**Regras de ordem, e por quê:**

1. **UA antes de tudo.** Enquanto o Googlebot receber 3 KB em `/artigo/*`,
   qualquer melhoria de artigo (301, schema, canonical) é feita num documento
   que o buscador não lê.
2. **Status HTTP e sitemap na mesma release.** Justificado com dados na §10.
3. **Superfície de editorias antes de metadata de editoria.** Não faz sentido
   escrever description para `/politica` num blog de esporte.
4. **Fonte única de path antes de qualquer schema de coleção.**
5. **Testes junto, não depois.** `F-23` é a razão de `F-01` ter durado dois
   meses.

---

## 13. Estratégia de testes

Runner: `node --test` via `tsx` (vitest não roda no Windows — `CLAUDE.md §14`).
Imports relativos com extensão `.ts` explícita.

**Baseline medido (19/08/2026):** typecheck limpo nos dois pacotes; **156 testes
verdes** em `brasilia-agora`; 18/18 nas suites de rota.

A tabela completa de casos do P0 (incluindo navegador × Googlebot, sitemap,
fallback de arquivos, `/seguranca` no sp011 e `/copa-do-mundo` no OleySports)
está no PRD P0 V2, §"Testes". Aqui ficam apenas os que **não** pertencem ao P0:

| Arquivo | O que cobre | Item |
|---|---|---|
| `src/lib/categoryRoutes.test.ts` *(estender)* | `categoryPathFor(slug, settings)` devolve `null` quando a categoria não tem página | P1-3 |
| **novo** `src/lib/articleSchema.test.ts` | `NewsArticle`: `publisher.logo` sai de settings; `dateModified` só quando houver timestamp editorial válido | P1-5 |
| **novo** `api-server/test/categoriesRoute.test.ts` | `/api/articles/categories` com e sem cadastro; filtro `visible !== false` | P1-1 |

---

## 14. Plano de validação

### 14.1 Baseline read-only (rodar antes de qualquer mudança)

```bash
D=https://oleysports.com.br
S=https://sp011.com.br

echo "== status por rota =="
for p in / /futebol /copa-do-mundo /politica /geral /contato /termos /privacidade \
         /arquivo /artigo/__placeholder__ /rota-que-nao-existe /sitemap.xml \
         /sitemap_index.xml /manifest.json /assets/inexistente.js; do
  printf '%-28s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "$D$p")"
done

echo "== sitemap geral =="
curl -s "$D/api/sitemap.xml" | grep -c '<loc>'
curl -s "$D/api/sitemap.xml" | grep -c '/artigo/'
curl -sI "$D/api/sitemap.xml" | grep -i 'cache-control\|content-type'

echo "== DIVERGENCIA POR USER-AGENT (F-26) =="
A=$(curl -s "$D/api/articles?limit=1" | grep -oE '"slug":"[^"]*"' | head -1 | cut -d'"' -f4)
curl -s -o /dev/null -w 'navegador: %{size_download} B\n' "$D/artigo/$A"
curl -s -o /dev/null -w 'googlebot: %{size_download} B\n' \
  -A 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' "$D/artigo/$A"
curl -s -A 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' \
  "$D/artigo/$A" | grep -c 'application/ld+json'

echo "== placeholder nas editorias fixas =="
for p in politica cidade seguranca transporte saude educacao cultura esportes \
         colunas brasil mundo economia tecnologia; do
  printf '/%-12s placeholder=%s\n' "$p" "$(curl -s "$D/$p" | grep -c '__placeholder__')"
done

echo "== canario sp011 =="
for p in /politica /geral /seguranca /nfl /aviacao; do
  printf '%-14s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "$S$p")"
done
curl -s "$S/seguranca" | grep -c '<h1'
```

**Baseline esperado (antes das correções):** todos os status = **200**;
`grep -c '/artigo/'` no sitemap = **0**; navegador ≈ 86 KB × googlebot ≈ 3 KB;
`ld+json` para Googlebot = **0**; `placeholder=1` nas 13; sp011 `/seguranca`
com `<h1>`. **Se algum item divergir, repositório e produção estão fora de
sincronia e a análise precisa ser revisitada antes de implementar.**

### 14.2 Depois de cada entrega

- Reexecutar o bloco e diferenciar contra o baseline.
- Validar o JSON-LD de home, editoria e artigo no **Rich Results Test** e no
  **Schema Markup Validator** — **e conferir com `curl -A Googlebot`**, não só
  pelo "Testar URL ativa" (que usa `Google-InspectionTool` e **não** casa o
  regex atual).
- GSC → Sitemaps → reenviar `/api/sitemap.xml` e conferir "URLs descobertas".

---

## 15. Validações externas necessárias

Nada abaixo é decidível pelo repositório.

| # | Pergunta | Onde responder | Bloqueia o quê |
|---|---|---|---|
| E-1 | Artigos **não publicados** com slug duplicado ou vazio | banco do blog | dimensiona F-16 (não bloqueia o P0 — publicados estão limpos) |
| E-2 | Slugs duplicados em qualquer status | banco | urgência do P2-1 |
| **E-3** | **Há `canonical_url` externo ou apontando para `oleysports.midia.run`?** | banco | **pré-condição de conteúdo do sitemap** (não do código) |
| E-4 | Total de publicados por blog | banco / API | dimensiona o sitemap |
| E-6 | GSC verificado? URLs indexadas, "Rastreada — não indexada", "Página alternativa com tag canônica" | Search Console | mede o dano real de F-02/F-05/F-26 |
| E-7 | Mudança de endereço `midia.run` → `.com.br` comunicada no GSC? | Search Console | recuperação da migração |
| E-8 | O blog está no Publisher Center / Google News? | Publisher Center | valida o `sitemap-news` |
| E-9 | Core Web Vitals de campo (CrUX) | PageSpeed Insights | única base legítima para reabrir F-09 |
| E-10 | Perfil de backlinks e marca na SERP | DataForSEO/Ahrefs | F-12 |
| E-11 | Há alerta de Safe Browsing / "Páginas enganosas" no `oleysports.com.br`? | GSC → Segurança e ações manuais | **responde se o precedente do resenhavip se repete aqui** |
| **E-12** | **`updatedAt` representa modificação editorial?** Rotinas de manutenção (`migrate-json`, reparo de conteúdo) o alteram em massa | banco + código | **bloqueia** `dateModified = updatedAt` (P1-5) |

---

## 16. Riscos

| # | Risco | Prob. | Sev. | Mitigação |
|---|---|---|---|---|
| R-1 | Um 404 mal calibrado tira do índice página que existe | Média | **Alta** | Classes de categoria explícitas (PRD P0 §Categorias); canário duplo sp011 + Oley; varredura de menu nos 11 domínios |
| R-2 | **Des-indexar arquivo legítimo** (sp011 `/seguranca`, 163 artigos) | **Era Alta na V1** | **Alta** | Regra corrigida: **não declarada + com conteúdo → 200 indexável**; `/seguranca` vira critério de aceite |
| R-3 | Retirar Googlebot do `socialOgPlugin` muda o que o Google indexa | Média | Média | É o objetivo; mas exige baseline antes/depois, `curl -A` nos dois UAs e acompanhamento do GSC por 30 dias |
| R-4 | **Quebrar o preview social** ao mexer no plugin | Baixa | Média | Os UAs sociais **permanecem** no regex; NR "compartilhamento social continua com OG certo" |
| R-5 | Mudança na imagem compartilhada quebra outro blog | Média | Alta | Superfície derivada de settings; fallback para menu e só então `FIXED_CATEGORIES`; canário sp011 |
| R-6 | 301 UUID→slug quebra link histórico | Baixa | Média | 301 preserva o link; backend continua resolvendo id **ou** slug |
| R-7 | Sitemap grande derruba o `api` | Baixa | Média | `select` de 4 colunas, `Cache-Control: 900`, teto de 50k |
| R-8 | Rollout afeta 11 blogs (~20 min) | Alta | Baixa | `CLAUDE.md §6`: bump + `build api web` + sp011 + canário + demais em paralelo |
| R-9 | `Caddyfile` é bind de arquivo único | Média | Média | Nenhum item destes PRDs toca o `Caddyfile` |
| R-10 | Escrever texto editorial de categoria no código | Média | Média | Description de editoria é **campo de produto** no painel |
| R-11 | **Migração de dados (F-28) executada sem levantamento** | Média | Alta | P1-8 exige contagem antes/depois e destino decidido por humano |

---

## 17. Rollback

- **Código:** commit direto na `main` (`CLAUDE.md §18`). Rollback =
  `git revert <sha>` + bump de `BLOG_IMAGE_VERSION` + `build api web`.
- **Imagem:** cada blog fixa `BLOG_IMAGE_TAG` no `.env` próprio. Rollback de um
  blog só = `sed -i` da tag anterior + `docker compose up -d`. **Não podar
  imagens antes do canário estabilizar.**
- **Banco:** nenhuma alteração de dados no P0. P1-8 (higiene) exige backup e
  contagem antes/depois. P2-1 (índice) = `DROP INDEX`.
- **Sinal de rollback:** 404 em URL que existia; queda abrupta de URLs indexadas
  no GSC; editoria do menu respondendo 404 em qualquer blog.

---

## 18. Métricas técnicas de sucesso

Todas verificáveis por `curl`/SQL/GSC. **Nenhuma meta de tráfego.**

| # | Métrica | Baseline (20/08/2026) | Alvo |
|---|---|---|---|
| **M-0** | **Bytes servidos em `/artigo/<slug>` ao UA `Googlebot`** | **2.953** | **≥ 95% do que o navegador recebe** |
| **M-0b** | **`application/ld+json` em `/artigo/<slug>` ao UA `Googlebot`** | **0** | **2** |
| M-1 | `<loc>` de artigo em `/api/sitemap.xml` | **0** | = nº de publicados com slug (**640** hoje) |
| M-2 | `<loc>` de editoria que não existe no blog | 11 | **0** |
| M-3 | Status de `/artigo/__placeholder__` | 200 | **404** |
| M-4 | Status de `/geral` no Oley e de rota inventada | 200 | **404** |
| M-5 | Status de `/politica` no Oley | 200 | **404** |
| M-5b | **Status de `/politica` e `/geral` no sp011** | 200 | **200** (não-regressão) |
| **M-5c** | **Status de `/seguranca` no sp011 e presença de `noindex`** | 200, sem noindex | **200, sem `noindex`** |
| **M-5d** | **`/copa-do-mundo` no Oley (86 artigos)** | 200 shell, sem `<h1>` | **200 com `<h1>` e artigos** |
| M-6 | Status de `/artigo/<uuid>` | 200 | **301** → `/artigo/<slug>` |
| **M-6b** | **Status de `/artigo/<uuid>` ao UA `Googlebot`** | 200 | **301** |
| M-7 | `/sitemap.xml` na raiz | 200 `text/html` | **XML válido ou 301 explícito** |
| M-7b | `/assets/inexistente.js` | 200 `text/html` | **404** |
| M-8 | Páginas com description idêntica à do site | ~26 | ≤ 1 (P1-1) |
| M-9 | `<h1>` em `/contato` sem JS | 0 | 1 (P1-2) |
| M-10 | `<link rel="canonical">` em toda rota 200 | ausente nas institucionais | 100% (P1-1) — **e ausente em toda resposta 404** |
| M-11 | JSON-LD válido no Rich Results Test (home, editoria, artigo) | só artigo, breadcrumb inválido | 3/3 válidos (P1-3, P1-4) |
| M-12 | Testes dedicados a sitemap/status/head/UA | 0 | **≥ 35 casos** |
| M-13 | GSC → "Rastreada — não indexada" | desconhecido (E-6) | tendência de queda em 60 dias |

---

## 19. Definição de pronto

Um item do roadmap está pronto quando **todos** os quadrados estiverem marcados.

- [ ] Código commitado direto na `main`, mensagem em pt-BR.
- [ ] `pnpm exec tsc -b` limpo; `pnpm run typecheck` limpo nos dois pacotes.
- [ ] Testes novos escritos **antes ou junto** da mudança; suíte inteira verde
      (baseline a superar: **156** em `brasilia-agora`).
- [ ] Rollout do `CLAUDE.md §6`: bump de `BLOG_IMAGE_VERSION`, `build api web`
      **juntos**, sp011, **canário duplo**, demais em paralelo.
- [ ] Bloco de §14.1 executado na VPS e diferenciado contra o baseline — **no
      OleySports E no sp011**.
- [ ] Nenhuma não-regressão da §9 violada (com atenção a **P-11**, preview
      social, e **P-12**, HEAD).
- [ ] `curl -s https://<dominio>/api/site | grep -o '"siteName":"[^"]*"'` correto
      em cada domínio afetado.
- [ ] Métricas de §18 tocadas pelo item medidas e registradas.
- [ ] `CLAUDE.md` atualizado se a mudança criar invariante nova.

---

## 20. Ordem recomendada

```
Etapa 0 · Baseline read-only em producao                        (§14.1)
   └─ inclui a medicao navegador x Googlebot e o E-3 (canonicalUrl no banco)

Etapa 1 · P0 — release ATOMICA
   1a. Unificar buscadores: Googlebot/bingbot saem do socialOgPlugin   (F-26)
   1b. Fonte unica de existencia/taxonomia de rota                     (F-04)
   1c. Parar de publicar links invalidos (placeholder, "Ver mais")     (F-03)
   1d. fetchJson tri-estado + stale/503                                (RN-1)
   1e. 404/200/noindex corretos + fallback de arquivos              (F-02, F-20)
   1f. 301 UUID -> slug                                                (F-05)
   1g. Sitemap geral + /sitemap.xml                             (F-01, F-22)
   1h. Testes integrados                                               (F-23)
   └─ rollout unico + canario duplo + verificacao

Etapa 2 · P1-3 + P1-5 — breadcrumb, publisher.logo, dateModified (apos E-12)
   └─ e o que passa a ser VISIVEL ao buscador por causa da Etapa 1

Etapa 3 · P1-2 + P1-6 — SSR das institucionais + pagina 404 real

Etapa 4 · P1-1 — metadata por rota (com o teste "404 sem canonical" ja verde)

Etapa 5 · P1-4 — schema de home e colecao

Etapa 6 · P1-8 — higiene dos 42 artigos (decisao humana de destino primeiro)

Etapa 7 · P2 — UNIQUE em slug, limpeza dos mocks, twitter:site, CI,
              canonicalUrl legado, barra final (investigativa)

Etapa 8 · P3 — hreflang, data futura, variacao de reescrita
   └─ reabrir peso de DOM SOMENTE com Core Web Vitals de campo em maos
```

---

## 21. Documentos relacionados

| Documento | Papel |
|---|---|
| `docs/PRD-P0-OLEYSPORTS-INDEXACAO-URL-SITEMAP-V2.md` | **PRD de implementação do P0** — a iniciativa urgente deste roadmap |
| `docs/REVALIDACAO-PRDS-OLEYSPORTS.md` | Registro da revalidação adversarial com runtime — fonte de toda evidência nova |
| `docs/PRD-SEO-TECHNICAL-OLEYSPORTS.md` | **V1, histórico.** Superseded por este documento |
| `docs/PRD-P0-OLEYSPORTS-RESOLUCAO-URL-E-SOFT-404.md` | **V1 do P0, histórico.** Superseded |
| `2026-08-19 — Relatório Comparativo SEO — BeeSports vs OleySports — Revisado.pdf` | Snapshot público de 13/08/2026. **Não está no repositório** |
