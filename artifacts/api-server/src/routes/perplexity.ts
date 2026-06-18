import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.js";
import { store, type PerplexityAutoMode } from "../lib/store.js";
import { articleService } from "../lib/articleService.js";
import { searchNews } from "../lib/perplexitySearch.js";
import { rewriteWithAI } from "../lib/rssProcessor.js";

const router = Router();
router.use(authMiddleware);

const TAG_MAP: Record<string, string> = {
  politica: "POLÍTICA", cidade: "CIDADE", seguranca: "SEGURANÇA",
  transporte: "TRANSPORTE", saude: "SAÚDE", educacao: "EDUCAÇÃO",
  cultura: "CULTURA", esportes: "ESPORTES", economia: "ECONOMIA",
  tecnologia: "TECNOLOGIA", brasil: "BRASIL", mundo: "MUNDO", geral: "GERAL",
};

// ─── Manual Search ────────────────────────────────────────────────────────────

/** POST /api/admin/perplexity/search  { query, maxResults? } */
router.post("/search", async (req, res) => {
  const { query, maxResults } = req.body as { query?: string; maxResults?: number };
  if (!query?.trim()) { res.status(400).json({ error: "query é obrigatório" }); return; }
  try {
    const result = await searchNews(query.trim(), maxResults ?? 5);
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/** POST /api/admin/perplexity/rewrite  { title, text, sourceName } */
router.post("/rewrite", async (req, res) => {
  const { title, text, sourceName } = req.body as {
    title?: string; text?: string; sourceName?: string;
  };
  if (!text?.trim()) { res.status(400).json({ error: "text é obrigatório" }); return; }
  try {
    const result = await rewriteWithAI(title ?? "", text, sourceName ?? "Perplexity", false);
    res.json({
      rewritten: result.content,  keywords: result.keywords,
      slug:      result.slug,     title:    result.title    ?? "",
      subtitle:  result.subtitle  ?? "",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.startsWith("QUOTA_COOLDOWN:") ? 429 : 500;
    res.status(status).json({ error: msg });
  }
});

/** POST /api/admin/perplexity/publish  { title, subtitle, content, … } */
router.post("/publish", async (req, res) => {
  const {
    title, subtitle, content, imageUrl, category, keywords, slug,
    sourceUrl, sourceName, status,
  } = req.body as {
    title?: string; subtitle?: string; content?: string; imageUrl?: string;
    category?: string; keywords?: string; slug?: string;
    sourceUrl?: string; sourceName?: string; status?: string;
  };

  if (!title?.trim()) { res.status(400).json({ error: "title é obrigatório" }); return; }
  if (await articleService.isDuplicateArticle(title, sourceUrl, imageUrl)) {
    res.status(409).json({ error: "Artigo duplicado — já existe um artigo com este título ou URL de origem" });
    return;
  }

  const cat = (category ?? "geral").toLowerCase();
  const article = await articleService.createArticle({
    title:         title.trim(),
    subtitle:      subtitle ?? "",
    content:       content  ?? "",
    category:      cat,
    tag:           TAG_MAP[cat] ?? "GERAL",
    imageUrl:      imageUrl ?? "",
    author:        "Redação",
    publishedAt:   new Date().toISOString(),
    status:        status === "published" ? "published" : "draft",
    origin:        "perplexity",
    rssSourceName: sourceName ?? "Perplexity",
    rssSourceUrl:  sourceUrl  ?? "",
    aiRewritten:   true,
    keywords:      keywords || undefined,
    slug:          slug     || undefined,
  });
  res.status(201).json({ article });
});

// ─── Topics CRUD ──────────────────────────────────────────────────────────────

/** GET /api/admin/perplexity/topics */
router.get("/topics", (_req, res) => {
  res.json({ topics: store.getPerplexityTopics() });
});

/** POST /api/admin/perplexity/topics */
router.post("/topics", (req, res) => {
  const { name, query, category, active, scheduleHours, maxResults, autoMode } = req.body as {
    name?: string; query?: string; category?: string; active?: boolean;
    scheduleHours?: number; maxResults?: number; autoMode?: string;
  };
  if (!name?.trim() || !query?.trim()) {
    res.status(400).json({ error: "name e query são obrigatórios" });
    return;
  }
  const topic = store.createPerplexityTopic({
    name:          name.trim(),
    query:         query.trim(),
    category:      (category ?? "geral").trim(),
    active:        active !== false,
    scheduleHours: Number(scheduleHours ?? 0),
    maxResults:    Math.min(Number(maxResults ?? 5), 10),
    autoMode:      (autoMode ?? "none") as PerplexityAutoMode,
  });
  res.status(201).json({ topic });
});

/** PATCH /api/admin/perplexity/topics/:id */
router.patch("/topics/:id", (req, res) => {
  const raw = req.body as Partial<{
    name: string; query: string; category: string; active: boolean;
    scheduleHours: number; maxResults: number; autoMode: PerplexityAutoMode;
  }>;
  if (raw.scheduleHours !== undefined) raw.scheduleHours = Number(raw.scheduleHours);
  if (raw.maxResults    !== undefined) raw.maxResults    = Math.min(Number(raw.maxResults), 10);
  const updated = store.updatePerplexityTopic(req.params.id ?? "", raw);
  if (!updated) { res.status(404).json({ error: "Topic not found" }); return; }
  res.json({ topic: updated });
});

/** DELETE /api/admin/perplexity/topics/:id */
router.delete("/topics/:id", (req, res) => {
  const deleted = store.deletePerplexityTopic(req.params.id ?? "");
  if (!deleted) { res.status(404).json({ error: "Topic not found" }); return; }
  res.json({ ok: true });
});

/** POST /api/admin/perplexity/topics/:id/run  — force-run one topic now */
router.post("/topics/:id/run", async (req, res) => {
  const topic = store.getPerplexityTopics().find((t) => t.id === req.params.id);
  if (!topic) { res.status(404).json({ error: "Topic not found" }); return; }

  store.updatePerplexityTopic(topic.id, { lastRunAt: new Date().toISOString() });

  try {
    const result = await searchNews(topic.query, topic.maxResults);
    const articles: unknown[] = [];

    for (const article of result.articles) {
      if (await articleService.isDuplicateArticle(article.title, article.sourceUrl)) {
        articles.push({ ...article, skipped: true, reason: "duplicate" });
        continue;
      }

      let title    = article.title;
      let subtitle = article.summary;
      let content  = article.fullText;
      let keywords = "";
      let slug     = "";

      if (topic.autoMode !== "none") {
        try {
          const rw = await rewriteWithAI(
            article.title, article.fullText || article.summary, article.sourceName, false
          );
          title    = rw.title    || title;
          subtitle = rw.subtitle || subtitle;
          content  = rw.content  || content;
          keywords = rw.keywords;
          slug     = rw.slug;
        } catch { /* keep original if rewrite fails */ }
      }

      const cat = (topic.category ?? "geral").toLowerCase();
      const saved = await articleService.createArticle({
        title,  subtitle, content,
        category:      cat,
        tag:           TAG_MAP[cat] ?? "GERAL",
        imageUrl:      article.imageUrl,
        author:        "Redação",
        publishedAt:   new Date().toISOString(),
        status:        topic.autoMode === "published" ? "published" : "draft",
        origin:        "perplexity",
        rssSourceName: article.sourceName,
        rssSourceUrl:  article.sourceUrl,
        aiRewritten:   topic.autoMode !== "none",
        keywords:      keywords || undefined,
        slug:          slug     || undefined,
      });
      articles.push({ ...article, saved: true, articleId: saved.id });
    }

    res.json({ processed: articles.length, articles });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.startsWith("QUOTA_COOLDOWN:") ? 429 : 500;
    res.status(status).json({ error: msg });
  }
});

export default router;
