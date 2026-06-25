import { Router } from "express";
import { BRAND } from "../lib/brand.js";
import { db, articlesTable } from "@workspace/db";
import { eq, gte, and, desc } from "drizzle-orm";

const router = Router();

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** GET /api/sitemap-news.xml — Google News sitemap (last 48h published articles) */
router.get("/sitemap-news.xml", async (req, res) => {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const base   = `${req.protocol}://${req.get("host")}`;

  const articles = await db
    .select({
      slug:        articlesTable.slug,
      id:          articlesTable.id,
      title:       articlesTable.title,
      publishedAt: articlesTable.publishedAt,
    })
    .from(articlesTable)
    .where(and(eq(articlesTable.status, "published"), gte(articlesTable.publishedAt, cutoff)))
    .orderBy(desc(articlesTable.publishedAt))
    .limit(1000);

  const items = articles.map((a) => {
    const slug = a.slug || a.id;
    const pubDate = a.publishedAt ? new Date(a.publishedAt).toISOString() : new Date().toISOString();
    const title = escapeXml(a.title.replace(/<[^>]*>/g, ""));
    return `  <url>
    <loc>${escapeXml(`${base}/artigo/${slug}`)}</loc>
    <news:news>
      <news:publication>
        <news:name>${BRAND.name}</news:name>
        <news:language>pt</news:language>
      </news:publication>
      <news:publication_date>${pubDate}</news:publication_date>
      <news:title>${title}</news:title>
    </news:news>
  </url>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${items}
</urlset>`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=900");
  res.send(xml);
});

export default router;
