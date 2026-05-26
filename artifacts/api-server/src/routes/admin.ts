import { Router } from "express";
import { authMiddleware, generateToken, validateCredentials } from "../middlewares/auth.js";
import { store } from "../lib/store.js";

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
  const ad = store.createAd({
    name, imageBase64, link,
    position: (position === "banner" || position === "sidebar" ? position : "banner"),
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

export default router;
