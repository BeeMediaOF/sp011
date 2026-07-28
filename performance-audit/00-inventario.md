# 00 — Inventário (Fase 0)

> Levantamento do que EXISTE hoje, sem juízo de "certo/errado". Conclusões e
> priorização ficam em `01-diagnostico.md`.
> Data: 2026-07-27 · Repo: `sp011` (main, commit `c691853`).

## 0.0 Como as evidências foram obtidas

| Fonte | Como |
|---|---|
| Código | leitura direta do repo (`artifacts/brasilia-agora`, `artifacts/api-server`, `Caddyfile`, `docker-compose.yml`) |
| Produção | `curl` contra `https://sp011.com.br`, `ksports.midia.run`, `resenhavip.midia.run`, `esporteagora.midia.run` |
| Banco do blog sp011 | MCP Supabase, projeto `yfmyufqfepzwjtzblths` (leitura) |
| Métricas de campo sintéticas | Chromium headless (Playwright 1.61 já instalado na máquina) contra produção, viewport 412×823 DPR 1.75, rede 1,6 Mbps/150 ms RTT, CPU 4× — perfil próximo do Lighthouse mobile |

**Limitação (alta confiança):** o build do frontend não roda no Windows
(CLAUDE.md §14) — nenhum número de bundle veio de build local. Todos os tamanhos
de chunk abaixo foram medidos **baixando os assets de produção**, o que é ainda
mais fiel.

---

## 0.1 Inventário de build e bundle

### Configuração

`artifacts/brasilia-agora/vite.config.ts` (657 linhas). Plugins, em ordem:

1. `staticCachePlugin()` — middlewares de `Cache-Control` no dev e no **preview**
   (produção), + geração de `dist/public/_headers`.
2. `socialOgPlugin(API_URL)` — HTML de OG para crawlers em `/artigo/*`.
3. `ssrHomePlugin(API_URL)` — **SSR apenas de `/`**, só em `configurePreviewServer`.
4. `spaHeadPlugin(API_URL)` — serve `index.html` com `<head>` reescrito para
   todas as demais rotas sem extensão.
5. `react()`, `tailwindcss()`, `runtimeErrorOverlay()`.

`build`: `target: "esnext"`, `cssCodeSplit: true`, `chunkSizeWarningLimit: 600`.
`manualChunks` (vite.config.ts:608-630) por substring de path:
`vendor-react`, `vendor-query`, `vendor-motion`, `vendor-charts`
(`node_modules/recharts` ou `node_modules/d3-`), `vendor-icons`,
`vendor-editor` (`@tiptap`), `vendor-radix`.

Runtime: `Dockerfile` do web roda `pnpm run serve` = **`vite preview`**
(não é Nginx nem servidor estático próprio). Ou seja, os 4 plugins acima estão
ativos em produção.

### Chunks reais em produção (`https://sp011.com.br`, 2026-07-27)

Recursos referenciados no `<head>` do HTML da home (1 `stylesheet`,
5 `modulepreload`, 1 `script type=module`):

| Asset | Bruto | gzip | Como entra |
|---|---:|---:|---|
| `assets/index-ChdAtXJa.css` | 197.582 B | 30.677 B | `<link rel=stylesheet>` (render-blocking) |
| `assets/index-CdUrz0ja.js` | 336.667 B | 97.580 B | entry `<script type=module>` |
| `assets/vendor-react-*.js` | 223.391 B | 70.620 B | `modulepreload` |
| `assets/vendor-charts-*.js` | **403.228 B** | **107.899 B** | `modulepreload` |
| `assets/vendor-radix-*.js` | 55.314 B | 19.584 B | `modulepreload` |
| `assets/vendor-icons-*.js` | 38.355 B | 12.527 B | `modulepreload` |
| `assets/vendor-query-*.js` | 24.608 B | 7.396 B | `modulepreload` |
| **Total JS inicial** | **1.081.563 B** | **315.606 B** | |

Cabeçalho de imports do `index-CdUrz0ja.js` baixado de produção:

