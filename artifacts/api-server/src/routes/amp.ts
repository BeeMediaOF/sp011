/**
 * AMP (Accelerated Mobile Pages) route.
 * GET /amp/artigos/:slug  →  valid AMP HTML for the article.
 * The canonical page adds <link rel="amphtml"> pointing here.
 */
import { Router } from "express";
import { BRAND } from "../lib/brand.js";
import { eq, or, sql } from "drizzle-orm";
import { db, articlesTable } from "@workspace/db";
import { logger } from "../lib/logger.js";

const router = Router();

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Strip HTML tags for plain text */
function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").trim();
}

/**
 * Convert article content to AMP-safe HTML (replace <img> with <amp-img>).
 * Também remove vetores de script que sobreviveriam ao filtro antigo:
 * event handlers inline (onload/onerror/...), URLs javascript:, e elementos
 * proibidos no AMP (object/embed/form/svg/style/link/meta).
 */
function toAmpHtml(content: string): string {
  const amp = content
    .replace(
      /<img([^>]*?)src="([^"]*)"([^>]*?)>/gi,
      '<amp-img$1src="$2"$3 width="800" height="450" layout="responsive"></amp-img>'
    )
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<script[^>]*>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<(object|embed|form|svg|math|style|link|meta|base)[\s\S]*?(<\/\1>|>)/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/(href|src)\s*=\s*(["']?)\s*javascript:[^"'\s>]*\2/gi, '$1="#"')
    .replace(/style="[^"]*"/gi, "");
  return amp;
}

const AMP_BOILERPLATE = `body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-ms-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}@-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-moz-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-ms-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}`;
const AMP_BOILERPLATE_NOSCRIPT = `body{-webkit-animation:none;-moz-animation:none;-ms-animation:none;animation:none}`;

router.get("/amp/artigos/:slug", async (req, res) => {
  const slug = req.params.slug ?? "";
  try {
    const [article] = await db
      .select()
      .from(articlesTable)
      .where(
        or(
          eq(articlesTable.slug, slug),
          eq(articlesTable.id, slug)
        )
      )
      .limit(1);

    if (!article || article.status !== "published") {
      res.status(404).send("<!DOCTYPE html><html><body>Artigo não encontrado.</body></html>");
      return;
    }

    const base = `${req.protocol}://${req.get("host")}`;
    const canonicalSlug = article.slug || article.id;
    const canonicalUrl  = `${base}/artigo/${canonicalSlug}`;
    const ampUrl        = `${base}/amp/artigos/${canonicalSlug}`;
    const title         = escHtml(stripHtml(article.title));
    const description   = escHtml(stripHtml(article.subtitle || article.title).slice(0, 160));
    const publishedIso  = article.publishedAt ? new Date(article.publishedAt).toISOString() : "";
    const modifiedIso   = article.updatedAt   ? new Date(article.updatedAt).toISOString()   : publishedIso;
    const authorName    = escHtml(article.author || "Redação");
    const imageUrl      = article.imageUrl || "";

    const bodyHtml = toAmpHtml(article.content || "");

    const dateStr = article.publishedAt
      ? new Date(article.publishedAt).toLocaleDateString("pt-BR", {
          day: "numeric", month: "long", year: "numeric",
        })
      : "";

    const jsonLd = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      headline: article.title.replace(/<[^>]*>/g, ""),
      description: article.subtitle || "",
      image: imageUrl ? [imageUrl] : [],
      datePublished: publishedIso,
      dateModified: modifiedIso,
      author: { "@type": "Person", name: article.author || "Redação" },
      publisher: {
        "@type": "Organization",
        name: BRAND.name,
        logo: { "@type": "ImageObject", url: `${base}/favicon.jpg` },
      },
    });

    const html = `<!DOCTYPE html>
<html ⚡ lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,minimum-scale=1,initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="${escHtml(canonicalUrl)}">
  <link rel="amphtml" href="${escHtml(ampUrl)}">
  ${imageUrl ? `<meta property="og:image" content="${escHtml(imageUrl)}">` : ""}
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:type" content="article">
  ${publishedIso ? `<meta property="article:published_time" content="${publishedIso}">` : ""}
  <style amp-boilerplate>${AMP_BOILERPLATE}</style>
  <noscript><style amp-boilerplate>${AMP_BOILERPLATE_NOSCRIPT}</style></noscript>
  <script async src="https://cdn.ampproject.org/v0.js"></script>
  <style amp-custom>
    body { font-family: Georgia, serif; color: #1a1a1a; margin: 0; padding: 0; background: #fff; }
    header { background: #0b3d91; color: white; padding: 12px 16px; }
    header a { color: white; text-decoration: none; font-family: sans-serif; font-size: 18px; font-weight: bold; }
    main { max-width: 720px; margin: 0 auto; padding: 16px; }
    .chapeu { display: inline-block; background: #c8102e; color: white; font-size: 11px; font-weight: bold; padding: 3px 10px; border-radius: 2px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; font-family: sans-serif; }
    h1 { font-size: 28px; line-height: 1.3; color: #1a2448; margin: 0 0 12px; }
    .subtitle { font-size: 17px; color: #555; border-left: 4px solid #c8102e; padding-left: 14px; margin-bottom: 16px; font-style: italic; }
    .meta { font-family: sans-serif; font-size: 12px; color: #888; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid #eee; }
    amp-img { width: 100%; margin-bottom: 20px; }
    p { font-size: 17px; line-height: 1.75; margin: 0 0 18px; color: #2a2a2a; }
    h2 { font-size: 20px; color: #1a2448; border-left: 4px solid #c8102e; padding-left: 10px; margin: 28px 0 12px; }
    .source { font-size: 12px; color: #aaa; margin-top: 24px; border-top: 1px solid #eee; padding-top: 12px; font-family: sans-serif; }
    .back { display: block; font-family: sans-serif; font-size: 13px; color: #0b3d91; margin-top: 24px; text-decoration: none; }
  </style>
  <script type="application/ld+json">${jsonLd}</script>
</head>
<body>
  <header>
    <a href="${escHtml(base)}">${BRAND.name}</a>
  </header>
  <main>
    <span class="chapeu">${escHtml(article.tag || article.category || "NOTÍCIA")}</span>
    <h1>${title}</h1>
    ${article.subtitle ? `<p class="subtitle">${escHtml(stripHtml(article.subtitle))}</p>` : ""}
    <div class="meta">${authorName}${dateStr ? ` · ${dateStr}` : ""}</div>
    ${imageUrl ? `<amp-img src="${escHtml(imageUrl)}" alt="${title}" width="800" height="450" layout="responsive"></amp-img>` : ""}
    <div>${bodyHtml}</div>
    ${article.rssSourceName ? `<p class="source">Fonte: ${escHtml(article.rssSourceName)}</p>` : ""}
    <a class="back" href="${escHtml(canonicalUrl)}">← Ver versão completa</a>
  </main>
</body>
</html>`;

    // AMP requires no CSP restriction on script-src for the AMP runtime
    res.removeHeader("Content-Security-Policy");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err) {
    logger.warn({ err, slug }, "AMP route error");
    res.status(500).send("Erro interno.");
  }
});

export default router;
