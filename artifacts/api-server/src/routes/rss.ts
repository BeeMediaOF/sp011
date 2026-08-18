import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.js";
import { requirePermission, requirePermissionForWrites } from "../middlewares/permissions.js";
import { store, type RssAutoMode } from "../lib/store.js";
import { articleService } from "../lib/articleService.js";
import {
  fetchSourceArticles, rewriteWithAI, scrapeArticle,
  processDueSource, DEFAULT_PROMPT_TEMPLATE, resolvePrompt,
  getRssLog,
} from "../lib/rssProcessor.js";
import { DEFAULT_MAX_PENDING_REWRITES, getCollectionConfig, getCollectionStatus } from "../lib/scheduler.js";

const router = Router();
router.use(authMiddleware);
// Leituras exigem rss.view; qualquer alteração (fontes, prompts, chaves de IA)
// exige rss.manage. Admins passam direto em ambos.
router.use(requirePermission("rss.view"));
router.use(requirePermissionForWrites("rss.manage"));

// ─── Sources CRUD ─────────────────────────────────────────────────────────────

/** GET /api/admin/rss/sources */
router.get("/sources", (_req, res) => {
  res.json({ sources: store.getRssSources() });
});

/** POST /api/admin/rss/sources */
router.post("/sources", (req, res) => {
  const {
    name, url, category, active,
    scheduleHours, fetchLimit, giveCredit, autoMode,
  } = req.body as {
    name?: string; url?: string; category?: string; active?: boolean;
    scheduleHours?: number; fetchLimit?: number; giveCredit?: boolean; autoMode?: string;
  };
  if (!name || !url) { res.status(400).json({ error: "name e url são obrigatórios" }); return; }
  const source = store.createRssSource({
    name:         name.trim(),
    url:          url.trim(),
    category:     (category ?? "geral").trim(),
    active:       active !== false,
    scheduleHours: Number(scheduleHours ?? 0),
    fetchLimit:   Number(fetchLimit ?? 3),
    giveCredit:   giveCredit !== false,
    autoMode:     (autoMode ?? "none") as RssAutoMode,
  });
  res.status(201).json({ source });
});

/** PATCH /api/admin/rss/sources/:id */
router.patch("/sources/:id", (req, res) => {
  const raw = req.body as Partial<{
    name: string; url: string; category: string; active: boolean;
    scheduleHours: number; fetchLimit: number; giveCredit: boolean; autoMode: RssAutoMode;
    customPrompt: string | null;
  }>;
  if (raw.scheduleHours !== undefined) raw.scheduleHours = Number(raw.scheduleHours);
  if (raw.fetchLimit    !== undefined) raw.fetchLimit    = Number(raw.fetchLimit);
  // Normalize: null or empty string → undefined (removes custom prompt)
  const body: Parameters<typeof store.updateRssSource>[1] = {
    ...raw,
    customPrompt: (raw.customPrompt === null || raw.customPrompt === "") ? undefined : raw.customPrompt,
  };
  const updated = store.updateRssSource(req.params.id ?? "", body);
  if (!updated) { res.status(404).json({ error: "Source not found" }); return; }
  res.json({ source: updated });
});

/** GET /api/admin/rss/default-prompt — return the default journalist prompt template */
router.get("/default-prompt", (_req, res) => {
  res.json({ prompt: DEFAULT_PROMPT_TEMPLATE });
});

/** GET /api/admin/rss/prompts — return global + category prompts */
router.get("/prompts", (_req, res) => {
  res.json(store.getRssPrompts());
});

/** PUT /api/admin/rss/prompts — save global + category prompts */
router.put("/prompts", (req, res) => {
  const { global: globalPrompt, categories } = req.body as {
    global?: string; categories?: Record<string, string>;
  };
  const updated = store.updateRssPrompts({
    global:     (globalPrompt === "" ? undefined : globalPrompt),
    categories: categories ?? {},
  });
  res.json(updated);
});

/** GET /api/admin/rss/logs — in-memory event log */
router.get("/logs", (_req, res) => {
  res.json({ logs: getRssLog() });
});