```js
import{...}from"./vendor-react-gREd9mYW.js"
import{Q as Ii,a as Ri}from"./vendor-query-BZ68cNsE.js"
import{P as Di,C as Ar,a as Oi}from"./vendor-radix-Bc9VOEZP.js"
import{c as Mi}from"./vendor-charts-Dw77MGS9.js"      // ← 1 símbolo
import{...}from"./vendor-icons-BvmIbyhD.js"
```

O único símbolo importado de `vendor-charts` é usado em
`function ft(...e){return al(Mi(e))}` — a assinatura do helper `cn()`
(`twMerge(clsx(...))`), ou seja **`clsx`**. O conteúdo de `vendor-charts` é
Recharts/d3 (o final do arquivo exporta `AreaChart`, `RadialBar`,
`formatAxisMap`…).

### Dependências pesadas e onde são usadas

| Dependência | Importada em | Lazy? |
|---|---|---|
| `recharts` | `pages/admin/Analytics.tsx`, `pages/admin/Dashboard.tsx`, `components/ui/chart.tsx` (arquivo nunca importado) | páginas admin são `lazy()` |
| `@tiptap/*` | `pages/admin/ArticleEdit.tsx` | lazy |
| `@radix-ui/*` | 13 wrappers em `components/ui/*` usados; `TooltipProvider` é **eager** em `App.tsx:3` | parcialmente |
| `framer-motion` | — | chunk `vendor-motion` não aparece no HTML da home |
| `lucide-react` | público e admin | eager |
| `react-hook-form`, `zod`, `date-fns`, `embla`, `cmdk`, `vaul`, `input-otp`, `react-day-picker` | só admin / `components/ui/*` não usados | — |

### Code splitting por rota

`App.tsx` faz `lazy()` em **todas** as páginas públicas exceto `Home`, e em
todas as páginas admin. Import **eager** remanescente no topo:
`Home`, `RequireAdmin`/`RequirePermission` (`@/pages/Admin` — arquivo pequeno,
sem dependências pesadas), `TooltipProvider` (`@/components/ui/tooltip` → Radix),
`SEOHead`, `useAnalytics`, `NotFound`.

`components/ui/` tem **55 arquivos**; apenas **13** são importados em todo o
código (`grep -o "@/components/ui/[a-z-]*"`).

---

## 0.2 Inventário de imagens

### Proxy de imagens de artigo

`artifacts/api-server/src/routes/image.ts` — `GET /api/image?url=&w=&q=&f=`:
- allowlist estrita de hosts (`ALLOWED_HOSTS` + `ALLOWED_HOST_SUFFIXES`),
  espelhada em `brasilia-agora/src/lib/newsImage.ts`;
- sharp → WebP (padrão) ou AVIF, `effort: 1`; cache LRU em memória + disco
  (`lib/imageTransform.ts`), coalescing de requisições;
- resposta: `Cache-Control: public, max-age=31536000, immutable` + ETag;
- falha de origem → placeholder WebP com `max-age=300` (nunca 502).

Medição real da imagem LCP da home (`central.midia.run/...0b1e729c.webp`,
original 78.180 B):

| `w=` | bytes | formato |
|---:|---:|---|
| 480 | 22.442 | image/webp |
| 768 | 41.714 | image/webp |
| 1024 | 59.766 | image/webp |
| 1280 | 81.532 | image/webp |

### Frontend

`src/lib/newsImage.ts`: `buildSrcSet(src, widths, q=82)` gera `srcset` via proxy;
retorna `""` para host fora da allowlist (o `src` original vira fallback).
Conjuntos: `CARD_WIDTHS = [320,480,640,960]`, `HERO_WIDTHS = [480,768,1024,1280]`,
`THUMB_WIDTHS = [120,240,360]`.

`components/LazyImage.tsx` existe e suporta `priority`/`eager`/`sizes`/`aspectRatio`,
mas os blocos da home usam `<img>` direto com `srcSet`+`sizes`+`width`/`height`+
`loading`+`decoding` escritos à mão (Home.tsx, SectionBlock*, PortalZoneBlocks).

Formato moderno: negociado **por query param** (`f=webp|avif`, padrão webp) —
não há `<picture>` nem negociação por `Accept`.

HTML da home em produção (185.197 B bruto / 37.379 B gzip):

