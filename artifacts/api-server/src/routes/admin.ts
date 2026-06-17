import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  authMiddleware, generateToken, verifyPassword,
  checkRateLimit, resetRateLimit,
} from "../middlewares/auth.js";
import { logAudit, logSecurity, getClientIp } from "../lib/audit.js";
import { store, type ContactInfo } from "../lib/store.js";
import { rewriteWithAI } from "../lib/rssProcessor.js";

const router = Router();

// ─── Auth ────────────────────────────────────────────────────────────────────

/** POST /api/admin/login */
router.post("/login", async (req, res) => {
  const ip = getClientIp(req);
  const ua = req.headers["user-agent"] ?? "";

  // Rate limit by IP
  if (!checkRateLimit(ip)) {
    await logSecurity({
      eventType: "rate_limit_exceeded",
      severity: "high",
      description: `Login rate limit excedido para IP: ${ip}`,
      ipAddress: ip, userAgent: ua, route: "/api/admin/login",
    });
    res.status(429).json({ error: "Muitas tentativas. Tente novamente em alguns minutos." });
    return;
  }

  const { email, username, password } = req.body as {
    email?: string; username?: string; password?: string;
  };
  const identifier = (email ?? username ?? "").trim().toLowerCase();

  if (!identifier || !password) {
    res.status(400).json({ error: "E-mail e senha são obrigatórios." });
    return;
  }

  try {
    // Try DB user first
    const [user] = await db.select().from(usersTable)
      .where(eq(sql`lower(${usersTable.email})`, identifier));

    if (user) {
      // Check if blocked
      if (user.status === "blocked" || (user.lockedUntil && user.lockedUntil > new Date())) {
        await logSecurity({
          userId: user.id, userEmail: user.email,
          eventType: "account_locked",
          severity: "medium",
          description: `Tentativa de login em conta bloqueada: ${user.email}`,
          ipAddress: ip, userAgent: ua, route: "/api/admin/login",
        });
        res.status(403).json({ error: "E-mail ou senha inválidos." });
        return;
      }
      if (user.status === "inactive") {
        res.status(403).json({ error: "E-mail ou senha inválidos." });
        return;
      }

      const valid = verifyPassword(password, user.passwordHash);
      if (!valid) {
        const newFailed = user.failedLoginAttempts + 1;
        const lockUntil = newFailed >= 5 ? new Date(Date.now() + 30 * 60_000) : null;
        await db.update(usersTable).set({
          failedLoginAttempts: newFailed,
          lockedUntil: lockUntil,
        }).where(eq(usersTable.id, user.id));
        await logSecurity({
          userId: user.id, userEmail: user.email,
          eventType: newFailed >= 5 ? "account_locked" : "failed_login",
          severity: newFailed >= 5 ? "high" : "medium",
          description: `Tentativa de login inválida (${newFailed}/5): ${user.email}`,
          ipAddress: ip, userAgent: ua, route: "/api/admin/login",
        });
        res.status(401).json({ error: "E-mail ou senha inválidos." });
        return;
      }

      // Success
      await db.update(usersTable).set({
        lastLogin: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      }).where(eq(usersTable.id, user.id));
      resetRateLimit(ip);
      await logAudit({
        userId: user.id, userEmail: user.email,
        action: "login", module: "auth",
        description: `Login realizado: ${user.email}`,
        ipAddress: ip, userAgent: ua,
      });
      const token = generateToken(user.id, user.role);
      res.json({ token, email: user.email, role: user.role, name: user.name, avatarBase64: user.avatarBase64 ?? null });
      return;
    }

    // No DB user found
    await logSecurity({
      eventType: "failed_login", severity: "low",
      description: `Tentativa de login com credencial desconhecida: ${identifier}`,
      ipAddress: ip, userAgent: ua, route: "/api/admin/login",
    });
    res.status(401).json({ error: "E-mail ou senha inválidos." });
  } catch (err) {
    req.log.error({ err }, "Login error");
    res.status(500).json({ error: "Erro interno no login." });
  }
});

/** GET /api/admin/me — current user info */
router.get("/me", authMiddleware, async (req, res) => {
  try {
    if (!req.userId) { res.status(401).json({ error: "Não autorizado" }); return; }
    const [user] = await db.select({
      id: usersTable.id, name: usersTable.name, email: usersTable.email,
      role: usersTable.role, status: usersTable.status,
      lastLogin: usersTable.lastLogin, mustChangePassword: usersTable.mustChangePassword,
      avatarBase64: usersTable.avatarBase64,
    }).from(usersTable).where(eq(usersTable.id, req.userId));
    if (!user) { res.status(404).json({ error: "Usuário não encontrado" }); return; }
    res.json({ user });
  } catch (err) {
    req.log.error({ err }, "Error fetching current user");
    res.status(500).json({ error: "Erro interno" });
  }
});

