import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.js";
import { store, type RssAutoMode } from "../lib/store.js";
import {
  fetchSourceArticles, rewriteWithAI, scrapeArticle,
  processDueSource,
} from "../lib/rssProcessor.js";

const router = Router();
router.use(authMiddleware);

// ─── Sources CRUD ─────────────────────────────────────────────────────────────

/** GET /api/admin/rss/sources */
router.get("/sources", (_req, res) => {
  res.json({ sources: store.getRssSources() });
});

/** POST /api/admin/rss/sources */
router.post("/sources", (req, res) => {
  const {
    name, url, category, active,
    scheduleHours, giveCredit, autoMode,
  } = req.body as {
    name?: string; url?: string; category?: string; active?: boolean;
    scheduleHours?: number; giveCredit?: boolean; autoMode?: string;
  };
  if (!name || !url) { res.status(400).json({ error: "name e url são obrigatórios" }); return; }
  const source = store.createRssSource({
    name:         name.trim(),
    url:          url.trim(),
    category:     (category ?? "geral").trim(),
    active:       active !== false,
    scheduleHours: Number(scheduleHours ?? 0),
    giveCredit:   giveCredit !== false,
    autoMode:     (autoMode ?? "none") as RssAutoMode,
  });
  res.status(201).json({ source });
});

/** PATCH /api/admin/rss/sources/:id */
router.patch("/sources/:id", (req, res) => {
  const body = req.body as Partial<{
    name: string; url: string; category: string; active: boolean;
    scheduleHours: number; giveCredit: boolean; autoMode: RssAutoMode;
  }>;
  if (body.scheduleHours !== undefined) body.scheduleHours = Number(body.scheduleHours);
  const updated = store.updateRssSource(req.params.id ?? "", body);
  if (!updated) { res.status(404).json({ error: "Source not found" }); return; }
  res.json({ source: updated });
});

/** DELETE /api/admin/rss/sources/:id */
router.delete("/sources/:id", (req, res) => {
  const deleted = store.deleteRssSource(req.params.id ?? "");
  if (!deleted) { res.status(404).json({ error: "Source not found" }); return; }
  res.json({ ok: true });
});

// ─── Fetch ────────────────────────────────────────────────────────────────────

/** POST /api/admin/rss/fetch  { sourceId? } */
router.post("/fetch", async (req, res) => {
  const { sourceId } = req.body as { sourceId?: string };
  const sources = store.getRssSources().filter(
    (s) => s.active && (!sourceId || s.id === sourceId)
  );
  if (!sources.length) { res.status(400).json({ error: "Nenhuma fonte ativa encontrada" }); return; }

  const allArticles: unknown[] = [];
  await Promise.allSettled(sources.map(async (src) => {
    try {
      const articles = await fetchSourceArticles(src);
      store.updateRssSource(src.id, { lastFetchedAt: new Date().toISOString() });
      allArticles.push(...articles);
    } catch (err) {
      allArticles.push({
        sourceId: src.id, sourceName: src.name, category: src.category,
        title: `Erro: ${String(err)}`, link: "", pubDate: "",
        imageUrl: "", excerpt: "", fullText: "",
      });
    }
  }));

  res.json({ articles: allArticles });
});

// ─── Rewrite ──────────────────────────────────────────────────────────────────

/** POST /api/admin/rss/rewrite  { title, text, sourceName, giveCredit? } */
router.post("/rewrite", async (req, res) => {
  const { title, text, sourceName, giveCredit } = req.body as {
    title?: string; text?: string; sourceName?: string; giveCredit?: boolean;
  };
  if (!text) { res.status(400).json({ error: "text é obrigatório" }); return; }
  try {
    const rewritten = await rewriteWithAI(
      title ?? "", text, sourceName ?? "fonte", giveCredit !== false
    );
    res.json({ rewritten });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Scrape URL (preview image) ───────────────────────────────────────────────

/** POST /api/admin/rss/scrape  { url } */
router.post("/scrape", async (req, res) => {
  const { url } = req.body as { url?: string };
  if (!url) { res.status(400).json({ error: "url é obrigatório" }); return; }
  const result = await scrapeArticle(url);
  res.json(result);
});

// ─── Force-run scheduler for one source ──────────────────────────────────────

/** POST /api/admin/rss/run  { sourceId } */
router.post("/run", async (req, res) => {
  const { sourceId } = req.body as { sourceId?: string };
  const src = store.getRssSources().find((s) => s.id === sourceId);
  if (!src) { res.status(404).json({ error: "Source not found" }); return; }
  try {
    const count = await processDueSource(src);
    res.json({ processed: count });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Import article to store ──────────────────────────────────────────────────

/** POST /api/admin/rss/import */
router.post("/import", (req, res) => {
  const { title, subtitle, content, category, tag, imageUrl, author, status } = req.body as {
    title?: string; subtitle?: string; content?: string; category?: string;
    tag?: string; imageUrl?: string; author?: string; status?: string;
  };
  if (!title) { res.status(400).json({ error: "title é obrigatório" }); return; }
  const article = store.createArticle({
    title:       title ?? "",
    subtitle:    subtitle ?? "",
    content:     content ?? "",
    category:    category ?? "geral",
    tag:         tag ?? "GERAL",
    imageUrl:    imageUrl ?? "",
    author:      author ?? "Redação",
    publishedAt: new Date().toISOString(),
    status:      (status === "published" ? "published" : "draft"),
  });
  res.status(201).json({ article });
});

// ─── AI settings ──────────────────────────────────────────────────────────────

/** GET /api/admin/rss/ai-settings */
router.get("/ai-settings", (_req, res) => {
  const s = store.getSettings();
  res.json({
    provider: s.rssAiProvider ?? "gemini_free",
    model:    s.rssAiModel ?? "",
    hasKey:   !!s.rssAiApiKey,
  });
});

/** PUT /api/admin/rss/ai-settings */
router.put("/ai-settings", (req, res) => {
  const { provider, model, apiKey } = req.body as {
    provider?: string; model?: string; apiKey?: string;
  };
  const update: Record<string, string | undefined> = {};
  if (provider) update["rssAiProvider"] = provider;
  if (model !== undefined) update["rssAiModel"] = model;
  if (apiKey !== undefined) update["rssAiApiKey"] = apiKey || undefined;
  store.updateSettings(update as Parameters<typeof store.updateSettings>[0]);
  res.json({ ok: true });
});

export default router;
