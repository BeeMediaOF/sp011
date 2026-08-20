import { defineConfig, type Plugin } from "vite";
/* Os módulos abaixo são compartilhados com o app de propósito: o middleware de
   SSR precisa concordar com o App sobre o que é página de editoria e sobre a URL
   exata de cada lista — divergir aqui é renderizar no servidor uma página que o
   cliente hidrata diferente. São TS puro, sem React nem browser. */
import {
  resolveCategoryRoute, categoryRouteForSlug, categoryTitle, smartCase,
  type MenuItemLike, type CategoryLike,
} from "./src/lib/categoryRoutes";
import { articlesUrl, ARTICLES_CATEGORY_LIMIT, ARTICLES_TICKER_LIMIT } from "./src/lib/articlesQuery";
import { brandNameFromHost } from "./src/lib/blogIdentity";
import { classifySsrPath, type SsrRoute } from "./src/lib/ssrRoutes";
import { isSocialCrawler } from "./src/lib/crawlerUa";
import { decideArticle, decideCategory } from "./src/lib/routeDecision";
import { isStaticCandidate, safeRelative } from "./src/lib/staticPath";
import { sanitizeGtmId, injectGtm } from "./src/lib/gtmSnippet";
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
  /** Container do Google Tag Manager deste blog ("" = sem GTM). */
  gtmId: string;
}

/**
 * Identidade do site com cache (~5min). A imagem `blog-web` é COMPARTILHADA
 * entre os blogs — o index.html buildado traz a marca do blog que buildou.
 * Todo <head> servido a crawler precisa vir daqui (API do próprio blog), nunca
 * do template. Falha de API → última leitura boa; em último caso, o nome sai do
 * HOST da requisição (nunca de uma marca embutida, que é a de outro portal).
 */
