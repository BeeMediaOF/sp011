import { Router } from "express";
import { store } from "../lib/store.js";

const router = Router();

/** GET /api/articles — list published articles (public) */
router.get("/", (_req, res) => {
  const articles = store.getArticles()
    .filter((a) => a.status === "published")
    .map((a) => ({
      id: a.id,
      title: a.title,
      subtitle: a.subtitle,
      category: a.category,
      tag: a.tag,
      imageUrl: a.imageUrl,
      author: a.author,
      publishedAt: a.publishedAt,
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
