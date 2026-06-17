import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.js";
import { store } from "../lib/store.js";
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

/** POST /api/admin/perplexity/search  { query, maxResults? } */
router.post("/search", async (req, res) => {
  const { query, maxResults } = req.body as { query?: string; maxResults?: number };
  if (!query?.trim()) {
    res.status(400).json({ error: "query é obrigatório" });
    return;
  }
  try {
    const result = await searchNews(query.trim(), maxResults ?? 5);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/** POST /api/admin/perplexity/rewrite  { title, text, sourceName } */
router.post("/rewrite", async (req, res) => {
  const { title, text, sourceName } = req.body as {
    title?: string; text?: string; sourceName?: string;
  };
  if (!text?.trim()) {
    res.status(400).json({ error: "text é obrigatório" });
    return;
  }
  try {
    const result = await rewriteWithAI(
      title ?? "", text, sourceName ?? "Perplexity", false
    );
    res.json({
      rewritten: result.content,
      keywords:  result.keywords,
      slug:      result.slug,
      title:     result.title    ?? "",
      subtitle:  result.subtitle ?? "",
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/** POST /api/admin/perplexity/publish  { article, category, status? } */
router.post("/publish", (req, res) => {
  const {
    title, subtitle, content, imageUrl, category, keywords, slug,
    sourceUrl, sourceName, status,
  } = req.body as {
    title?: string; subtitle?: string; content?: string; imageUrl?: string;
    category?: string; keywords?: string; slug?: string;
    sourceUrl?: string; sourceName?: string; status?: string;
  };

  if (!title?.trim()) {
    res.status(400).json({ error: "title é obrigatório" });
    return;
  }

  if (store.isDuplicateArticle(title, sourceUrl, imageUrl)) {
    res.status(409).json({ error: "Artigo duplicado — já existe um artigo com este título ou URL de origem" });
    return;
  }

  const cat = (category ?? "geral").toLowerCase();
  const article = store.createArticle({
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

export default router;