function makeSiteMetaResolver(apiBase: string): (host?: string) => Promise<SiteMeta> {
  const TTL_MS = 5 * 60_000;
  const fallbackFor = (host?: string): SiteMeta => ({
    lang: "pt-BR",
    siteName: brandNameFromHost(host ?? ""),
    tagline: "",
    seoDescription: "",
    ogImagePath: "/opengraph.jpg",
    gtmId: "",
  });
  let cached: { meta: SiteMeta; at: number } | null = null;
  return async (host?: string) => {
    const now = Date.now();
    if (cached && now - cached.at < TTL_MS) return cached.meta;
    try {
      const r = await fetch(`${apiBase}/api/site`);
      const s = r.ok ? ((await r.json()) as Record<string, unknown>) : null;
      const meta = s ? metaFromSitePayload(s) : null;
      if (!meta) return cached?.meta ?? fallbackFor(host);
      cached = { meta, at: now };
      return meta;
    } catch {
      return cached?.meta ?? fallbackFor(host);
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
    // Cada blog tem o SEU container: o valor vem do /api/site do próprio blog,
    // nunca do index.html buildado (que é do blog que gerou a imagem Docker).
    gtmId: sanitizeGtmId(typeof s["gtmId"] === "string" ? (s["gtmId"] as string) : ""),
  };
}

/** O que o <head> servido precisa carregar. Uma rota, um destes. */
interface HeadFields {
  lang: SiteLang;
  /** Conteúdo do <title> (com o sufixo do portal, quando houver). */
  title: string;
  description: string;
  siteName: string;
  /** URL absoluta desta página — og:url. */
  url: string;
  /** URL absoluta da imagem OG. */
  image: string;
  ogType?: "website" | "article";
  /** Valor da tag `robots` — "noindex, follow" nas respostas que não indexam. */
  robots?: string;
  /** og:title/twitter:title quando diferem do <title> (artigo: sem o sufixo). */
  socialTitle?: string;
  /** Tags extras injetadas antes de </head> (canonical, article:*). */
  extraTags?: readonly string[];
  /** Container do GTM. Injetado no <head> e no <body> — ver gtmSnippet.ts. */
  gtmId?: string;
}

/**
 * Reescreve título/descrição/OG/Twitter do index.html buildado. O template traz
 * a marca de quem buildou a imagem Docker — a mesma imagem serve os 8 blogs —,
 * então TODO HTML servido passa por aqui.
 */
function applyHead(html: string, f: HeadFields): string {
  const social = f.socialTitle ?? f.title;
  let out = html
    .replace(/<html lang="[^"]*"/, `<html lang="${f.lang}"`)
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(f.title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(f.description)}$2`)
    .replace(/(<meta property="og:type" content=")[^"]*(")/, `$1${f.ogType ?? "website"}$2`)
    .replace(/(<meta property="og:site_name" content=")[^"]*(")/, `$1${esc(f.siteName)}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${esc(f.url)}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(social)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(f.description)}$2`)
    .replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${esc(f.image)}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(social)}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${esc(f.description)}$2`)
    .replace(/(<meta name="twitter:image" content=")[^"]*(")/, `$1${esc(f.image)}$2`);
  const extra = [...(f.extraTags ?? [])];

  /* UMA tag `robots` na resposta. O valor SUBSTITUI o do template em vez de
     acrescentar uma segunda: duas tags robots têm resolução indefinida entre
     buscadores, e a segunda não anula a primeira de forma previsível. */
  if (f.robots) {
    const robotsRe = /(<meta name="robots" content=")[^"]*(")/;
    if (robotsRe.test(out)) out = out.replace(robotsRe, `$1${esc(f.robots)}$2`);
    else extra.push(`<meta name="robots" content="${esc(f.robots)}">`);
  }

  /* GTM no HTML SERVIDO (2026-08-14). Antes o container só era montado no
     cliente, depois do consentimento — o verificador do GTM, que faz um GET
     simples, nunca via nada e acusava "container não encontrado". Entra aqui
     porque `applyHead` é o funil por onde passa TODO HTML servido: home, artigo,
     editoria e o fallback SPA de qualquer outra rota. */
  const comExtra = extra.length === 0
    ? out
    // O `</head>` do template já vem indentado; as tags entram antes dele.
    : out.replace("</head>", `${extra.join("\n    ")}\n  </head>`);

  return injectGtm(comExtra, f.gtmId ?? "");
}

/**
 * <head> com a identidade do blog (sem nada específico de rota).
 * `origin` = proto://host da requisição — og:url e og:image precisam ser absolutos.
 */
function rewriteHeadMeta(
  html: string,
  meta: SiteMeta,
  origin: string,
  pathOnly: string,
  extraTags: readonly string[] = [],
  robots?: string,
): string {
  return applyHead(html, {
    lang: meta.lang,
    ...(robots ? { robots } : {}),
    title: meta.tagline ? `${meta.siteName} — ${meta.tagline}` : meta.siteName,
    description: meta.seoDescription,
    siteName: meta.siteName,
    url: `${origin}${pathOnly}`,
    image: `${origin}${meta.ogImagePath}`,
    extraTags,
    gtmId: meta.gtmId,
  });
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
    /* Duas condições novas (P0 de indexação, 20/08/2026):
       - `isReadRequest`: um POST em /artigo/* com UA de crawler não pode ser
         respondido com o card de compartilhamento;
       - `isSocialCrawler`: BUSCADOR NÃO PASSA POR AQUI. Googlebot e bingbot
         seguem para o `ssrPlugin` e recebem o mesmo HTML editorial que o
         navegador recebe. Ver `src/lib/crawlerUa.ts`. */
    if (!isReadRequest(req) || !match || !isSocialCrawler(ua)) {
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

      // Host da requisição — sem reserva embutida: um domínio fixo aqui seria o
      // de outro blog no canonical/OG da página servida por este.
      const host = req.headers.host ?? "";
      const proto = (req.headers["x-forwarded-proto"] as string) ?? "https";
      const artSlug = article.slug ?? article.id ?? slug;
      const canonicalUrl = `${proto}://${host}/artigo/${artSlug}`;

      const meta = await resolveSiteMeta(host);
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
 * GET e HEAD pedem o MESMO recurso — crawler e monitor costumam mandar HEAD antes
 * do GET. Com o guard só em "GET", o HEAD caía no next() e era respondido pelo
 * estático: `index.html` cru, com o <head> do blog que buildou a imagem
 * compartilhada. Mesma causa do defeito que 8cd8518 corrigiu no seoTextPlugin.
 */
function isReadRequest(req: IncomingMessage): boolean {
  return req.method === "GET" || req.method === "HEAD";
}

/**
 * Responde um HTML já montado. O Content-Length é explícito porque estes handlers
 * também atendem HEAD: o Node zera o corpo de resposta a HEAD sozinho
 * (`res._hasBody = false`), então o mesmo `end(html)` serve aos dois — mas sem o
 * header o HEAD sairia sem anunciar tamanho nenhum.
 */
/* bfcache-friendly (sem no-store) + cache curto: repeat-nav instantâneo e
   restauração back/forward. Conteúdo público, staleness de ~30s aceitável. */
const HOME_CACHE_CONTROL = "public, max-age=30, stale-while-revalidate=60";
/* Artigo e editoria mudam menos que a home (a home reordena a cada publicação). */
const PAGE_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=120";

function sendHtml(res: ServerResponse, html: string, cacheControl: string, status = 200): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", cacheControl);
  res.setHeader("Content-Length", String(Buffer.byteLength(html)));
  res.end(html);
}

/**
 * Contadores em memória do middleware. Não existe logger estruturado no
 * container `web` (ele é um `vite preview`), e sem NENHUM sinal uma `api`
 * instável degrada em silêncio: o visitante vê página vazia e nada acende.
 */
const ssrStats = {
  ok: 0, notFound: 0, redirect: 0, staleServed: 0, unavailable503: 0, staticNotFound: 0,
};

/**
 * Log amostrado (1 a cada `every` ocorrências do mesmo evento).
 * NUNCA registra query string, cookie, header de autenticação ou IP — mesma
 * disciplina do `pino` do api-server, que serializa `req.url.split("?")[0]`.
 */
function ssrLog(
  event: string,
  every: number,
  count: number,
  fields: Record<string, string | number>,
): void {
  if ((count - 1) % every !== 0) return;
  const parts = Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(" ");
  const line = `[ssr] ${event} ${parts} n=${count}`;
  if (event === "apiUnavailable" || event === "staleServed") console.warn(line);
  else console.log(line);
}

/** Como servir o shell da SPA numa resposta que não é o 200 de sempre. */
interface ShellOptions {
  status?: number;
  cacheControl?: string;
  /** `noindex, follow` — usado no 404. */
  noindex?: boolean;
  /** Headers extras (o `Retry-After` do 503). */
  headers?: Readonly<Record<string, string>>;
}

/**
 * Serve o `index.html` buildado com o `<head>` do blog da requisição.
 *
 * Era código exclusivo do `spaHeadPlugin`; virou fábrica compartilhada porque o
 * `ssrPlugin` também precisa devolver o shell — com outro status — quando a
 * `api` está indisponível. Uma implementação só evita que as duas respostas
 * divirjam na identidade do portal.
 */
function makeShellRenderer(apiBase: string): (
  req: IncomingMessage,
  res: ServerResponse,
  opts?: ShellOptions,
) => Promise<boolean> {
  const clientIndex = path.resolve(import.meta.dirname, "dist/public/index.html");
  const resolveSiteMeta = makeSiteMetaResolver(apiBase);
  let template: string | null = null;

  return async (req, res, opts = {}) => {
    try {
      if (template === null) template = fs.readFileSync(clientIndex, "utf-8");
      const pathOnly = (req.url ?? "").split("?")[0] ?? "";
      const proto = (req.headers["x-forwarded-proto"] as string) ?? "https";
      const host = req.headers.host ?? "";
      const meta = await resolveSiteMeta(host);
      /* Sem `extraTags`: a resposta 404 NÃO leva canonical. Canonical numa
         página que não existe aponta o buscador para tratá-la como versão de
         outra URL — o oposto do que o 404 comunica. */
      const html = rewriteHeadMeta(
        template, meta, `${proto}://${host}`, pathOnly, [],
        opts.noindex ? "noindex, follow" : undefined,
      );
      for (const [k, v] of Object.entries(opts.headers ?? {})) res.setHeader(k, v);
      sendHtml(res, html, opts.cacheControl ?? "no-cache, must-revalidate", opts.status ?? 200);
      return true;
    } catch {
      return false;
    }
  };
}

/**
 * ssrPlugin — SSR de home, artigo e editoria no servidor de preview (produção).
 * Renderiza o App no servidor (bundle dist/server/entry-server.js gerado por
 * `vite build --ssr`), injeta o HTML no #root do template buildado e serializa os
 * dados em window.__SSR_DATA__. Assim a imagem do topo já vem pintada no HTML
 * (LCP cedo) e o cliente hidrata sem refazer o trabalho. Toda falha (API fora,
 * artigo inexistente, exceção no render) → next(): cai no spaHeadPlugin e o
 * visitante recebe a SPA de sempre, nunca um 500.
 * Só em preview (produção); o dev (`vite`) segue client-only.
 */
function ssrPlugin(apiBase: string): Plugin {
  const clientIndex = path.resolve(import.meta.dirname, "dist/public/index.html");
  const ssrEntry = path.resolve(import.meta.dirname, "dist/server/entry-server.js");
  const serveShell = makeShellRenderer(apiBase);
  let template: string | null = null;
  let renderFn: ((url: string, data: unknown) => string) | null = null;

  /* Cache em memória do HTML já renderizado. Sem ele, CADA request paga fetches
     de API + renderToString + serialize como TTFB — o que infla FCP e LCP em TODA
     medição (o PageSpeed recarrega a página várias vezes). Nada aqui é
     personalizado (mesmos articles/site/ads para todos), então servir um HTML com
     algumas dezenas de segundos de idade é seguro e derruba o TTFB para ~0 nos
     hits seguintes.
     A home era uma variável única; com artigo e editoria vira dicionário — e o
     container `web` tem mem_limit de 768m. Daí o teto de entradas + LRU. */
  const HOME_TTL_MS = 30_000;
  const PAGE_TTL_MS = 60_000;
  const CACHE_MAX_ENTRIES = 200;
  /* Idade a partir da qual o HTML velho deixa de ser servido: aí o visitante
     espera a renderização mesmo. Só acontece em rota que ninguém pede há 10 min. */
  const STALE_MAX_MS = 10 * 60_000;
  /* "Não existe" também é resposta, e cacheá-la é o que impede uma varredura de
     URLs inventadas de virar uma consulta à `api` por requisição. Curto o
     bastante para um artigo publicado agora aparecer rápido. */
  const NOT_FOUND_TTL_MS = 60_000;
  /* Teto SEPARADO para essas entradas: sem ele, a varredura despejaria do LRU as
     páginas que o site realmente serve. */
  const NOT_FOUND_MAX_ENTRIES = 50;

  type CacheEntry =
    | { kind: "html"; html: string; at: number; ttl: number }
    | { kind: "redirect"; location: string; at: number; ttl: number }
    | { kind: "notFound"; at: number; ttl: number };

  const htmlCache = new Map<string, CacheEntry>();
  /** Chaves com revalidação em andamento — impede N renders simultâneos da mesma rota. */
  const revalidating = new Set<string>();

  /** Entrada utilizável (mesmo vencida) e se ela já passou do TTL. */
  function cacheLookup(key: string): { entry: CacheEntry; stale: boolean } | null {
    const hit = htmlCache.get(key);
    if (!hit) return null;
    const age = Date.now() - hit.at;
    if (age >= STALE_MAX_MS) { htmlCache.delete(key); return null; }
    /* Só HTML é servido vencido: um "não existe" velho tem de ser reperguntado à
       `api`, senão um artigo republicado ficaria 10 min em 404. */
    if (hit.kind !== "html" && age >= hit.ttl) { htmlCache.delete(key); return null; }
    htmlCache.delete(key); // reinsere no fim: Map itera por ordem de inserção
    htmlCache.set(key, hit);
    return { entry: hit, stale: age >= hit.ttl };
  }

  function cacheSet(key: string, entry: CacheEntry): void {
    htmlCache.delete(key);
    htmlCache.set(key, entry);
    if (entry.kind === "notFound") evictExcessNotFound();
    while (htmlCache.size > CACHE_MAX_ENTRIES) {
      const oldest = htmlCache.keys().next().value;
      if (oldest === undefined) break;
      htmlCache.delete(oldest);
    }
  }

  function cacheSetHtml(key: string, html: string, ttl: number): void {
    cacheSet(key, { kind: "html", html, at: Date.now(), ttl });
  }

  /** Mantém no máximo NOT_FOUND_MAX_ENTRIES entradas de "não existe" (as mais novas). */
  function evictExcessNotFound(): void {
    let n = 0;
    for (const e of htmlCache.values()) if (e.kind === "notFound") n += 1;
    if (n <= NOT_FOUND_MAX_ENTRIES) return;
    for (const [k, e] of htmlCache) {
      if (e.kind !== "notFound") continue;
      htmlCache.delete(k);
      n -= 1;
      if (n <= NOT_FOUND_MAX_ENTRIES) return;
    }
  }

  /**
   * Resposta da `api` com TRÊS estados, e não dois.
   *
   * "Não existe" e "não deu para saber" são coisas diferentes, e confundi-las é
   * o defeito mais caro que este middleware pode ter: um timeout ou um 5xx
   * respondido como 404 tira do índice conteúdo que está publicado. Só o 404
   * EXPLÍCITO da `api` é autoritativo — ela sabe distinguir (o app responde 503
   * `db_unavailable`/`setup_required` antes do router e 404 no artigo que não
   * existe).
   */
  type Fetched<T> =
    | { state: "ok"; data: T }
    | { state: "notFound" }
    | { state: "unavailable" };

  async function fetchJson(u: string): Promise<Fetched<unknown>> {
    try {
      const r = await fetch(u);
      if (r.ok) return { state: "ok", data: await r.json() };
      if (r.status === 404) return { state: "notFound" };
      // 5xx, 503 de banco não hidratado, 429: indisponibilidade, não ausência.
      return { state: "unavailable" };
    } catch {
      return { state: "unavailable" };
    }
  }

  /** Payload quando existe; `null` para ausência E para falha. Só onde a
   *  ausência é aceitável e não muda o status da página (anúncios). */
  function dataOrNull(f: Fetched<unknown>): unknown {
    return f.state === "ok" ? f.data : null;
  }

  type Row = Record<string, unknown>;
  interface ListPage { articles: Row[]; total: number }

  /** Uma página de /api/articles, já sem os campos que o site não usa. */
  async function fetchList(query: string): Promise<Fetched<ListPage>> {
    const res = await fetchJson(`${apiBase}${query}`);
    if (res.state !== "ok") return res;
    const raw = res.data as { articles?: unknown[]; total?: number } | null;
    const rows = Array.isArray(raw?.articles) ? (raw.articles as Row[]) : [];
    const articles = rows.map((a) => { const copy = { ...a }; delete copy["keywords"]; return copy; });
    return {
      state: "ok",
      data: { articles, total: typeof raw?.total === "number" ? raw.total : articles.length },
    };
  }

  /**
   * O que o middleware deve responder para uma rota. Substitui o `string | null`
   * de antes, em que "não existe", "está fora do ar" e "não é rota de SSR"
   * chegavam ao handler como o MESMO valor — e por isso viravam a mesma
   * resposta 200.
   */
  type Outcome =
    | { kind: "html"; html: string }
    /** Path canônico SEM query: quem responde acrescenta a query da requisição. */
    | { kind: "redirect"; location: string }
    | { kind: "notFound" }
    | { kind: "unavailable" };

  /** Carrega o bundle de SSR e o template uma única vez por processo. */
  async function ensureRuntime(): Promise<(url: string, data: unknown) => string> {
    if (!renderFn) {
      const mod = (await import(pathToFileURL(ssrEntry).href)) as {
        render: (url: string, data: unknown) => string;
      };
      renderFn = mod.render;
    }
    if (template === null) template = fs.readFileSync(clientIndex, "utf-8");
    return renderFn;
  }

  /**
   * Monta o documento final: #root preenchido, __SSR_DATA__ no fim do body e o
   * <head> do blog.
   *
   * O JSON vai para o FIM do body, logo depois do #root — não no topo do <head>.
   * Medido em produção (2026-07-28): eram 62.287 chars ANTES do <link> do CSS
   * render-blocking, dos modulepreload e de todo o markup do SSR, num documento de
   * 176 KB. Na banda do Lighthouse mobile (1,6 Mbps) isso são ~310 ms de atraso
   * puro empurrando o FCP. Ler daqui é seguro porque o entry é
   * <script type="module">, que é deferred por definição: só executa quando o
   * parse termina, e a esta altura o script clássico do <head> já rodou.
   * O que NÃO pode descer é o SINAL de "esta rota tem SSR": o boot inline do
   * index.html roda no <head> e precisa dele para NÃO disparar o prefetch e o
   * preload de LCP (que o SSR já dispensa). Daí os 26 B de __SSR__ no topo.
   * Os dois replaces são amarrados de propósito: se a âncora do #root não casar,
   * o SSR não entrou e o marcador também não deve entrar — senão o boot se
   * calaria numa página que precisa dele.
   */
  function compose(appHtml: string, data: unknown, head: (html: string) => string): string {
    const serialized = JSON.stringify(data).replace(/</g, "\\u003c");
    const withRoot = template!.replace(
      '<div id="root"></div>',
      `<div id="root">${appHtml}</div>\n    <script>window.__SSR_DATA__=${serialized}</script>`,
    );
    const html =
      withRoot === template
        ? withRoot
        : withRoot.replace("<head>", `<head>\n    <script>window.__SSR__=1</script>`);
    return head(html);
  }

  /** <head> quando o /api/site não deu nem o nome do portal: só o idioma. */
  function langOnly(html: string, site: Row | null): string {
    const lang = site?.["siteLanguage"] === "en" ? "en" : "pt-BR";
    return html.replace(/<html lang="[^"]*"/, `<html lang="${lang}"`);
  }

  async function renderHome(origin: string): Promise<Outcome> {
    const render = await ensureRuntime();
    const [a, s, d] = await Promise.all([
      // Pool de origem do SSR: 300 recentes bastam para os 22 blocos + o
      // complemento por categoria abaixo (a rota é paginada — PRD-PERF-01).
      fetchList("/api/articles?limit=300&offset=0&sort=recent"),
      fetchJson(`${apiBase}/api/site`),
      fetchJson(`${apiBase}/api/ads`),
    ]);
    /* A home nunca "não existe": ou ela tem o conteúdo do portal, ou a `api`
       está fora — e aí a resposta é 503, nunca uma página vazia com 200.
       Anúncio de fora não derruba a página. */
    if (a.state !== "ok" || s.state !== "ok") return { kind: "unavailable" };

    /* O /api/site publica os campos de imagem como URLs pequenas
       (/api/site-asset/…) em vez de data URI — o __SSR_DATA__ pode levar as
       settings inteiras sem inchar o HTML, e o header/rodapé do SSR já saem
       com a logo certa (sem flash da marca default na hidratação). */
    const site: Row | null = s.data && typeof s.data === "object" ? { ...(s.data as Row) } : null;
    /* O __SSR_DATA__ duplica os artigos (já renderizados no appHtml) como JSON
       para a hidratação. A home exibe ~60 itens (mais recentes por seção), então
       inlinear a lista INTEIRA incha o documento à toa. Limitamos aos 100 mais
       recentes — cobrem as seções quentes sem perda visível.
       MEDIDO em produção (2026-07-28): 511 B por artigo no __SSR_DATA__. Subir
       para 150 (como o PRD-PERF-01 previa) engordou o documento da home em
       16,5 KB e o __SSR_DATA__ foi de 70.923 B para 86.921 B — o oposto do
       objetivo. As editorias de baixo volume são cobertas pelo pool por
       categoria abaixo, não pelo tamanho deste corte. */
    const articles = a.data.articles
      .slice()
      .sort((x, y) => new Date(String(y["publishedAt"] ?? 0)).getTime() - new Date(String(x["publishedAt"] ?? 0)).getTime())
      .slice(0, 100);
    /* O corte acima é só "mais recentes": editoria de baixo volume (ex.: NFL,
       e-sports) cujos artigos saíram do top-N sumia da home no público e
       virava "EXEMPLO" no preview do admin. Completa o pool com até 8 artigos
       por categoria referenciada pelos blocos visíveis.
       A busca é POR CATEGORIA na API (e não uma varredura da lista-base):
       desde o PRD-PERF-01 a lista vem paginada, então uma editoria sem nada
       nos 300 recentes não seria alcançada por varredura. O filtro `category`
       da rota é igualdade exata + fallback por tag — a MESMA regra do
       getArticles da Home. */
    const homeBlocks = site?.["homeBlocks"];
    if (Array.isArray(homeBlocks)) {
      const cats = new Set<string>();
      for (const b of homeBlocks) {
        if (!b || typeof b !== "object") continue;
        const blk = b as Row;
        if (blk["visible"] === false) continue;
        const cat = typeof blk["category"] === "string" ? blk["category"].trim().toLowerCase() : "";
        if (cat) cats.add(cat);
      }
      const pools = await Promise.all([...cats].map((cat) => fetchList(
        `/api/articles?limit=8&offset=0&category=${encodeURIComponent(cat)}&sort=recent`,
      )));
      const have = new Set(articles.map((art) => String(art["id"])));
      for (const pool of pools) {
        // Complemento por editoria: falha aqui não invalida a home.
        if (pool.state !== "ok") continue;
        for (const raw of pool.data.articles) {
          const id = String(raw["id"]);
          if (have.has(id)) continue;
          have.add(id);
          articles.push(raw);
        }
      }
    }

    const data = { articles, site, ads: (dataOrNull(d) as { ads?: unknown[] } | null)?.ads ?? [], origin };
    const meta = site ? metaFromSitePayload(site) : null;
    const html = compose(render("/", data), data, (h) =>
      meta
        ? rewriteHeadMeta(h, meta, origin, "/", [`<link rel="canonical" href="${esc(`${origin}/`)}">`])
        : langOnly(h, site));
    return { kind: "html", html };
  }

  async function renderArticle(slug: string, origin: string): Promise<Outcome> {
    const render = await ensureRuntime();
    const [detail, list, s, d] = await Promise.all([
      // Slug CRU, exatamente como o useArticle do cliente pede.
      fetchJson(`${apiBase}/api/articles/${slug}`),
      fetchList(articlesUrl({ limit: ARTICLES_TICKER_LIMIT, offset: 0, sort: "recent" })),
      fetchJson(`${apiBase}/api/site`),
      fetchJson(`${apiBase}/api/ads`),
    ]);

    /* 404 da `api` é AUTORITATIVO: o artigo foi despublicado ou apagado. É o
       único caminho que autoriza um 404 na borda. */
    if (detail.state === "notFound") return { kind: "notFound" };
    if (detail.state !== "ok" || s.state !== "ok" || list.state !== "ok") {
      return { kind: "unavailable" };
    }

    const article = (detail.data as { article?: Row } | null)?.article;
    // Payload sem título: a `api` respondeu 200 sem artigo utilizável.
    if (!article || typeof article["title"] !== "string") return { kind: "notFound" };

    /* Canonicalização ANTES de renderizar: `/artigo/<uuid>` e `/artigo/<slug>`
       serviam a mesma matéria com 200 nos dois, porque o backend resolve por id
       OU slug. A resolução continua igual — link histórico não pode quebrar —,
       muda o status. O `Location` sai sem query; quem responde recoloca a da
       requisição. */
    const decision = decideArticle({
      requested: slug,
      state: "found",
      article: {
        slug: typeof article["slug"] === "string" ? article["slug"] : null,
        id: typeof article["id"] === "string" ? article["id"] : null,
      },
    });
    if (decision.action === "redirect" && decision.location) {
      return { kind: "redirect", location: decision.location };
    }

    const site: Row | null = s.data && typeof s.data === "object" ? { ...(s.data as Row) } : null;
    const data = {
      articles: list.data.articles,
      site,
      ads: (dataOrNull(d) as { ads?: unknown[] } | null)?.ads ?? [],
      origin,
      article: { key: slug, article },
    };

    const meta = site ? metaFromSitePayload(site) : null;
    const url = `${origin}/artigo/${String(article["slug"] ?? article["id"] ?? slug)}`;
    const html = compose(render(`/artigo/${slug}`, data), data, (doc) => {
      if (!meta) return langOnly(doc, site);
      const title = stripHtml(String(article["title"] ?? ""));
      // Mesmos recortes do <head> que a página aplica no cliente (Artigo.tsx):
      // servidor e cliente não podem anunciar títulos diferentes.
      const description = (stripHtml(String(article["subtitle"] ?? "")) || title).slice(0, 160);
      const rawImage = typeof article["imageUrl"] === "string" ? article["imageUrl"] : "";
      const image = rawImage.startsWith("http")
        ? rawImage
        : rawImage
          ? `${origin}${rawImage.startsWith("/") ? rawImage : `/${rawImage}`}`
          : `${origin}${meta.ogImagePath}`;
      const canonical = typeof article["canonicalUrl"] === "string" && article["canonicalUrl"]
        ? article["canonicalUrl"]
        : url;
      const extraTags = [`<link rel="canonical" href="${esc(canonical)}">`];
      const publishedAt = String(article["publishedAt"] ?? "");
      if (publishedAt) {
        const iso = new Date(publishedAt);
        if (!Number.isNaN(iso.getTime())) {
          extraTags.push(`<meta property="article:published_time" content="${esc(iso.toISOString())}">`);
        }
      }
      const section = String(article["category"] ?? "");
      if (section) extraTags.push(`<meta property="article:section" content="${esc(section)}">`);
      return applyHead(doc, {
        lang: meta.lang,
        title: `${title} — ${meta.siteName}`,
        socialTitle: title,
        description,
        siteName: meta.siteName,
        url,
        image,
        ogType: "article",
        extraTags,
        gtmId: meta.gtmId,
      });
    });
    return { kind: "html", html };
  }

  async function renderCategory(pathOnly: string, origin: string): Promise<Outcome> {
    const render = await ensureRuntime();
    // O /api/site vem ANTES do resto: sem ele não dá para saber se este slug é
    // editoria, e buscar as listas de um path qualquer daria a bots um jeito
    // barato de multiplicar consultas.
    const s = await fetchJson(`${apiBase}/api/site`);
    // Sem as settings não se sabe QUAIS editorias existem — e chutar aqui é
    // exatamente o erro que este PRD corrige. Indisponível, nunca inexistente.
    if (s.state !== "ok") return { kind: "unavailable" };
    const site: Row | null = s.data && typeof s.data === "object" ? { ...(s.data as Row) } : null;
    /* Superfície do PRÓPRIO blog: menu + editorias declaradas no painel
       (inclusive as ocultas). A tabela fixa das 13 editorias do sp011 só entra
       quando o blog não declarou nada. */
    const declared = resolveCategoryRoute(
      pathOnly,
      site?.["menuItems"] as MenuItemLike[] | undefined,
      site?.["categories"] as CategoryLike[] | undefined,
    );
    /* Fora da superfície, a segunda pergunta: a editoria TEM CONTEÚDO? Arquivo
       histórico de blog que mudou de taxonomia continua sendo página real — é o
       /seguranca do sp011 (163 artigos) e o /copa-do-mundo do Oley (86). A sonda
       é de 1 item só, e existe para não pagar quatro buscas por path inventado. */
    const candidate = /^\/[^/]+$/.test(pathOnly.replace(/\/+$/, ""))
      ? pathOnly.replace(/\/+$/, "").slice(1)
      : "";
    let route = declared;
    if (!route) {
      if (!candidate || !categoryRouteForSlug(candidate)) return { kind: "notFound" };
      const probe = await fetchList(articlesUrl({ category: candidate, limit: 1, sort: "recent" }));
      if (probe.state !== "ok") return { kind: "unavailable" };
      /* Quem classifica é o `routeDecision` — aqui só se executa o veredito. */
      if (decideCategory({ declared: false, total: probe.data.total, state: "found" }).status === 404) {
        return { kind: "notFound" };
      }
      route = categoryRouteForSlug(candidate);
    }
    if (!route) return { kind: "notFound" };

    const [list, top, recent, d] = await Promise.all([
      fetchList(articlesUrl({ category: route.slug, limit: ARTICLES_CATEGORY_LIMIT, sort: "recent" })),
      // "Mais lidas" da sidebar é do SITE INTEIRO, não da editoria.
      fetchList(articlesUrl({ limit: 5, sort: "views" })),
      // Lista curta que o chrome (TopBar) lê via useArticles em rota não-home.
      fetchList(articlesUrl({ limit: ARTICLES_TICKER_LIMIT, offset: 0, sort: "recent" })),
      fetchJson(`${apiBase}/api/ads`),
    ]);
    if (list.state !== "ok" || top.state !== "ok" || recent.state !== "ok") {
      return { kind: "unavailable" };
    }

    /* As quatro classes de editoria (ver `decideCategory`). O que muda aqui é
       só a tag `robots`: editoria declarada e sem nenhum artigo continua sendo
       página navegável do portal — ela é servida — mas não entra no índice. */
    const decision = decideCategory({
      declared: declared !== null,
      total: list.data.total,
      state: "found",
    });
    if (decision.status === 404) return { kind: "notFound" };

    const data = {
      articles: recent.data.articles,
      site,
      ads: (dataOrNull(d) as { ads?: unknown[] } | null)?.ads ?? [],
      origin,
      category: {
        slug: route.slug,
        articles: list.data.articles,
        total: list.data.total,
        mostRead: top.data.articles.map((a) => ({
          id: String(a["id"]), slug: String(a["slug"] ?? a["id"]), title: String(a["title"] ?? ""),
        })),
      },
    };

    const meta = site ? metaFromSitePayload(site) : null;
    const html = compose(render(route.path, data), data, (h) =>
      meta
        ? applyHead(h, {
            lang: meta.lang,
            title: categoryTitle(route.label, meta.siteName),
            description: meta.seoDescription,
            siteName: meta.siteName,
            url: `${origin}${route.path}`,
            image: `${origin}${meta.ogImagePath}`,
            ...(decision.noindex ? { robots: "noindex, follow" } : {}),
            extraTags: [`<link rel="canonical" href="${esc(`${origin}${route.path}`)}">`],
            gtmId: meta.gtmId,
          })
        : langOnly(h, site));
    return { kind: "html", html };
  }

  function renderRoute(route: SsrRoute, pathOnly: string, origin: string): Promise<Outcome> {
    return route.kind === "home" ? renderHome(origin)
      : route.kind === "article" ? renderArticle(route.slug, origin)
      : renderCategory(pathOnly, origin);
  }

  /**
   * stale-while-revalidate DO SERVIDOR. O header de mesmo nome só vale para
   * cache compartilhado e navegador; na origem, alguém sempre pagava a
   * renderização quando o TTL vencia. Medido em produção (2026-07-29): 505 ms,
   * 2.792 ms e 311 ms de servidor em três misses da home — a cada 30 s um
   * visitante levava isso na cara. Agora ele recebe o HTML vencido na hora e a
   * renderização acontece atrás; `revalidating` impede que N requisições
   * simultâneas disparem N renders da mesma rota.
   */
  function revalidate(key: string, ttl: number, route: SsrRoute, pathOnly: string, origin: string): void {
    if (revalidating.has(key)) return;
    revalidating.add(key);
    renderRoute(route, pathOnly, origin)
      .then((out) => {
        /* A distinção decide se o visitante seguinte vê a página velha ou não:
           - notFound: a rota deixou de existir (artigo despublicado) e o 404 da
             `api` é autoritativo → invalida, para não servir conteúdo morto;
           - unavailable: a `api` está fora → MANTÉM o cache, que é justamente o
             stale que vai segurar o site em pé até o STALE_MAX_MS. Apagar aqui
             seria transformar uma instabilidade em página vazia. */
        if (out.kind === "html") cacheSetHtml(key, out.html, ttl);
        else if (out.kind === "notFound" || out.kind === "redirect") htmlCache.delete(key);
      })
      .catch(() => { /* mantém o que está em cache até o STALE_MAX_MS */ })
      .finally(() => { revalidating.delete(key); });
  }

  async function handleSsr(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): Promise<void> {
    const pathOnly = (req.url ?? "").split("?")[0] ?? "";
    const route = isReadRequest(req) ? classifySsrPath(pathOnly) : null;
    if (!route) {
      next();
      return;
    }
    /* Página institucional: existe sempre, segue para o shell (o SSR dela é
       outro assunto). Nunca passa pela pergunta "tem conteúdo?". */
    if (route.kind === "static") {
      next();
      return;
    }
    /* Path que não corresponde a rota nenhuma do App. Não consulta a `api` — não
       há o que consultar — e por isso também não ocupa entrada de cache. */
    if (route.kind === "unknown") {
      await serveNotFound(req, res, pathOnly);
      return;
    }
    const proto = (req.headers["x-forwarded-proto"] as string) ?? "https";
    const host = req.headers.host ?? "";
    // O host entra na chave: og:url e canonical são absolutos, e um blog
    // alcançável por dois nomes não pode receber o HTML do outro.
    const cacheKey = `${host}|${route.key}`;
    const ttl = route.kind === "home" ? HOME_TTL_MS : PAGE_TTL_MS;
    const cacheControl = route.kind === "home" ? HOME_CACHE_CONTROL : PAGE_CACHE_CONTROL;
    const origin = `${proto}://${host}`;

    /* Query da requisição: não entra na chave do cache (a mesma editoria com
       ?page=2 devolve o mesmo HTML e o mesmo canonical), mas é recolocada no
       `Location` do 301 — perder o utm_source de um link compartilhado seria
       apagar a origem da visita. */
    const search = (req.url ?? "").slice(pathOnly.length);

    const cached = cacheLookup(cacheKey);
    if (cached) {
      if (cached.entry.kind === "notFound") {
        await serveNotFound(req, res, pathOnly);
        return;
      }
      if (cached.entry.kind === "redirect") {
        sendRedirect(res, `${cached.entry.location}${search}`, pathOnly);
        return;
      }
      sendHtml(res, cached.entry.html, cacheControl);
      if (cached.stale) revalidate(cacheKey, ttl, route, pathOnly, origin);
      return;
    }
    try {
      const out = await renderRoute(route, pathOnly, origin);
      if (out.kind === "html") {
        cacheSetHtml(cacheKey, out.html, ttl);
        ssrStats.ok += 1;
        sendHtml(res, out.html, cacheControl);
        return;
      }
      if (out.kind === "redirect") {
        cacheSet(cacheKey, {
          kind: "redirect", location: out.location, at: Date.now(), ttl: NOT_FOUND_TTL_MS,
        });
        sendRedirect(res, `${out.location}${search}`, pathOnly);
        return;
      }
      if (out.kind === "unavailable") {
        await serveUnavailable(req, res, pathOnly);
        return;
      }
      /* A `api` afirmou que não existe. É o ÚNICO caminho que autoriza um 404
         aqui — e o único que grava "não existe" no cache. */
      cacheSet(cacheKey, { kind: "notFound", at: Date.now(), ttl: NOT_FOUND_TTL_MS });
      await serveNotFound(req, res, pathOnly);
    } catch (err) {
      ssrLog("renderError", 1, 1, {
        path: pathOnly,
        msg: err instanceof Error ? err.message : "erro desconhecido",
      });
      next(); // qualquer falha → cai para o index.html cru (SPA client-only)
    }
  }

  /** 301 permanente para a URL canônica. Sem corpo — o HEAD recebe o mesmo. */
  function sendRedirect(res: ServerResponse, location: string, from: string): void {
    ssrStats.redirect += 1;
    ssrLog("redirect", 50, ssrStats.redirect, { from, to: location });
    res.statusCode = 301;
    res.setHeader("Location", location);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Content-Length", "0");
    res.end();
  }

  /**
   * Rota que não existe: 404 com o shell do blog e `noindex`.
   *
   * O `noindex` num 404 é redundante — o status já basta — e é mantido de
   * propósito: se algum dia um middleware novo vazar essa resposta como 200, a
   * tag segura a página fora do índice. O que NÃO vai junto é o canonical:
   * canonical numa página inexistente manda o buscador tratá-la como versão de
   * outra URL, o oposto do que o 404 comunica.
   */
  async function serveNotFound(
    req: IncomingMessage,
    res: ServerResponse,
    pathOnly: string,
  ): Promise<void> {
    ssrStats.notFound += 1;
    ssrLog("notFound", 50, ssrStats.notFound, { path: pathOnly });
    const served = await serveShell(req, res, {
      status: 404,
      noindex: true,
      cacheControl: "public, max-age=60",
    });
    if (served) return;
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=60");
    res.end("404 Not Found");
  }

  /**
   * `api` indisponível e SEM HTML em cache para servir: 503 com `Retry-After`.
   *
   * NUNCA 404 (indisponibilidade não é ausência) e nunca 200 com página vazia —
   * um 200 sem conteúdo é o próprio defeito que este middleware existe para
   * corrigir, e ainda esconde o incidente de qualquer monitoramento. O 503 é
   * curto, tratado como transitório pelos buscadores e visível em qualquer
   * métrica de status.
   *
   * O caminho do stale é o do cache acima: uma entrada dentro da janela de 10
   * min é servida ANTES de qualquer nova busca à `api`, e o `revalidate` a
   * preserva enquanto a `api` não voltar.
   */
  async function serveUnavailable(
    req: IncomingMessage,
    res: ServerResponse,
    pathOnly: string,
  ): Promise<void> {
    ssrStats.unavailable503 += 1;
    ssrLog("apiUnavailable", 10, ssrStats.unavailable503, { path: pathOnly, upstream: "api" });
    const served = await serveShell(req, res, {
      status: 503,
      cacheControl: "no-store",
      headers: { "Retry-After": "60" },
    });
    if (served) return;
    // Sem nem o shell (build incompleto): texto puro, mas com o status certo.
    res.statusCode = 503;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Retry-After", "60");
    res.setHeader("Cache-Control", "no-store");
    res.end("503 Service Unavailable");
  }

  return {
    name: "ssr-routes",
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleSsr(req, res, next);
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
 * (API própria, cache de 5min). Registrar DEPOIS do ssrPlugin: home, artigo e
 * editoria saem renderizados de lá; aqui só passa o resto — e tudo o que o SSR
 * recusou (artigo inexistente, slug que não é editoria, API fora).
 * Falha → index.html cru.
 */
function spaHeadPlugin(apiBase: string): Plugin {
  /* Mesma fábrica que o ssrPlugin usa para o 503: um só lugar monta o shell com
     a identidade do blog. */
  const serveShell = makeShellRenderer(apiBase);

  async function handleSpaRoute(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): Promise<void> {
    const pathOnly = (req.url ?? "").split("?")[0] ?? "";
    // Só rotas de página: com extensão (assets, /opengraph.jpg, /sw.js…) ou
    // /api/* seguem o fluxo normal do servidor estático.
    if (!isReadRequest(req) || pathOnly.startsWith("/api/") || /\.[a-zA-Z0-9]+$/.test(pathOnly)) {
      next();
      return;
    }
    if (!(await serveShell(req, res))) next();
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

/** Link de uma seção do portal no llms.txt (menu item interno e visível). */
interface SeoLink {
  label: string;
  path: string;
}

/**
 * Rótulos fixos do llms.txt nos dois idiomas de site (CLAUDE.md §15). Objeto
 * local em vez do dicionário do app (`src/lib/i18n.ts`): aquele é de runtime do
 * browser e traz ~700 chaves para resolver 12.
 */
const SEO_TEXT_STRINGS = {
  "pt-BR": {
    sections: "Seções",
    resources: "Recursos",
    homeDesc: "últimas notícias publicadas",
    sectionDesc: (label: string) => `notícias de ${label}`,
    intro: (siteName: string, labels: string, origin: string) =>
      `${siteName} é um portal de notícias online. Editorias publicadas: ${labels}. ` +
      `Cada reportagem fica em ${origin}/artigo/{slug}; o mapa do site abaixo lista todas as URLs publicadas.`,
    introNoSections: (siteName: string, origin: string) =>
      `${siteName} é um portal de notícias online. Cada reportagem fica em ${origin}/artigo/{slug}; ` +
      `o mapa do site abaixo lista todas as URLs publicadas.`,
    sitemap: "Mapa do site",
    sitemapDesc: "índice completo de URLs publicadas",
    newsSitemap: "Mapa de notícias",
    newsSitemapDesc: "publicações das últimas 48 horas",
    contact: "Contato",
    contactDesc: "equipe editorial e canais de contato",
    privacy: "Política de Privacidade",
    terms: "Termos de Uso",
  },
  en: {
    sections: "Sections",
    resources: "Resources",
    homeDesc: "latest published news",
    sectionDesc: (label: string) => `${label} news`,
    intro: (siteName: string, labels: string, origin: string) =>
      `${siteName} is an online news portal. Sections published: ${labels}. ` +
      `Every article lives at ${origin}/artigo/{slug}; the sitemap below lists all published URLs.`,
    introNoSections: (siteName: string, origin: string) =>
      `${siteName} is an online news portal. Every article lives at ${origin}/artigo/{slug}; ` +
      `the sitemap below lists all published URLs.`,
    sitemap: "Sitemap",
    sitemapDesc: "complete index of published URLs",
    newsSitemap: "News sitemap",
    newsSitemapDesc: "articles from the last 48 hours",
    contact: "Contact",
    contactDesc: "editorial team and contact channels",
    privacy: "Privacy Policy",
    terms: "Terms of Use",
  },
} as const;

/** Extrai as seções internas e visíveis do menu (submenu de 1 nível achatado). */
function seoLinksFromSite(site: Record<string, unknown>): SeoLink[] {
  const out: SeoLink[] = [];
  const seen = new Set<string>();
  const push = (raw: unknown): void => {
    if (!raw || typeof raw !== "object") return;
    const m = raw as Record<string, unknown>;
    if (m["visible"] === false) return;
    const label = typeof m["label"] === "string" ? m["label"].trim() : "";
    const p = typeof m["path"] === "string" ? m["path"].trim() : "";
    // Só rota interna: link externo do menu não é seção deste portal.
    if (!label || !p.startsWith("/") || seen.has(p)) return;
    seen.add(p);
    out.push({ label: smartCase(label.replace(/[[\]]/g, "")), path: p });
  };
  const items = site["menuItems"];
  if (!Array.isArray(items)) return out;
  for (const item of items) {
    push(item);
    const children = (item as Record<string, unknown> | null)?.["children"];
    if (Array.isArray(children)) for (const c of children) push(c);
  }
  return out;
}

/** llms.txt no formato recomendado: título, resumo em `>`, links markdown absolutos. */
function buildLlmsTxt(meta: SiteMeta, links: SeoLink[], origin: string): string {
  const T = SEO_TEXT_STRINGS[meta.lang];
  const summary = meta.seoDescription.replace(/\s+/g, " ").trim();
  const sections = links.filter((l) => l.path !== "/");
  const intro = sections.length
    ? T.intro(meta.siteName, sections.map((l) => l.label).join(", "), origin)
    : T.introNoSections(meta.siteName, origin);
  const lines = [
    `# ${meta.siteName}`,
    "",
    `> ${summary}`,
    "",
    intro,
    "",
    `## ${T.sections}`,
    "",
  ];
  for (const l of links) {
    const desc = l.path === "/" ? T.homeDesc : T.sectionDesc(l.label);
    lines.push(`- [${l.label}](${origin}${l.path}): ${desc}`);
  }
  lines.push(
    "",
    `## ${T.resources}`,
    "",
    `- [${T.sitemap}](${origin}/api/sitemap.xml): ${T.sitemapDesc}`,
    `- [${T.newsSitemap}](${origin}/api/sitemap-news.xml): ${T.newsSitemapDesc}`,
    `- [${T.contact}](${origin}/contato): ${T.contactDesc}`,
    `- [${T.privacy}](${origin}/privacidade)`,
    `- [${T.terms}](${origin}/termos)`,
    "",
  );
  return lines.join("\n");
}

/** robots.txt do próprio host. Não depende da API — só do Host da requisição. */
function buildRobotsTxt(origin: string): string {
  return [
    "User-agent: *",
    "Allow: /",
    // O painel nunca deveria ser rastreado (não bloqueia navegação humana).
    "Disallow: /admin",
    "Disallow: /admin/",
    "",
    `Sitemap: ${origin}/api/sitemap.xml`,
    `Sitemap: ${origin}/api/sitemap-news.xml`,
    "",
  ].join("\n");
}

/**
 * seoTextPlugin — serve /llms.txt e /robots.txt com a identidade DESTE blog.
 * Os dois eram arquivos estáticos de `public/` buildados na imagem
 * compartilhada: os 8 blogs anunciavam "SBC Agora" e um Sitemap em host morto
 * (violação da invariante do CLAUDE.md §13 — nada por blog na imagem).
 * Agora saem das settings via /api/site, com cache de 1 h por (host, path).
 * O robots.txt não depende da API (só do Host), então continua correto mesmo
 * com a `api` do blog fora; o llms.txt cai para o estático neutro de `public/`.
 * Registrar antes do ssrPlugin: paths com extensão nunca chegam nele, mas a
 * ordem explícita evita surpresa.
 */
function seoTextPlugin(apiBase: string): Plugin {
  const TTL_MS = 60 * 60_000;
  const cache = new Map<string, { body: string; at: number }>();

  async function handleSeoText(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): Promise<void> {
    const pathOnly = (req.url ?? "").split("?")[0] ?? "";
    if (!isReadRequest(req)) {
      next();
      return;
    }
    /* `/sitemap.xml` na raiz é URL de convenção, e antes respondia 200 com o
       HTML da SPA — para um buscador, um sitemap ilegível. O documento real é
       servido pela `api`, que é quem tem o banco; um 301 permanente mantém UMA
       fonte da verdade em vez de publicar o mesmo XML em dois endereços. É
       também para onde o robots.txt já aponta. */
    if (pathOnly === "/sitemap.xml") {
      const proto = (req.headers["x-forwarded-proto"] as string) ?? "https";
      const host = req.headers.host ?? "";
      res.statusCode = 301;
      res.setHeader("Location", `${proto}://${host}/api/sitemap.xml`);
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("Content-Length", "0");
      res.end();
      return;
    }
    /* Não existe sitemap index nesta arquitetura, e inventar um seria anunciar
       um documento que ninguém gera. */
    if (pathOnly === "/sitemap_index.xml") {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=60");
      res.end("404 Not Found");
      return;
    }
    if (pathOnly !== "/llms.txt" && pathOnly !== "/robots.txt") {
      next();
      return;
    }
    try {
      const proto = (req.headers["x-forwarded-proto"] as string) ?? "https";
      const host = req.headers.host ?? "";
      const origin = `${proto}://${host}`;
      const key = `${host}|${pathOnly}`;
      const now = Date.now();
      const hit = cache.get(key);
      let body = hit && now - hit.at < TTL_MS ? hit.body : null;
      if (body === null) {
        if (pathOnly === "/robots.txt") {
          body = buildRobotsTxt(origin);
        } else {
          const r = await fetch(`${apiBase}/api/site`);
          const site = r.ok ? ((await r.json()) as Record<string, unknown>) : null;
          const meta = site ? metaFromSitePayload(site) : null;
          if (!site || !meta) {
            next(); // API fora / instalação incompleta → public/llms.txt neutro
            return;
          }
          body = buildLlmsTxt(meta, seoLinksFromSite(site), origin);
        }
        cache.set(key, { body, at: now });
      }
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      // Explícito para que o HEAD anuncie o tamanho do corpo REAL (o dinâmico),
      // e não fique sem Content-Length por não escrever corpo nenhum.
      res.setHeader("Content-Length", String(Buffer.byteLength(body)));
      res.end(body);
    } catch {
      next();
    }
  }

  return {
    name: "seo-text-files",
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleSeoText(req, res, next);
      });
    },
  };
}

/**
 * staticExistsPlugin — arquivo que não existe responde 404, e não o `index.html`.
 *
 * O `vite preview` roda com `appType` no default `spa`: o servidor estático tem
 * fallback single-page e devolvia o documento da SPA, com 200 `text/html`, para
 * QUALQUER path com extensão que não existisse. Medido em produção
 * (20/08/2026): `/sitemap.xml`, `/sitemap_index.xml`, `/manifest.json`,
 * `/wp-login.php`, `/nada.xml` e `/assets/inexistente.js` respondiam 200 com o
 * mesmo shell de 6.588 B. Para um rastreador é um site de páginas infinitas;
 * para uma aba antiga pedindo um chunk que o deploy substituiu, é um erro de
 * MIME em vez de um 404 que manda recarregar.
 *
 * Registrado como o ÚLTIMO dos plugins próprios: `/robots.txt`, `/llms.txt` e
 * `/sitemap.xml` já foram respondidos antes de chegar aqui.
 *
 * A alternativa de uma linha (`appType: "mpa"`) mudaria também o servidor de
 * desenvolvimento; este plugin é cirúrgico, testável e não toca o dev.
 */
function staticExistsPlugin(): Plugin {
  const distPublic = path.resolve(import.meta.dirname, "dist/public");
  /* Só o resultado POSITIVO é memorizado: o conteúdo de dist/public é imutável
     dentro do container, e cachear ausência daria a um scanner uma forma barata
     de crescer memória. */
  const known = new Set<string>();

  function handleStatic(req: IncomingMessage, res: ServerResponse, next: () => void): void {
    const pathOnly = (req.url ?? "").split("?")[0] ?? "";
    if (!isReadRequest(req) || !isStaticCandidate(pathOnly)) {
      next();
      return;
    }
    if (known.has(pathOnly)) {
      next();
      return;
    }
    const rel = safeRelative(pathOnly);
    if (rel !== null && fs.existsSync(path.join(distPublic, rel))) {
      if (known.size < 1000) known.add(pathOnly);
      next();
      return;
    }
    ssrStats.staticNotFound += 1;
    ssrLog("staticNotFound", 50, ssrStats.staticNotFound, { path: pathOnly });
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=60");
    res.end("404 Not Found");
  }

  return {
    name: "static-exists",
    // Só no preview (produção): no dev os módulos são servidos da árvore de
    // fontes e `dist/public` pode nem existir.
    configurePreviewServer(server) {
      server.middlewares.use(handleStatic);
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    staticCachePlugin(),
    socialOgPlugin(process.env.API_URL ?? "http://localhost:8080"),
    seoTextPlugin(process.env.API_URL ?? "http://localhost:8080"),
    ssrPlugin(process.env.API_URL ?? "http://localhost:8080"),
    spaHeadPlugin(process.env.API_URL ?? "http://localhost:8080"),
    // Último dos plugins próprios: só chega aqui o que ninguém respondeu.
    staticExistsPlugin(),
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
          /* Utilitários minúsculos usados por TODA a UI (cn = twMerge(clsx)).
             Sem nome próprio eles caem no agrupamento automático do Rollup e já
             foram parar DENTRO do vendor-charts — o entry público importava um
             símbolo (clsx) e arrastava 403 KB de Recharts/d3 para o preload de
             toda rota. A atribuição por manualChunks é autoritativa e impede
             essa fusão. */
          if (id.includes("node_modules/clsx") ||
              id.includes("node_modules/tailwind-merge") ||
              id.includes("node_modules/class-variance-authority")) {
            return "vendor-utils";
          }
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom") || id.includes("node_modules/scheduler")) {
            return "vendor-react";
          }
          if (id.includes("node_modules/@tanstack")) {
            return "vendor-query";
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
