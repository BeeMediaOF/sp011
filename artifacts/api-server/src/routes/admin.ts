import { Router } from "express";
import { authMiddleware, generateToken, validateCredentials } from "../middlewares/auth.js";
import { store, type ContactInfo } from "../lib/store.js";
import { rewriteWithAI } from "../lib/rssProcessor.js";

const router = Router();

// ─── Auth ────────────────────────────────────────────────────────────────────

/** POST /api/admin/login */
router.post("/login", (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ error: "username and password are required" });
    return;
  }
  if (!validateCredentials(username, password)) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const token = generateToken(username);
  res.json({ token, username });
});

// All routes below require auth
router.use(authMiddleware);

// ─── Articles ────────────────────────────────────────────────────────────────

/** GET /api/admin/articles */
router.get("/articles", (_req, res) => {
  res.json({ articles: store.getArticles() });
});

/** GET /api/admin/articles/:id */
router.get("/articles/:id", (req, res) => {
  const article = store.getArticle(req.params.id ?? "");
  if (!article) { res.status(404).json({ error: "Article not found" }); return; }
  res.json({ article });
});

/** POST /api/admin/articles */
router.post("/articles", (req, res) => {
  const { title, subtitle, content, category, tag, imageUrl, author, status } = req.body as {
    title?: string; subtitle?: string; content?: string; category?: string;
    tag?: string; imageUrl?: string; author?: string; status?: string;
  };
  if (!title) { res.status(400).json({ error: "title is required" }); return; }
  const article = store.createArticle({
    title: title ?? "",
    subtitle: subtitle ?? "",
    content: content ?? "",
    category: category ?? "geral",
    tag: tag ?? "GERAL",
    imageUrl: imageUrl ?? "",
    author: author ?? "Redação Brasília Hoje",
    publishedAt: new Date().toISOString(),
    status: (status === "published" ? "published" : "draft"),
  });
  res.status(201).json({ article });
});

/** PUT /api/admin/articles/:id */
router.put("/articles/:id", (req, res) => {
  const article = store.updateArticle(req.params.id ?? "", req.body as Parameters<typeof store.updateArticle>[1]);
  if (!article) { res.status(404).json({ error: "Article not found" }); return; }
  res.json({ article });
});

/** DELETE /api/admin/articles/:id */
router.delete("/articles/:id", (req, res) => {
  const deleted = store.deleteArticle(req.params.id ?? "");
  if (!deleted) { res.status(404).json({ error: "Article not found" }); return; }
  res.json({ success: true });
});

