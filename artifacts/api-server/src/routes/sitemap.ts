import { Router } from "express";
import { store } from "../lib/store.js";

const router = Router();

const STATIC_PAGES: { path: string; changefreq: string; priority: string }[] = [
  { path: "/",           changefreq: "hourly",  priority: "1.0" },
  { path: "/politica",   changefreq: "daily",   priority: "0.9" },
  { path: "/cidade",     changefreq: "daily",   priority: "0.9" },
  { path: "/seguranca",  changefreq: "daily",   priority: "0.9" },
  { path: "/transporte", changefreq: "daily",   priority: "0.9" },
  { path: "/saude",      changefreq: "daily",   priority: "0.9" },
  { path: "/educacao",   changefreq: "daily",   priority: "0.9" },
  { path: "/cultura",    changefreq: "daily",   priority: "0.9" },
  { path: "/esportes",   changefreq: "daily",   priority: "0.9" },
  { path: "/brasil",     changefreq: "daily",   priority: "0.9" },
  { path: "/mundo",      changefreq: "daily",   priority: "0.9" },
  { path: "/colunas",    changefreq: "daily",   priority: "0.8" },
  { path: "/arquivo",    changefreq: "weekly",  priority: "0.6" },
  { path: "/contato",    changefreq: "monthly", priority: "0.5" },
];

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** GET /api/sitemap.xml — full site sitemap including all published articles */
router.get("/sitemap.xml", (req, res) => {
  const base = `${req.protocol}://${req.get("host")}`;

  const articles = store
    .getArticles()
    .filter((a) => a.status === "published");

  const staticUrls = STATIC_PAGES.map(
    (p) =>
      `  <url>\n    <loc>${escapeXml(base + p.path)}</loc>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`,
  ).join("\n");

  const articleUrls = articles
    .map((a) => {
      const lastmod = a.updatedAt
        ? new Date(a.updatedAt).toISOString().split("T")[0]
        : "";
      const lastmodTag = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : "";
      return `  <url>\n    <loc>${escapeXml(base + "/artigo/" + (a.slug || a.id))}</loc>${lastmodTag}\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticUrls}
${articleUrls}
</urlset>`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.send(xml);
});

export default router;
