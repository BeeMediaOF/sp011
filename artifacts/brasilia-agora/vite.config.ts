import { defineConfig, type Plugin } from "vite";
import { BRAND } from "./src/brand";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "node:fs";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import type { IncomingMessage, ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

const CRAWLER_RE =
  /facebookexternalhit|Twitterbot|WhatsApp|LinkedInBot|Slackbot|TelegramBot|Discordbot|Pinterest|instagram|Googlebot|bingbot|Applebot|vkShare|W3C_Validator/i;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").trim();
}

type SiteLang = "pt-BR" | "en";

/** Identidade pública do blog para as meta tags servidas ao crawler. */
interface SiteMeta {
  lang: SiteLang;
  siteName: string;
  tagline: string;
  seoDescription: string;
  /** Caminho relativo da imagem OG (asset das settings ou /opengraph.jpg). */
  ogImagePath: string;
}

/**
 * Identidade do site com cache (~5min). A imagem `blog-web` é COMPARTILHADA
 * entre os blogs — o index.html buildado traz a marca do blog que buildou.
 * Todo <head> servido a crawler precisa vir daqui (API do próprio blog), nunca
 * do template. Falha de API → última leitura boa, ou BRAND como último recurso.
 */
function makeSiteMetaResolver(apiBase: string): () => Promise<SiteMeta> {
  const TTL_MS = 5 * 60_000;
  const FALLBACK: SiteMeta = {
    lang: "pt-BR",
    siteName: BRAND.name,
    tagline: BRAND.tagline,
    seoDescription: BRAND.description,
    ogImagePath: "/opengraph.jpg",
  };
  let cached: { meta: SiteMeta; at: number } | null = null;
  return async () => {
    const now = Date.now();
    if (cached && now - cached.at < TTL_MS) return cached.meta;
    try {
      const r = await fetch(`${apiBase}/api/site`);
      const s = r.ok ? ((await r.json()) as Record<string, unknown>) : null;
      const meta = s ? metaFromSitePayload(s) : null;
      if (!meta) return cached?.meta ?? FALLBACK;
      cached = { meta, at: now };
      return meta;
    } catch {
      return cached?.meta ?? FALLBACK;
    }
  };
}

/**
 * Monta o SiteMeta a partir do payload público de /api/site (null se o payload
 * não tiver nem siteName — API fora/instalação incompleta). Imagem OG: a das
 * settings; sem ela, a logo do blog (payload publica ambas como URL
 * /api/site-asset/…); por último o /opengraph.jpg buildado — que é o do blog
 * que gerou a imagem Docker, o pior dos fallbacks.
 */
function metaFromSitePayload(s: Record<string, unknown>): SiteMeta | null {
  const siteName = typeof s["siteName"] === "string" ? (s["siteName"] as string).trim() : "";
  if (!siteName) return null;
  const tagline = typeof s["tagline"] === "string" ? (s["tagline"] as string).trim() : "";
  const seoDescription =
    (typeof s["seoDescription"] === "string" && (s["seoDescription"] as string).trim()) || tagline || siteName;
  const ogRaw = typeof s["ogImageBase64"] === "string" ? (s["ogImageBase64"] as string) : "";
  const logoRaw = typeof s["logoBase64"] === "string" ? (s["logoBase64"] as string) : "";
  return {
    lang: s["siteLanguage"] === "en" ? "en" : "pt-BR",
    siteName,
    tagline,
    seoDescription,
    ogImagePath: ogRaw.startsWith("/") ? ogRaw : logoRaw.startsWith("/") ? logoRaw : "/opengraph.jpg",
  };
}

/**
 * Reescreve título/descrição/OG/Twitter do index.html buildado com a identidade
 * do blog dono do container (o template traz a marca de quem buildou a imagem).
 * `origin` = proto://host da requisição — og:url e og:image precisam ser absolutos.
 */
