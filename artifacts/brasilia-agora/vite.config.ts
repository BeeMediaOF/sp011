import { defineConfig, type Plugin } from "vite";
import { BRAND } from "./src/brand";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "node:fs";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import type { IncomingMessage, ServerResponse } from "node:http";

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

function buildOgHtml(params: {
  title: string;
  description: string;
  imageUrl: string;
  canonicalUrl: string;
  category: string;
  publishedAt: string;
}): string {
  const { title, description, imageUrl, canonicalUrl, category, publishedAt } =
    params;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — ${BRAND.titleSuffix}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${BRAND.name}">
<meta property="og:locale" content="pt_BR">
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
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
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
        "# HTML — nunca cachear; deve sempre buscar o mais recente",
        "/*.html",
        "  Cache-Control: no-store, no-cache, must-revalidate",
        "/",
        "  Cache-Control: no-store, no-cache, must-revalidate",
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

      const rawTitle = stripHtml(article.title);
      const rawSubtitle = stripHtml(article.subtitle ?? "");
      const baseDesc = rawSubtitle || rawTitle;
      const description =
        baseDesc.slice(0, 200) + (baseDesc.length > 200 ? "…" : "") +
        " — Leia mais em nosso site";

      const html = buildOgHtml({
        title: rawTitle,
        description,
        imageUrl: article.imageUrl ?? "",
        canonicalUrl,
        category: article.category ?? "",
        publishedAt: article.publishedAt ?? "",
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

export default defineConfig({
  base: basePath,
  plugins: [
    staticCachePlugin(),
    socialOgPlugin(process.env.API_URL ?? "http://localhost:8080"),
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