- 68 `<img>`; 44 com `srcset`; 60 `loading="lazy"`; 2 `loading="eager"`;
- 50 apontam para `central.midia.run` (com `srcset` via `/api/image`);
- 12 para `/api/site-asset/byline-logo`; 3 para `/api/site-asset/logo`;
  1 para `/api/site-asset/footer-logo`.

### Imagens de identidade (`/api/site-asset/:key`)

`api-server/src/routes/site.ts:10-18` decodifica o data URI das settings e
devolve o binário cru, com `immutable`. **Não há resize nem conversão.**
Medição em produção:

| Asset | Dimensão intrínseca | Bytes | Onde aparece |
|---|---|---:|---|
| `logo` | 818×288 PNG | 81.530 | cabeçalho, `style="height:48px"` |
| `byline-logo` | 1080×1080 PNG | 82.957 | 12× na home, avatar de assinatura |
| `footer-logo` | 818×288 PNG | 69.534 | rodapé (abaixo da dobra) |
| `favicon` | 321×138 PNG | 33.166 | favicon |

`store.ts:807-831` (`SITE_ASSET_FIELDS` + `assetUrl`) converte os 8 campos
base64 das settings em URLs `/api/site-asset/<key>?v=<sha1-10>`; o payload
público de `/api/site` fica em 10.133 B bruto / 3.391 B gzip (medido).

### Anúncios

`routes/ads.ts:153-159` — comentário no próprio código registra a correção:
o payload já **não** carrega `imageBase64` (era 51 MB), devolve
`imageUrl: /api/ads/:id/image`, que por sua vez redireciona para o proxy
(`w=960&q=80`). `/api/ads` hoje devolve 10 B em sp011, ksports e resenhavip
(nenhum anúncio ativo).

### Preloads emitidos no HTML da home

```html
<link rel="preload" href="/fonts/inter-latin.woff2" as="font" ... crossorigin>
<link rel="preload" href="/fonts/merriweather-latin.woff2" as="font" ... crossorigin>
<link rel="preload" as="image" href="/api/site-asset/logo?v=15f61d3a53">
<link rel="preload" as="image" imageSrcSet="/api/image?...&w=480 480w, ...768w, ...1024w, ...1280w"
      imageSizes="(max-width: 1024px) 100vw, (max-width: 1280px) 33vw, 427px" fetchPriority="high">
<link rel="preload" as="image" href="/api/site-asset/footer-logo?v=b57a707fa2">
```

Os dois de fonte são estáticos (`index.html:105-106`). Os **três de imagem não
existem no `index.html`** nem em nenhum componente (`grep -rn preload src/` só
acha o `lazyWithPreload` do admin): são emitidos pelo **React 19.1 no
`renderToString`**, que hoisteia `<link rel=preload as=image>` para todo `<img>`
não-`lazy` renderizado no SSR. O `index.html` também tem um preload da imagem
LCP montado em JS (linhas 33-78), mas ele só roda quando **não** há
`window.__SSR_DATA__`.

### Fontes

Auto-hospedadas em `public/fonts/` (4 arquivos woff2 variáveis):
`inter-latin` 48.256 B, `inter-latin-ext` 85.068 B, `merriweather-latin` 97.548 B,
`merriweather-latin-ext` 74.960 B. `@font-face` em `src/index.css:6-37` com
`font-display: swap` e `unicode-range` por subset. `index.html` faz `preload`
dos dois subsets `latin`. Nenhuma requisição a Google Fonts.

---

## 0.3 Inventário de renderização

### SSR

- **Só a home (`/`)**, e só no servidor de preview: `ssrHomePlugin`
  (vite.config.ts:361-500) registra o middleware em `configurePreviewServer`.
- Fluxo: `Promise.all` de `/api/articles`, `/api/site`, `/api/ads` →
  `render()` do bundle `dist/server/entry-server.js` → injeta
  `window.__SSR_DATA__` e o HTML no `#root` → reescreve `<head>` com a
  identidade do blog.
- Cache em memória do HTML: `HTML_TTL_MS = 30_000`; resposta com
  `Cache-Control: public, max-age=30, stale-while-revalidate=60`.
- `__SSR_DATA__` = 100 artigos mais recentes (sem `keywords`) + até 8 por
  categoria de bloco visível + settings + ads. **Medido: 70.923 B** dentro de um
  documento de 185.197 B (38% do HTML).