function rewriteHeadMeta(html: string, meta: SiteMeta, origin: string, pathOnly: string): string {
  const title = meta.tagline ? `${meta.siteName} — ${meta.tagline}` : meta.siteName;
  const desc = meta.seoDescription;
  const ogImage = `${origin}${meta.ogImagePath}`;
  const url = `${origin}${pathOnly}`;
  return html
    .replace(/<html lang="[^"]*"/, `<html lang="${meta.lang}"`)
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
    .replace(/(<meta property="og:site_name" content=")[^"]*(")/, `$1${esc(meta.siteName)}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${esc(url)}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
    .replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${esc(ogImage)}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
    .replace(/(<meta name="twitter:image" content=")[^"]*(")/, `$1${esc(ogImage)}$2`);
}

function buildOgHtml(params: {
  title: string;
  description: string;
  imageUrl: string;
  canonicalUrl: string;
  category: string;
  publishedAt: string;
  lang: SiteLang;
  siteName: string;
}): string {
  const { title, description, imageUrl, canonicalUrl, category, publishedAt, lang, siteName } =
    params;
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — ${esc(siteName)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${esc(siteName)}">
<meta property="og:locale" content="${lang === "en" ? "en_US" : "pt_BR"}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonicalUrl)}">
${imageUrl ? `<meta property="og:image" content="${esc(imageUrl)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(title)}">` : ""}
${category ? `<meta property="article:section" content="${esc(category)}">` : ""}
${publishedAt ? `<meta property="article:published_time" content="${esc(publishedAt)}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@brasiliaagora">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
${imageUrl ? `<meta name="twitter:image" content="${esc(imageUrl)}">` : ""}
<link rel="canonical" href="${esc(canonicalUrl)}">
<script>window.location.replace(${JSON.stringify(canonicalUrl)});</script>
</head>
<body>
<h1><a href="${esc(canonicalUrl)}">${esc(title)}</a></h1>
<p>${esc(description)}</p>
${imageUrl ? `<img src="${esc(imageUrl)}" alt="${esc(title)}" style="max-width:100%">` : ""}
</body>
</html>`;
}

/**
 * staticCachePlugin — duas funções:
 * 1. No dev server: middleware que serve /assets/* com headers imutáveis e
 *    o index.html com no-cache, para simular a política de produção.
 * 2. No closeBundle: gera dist/public/_headers (Netlify/Cloudflare/Replit)
 *    com Cache-Control por tipo de recurso.
 */
function staticCachePlugin(): Plugin {
  /* Headers de cache por path, usados tanto no dev quanto no preview (produção).
     /assets/* e /fonts/*.woff2 têm hash/URL estável → imutável por 1 ano.
     HTML → nunca cacheia (sempre busca o mais recente). */
  function cacheMiddleware(
    req: { url?: string },
    res: { setHeader(k: string, v: string): void },
    next: () => void,
  ): void {
    const url = req.url ?? "";
    if (/^\/assets\//.test(url) || /\.(woff2?|ttf)(\?.*)?$/.test(url)) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    } else if (url === "/" || url.endsWith(".html")) {
      // no-cache (e não no-store): o navegador sempre revalida antes de usar,
      // mas o documento continua elegível ao bfcache — no-store bloqueava a
      // restauração back/forward (diagnóstico do Lighthouse).
      res.setHeader("Cache-Control", "no-cache, must-revalidate");
    }
    next();
  }

  return {
    name: "vite-static-cache",

    configureServer(server) {
      server.middlewares.use(cacheMiddleware);
    },

    configurePreviewServer(server) {
      server.middlewares.use(cacheMiddleware);
    },

    closeBundle() {
      const outDir = path.resolve(import.meta.dirname, "dist/public");
      if (!fs.existsSync(outDir)) return;

      const content = [
        "# Arquivos com hash de conteúdo — imutáveis por 1 ano",
        "/assets/*",
        "  Cache-Control: public, max-age=31536000, immutable",
        "",
        "# Fontes woff/woff2 (auto-hospedadas em /fonts e na raiz)",
        "/fonts/*",
        "  Cache-Control: public, max-age=31536000, immutable",
        "/*.woff2",
        "  Cache-Control: public, max-age=31536000, immutable",
        "/*.woff",
        "  Cache-Control: public, max-age=31536000, immutable",
        "",
        "# HTML — sempre revalidar (no-cache, não no-store: preserva o bfcache)",
        "/*.html",
        "  Cache-Control: no-cache, must-revalidate",
        "/",
        "  Cache-Control: no-cache, must-revalidate",
        "",
        "# Manifesto e service worker",
        "/manifest.webmanifest",
        "  Cache-Control: public, max-age=86400",
        "/sw.js",
        "  Cache-Control: no-store",
      ].join("\n");

      fs.writeFileSync(path.join(outDir, "_headers"), content, "utf-8");
    },
  };
}

function socialOgPlugin(apiBase: string): Plugin {
  const resolveSiteMeta = makeSiteMetaResolver(apiBase);

  async function handleCrawler(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): Promise<void> {
    const ua = req.headers["user-agent"] ?? "";
    const url = req.url ?? "";

    const match = url.match(/^\/artigo\/([^/?#]+)/);
    if (!match || !CRAWLER_RE.test(ua)) {
      next();
      return;
    }

    const slug = match[1];

    try {
      const apiRes = await fetch(`${apiBase}/api/articles/${encodeURIComponent(slug)}`);
      if (!apiRes.ok) {
        next();
        return;
      }

      const data = (await apiRes.json()) as {
        article?: {
          title?: string;
          subtitle?: string;
          imageUrl?: string;
          slug?: string;
          id?: string;
          category?: string;
          publishedAt?: string;
        };
      };

      const article = data.article;
      if (!article?.title) {
        next();
        return;
      }

      const host = req.headers.host ?? "sbcagora.com.br";
      const proto = (req.headers["x-forwarded-proto"] as string) ?? "https";
      const artSlug = article.slug ?? article.id ?? slug;
      const canonicalUrl = `${proto}://${host}/artigo/${artSlug}`;

      const meta = await resolveSiteMeta();
      const lang = meta.lang;
      const rawTitle = stripHtml(article.title);
      const rawSubtitle = stripHtml(article.subtitle ?? "");
      const baseDesc = rawSubtitle || rawTitle;
      const description =
        baseDesc.slice(0, 200) + (baseDesc.length > 200 ? "…" : "") +
        (lang === "en" ? " — Read more on our site" : " — Leia mais em nosso site");

      const html = buildOgHtml({
        title: rawTitle,
        description,
        imageUrl: article.imageUrl ?? "",
        canonicalUrl,
        category: article.category ?? "",
        publishedAt: article.publishedAt ?? "",
        lang,
        siteName: meta.siteName,
      });

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=300");
      res.end(html);
    } catch {
      next();
    }
  }

  return {
    name: "social-og-prerender",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleCrawler(req, res, next);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleCrawler(req, res, next);
      });
    },
  };
}

/**
 * ssrHomePlugin — SSR da home (apenas `/`) no servidor de preview (produção).
 * Renderiza o App no servidor (usando o bundle dist/server/entry-server.js gerado
 * por `vite build --ssr`), injeta o HTML no #root do template buildado e serializa
 * os dados em window.__SSR_DATA__. Assim o hero já vem pintado no HTML (LCP cedo)
 * e o cliente hidrata sem refazer o trabalho. Demais rotas → next() (SPA client).
 * Só em preview (produção); o dev (`vite`) segue client-only.
 */
function ssrHomePlugin(apiBase: string): Plugin {
  const clientIndex = path.resolve(import.meta.dirname, "dist/public/index.html");
  const ssrEntry = path.resolve(import.meta.dirname, "dist/server/entry-server.js");
  let template: string | null = null;
  let renderFn: ((url: string, data: unknown) => string) | null = null;

  /* Cache em memória do HTML já renderizado. Sem ele, CADA request a `/` paga
     3 fetches de API + renderToString + serialize como TTFB — o que infla FCP e
     LCP em TODA medição (PageSpeed recarrega a home várias vezes). A home não é
     personalizada (mesmos articles/site/ads para todos), então servir um HTML
     com até ~30s de idade é seguro e derruba o TTFB para ~0 nos hits seguintes. */
  const HTML_TTL_MS = 30_000;
  let htmlCache: { html: string; at: number } | null = null;

  async function fetchJson(u: string): Promise<unknown> {
    try {
      const r = await fetch(u);
      return r.ok ? await r.json() : null;
    } catch {
      return null;
    }
  }

  async function handleHome(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): Promise<void> {
    const pathOnly = (req.url ?? "").split("?")[0];
    if (req.method !== "GET" || (pathOnly !== "/" && pathOnly !== "/index.html")) {
      next();
      return;
    }
    // Hit do cache TTL → responde na hora, sem fetch/render (TTFB ~0).
    const now = Date.now();
    if (htmlCache && now - htmlCache.at < HTML_TTL_MS) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
      res.end(htmlCache.html);
      return;
    }
    try {
      if (!renderFn) {
        const mod = (await import(pathToFileURL(ssrEntry).href)) as {
          render: (url: string, data: unknown) => string;
        };
        renderFn = mod.render;
      }
      if (template === null) template = fs.readFileSync(clientIndex, "utf-8");

      const [a, s, d] = (await Promise.all([
        fetchJson(`${apiBase}/api/articles`),
        fetchJson(`${apiBase}/api/site`),
        fetchJson(`${apiBase}/api/ads`),
      ])) as [{ articles?: unknown[] } | null, unknown, { ads?: unknown[] } | null];

      /* O /api/site publica os campos de imagem como URLs pequenas
         (/api/site-asset/…) em vez de data URI — o __SSR_DATA__ pode levar as
         settings inteiras sem inchar o HTML, e o header/rodapé do SSR já saem
         com a logo certa (sem flash da marca default na hidratação). */
      const site: Record<string, unknown> | null =
        (s && typeof s === "object") ? { ...(s as Record<string, unknown>) } : null;
      /* O __SSR_DATA__ duplica os artigos (já renderizados no appHtml) como JSON
         para a hidratação. A home exibe ~60 itens (mais recentes por seção), então
         inlinear a lista INTEIRA incha o documento à toa. Limitamos aos 100 mais
         recentes — cobrem as seções quentes sem perda visível. */
      const rawArticles = (a && Array.isArray(a.articles)) ? (a.articles as Array<Record<string, unknown>>) : [];
      const sorted = rawArticles
        .map((art) => { const copy = { ...art }; delete copy["keywords"]; return copy; })
        .sort((x, y) => new Date(String(y["publishedAt"] ?? 0)).getTime() - new Date(String(x["publishedAt"] ?? 0)).getTime());
      const articles = sorted.slice(0, 100);
      /* O corte acima é só "mais recentes": editoria de baixo volume (ex.: NFL,
         e-sports) cujos artigos saíram do top-100 sumia da home no público e
         virava "EXEMPLO" no preview do admin. Completa o pool com até 8 artigos
         por categoria referenciada pelos blocos visíveis — mesmo critério de
         match do getArticles da Home (includes, case-insensitive). */
      const homeBlocks = site?.["homeBlocks"];
      if (Array.isArray(homeBlocks)) {
        const have = new Set(articles.map((art) => String(art["id"])));
        const cats = new Set<string>();
        for (const b of homeBlocks) {
          if (!b || typeof b !== "object") continue;
          const blk = b as Record<string, unknown>;
          if (blk["visible"] === false) continue;
          const cat = typeof blk["category"] === "string" ? blk["category"].trim().toLowerCase() : "";
          if (cat) cats.add(cat);
        }
        for (const cat of cats) {
          let covered = 0;
          for (const art of sorted) {
            if (covered >= 8) break;
            if (!String(art["category"] ?? "").toLowerCase().includes(cat)) continue;
            covered++;
            const id = String(art["id"]);
            if (!have.has(id)) { have.add(id); articles.push(art); }
          }
        }
      }

      const data = { articles, site, ads: d?.ads ?? [] };

      const appHtml = renderFn("/", data);
      const serialized = JSON.stringify(data).replace(/</g, "\\u003c");
      let html = template
        .replace("<head>", `<head>\n    <script>window.__SSR_DATA__=${serialized}</script>`)
        .replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`);
      // Título/descrição/OG do template são do blog que buildou a imagem
      // compartilhada — reescreve com a identidade DESTE blog (o crawler do
      // WhatsApp/Facebook lê a home daqui; sem isso o preview sai com a marca
      // errada). Também ajusta <html lang> e og:url/og:image absolutos.
      const meta = site ? metaFromSitePayload(site) : null;
      if (meta) {
        const proto = (req.headers["x-forwarded-proto"] as string) ?? "https";
        const host = req.headers.host ?? BRAND.domain;
        html = rewriteHeadMeta(html, meta, `${proto}://${host}`, "/");
      } else {
        const lang = site?.["siteLanguage"] === "en" ? "en" : "pt-BR";
        html = html.replace(/<html lang="[^"]*"/, `<html lang="${lang}"`);
      }

      htmlCache = { html, at: now };
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      // bfcache-friendly (sem no-store) + cache curto: repeat-nav instantâneo e
      // restauração back/forward. Conteúdo público, staleness de ~30s aceitável.
      res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
      res.end(html);
    } catch {
      next(); // qualquer falha → cai para o index.html cru (SPA client-only)
    }
  }

  return {
    name: "ssr-home",
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleHome(req, res, next);
      });
    },
  };
}

/**
 * spaHeadPlugin — fallback SPA com <head> do blog certo. Toda rota sem extensão
 * (categorias, /artigo/* para usuários, páginas institucionais) cairia no
 * index.html buildado, cujo título/OG são do blog que gerou a imagem Docker
 * compartilhada — link compartilhado dessas páginas mostrava a marca errada.
 * Serve o mesmo index.html com o head reescrito pela identidade do blog
 * (API própria, cache de 5min). Registrar DEPOIS do ssrHomePlugin: a home
 * continua com SSR completo; aqui só passa o resto. Falha → index.html cru.
 */
function spaHeadPlugin(apiBase: string): Plugin {
  const clientIndex = path.resolve(import.meta.dirname, "dist/public/index.html");
  const resolveSiteMeta = makeSiteMetaResolver(apiBase);
  let template: string | null = null;

  async function handleSpaRoute(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): Promise<void> {
    const pathOnly = (req.url ?? "").split("?")[0] ?? "";
    // Só rotas de página: com extensão (assets, /opengraph.jpg, /sw.js…) ou
    // /api/* seguem o fluxo normal do servidor estático.
    if (req.method !== "GET" || pathOnly.startsWith("/api/") || /\.[a-zA-Z0-9]+$/.test(pathOnly)) {
      next();
      return;
    }
    try {
      if (template === null) template = fs.readFileSync(clientIndex, "utf-8");
      const meta = await resolveSiteMeta();
      const proto = (req.headers["x-forwarded-proto"] as string) ?? "https";
      const host = req.headers.host ?? BRAND.domain;
      const html = rewriteHeadMeta(template, meta, `${proto}://${host}`, pathOnly);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, must-revalidate");
      res.end(html);
    } catch {
      next();
    }
  }

  return {
    name: "spa-head-meta",
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleSpaRoute(req, res, next);
      });
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    staticCachePlugin(),
    socialOgPlugin(process.env.API_URL ?? "http://localhost:8080"),
    ssrHomePlugin(process.env.API_URL ?? "http://localhost:8080"),
    spaHeadPlugin(process.env.API_URL ?? "http://localhost:8080"),
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    target: "esnext",
    cssCodeSplit: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      /* Silencia ruído inofensivo do build do SPA:
         - "use client": diretiva que só tem efeito em RSC/Next; aqui o Vite a
           ignora e o Rollup emite MODULE_LEVEL_DIRECTIVE para cada componente
           shadcn/Radix que a contém (tooltip, select, dropdown-menu, etc.).
         - O aviso secundário "Error when using sourcemap for reporting an error"
           é a tentativa (falha) do Rollup de mapear a localização do aviso acima.
         Demais avisos continuam sendo exibidos normalmente. */
      onwarn(warning, warn) {
        if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
        if (warning.code === "SOURCEMAP_ERROR") return;
        const msg = typeof warning.message === "string" ? warning.message : "";
        if (msg.includes("Error when using sourcemap") || msg.includes("use client")) return;
        warn(warning);
      },
      output: {
        /* Separa vendors pesados em chunks dedicados — o browser faz cache deles
           separadamente e só re-baixa quando a versão mudar. */
        manualChunks(id) {
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom") || id.includes("node_modules/scheduler")) {
            return "vendor-react";
          }
          if (id.includes("node_modules/@tanstack")) {
            return "vendor-query";
          }
          if (id.includes("node_modules/framer-motion")) {
            return "vendor-motion";
          }
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-")) {
            return "vendor-charts";
          }
          if (id.includes("node_modules/lucide-react")) {
            return "vendor-icons";
          }
          if (id.includes("node_modules/@tiptap")) {
            return "vendor-editor";
          }
          if (id.includes("node_modules/@radix-ui")) {
            return "vendor-radix";
          }
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    /* Cache-Control por path é gerenciado pelo staticCachePlugin acima.
       Sem headers globais aqui para não sobrescrever os cabeçalhos por rota. */
    fs: {
      strict: true,
    },
    proxy: {
      "/api": {
        target: process.env.API_URL ?? "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