/** DELETE /api/admin/rss/sources/:id */
router.delete("/sources/:id", (req, res) => {
  const deleted = store.deleteRssSource(req.params.id ?? "");
  if (!deleted) { res.status(404).json({ error: "Source not found" }); return; }
  res.json({ ok: true });
});

/**
 * POST /api/admin/rss/sources/bulk-delete  { ids: string[] }
 *
 * Exclusao em lote da selecao multipla. Cai no mesmo `requirePermissionForWrites
 * ("rss.manage")` do router, entao nao precisa de guarda propria. Devolve os ids
 * removidos de fato -- id ja apagado por outra aba nao e erro.
 */
router.post("/sources/bulk-delete", (req, res) => {
  const brutos = (req.body as { ids?: unknown }).ids;
  if (!Array.isArray(brutos)) { res.status(400).json({ error: "ids deve ser um array" }); return; }
  const ids = [...new Set(brutos.map((v) => String(v ?? "")).filter(Boolean))];
  const removidos = store.deleteRssSources(ids);
  res.json({ deleted: removidos.length, ids: removidos });
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
      // Mark duplicates so the UI can flag them without blocking preview
      const tagged = await Promise.all(articles.map(async (a) => ({
        ...a,
        isDuplicate: await articleService.isDuplicateArticle(a.title, a.link, a.imageUrl),
      })));
      allArticles.push(...tagged);
    } catch (err) {
      allArticles.push({
        sourceId: src.id, sourceName: src.name, category: src.category,
        title: `Erro: ${err instanceof Error ? err.message : String(err)}`, link: "", pubDate: "",
        imageUrl: "", excerpt: "", fullText: "", isDuplicate: false,
      });
    }
  }));

  res.json({ articles: allArticles });
});

// ─── Rewrite ──────────────────────────────────────────────────────────────────

