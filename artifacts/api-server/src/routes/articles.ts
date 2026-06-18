import { Router } from "express";
import { store } from "../lib/store.js";

const router = Router();

/** GET /api/categories — distinct categories from all articles (public) */
router.get("/categories", (_req, res) => {
  const all = store.getArticles();
  const map = new Map<string, { label: string; tag: string; count: number }>();

  for (const a of all) {
    const key = (a.category ?? "geral").toLowerCase().trim();
    if (!key) continue;
    const existing = map.get(key);
    const isPublished = a.status === "published";
    if (existing) {
      if (isPublished) existing.count++;
    } else {
      map.set(key, {
        label: a.tag
          ? a.tag.charAt(0).toUpperCase() + a.tag.slice(1).toLowerCase()
          : key.charAt(0).toUpperCase() + key.slice(1),
        tag: a.tag || key.toUpperCase(),
        count: isPublished ? 1 : 0,
      });
    }
  }

  const categories = Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
    .map(([value, { label, tag, count }]) => ({ value, label, tag, count }));

  res.json({ categories });
});

/** GET /api/articles — list published articles (public) */
router.get("/", (_req, res) => {
  const articles = store.getArticles()
    .filter((a) => a.status === "published")
    .map((a) => ({
      id: a.id,
      slug: a.slug || a.id,
      title: a.title,
      subtitle: a.subtitle,
      category: a.category,
      tag: a.tag,
      imageUrl: a.imageUrl,
      author: a.author,
      publishedAt: a.publishedAt,
      keywords: a.keywords,
    }));
  res.json({ articles });
});

/** GET /api/articles/:id — single article (public) */
router.get("/:id", (req, res) => {
  const article = store.getArticle(req.params.id ?? "");
  if (!article || article.status !== "published") {
    res.status(404).json({ error: "Article not found" }); return;
  }
  res.json({ article });
});

export default router;