- Hidratação: `entry-client.tsx` semeia os caches (`seedArticles`/`seedSite`/
  `seedAds`) e chama `hydrateRoot`; depois `refreshSite()`.

### Demais rotas

`spaHeadPlugin` devolve o `index.html` buildado (`<div id="root"></div>` vazio)
com `<head>` reescrito e `Cache-Control: no-cache`. **Artigo, categorias,
arquivo e páginas institucionais são SPA pura.**

### Prefetch de dados

`index.html:11-81` — script inline síncrono no `<head>` que, quando **não** há
`__SSR_DATA__`, dispara `fetch` de `/api/articles`, `/api/site` e `/api/ads`
em `window.__BOOT__`, e monta o `<link rel=preload as=image>` do LCP a partir
do 1º artigo. `useArticles`/`useSite`/`useAds` consomem essas promessas
(`takeBoot`).

### Servidor estático / proxy

- `vite preview` (sirv) atrás do **Caddy 2**.
- `Caddyfile`: `encode gzip zstd` nos 3 blocos (snippet `(blog)`, `SITE_DOMAIN`,
  `CENTRAL_DOMAIN`); headers de segurança; CSP report-only.
- Protocolo negociado com o navegador: **h2** (20/20 recursos, medido).
- Cache-Control observado em produção:

| Recurso | Header |
|---|---|
| `/` (GET, via SSR) | `public, max-age=30, stale-while-revalidate=60` |
| `/assets/*` | `public, max-age=31536000, immutable` + ETag |
| `/fonts/*.woff2` | `public, max-age=31536000, immutable` (sem `Content-Encoding`, correto) |
| `/api/articles` | `public, max-age=30, s-maxage=30, stale-while-revalidate=300` + gzip |
| `/api/site` | `no-cache` |
| `/api/image` | `public, max-age=31536000, immutable` + ETag |
| `/api/site-asset/*` | `public, max-age=31536000, immutable` |

---

## 0.4 Inventário de recursos bloqueantes

- `<head>` do `index.html`: 1 script **inline síncrono** (boot prefetch, ~2,4 KB),
  `<title>`/metas, `<link rel=icon>`, 2 `preload` de fonte.
- Vite injeta no build: 1 `<link rel="stylesheet">` (render-blocking) e
  `<script type="module">` (defer implícito) + 5 `modulepreload`.
- **Não há critical CSS inline.**
- Tailwind CSS 4 via `@tailwindcss/vite`, sem `tailwind.config`: `src/index.css`
  faz `@import "tailwindcss"` + `tw-animate-css` + `@plugin @tailwindcss/typography`.
  A detecção automática de fontes do Tailwind 4 varre o projeto inteiro — as
  classes das 30 páginas admin e dos 55 arquivos `components/ui/*` entram no
  **mesmo** `index-*.css` servido ao público. Resultado medido: 197.582 B.
- `entry-client.tsx` importa `./index.css` → o CSS é dependência do entry, logo
  do HTML de todas as rotas.

---

## 0.5 Volume de dados servido pelas APIs públicas

`routes/articles.ts:59-81` — `GET /api/articles` devolve **todos** os artigos
publicados, sem `limit`, `offset` nem filtro; 14 campos por artigo.

| Blog | `/api/articles` bruto | gzip |
|---|---:|---:|
| sp011.com.br | **2.454.750 B** | 832.734 B |
| ksports.midia.run | 985.121 B | 324.439 B |
| resenhavip.midia.run | 365.281 B | 120.405 B |
| esporteagora.midia.run | 364.461 B | 120.138 B |

Banco do sp011 (MCP Supabase): **3.109 artigos publicados** (3.115 no total);
média de 815 B por artigo no formato do payload.

Consumidores de `/api/articles` (lista inteira):
`hooks/useArticles.ts:63` (usado por `TopBar`, `HeroSection`, `Home`, `Artigo`,
`PortalZoneBlocks`), `pages/CategoryArchivePage.tsx:31` (fetch próprio),
`pages/Archive.tsx:89` (fetch próprio), e o `ssrHomePlugin` no servidor.