/** POST /api/admin/rss/rewrite  { title, text, sourceName, giveCredit?, customPrompt? } */
router.post("/rewrite", async (req, res) => {
  const { title, text, sourceName, giveCredit, customPrompt } = req.body as {
    title?: string; text?: string; sourceName?: string; giveCredit?: boolean; customPrompt?: string;
  };
  if (!text) { res.status(400).json({ error: "text é obrigatório" }); return; }
  try {
    const result = await rewriteWithAI(
      title ?? "", text, sourceName ?? "fonte", giveCredit !== false, customPrompt
    );
    res.json({
      rewritten: result.content,
      keywords:  result.keywords,
      slug:      result.slug,
      title:     result.title    ?? "",
      subtitle:  result.subtitle ?? "",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.startsWith("QUOTA_COOLDOWN:") ? 429 : 500;
    res.status(status).json({ error: msg });
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
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.startsWith("QUOTA_COOLDOWN:") ? 429 : 500;
    res.status(status).json({ error: msg });
  }
});

// ─── Import article to store ──────────────────────────────────────────────────

/** POST /api/admin/rss/import */
router.post("/import", async (req, res) => {
  const { title, subtitle, content, category, tag, imageUrl, author, status,
    rssSourceId, rssSourceName, rssSourceUrl, aiRewritten, keywords, slug } = req.body as {
    title?: string; subtitle?: string; content?: string; category?: string;
    tag?: string; imageUrl?: string; author?: string; status?: string;
    rssSourceId?: string; rssSourceName?: string; rssSourceUrl?: string; aiRewritten?: boolean;
    keywords?: string; slug?: string;
  };
  if (!title) { res.status(400).json({ error: "title é obrigatório" }); return; }

  // Block duplicate imports
  if (await articleService.isDuplicateArticle(title, rssSourceUrl)) {
    res.status(409).json({ error: "Artigo duplicado — já existe um artigo com este título ou URL de origem" });
    return;
  }

  const article = await articleService.createArticle({
    title:         title ?? "",
    subtitle:      subtitle ?? "",
    content:       content ?? "",
    category:      category ?? "geral",
    tag:           tag ?? "GERAL",
    imageUrl:      imageUrl ?? "",
    author:        author ?? "Redação",
    publishedAt:   new Date().toISOString(),
    status:        (status === "published" ? "published" : "draft"),
    origin:        "rss",
    rssSourceId:   rssSourceId ?? "",
    rssSourceName: rssSourceName ?? "",
    rssSourceUrl:  rssSourceUrl ?? "",
    aiRewritten:   aiRewritten === true,
    keywords:      keywords || undefined,
    slug:          slug || undefined,
  });
  res.status(201).json({ article });
});

// ─── Collection settings (Configurações da Coleta) ────────────────────────────

/** GET /api/admin/rss/collection-settings — configuração global da coleta + status ao vivo */
router.get("/collection-settings", async (_req, res) => {
  const s = store.getSettings();
  const cfg = getCollectionConfig();
  let collectedToday = 0;
  try { collectedToday = await articleService.countAutomatedToday(); } catch { /* mostra 0 */ }
  res.json({
    enabled:            cfg.enabled,
    intervalMinutes:    cfg.intervalMinutes,
    defaultFetchLimit:  s.collectionDefaultFetchLimit ?? 3,
    maxPerCycle:        cfg.maxPerCycle,
    maxPerDay:          cfg.maxPerDay,
    startHour:          cfg.startHour,
    endHour:            cfg.endHour,
    days:               cfg.days,
    maxPendingRewrites: s.rssMaxPendingRewrites ?? DEFAULT_MAX_PENDING_REWRITES,
    status: { ...getCollectionStatus(), collectedToday },
  });
});

/** PUT /api/admin/rss/collection-settings */
router.put("/collection-settings", (req, res) => {
  const b = req.body as {
    enabled?: boolean; intervalMinutes?: number; defaultFetchLimit?: number;
    maxPerCycle?: number; maxPerDay?: number;
    startHour?: number; endHour?: number; days?: number[];
    maxPendingRewrites?: number;
  };
  const clamp = (v: unknown, min: number, max: number): number | undefined => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.max(min, Math.min(n, max)) : undefined;
  };
  const update: Record<string, unknown> = {};
  if (b.enabled            !== undefined) update["collectionEnabled"]           = !!b.enabled;
  if (b.intervalMinutes    !== undefined) update["collectionIntervalMinutes"]   = clamp(b.intervalMinutes, 5, 24 * 60);
  if (b.defaultFetchLimit  !== undefined) update["collectionDefaultFetchLimit"] = clamp(b.defaultFetchLimit, 1, 20);
  if (b.maxPerCycle        !== undefined) update["collectionMaxPerCycle"]       = clamp(b.maxPerCycle, 0, 500);
  if (b.maxPerDay          !== undefined) update["collectionMaxPerDay"]         = clamp(b.maxPerDay, 0, 5000);
  if (b.startHour          !== undefined) update["collectionStartHour"]         = clamp(b.startHour, 0, 23);
  if (b.endHour            !== undefined) update["collectionEndHour"]           = clamp(b.endHour, 0, 23);
  if (b.maxPendingRewrites !== undefined) update["rssMaxPendingRewrites"]       = clamp(b.maxPendingRewrites, 0, 1000);
  if (Array.isArray(b.days)) {
    const days = [...new Set(b.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))];
    update["collectionDays"] = days.length > 0 ? days : undefined; // vazio = todos os dias
  }
  store.updateSettings(update as Parameters<typeof store.updateSettings>[0]);
  res.json({ ok: true });
});

// ─── Fallback / reforço de IA (IAs de Apoio) ──────────────────────────────────