/** POST /api/admin/articles/:id/rewrite — re-run AI rewrite on any article */
router.post("/articles/:id/rewrite", async (req, res) => {
  const article = store.getArticle(req.params.id ?? "");
  if (!article) { res.status(404).json({ error: "Article not found" }); return; }

  try {
    const sourceText = article.content ?? article.title;
    const result = await rewriteWithAI(
      article.title,
      sourceText,
      article.rssSourceName ?? "Redação",
      !!article.rssSourceName,
    );
    const updated = store.updateArticle(article.id, {
      content:     result.content,
      keywords:    result.keywords || undefined,
      slug:        result.slug || undefined,
      aiRewritten: true,
    });
    res.json({ article: updated });
  } catch (err: unknown) {
    req.log.error({ err }, "AI rewrite failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "AI rewrite failed" });
  }
});

// ─── Publish ─────────────────────────────────────────────────────────────────

/** POST /api/admin/publish/:id  — mark article as published */
router.post("/publish/:id", (req, res) => {
  const article = store.updateArticle(req.params.id ?? "", {
    status: "published",
    publishedAt: new Date().toISOString(),
  });
  if (!article) { res.status(404).json({ error: "Article not found" }); return; }
  res.json({ article, message: "Article published successfully" });
});

/** POST /api/publish  — bulk publish all drafts (public endpoint, auth required via header) */
router.post("/bulk-publish", (_req, res) => {
  const articles = store.getArticles();
  let count = 0;
  articles.forEach((a) => {
    if (a.status === "draft") {
      store.updateArticle(a.id, { status: "published", publishedAt: new Date().toISOString() });
      count++;
    }
  });
  res.json({ message: `${count} article(s) published`, count });
});

// ─── Menu ────────────────────────────────────────────────────────────────────

/** GET /api/admin/menu */
router.get("/menu", (_req, res) => {
  res.json({ menuItems: store.getMenuItems() });
});

/** PUT /api/admin/menu  — replace entire menu */
router.put("/menu", (req, res) => {
  const { menuItems } = req.body as { menuItems?: unknown };
  if (!Array.isArray(menuItems)) {
    res.status(400).json({ error: "menuItems must be an array" }); return;
  }
  const updated = store.updateMenuItems(menuItems as Parameters<typeof store.updateMenuItems>[0]);
  res.json({ menuItems: updated });
});

// ─── Settings ────────────────────────────────────────────────────────────────

/** GET /api/admin/settings */
router.get("/settings", (_req, res) => {
  res.json({ settings: store.getSettings() });
});

/** PUT /api/admin/settings */
router.put("/settings", (req, res) => {
  const settings = store.updateSettings(req.body as Parameters<typeof store.updateSettings>[0]);
  res.json({ settings });
});

/** POST /api/admin/logo  — upload logo as base64 */
router.post("/logo", (req, res) => {
  const { logoBase64 } = req.body as { logoBase64?: string };
  if (!logoBase64) { res.status(400).json({ error: "logoBase64 is required" }); return; }
  const settings = store.updateSettings({ logoBase64 });
  res.json({ settings, message: "Logo updated successfully" });
});

// ─── Ads ───────────────────────────────────────────────────────────────

/** GET /api/admin/ads */
router.get("/ads", (_req, res) => {
  res.json({ ads: store.getAds() });
});

/** GET /api/admin/ads/:id */
router.get("/ads/:id", (req, res) => {
  const ad = store.getAd(req.params.id ?? "");
  if (!ad) { res.status(404).json({ error: "Ad not found" }); return; }
  res.json({ ad });
});

/** POST /api/admin/ads — create ad */
router.post("/ads", (req, res) => {
  const { name, imageBase64, link, position, active } = req.body as {
    name?: string; imageBase64?: string; link?: string; position?: string; active?: boolean;
  };
  if (!name || !imageBase64 || !link) {
    res.status(400).json({ error: "name, imageBase64 and link are required" }); return;
  }
  const VALID_POSITIONS = [
    "slot_01","slot_02","slot_03","slot_04","slot_05","slot_06","slot_07",
    "banner","sidebar","central","topo","centro","lateral","rodape",
    "slidebar_250","slidebar_500",
  ];
  const ad = store.createAd({
    name, imageBase64, link,
    position: (VALID_POSITIONS.includes(position ?? "") ? position! : "slot_01") as Parameters<typeof store.createAd>[0]["position"],
    active: !!active,
  });
  res.status(201).json({ ad });
});

/** PUT /api/admin/ads/:id */
router.put("/ads/:id", (req, res) => {
  const ad = store.updateAd(req.params.id ?? "", req.body as Parameters<typeof store.updateAd>[1]);
  if (!ad) { res.status(404).json({ error: "Ad not found" }); return; }
  res.json({ ad });
});

/** DELETE /api/admin/ads/:id */
router.delete("/ads/:id", (req, res) => {
  const deleted = store.deleteAd(req.params.id ?? "");
  if (!deleted) { res.status(404).json({ error: "Ad not found" }); return; }
  res.json({ success: true });
});

// ─── Columnists ────────────────────────────────────────────────────────────────────

router.get("/columnists", (_req, res) => {
  res.json({ columnists: store.getColumnists() });
});

router.get("/columnists/:id", (req, res) => {
  const c = store.getColumnist(req.params.id ?? "");
  if (!c) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ columnist: c });
});

router.post("/columnists", (req, res) => {
  const { name, bio, avatarBase64, active } = req.body as { name?: string; bio?: string; avatarBase64?: string; active?: boolean };
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const c = store.createColumnist({ name, bio: bio ?? "", avatarBase64: avatarBase64 ?? "", active: !!active });
  res.status(201).json({ columnist: c });
});

router.put("/columnists/:id", (req, res) => {
  const c = store.updateColumnist(req.params.id ?? "", req.body as Parameters<typeof store.updateColumnist>[1]);
  if (!c) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ columnist: c });
});

router.delete("/columnists/:id", (req, res) => {
  const ok = store.deleteColumnist(req.params.id ?? "");
  if (!ok) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ success: true });
});

// ─── Contact Info ────────────────────────────────────────────────────────────────────

router.get("/contact", (_req, res) => {
  res.json({ contactInfo: store.getContactInfo() });
});

router.put("/contact", (req, res) => {
  const info = store.updateContactInfo(req.body as Partial<ContactInfo>);
  res.json({ contactInfo: info });
});

export default router;
