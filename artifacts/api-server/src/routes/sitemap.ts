import { Router } from "express";
import { db, articlesTable } from "@workspace/db";
import { eq, and, ne, desc } from "drizzle-orm";
import { buildSitemapXml, SITEMAP_MAX_URLS } from "../lib/sitemapXml.js";
import { logger } from "../lib/logger.js";

const router = Router();

/**
 * GET /api/sitemap.xml — mapa do site com o acervo REAL deste blog.
 *
 * A lista de artigos vinha de `store.getArticles()`, um stub que devolve `[]`
 * desde junho de 2026: o endpoint respondia 200 com XML válido anunciando 14
 * URLs fixas — 12 delas editorias de outro portal — e ZERO artigos, num blog
 * com centenas de matérias publicadas.
 *
 * As editorias saem do PRÓPRIO acervo: uma editoria com artigo publicado é
 * página 200 indexável, e uma sem artigo nenhum responde `noindex` (declarada)
 * ou 404 (não declarada) — nos dois casos ela não pode ser anunciada aqui.
 * Assim o sitemap acompanha a taxonomia de cada blog sem uma linha de slug
 * embutida na imagem compartilhada.
 *
 * O molde da consulta é o do `sitemap-news.ts`, que já lia o banco.
 */
router.get("/sitemap.xml", async (req, res) => {
  const base = `${req.protocol}://${req.get("host")}`;

  const [articles, cats, legacyTags] = await Promise.all([
    db
      .select({
        id:           articlesTable.id,
        slug:         articlesTable.slug,
        publishedAt:  articlesTable.publishedAt,
        canonicalUrl: articlesTable.canonicalUrl,
      })
      .from(articlesTable)
      .where(eq(articlesTable.status, "published"))
      .orderBy(desc(articlesTable.publishedAt))
      // Teto do protocolo (50.000 URLs por arquivo). Corta pelas mais recentes.
      .limit(SITEMAP_MAX_URLS),
    db
      .select({ category: articlesTable.category })
      .from(articlesTable)
      .where(and(eq(articlesTable.status, "published"), ne(articlesTable.category, "")))
      .groupBy(articlesTable.category),
    /* Artigo legado sem `category` é listado pela editoria da TAG slugificada —
       mesma regra do filtro de /api/articles. Sem isto, uma editoria que só tem
       artigo antigo responderia 200 e ficaria fora do sitemap. */
    db
      .select({ tag: articlesTable.tag })
      .from(articlesTable)
      .where(and(eq(articlesTable.status, "published"), eq(articlesTable.category, "")))
      .groupBy(articlesTable.tag),
  ]);

  const categorySlugs = [
    ...cats.map((c) => (c.category ?? "").trim().toLowerCase()),
    ...legacyTags.map((t) => (t.tag ?? "").trim().toLowerCase().replace(/\s+/g, "-")),
  ];

  const { xml, articleCount, truncated } = buildSitemapXml({ base, articles, categorySlugs });

  if (truncated > 0) {
    logger.warn(
      { truncated, published: articleCount + truncated },
      "sitemap: acervo acima do limite de 50.000 URLs do protocolo — considerar sitemap index",
    );
  }

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  // Mesma janela do sitemap de notícias: o rastreador não paga a consulta a cada visita.
  res.setHeader("Cache-Control", "public, max-age=900");
  res.send(xml);
});

export default router;