/** GET /api/admin/rss/fallback-settings — config das IAs de apoio (fallback + reforço) */
router.get("/fallback-settings", (_req, res) => {
  const s = store.getSettings();
  const geminiKeys = (s.geminiApiKeys ?? []).filter((k) => k.trim().length > 0);
  res.json({
    fallbackGeminiEnabled:     s.fallbackGeminiEnabled ?? true,
    fallbackPerplexityEnabled: s.fallbackPerplexityEnabled ?? true,
    hasPerplexityKey:          !!(s.perplexityApiKey || process.env["PERPLEXITY_API_KEY"]),
    perplexityKeySource:       s.perplexityApiKey ? "painel" : (process.env["PERPLEXITY_API_KEY"] ? "ambiente" : null),
    perplexityModel:           s.perplexityModel ?? "sonar",
    hasGeminiKeys:             geminiKeys.length > 0 || !!s.geminiApiKey || !!process.env["GEMINI_API_KEY"],
    boost: {
      enabled:        s.aiBoostEnabled ?? false,
      provider:       s.aiBoostProvider ?? "both",
      timesPerDay:    s.aiBoostTimesPerDay ?? 0,
      batchSize:      s.aiBoostBatchSize ?? 10,
      queueThreshold: s.aiBoostQueueThreshold ?? 0,
      maxPerDay:      s.aiBoostMaxPerDay ?? 0,
    },
  });
});

/** PUT /api/admin/rss/fallback-settings */
router.put("/fallback-settings", (req, res) => {
  const b = req.body as {
    fallbackGeminiEnabled?: boolean; fallbackPerplexityEnabled?: boolean;
    perplexityApiKey?: string; perplexityModel?: string;
    boost?: {
      enabled?: boolean; provider?: string; timesPerDay?: number;
      batchSize?: number; queueThreshold?: number; maxPerDay?: number;
    };
  };
  const clamp = (v: unknown, min: number, max: number): number | undefined => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.max(min, Math.min(n, max)) : undefined;
  };
  const update: Record<string, unknown> = {};
  if (b.fallbackGeminiEnabled     !== undefined) update["fallbackGeminiEnabled"]     = !!b.fallbackGeminiEnabled;
  if (b.fallbackPerplexityEnabled !== undefined) update["fallbackPerplexityEnabled"] = !!b.fallbackPerplexityEnabled;
  // Chave é write-only: string vazia remove, ausente mantém
  if (b.perplexityApiKey !== undefined) update["perplexityApiKey"] = b.perplexityApiKey.trim() || undefined;
  if (b.perplexityModel  !== undefined) update["perplexityModel"]  = b.perplexityModel.trim() || undefined;
  if (b.boost) {
    if (b.boost.enabled !== undefined) update["aiBoostEnabled"] = !!b.boost.enabled;
    if (b.boost.provider && ["gemini", "perplexity", "both"].includes(b.boost.provider)) {
      update["aiBoostProvider"] = b.boost.provider;
    }
    if (b.boost.timesPerDay    !== undefined) update["aiBoostTimesPerDay"]    = clamp(b.boost.timesPerDay, 0, 48);
    if (b.boost.batchSize      !== undefined) update["aiBoostBatchSize"]      = clamp(b.boost.batchSize, 1, 100);
    if (b.boost.queueThreshold !== undefined) update["aiBoostQueueThreshold"] = clamp(b.boost.queueThreshold, 0, 1000);
    if (b.boost.maxPerDay      !== undefined) update["aiBoostMaxPerDay"]      = clamp(b.boost.maxPerDay, 0, 2000);
  }
  store.updateSettings(update as Parameters<typeof store.updateSettings>[0]);
  res.json({ ok: true });
});

// ─── AI settings ──────────────────────────────────────────────────────────────

/** GET /api/admin/rss/ai-settings */
router.get("/ai-settings", (_req, res) => {
  const s = store.getSettings();
  const allKeys = (s.geminiApiKeys ?? []).filter((k) => k.trim().length > 0);
  // Return masked hints (last 6 chars) so the UI can identify keys without exposing them
  const geminiKeyHints = allKeys.map((k) => `...${k.slice(-6)}`);
  // Merge legacy single key into count if not already in array
  const geminiKeyCount = allKeys.length + (s.geminiApiKey && !allKeys.includes(s.geminiApiKey) ? 1 : 0);
  res.json({
    provider:         s.rssAiProvider ?? "gemini_direct",
    model:            s.rssAiModel ?? "",
    baseUrl:          s.rssAiBaseUrl ?? "",
    maxPendingRewrites: s.rssMaxPendingRewrites ?? DEFAULT_MAX_PENDING_REWRITES,
    hasKey:           !!s.rssAiApiKey,
    outputPrompt:     s.rssAiOutputPrompt ?? "",
    hasDiffbotKey:    !!s.diffbotApiKey,
    hasGeminiKey:     !!s.geminiApiKey,
    hasOpenaiKey:     !!s.openaiApiKey,
    hasYoutubeKey:    !!s.youtubeApiKey,
    geminiKeyCount,
    geminiKeyHints,
  });
});