/** PUT /api/admin/me — update own name and avatar */
router.put("/me", authMiddleware, async (req, res) => {
  if (!req.userId) { res.status(401).json({ error: "Não autorizado" }); return; }
  const { name, avatarBase64 } = req.body as { name?: string; avatarBase64?: string | null };
  try {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof name === "string" && name.trim()) updates["name"] = name.trim();
    if (avatarBase64 !== undefined) updates["avatarBase64"] = avatarBase64 ?? null;
    await db.update(usersTable).set(updates).where(eq(usersTable.id, req.userId));
    const [updated] = await db.select({
      id: usersTable.id, name: usersTable.name, email: usersTable.email,
      role: usersTable.role, avatarBase64: usersTable.avatarBase64,
    }).from(usersTable).where(eq(usersTable.id, req.userId));
    await logAudit({
      userId: req.userId, action: "update_profile", module: "auth",
      description: "Perfil atualizado",
      ipAddress: getClientIp(req), userAgent: req.headers["user-agent"],
    });
    res.json({ user: updated });
  } catch (err) {
    req.log.error({ err }, "Error updating profile");
    res.status(500).json({ error: "Erro interno" });
  }
});

/** POST /api/admin/logout */
router.post("/logout", authMiddleware, async (req, res) => {
  await logAudit({
    userId: req.userId,
    action: "logout", module: "auth",
    description: `Logout realizado`,
    ipAddress: getClientIp(req), userAgent: req.headers["user-agent"],
  });
  res.json({ success: true });
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

/** POST /api/admin/articles/autofill  — AI auto-fill SEO metadata from title + content */
router.post("/articles/autofill", async (req, res) => {
  const { title, content } = req.body as { title?: string; content?: string };
  if (!title || title.trim().length < 5) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  const apiKey = process.env["PERPLEXITY_API_KEY"];
  if (!apiKey) {
    res.status(503).json({ error: "PERPLEXITY_API_KEY not configured" });
    return;
  }

  const textSample = (content ?? "").slice(0, 1200);

  const prompt = `Você é especialista em SEO para portais de notícias brasileiros e em AIO (AI Optimization) para destaque no Google e em buscas por IA.

Dado o título e conteúdo de uma matéria jornalística, gere os seguintes campos de forma otimizada para SEO/AIO:

TÍTULO DA MATÉRIA: ${title.trim()}
CONTEÚDO (trecho): ${textSample || "(sem conteúdo ainda — use apenas o título)"}

Retorne APENAS um objeto JSON válido (sem markdown, sem \`\`\`, sem texto extra) com exatamente estas chaves:
{
  "subtitle": "subtítulo editorial de 1 frase (até 120 chars), complementa o título, jornalístico",
  "summary": "resumo/lide de 2-3 frases (até 160 chars), o mais importante do texto, linguagem direta",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "seoTitle": "título SEO otimizado (até 60 chars), com palavra-chave principal no início",
  "metaDesc": "meta descrição SEO (até 155 chars), inclui palavra-chave, chama atenção para clicar",
  "slug": "slug-url-amigavel-sem-acentos-sem-espacos"
}

Regras:
- tags: até 5 tags em português, palavras-chave relevantes para o tema, sem hashtag
- slug: só letras minúsculas, números e hifens, sem acentos, sem caracteres especiais
- Todos os campos em português brasileiro
- Foco em São Bernardo do Campo / Grande ABC quando relevante`;

  try {
    const resp = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "sonar",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 600,
        search_recency_filter: "month",
        return_citations: false,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => resp.statusText);
      req.log.error({ status: resp.status, errText }, "Perplexity autofill error");
      res.status(502).json({ error: `Perplexity error: ${resp.status}` });
      return;
    }

    const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data.choices?.[0]?.message?.content ?? "";

    // Strip markdown code fences if present
    const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(clean) as Record<string, unknown>;
    } catch {
      req.log.warn({ raw }, "autofill JSON parse failed, attempting extraction");
      // Fallback: extract JSON object from response
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) {
        res.status(502).json({ error: "Resposta da IA não contém JSON válido" });
        return;
      }
      parsed = JSON.parse(match[0]) as Record<string, unknown>;
    }

    res.json({
      subtitle:  typeof parsed["subtitle"]  === "string" ? parsed["subtitle"]  : "",
      summary:   typeof parsed["summary"]   === "string" ? parsed["summary"]   : "",
      tags:      Array.isArray(parsed["tags"]) ? (parsed["tags"] as unknown[]).filter((t): t is string => typeof t === "string").slice(0, 5) : [],
      seoTitle:  typeof parsed["seoTitle"]  === "string" ? parsed["seoTitle"]  : "",
      metaDesc:  typeof parsed["metaDesc"]  === "string" ? parsed["metaDesc"]  : "",
      slug:      typeof parsed["slug"]      === "string" ? parsed["slug"]      : "",
    });
  } catch (err: unknown) {
    req.log.error({ err }, "autofill failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "autofill failed" });
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