`settings.site_settings` no banco tem 687.348 B; o payload público de
`/api/site` (após remoção de `homeTemplates`/`internalIps`/`paidCampaigns` e
conversão dos 8 campos base64 em URLs) fica em 10.133 B. `homeBlocks` tem
22 blocos / 5.147 B.

---

## 0.6 Métricas medidas (baseline própria, 2026-07-27)

Chromium headless, mobile 412×823 DPR 1.75, throttling 1,6 Mbps / 150 ms /
CPU 4×, origem São Paulo:

| Rota | FCP | LCP | Elemento LCP | Transfer | Decoded | Requisições |
|---|---:|---:|---|---:|---:|---:|
| `/` (SSR) | 2.564 ms | 2.572 ms | `/api/image?...w=768` | 1.006 KB | 1.939 KB | 31 |
| `/artigo/:slug` | 4.208 ms | 5.464 ms | `/api/image?...w=768` | 1.622 KB | 4.196 KB | 22 |
| `/politica` | 4.208 ms | 5.660 ms | `<p>` | 1.490 KB | 6.508 KB | 20 |

TTFB: 66–87 ms nas três (cache SSR quente / `index.html` estático).

Quebra por tipo na home: script 8 req / 320 KB transfer / **1.086 KB decoded**;
link (CSS+fontes+preloads) 6 req / 371 KB / 536 KB; img 15 req / 310 KB;
fetch 2 req / 4 KB.

Quebra em `/politica`: fetch 5 req / 837 KB transfer / **4.919 KB decoded**
(≈ 2× os 2.454 KB de `/api/articles` — segunda leitura servida do cache HTTP,
mas com novo parse).

Long tasks (`PerformanceObserver`, ms):
- `/`: 467, 270, 219, + 9 tarefas de 52–83
- `/politica`: **900**, 420, 238, 233, 167, 88, 71, 61, 51

## 0.7 Arquivos estáticos de `public/`

`public/llms.txt` (1.519 B) e `public/robots.txt` (87 B) são **baked na imagem
Docker compartilhada** — servidos idênticos em todos os blogs da rede. Conteúdo
atual em produção no sp011:

- `llms.txt` começa com `# SBC Agora` e descreve "São Bernardo do Campo e região
  do Grande ABC"; lista seções como `- Política: /politica` (sem links markdown,
  sem URLs absolutas, sem bloco de resumo).
- `robots.txt` aponta `Sitemap: https://brasilia-agora.replit.app/api/sitemap.xml`
  (host inexistente). A rota real é `GET /api/sitemap.xml`
  (`routes/sitemap.ts:33`), servida por cada blog.

Também em `public/`: 7 imagens de anúncio de exemplo (`ad-*.png/gif/jpg`,
549 KB), 6 logos de apoiador, `opengraph.jpg` (133 KB), `favicon.jpg` (33 KB),
`sw.js`.

`src/assets/images/`: **43 MB em 37 PNGs** (avatares de 1,3 MB cada, arte de
exemplo de 1,5–2,2 MB) + 2,9 MB em 21 `.webp`. Importados: os 7 `.webp` de
fallback do `HeroSection`, 2 logos PNG de 33 KB (`Header`/`Footer`) e
3 avatares PNG em `CategoryPage`/`BottomSection`/`ColunistasSection` —
`CategoryPage` importa os avatares mas **não os referencia** no JSX.

## 0.8 Outros

- Scripts de terceiros (GTM/GA4/Pixel/`customHeadCode`) são injetados em
  `requestIdleCallback` e só com consentimento (`SEOHead.tsx:125-196`);
  `customHeadCode` do sp011 tem 427 B.
- Service worker `public/sw.js` (1.598 B) registrado em `main.tsx:22` — mas o
  entry real é `entry-client.tsx` (`index.html:110`); `main.tsx` não é referenciado
  pelo HTML.
- `.cv-auto` (`index.css:250-253`) aplica `content-visibility: auto` +
  `contain-intrinsic-size: auto 600px` nos blocos da home a partir do índice 3.
- CLS medido = 0 nas três rotas (nenhum `layout-shift` reportado); todas as
  `<img>` da home têm `width`/`height` ou `aspect-ratio` no container.