/** PUT /api/admin/rss/ai-settings */
router.put("/ai-settings", (req, res) => {
  const { provider, model, baseUrl, apiKey, outputPrompt, diffbotApiKey, geminiApiKey, openaiApiKey, youtubeApiKey, maxPendingRewrites } = req.body as {
    provider?: string; model?: string; baseUrl?: string; apiKey?: string;
    outputPrompt?: string; diffbotApiKey?: string;
    geminiApiKey?: string; openaiApiKey?: string; youtubeApiKey?: string;
    maxPendingRewrites?: number;
  };
  const update: Record<string, unknown> = {};
  if (provider) update["rssAiProvider"] = provider;
  if (maxPendingRewrites !== undefined) {
    const n = Math.floor(Number(maxPendingRewrites));
    update["rssMaxPendingRewrites"] = Number.isFinite(n) && n >= 0 ? Math.min(n, 1000) : undefined;
  }
  if (model !== undefined) update["rssAiModel"] = model;
  if (baseUrl !== undefined) update["rssAiBaseUrl"] = baseUrl || undefined;
  if (apiKey !== undefined) update["rssAiApiKey"] = apiKey || undefined;
  if (outputPrompt !== undefined) update["rssAiOutputPrompt"] = outputPrompt || undefined;
  if (diffbotApiKey !== undefined) update["diffbotApiKey"] = diffbotApiKey || undefined;
  if (geminiApiKey !== undefined) update["geminiApiKey"] = geminiApiKey || undefined;
  if (openaiApiKey !== undefined) update["openaiApiKey"] = openaiApiKey || undefined;
  if (youtubeApiKey !== undefined) update["youtubeApiKey"] = youtubeApiKey || undefined;
  store.updateSettings(update as Parameters<typeof store.updateSettings>[0]);
  res.json({ ok: true });
});

/** POST /api/admin/rss/ai-settings/gemini-keys — add one Gemini API key */
router.post("/ai-settings/gemini-keys", (req, res): void => {
  const { key } = req.body as { key?: string };
  if (!key?.trim()) { res.status(400).json({ error: "key is required" }); return; }
  const s = store.getSettings();
  const existing = (s.geminiApiKeys ?? []).filter((k) => k.trim().length > 0);
  if (existing.includes(key.trim())) { res.status(409).json({ error: "key already exists" }); return; }
  store.updateSettings({ geminiApiKeys: [...existing, key.trim()] });
  const allKeys = store.getSettings().geminiApiKeys ?? [];
  res.json({ ok: true, geminiKeyCount: allKeys.length, geminiKeyHints: allKeys.map((k) => `...${k.slice(-6)}`) });
});

/** DELETE /api/admin/rss/ai-settings/gemini-keys/:index — remove a Gemini API key by index */
router.delete("/ai-settings/gemini-keys/:index", (req, res): void => {
  const idx = parseInt(req.params["index"] ?? "", 10);
  const s = store.getSettings();
  const existing = (s.geminiApiKeys ?? []).filter((k) => k.trim().length > 0);
  if (isNaN(idx) || idx < 0 || idx >= existing.length) { res.status(400).json({ error: "invalid index" }); return; }
  const updated = existing.filter((_, i) => i !== idx);
  store.updateSettings({ geminiApiKeys: updated.length > 0 ? updated : undefined });
  res.json({ ok: true, geminiKeyCount: updated.length, geminiKeyHints: updated.map((k) => `...${k.slice(-6)}`) });
});

export default router;
