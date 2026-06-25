import { Router } from "express";
import { BRAND } from "../lib/brand.js";
import { eq, sql } from "drizzle-orm";
import { writeFileSync } from "fs";
import { resolve } from "path";
import { db, usersTable, adsTable, parseTargetDevices, serializeTargetDevices, VALID_AD_POSITIONS, type AdPosition } from "@workspace/db";
import {
  authMiddleware, generateToken, generateTempToken, verifyTempToken,
  verifyPassword, checkRateLimit, resetRateLimit,
} from "../middlewares/auth.js";
import { generateSecret as otpGenerateSecret, verifySync as otpVerifySync, generateURI as otpGenerateURI } from "otplib";
import QRCode from "qrcode";
import { logAudit, logSecurity, getClientIp } from "../lib/audit.js";
import { store, type ContactInfo, type SiteSettings } from "../lib/store.js";
import { logger } from "../lib/logger.js";
import { articleService } from "../lib/articleService.js";
import { rewriteWithAI, scrapeArticle, scrapeWithDiffbot, getAIQuotaStatus } from "../lib/rssProcessor.js";
import { YoutubeTranscript } from "youtube-transcript";

const router = Router();

// ─── Auth ────────────────────────────────────────────────────────────────────

/** POST /api/admin/login */
router.post("/login", async (req, res) => {
  const ip = getClientIp(req);
  const ua = req.headers["user-agent"] ?? "";

  // Rate limit by IP
  if (!await checkRateLimit(ip)) {
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
        res.status(401).json({
          error: "E-mail ou senha inválidos.",
          requiresCaptcha: newFailed >= 3,
        });
        return;
      }

      // Two-factor auth check — return a temp token for the TOTP step
      if (user.twoFactorEnabled) {
        const tempToken = generateTempToken(user.id);
        res.json({ requiresTwoFactor: true, tempToken });
        return;
      }

      // Success
      await db.update(usersTable).set({
        lastLogin: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      }).where(eq(usersTable.id, user.id));
      await resetRateLimit(ip);
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

// ─── 2FA Routes ──────────────────────────────────────────────────────────────

/** POST /api/admin/2fa/setup — generate TOTP secret + QR code */
router.post("/2fa/setup", authMiddleware, async (req, res) => {
  if (!req.userId) { res.status(401).json({ error: "Não autorizado" }); return; }
  try {
    const [user] = await db.select({ email: usersTable.email })
      .from(usersTable).where(eq(usersTable.id, req.userId)).limit(1);
    if (!user) { res.status(404).json({ error: "Usuário não encontrado" }); return; }
    const secret = otpGenerateSecret();
    const otpauth = otpGenerateURI({ label: user.email, issuer: BRAND.adminIssuer, secret });
    const qrDataUrl = await QRCode.toDataURL(otpauth);
    // Store secret temporarily (user must verify before it's persisted)
    await db.update(usersTable).set({ twoFactorSecret: secret }).where(eq(usersTable.id, req.userId));
    res.json({ secret, qrDataUrl });
  } catch (err) {
    req.log.error({ err }, "2FA setup error");
    res.status(500).json({ error: "Erro ao configurar 2FA" });
  }
});

/** POST /api/admin/2fa/verify — verify TOTP code and enable 2FA */
router.post("/2fa/verify", authMiddleware, async (req, res) => {
  if (!req.userId) { res.status(401).json({ error: "Não autorizado" }); return; }
  const { code } = req.body as { code?: string };
  if (!code) { res.status(400).json({ error: "Código obrigatório" }); return; }
  try {
    const [user] = await db.select({ twoFactorSecret: usersTable.twoFactorSecret })
      .from(usersTable).where(eq(usersTable.id, req.userId)).limit(1);
    if (!user?.twoFactorSecret) { res.status(400).json({ error: "Execute /2fa/setup primeiro" }); return; }
    const valid = otpVerifySync({ token: code.replace(/\s/g, ""), secret: user.twoFactorSecret, strategy: "totp" });
    if (!valid) { res.status(400).json({ error: "Código inválido" }); return; }
    await db.update(usersTable).set({ twoFactorEnabled: true }).where(eq(usersTable.id, req.userId));
    res.json({ ok: true, message: "2FA ativado com sucesso" });
  } catch (err) {
    req.log.error({ err }, "2FA verify error");
    res.status(500).json({ error: "Erro ao verificar 2FA" });
  }
});

/** POST /api/admin/2fa/disable — disable 2FA (requires valid code) */
router.post("/2fa/disable", authMiddleware, async (req, res) => {
  if (!req.userId) { res.status(401).json({ error: "Não autorizado" }); return; }
  const { code } = req.body as { code?: string };
  if (!code) { res.status(400).json({ error: "Código obrigatório" }); return; }
  try {
    const [user] = await db.select({ twoFactorSecret: usersTable.twoFactorSecret, twoFactorEnabled: usersTable.twoFactorEnabled })
      .from(usersTable).where(eq(usersTable.id, req.userId)).limit(1);
    if (!user?.twoFactorEnabled) { res.json({ ok: true, message: "2FA já estava desativado" }); return; }
    const valid = otpVerifySync({ token: code.replace(/\s/g, ""), secret: user.twoFactorSecret!, strategy: "totp" });
    if (!valid) { res.status(400).json({ error: "Código inválido" }); return; }
    await db.update(usersTable).set({ twoFactorEnabled: false, twoFactorSecret: null }).where(eq(usersTable.id, req.userId));
    res.json({ ok: true, message: "2FA desativado" });
  } catch (err) {
    req.log.error({ err }, "2FA disable error");
    res.status(500).json({ error: "Erro ao desativar 2FA" });
  }
});

/** POST /api/admin/2fa/status — check 2FA status for current user */
router.get("/2fa/status", authMiddleware, async (req, res) => {
  if (!req.userId) { res.status(401).json({ error: "Não autorizado" }); return; }
  const [user] = await db.select({ twoFactorEnabled: usersTable.twoFactorEnabled })
    .from(usersTable).where(eq(usersTable.id, req.userId)).limit(1);
  res.json({ twoFactorEnabled: user?.twoFactorEnabled ?? false });
});

/** POST /api/admin/2fa/login — complete 2FA login with tempToken + TOTP code */
router.post("/2fa/login", async (req, res) => {
  const ip = getClientIp(req);
  const { tempToken, code } = req.body as { tempToken?: string; code?: string };
  if (!tempToken || !code) { res.status(400).json({ error: "tempToken e code são obrigatórios" }); return; }
  const userId = verifyTempToken(tempToken);
  if (!userId) { res.status(401).json({ error: "Token inválido ou expirado" }); return; }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user || user.status !== "active") { res.status(401).json({ error: "Conta inativa" }); return; }
    if (!user.twoFactorSecret) { res.status(400).json({ error: "2FA não configurado" }); return; }
    const valid = otpVerifySync({ token: code.replace(/\s/g, ""), secret: user.twoFactorSecret, strategy: "totp" });
    if (!valid) {
      await logSecurity({
        userId: user.id, userEmail: user.email,
        eventType: "failed_login", severity: "medium",
        description: `Código 2FA inválido: ${user.email}`,
        ipAddress: ip, userAgent: req.headers["user-agent"] ?? "", route: "/api/admin/2fa/login",
      });
      res.status(401).json({ error: "Código inválido" });
      return;
    }
    await db.update(usersTable).set({ lastLogin: new Date(), failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));
    await logAudit({
      userId: user.id, userEmail: user.email, action: "login", module: "auth",
      description: `Login com 2FA: ${user.email}`, ipAddress: ip, userAgent: req.headers["user-agent"] ?? "",
    });
    const token = generateToken(user.id, user.role);
    res.json({ token, email: user.email, role: user.role, name: user.name, avatarBase64: user.avatarBase64 ?? null });
  } catch (err) {
    req.log.error({ err }, "2FA login error");
    res.status(500).json({ error: "Erro interno" });
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
router.get("/articles", async (_req, res) => {
  const [articles, viewsMap] = await Promise.all([
    articleService.getArticles(),
    Promise.resolve(store.getArticleViews()),
  ]);
  const withViews = articles.map((a) => ({
    ...a,
    views: viewsMap[a.id]?.views ?? 0,
  }));
  res.json({ articles: withViews });
});

/** GET /api/admin/articles/:id */
router.get("/articles/:id", async (req, res) => {
  const article = await articleService.getArticle(req.params.id ?? "");
  if (!article) { res.status(404).json({ error: "Article not found" }); return; }
  res.json({ article });
});

/** POST /api/admin/articles */
router.post("/articles", async (req, res) => {
  const { title, subtitle, content, category, tag, imageUrl, author, status } = req.body as {
    title?: string; subtitle?: string; content?: string; category?: string;
    tag?: string; imageUrl?: string; author?: string; status?: string;
  };
  if (!title) { res.status(400).json({ error: "title is required" }); return; }
  const article = await articleService.createArticle({
    title: title ?? "",
    subtitle: subtitle ?? "",
    content: content ?? "",
    category: category ?? "geral",
    tag: tag ?? "GERAL",
    imageUrl: imageUrl ?? "",
    author: author ?? BRAND.author,
    publishedAt: new Date().toISOString(),
    status: (status === "published" ? "published" : "draft"),
  });
  res.status(201).json({ article });
});

/** PUT /api/admin/articles/:id */
router.put("/articles/:id", async (req, res) => {
  const article = await articleService.updateArticle(req.params.id ?? "", req.body as Parameters<typeof articleService.updateArticle>[1]);
  if (!article) { res.status(404).json({ error: "Article not found" }); return; }
  res.json({ article });
});

/** DELETE /api/admin/articles/:id */
router.delete("/articles/:id", async (req, res) => {
  const deleted = await articleService.deleteArticle(req.params.id ?? "");
  if (!deleted) { res.status(404).json({ error: "Article not found" }); return; }
  res.json({ success: true });
});

/** POST /api/admin/articles/:id/rewrite — re-run AI rewrite on any article */
router.post("/articles/:id/rewrite", async (req, res) => {
  const article = await articleService.getArticle(req.params.id ?? "");
  if (!article) { res.status(404).json({ error: "Article not found" }); return; }

  try {
    const sourceText = article.content ?? article.title;
    const result = await rewriteWithAI(
      article.title,
      sourceText,
      article.rssSourceName ?? "Redação",
      !!article.rssSourceName,
    );
    const updated = await articleService.updateArticle(article.id, {
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
router.post("/publish/:id", async (req, res) => {
  const article = await articleService.updateArticle(req.params.id ?? "", {
    status: "published",
    publishedAt: new Date().toISOString(),
  });
  if (!article) { res.status(404).json({ error: "Article not found" }); return; }
  res.json({ article, message: "Article published successfully" });
});

/** POST /api/admin/articles/repair-content
 *  Scans all articles for JSON-wrapped content and extracts clean HTML.
 *  Safe to run multiple times — only touches broken articles.
 */
router.post("/articles/repair-content", async (_req, res) => {
  function extractHtmlFromJson(raw: string): string | null {
    // Strip markdown fences
    const stripped = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    if (!stripped.startsWith("{")) return null;

    // 1. Try clean JSON parse
    try {
      const parsed = JSON.parse(stripped) as Record<string, unknown>;
      const html = (parsed["content_html"] ?? parsed["contentHtml"] ?? parsed["content"] ?? "") as string;
      return html.trim() || null;
    } catch { /* try regex fallback */ }

    // 2. Regex fallback for truncated / malformed JSON
    const m = stripped.match(/"content_html"\s*:\s*"([\s\S]+?)(?:"\s*[,}]|"\s*$)/);
    if (m?.[1]) {
      return m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\").trim();
    }
    return null;
  }

  function looksLikeBrokenContent(content: string): boolean {
    const t = content.trim();
    return (
      t.startsWith("```json") ||
      t.startsWith("```") ||
      (t.startsWith("{") && (t.includes('"content_html"') || t.includes('"contentHtml"'))) ||
      // stored JSON that was treated as plain text
      /^\s*\{[\s\S]{50,}"title"\s*:/.test(t)
    );
  }

  const articles = await articleService.getArticles();
  let fixed = 0;
  let skipped = 0;

  for (const article of articles) {
    const raw = article.content ?? "";
    if (!looksLikeBrokenContent(raw)) { skipped++; continue; }

    const html = extractHtmlFromJson(raw);
    if (!html) { skipped++; continue; }

    await articleService.updateArticle(article.id, { content: html });
    fixed++;
  }

  res.json({ fixed, skipped, total: articles.length });
});

/**
 * POST /api/admin/articles/delete-invalid
 * Apaga todos os artigos cujo conteúdo é ilegível (JSON malformado que não pode ser extraído,
 * conteúdo vazio, ou apenas metadados sem texto real). Útil para limpar o banco de artigos
 * que o pipeline de reescrita não conseguiu processar corretamente.
 */
router.post("/articles/delete-invalid", authMiddleware, async (req, res) => {
  /**
   * Returns true for articles that had the red "Conteúdo com formatação inválida" error.
   * These are articles where the content looks like JSON but neither a clean JSON parse
   * nor a regex extraction can recover a readable `content_html` value.
   * HTML content, plain text, and correctly-formed JSON all return false (keep).
   */
  function isContentInvalid(content: string): boolean {
    if (!content || content.trim().length < 20) return true;
    const stripped = content.trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    // HTML or plain text → fine
    if (!stripped.startsWith("{") && !stripped.startsWith("[")) return false;
    // Try clean JSON parse → look for any content-bearing field
    try {
      const parsed = JSON.parse(stripped) as Record<string, unknown>;
      const html = (parsed["content_html"] ?? parsed["contentHtml"] ?? parsed["content"] ?? "") as string;
      if (html.trim().length > 50) return false;
    } catch { /* fall through */ }
    // Regex for content_html (handles truncated JSON)
    const m = stripped.match(/"content_html"\s*:\s*"([\s\S]+?)(?:"\s*[,}]|"\s*$)/);
    if (m?.[1]?.replace(/\\n/g, "\n").replace(/\\"/g, '"').trim().length ?? 0 > 50) return false;
    // JSON-like, nothing extractable → invalid
    return true;
  }

  const articles = await articleService.getArticles();
  let deleted = 0;
  const ids: string[] = [];

  for (const article of articles) {
    if (isContentInvalid(article.content ?? "")) {
      await articleService.deleteArticle(article.id);
      deleted++;
      ids.push(article.id);
    }
  }

  req.log.info({ deleted, total: articles.length }, "admin: deleted invalid-content articles");
  res.json({ deleted, total: articles.length, ids });
});

/** POST /api/publish  — bulk publish all drafts (public endpoint, auth required via header) */
router.post("/bulk-publish", async (_req, res) => {
  const articles = await articleService.getArticles();
  let count = 0;
  for (const a of articles) {
    if (a.status === "draft") {
      await articleService.updateArticle(a.id, { status: "published", publishedAt: new Date().toISOString() });
      count++;
    }
  }
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

/** Escape HTML special chars for safe interpolation into index.html */
function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Write the Vite index.html and public/opengraph.jpg whenever settings change
 * so social-media crawlers always see up-to-date Open Graph meta tags without
 * requiring server-side rendering.
 *
 * Non-critical — errors are logged but never surfaced to the caller.
 */
function updateIndexHtml(settings: SiteSettings): void {
  try {
    const base      = resolve(process.cwd(), "..", "brasilia-agora");
    const indexPath = resolve(base, "index.html");
    const ogPath    = resolve(base, "public", "opengraph.jpg");
    const favPath   = resolve(base, "public", "favicon.jpg");

    const siteName = escHtml(settings.siteName  || BRAND.name);
    const tagline  = escHtml(settings.tagline   || BRAND.tagline);
    const desc     = escHtml(settings.seoDescription || settings.tagline || "Informação com credibilidade sobre o Distrito Federal e o Brasil.");
    const siteUrl  = escHtml(settings.siteUrl   || "");
    const title    = `${siteName} — ${tagline}`;

    // Persist OG image so /opengraph.jpg returns the admin-uploaded version
    if (settings.ogImageBase64) {
      try {
        const b64 = settings.ogImageBase64.replace(/^data:image\/\w+;base64,/, "");
        writeFileSync(ogPath, Buffer.from(b64, "base64"));
      } catch (imgErr) {
        logger.warn({ err: imgErr }, "updateIndexHtml: could not write opengraph.jpg");
      }
    }

    // Persist favicon so /favicon.jpg returns the admin-uploaded version
    if (settings.faviconBase64) {
      try {
        const b64 = settings.faviconBase64.replace(/^data:image\/\w+;base64,/, "");
        writeFileSync(favPath, Buffer.from(b64, "base64"));
      } catch (favErr) {
        logger.warn({ err: favErr }, "updateIndexHtml: could not write favicon.jpg");
      }
    }

    const ogUrlTag = siteUrl
      ? `\n    <meta property="og:url" content="${siteUrl}" />`
      : "";

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
    <title>${title}</title>
    <meta name="description" content="${desc}" />
    <meta name="robots" content="index, follow" />

    <!-- Open Graph -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${siteName}" />${ogUrlTag}
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${desc}" />
    <meta property="og:image" content="/opengraph.jpg" />

    <!-- Twitter / X -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${desc}" />
    <meta name="twitter:image" content="/opengraph.jpg" />

    <link rel="icon" type="image/jpeg" href="/favicon.jpg" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;

    writeFileSync(indexPath, html, "utf-8");
  } catch (err) {
    logger.warn({ err }, "updateIndexHtml: failed");
  }
}

/** GET /api/admin/settings */
router.get("/settings", (_req, res) => {
  res.json({ settings: store.getPublicSettings() });
});

/** GET /api/admin/ai-quota */
router.get("/ai-quota", authMiddleware, (_req, res) => {
  res.json(getAIQuotaStatus());
});

/** PUT /api/admin/settings */
router.put("/settings", (req, res) => {
  const updated = store.updateSettings(req.body as Parameters<typeof store.updateSettings>[0]);
  updateIndexHtml(updated);
  res.json({ settings: store.getPublicSettings() });
});

/** POST /api/admin/logo  — upload logo as base64 */
router.post("/logo", (req, res) => {
  const { logoBase64 } = req.body as { logoBase64?: string };
  if (!logoBase64) { res.status(400).json({ error: "logoBase64 is required" }); return; }
  const settings = store.updateSettings({ logoBase64 });
  res.json({ settings, message: "Logo updated successfully" });
});

// ─── Ads ───────────────────────────────────────────────────────────────

function adRowToPublic(r: typeof adsTable.$inferSelect) {
  return {
    id: r.id,
    name: r.name,
    imageBase64: r.imageBase64,
    imageUrl: r.imageUrl ?? undefined,
    link: r.link,
    position: r.position,
    active: r.active,
    clicks: r.clicks,
    impressions: r.impressions,
    targetDevices: parseTargetDevices(r.targetDevices),
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** GET /api/admin/ads */
router.get("/ads", async (_req, res) => {
  const rows = await db.select().from(adsTable).orderBy(adsTable.createdAt);
  res.json({ ads: rows.map(adRowToPublic) });
});

/** GET /api/admin/ads/:id */
router.get("/ads/:id", async (req, res) => {
  const [row] = await db.select().from(adsTable).where(eq(adsTable.id, req.params.id ?? "")).limit(1);
  if (!row) { res.status(404).json({ error: "Ad not found" }); return; }
  res.json({ ad: adRowToPublic(row) });
});


/** POST /api/admin/ads — create ad */
router.post("/ads", async (req, res) => {
  const { name, imageBase64, imageUrl: imageUrlIn, link, position, active, targetDevices, expiresAt } = req.body as {
    name?: string; imageBase64?: string; imageUrl?: string; link?: string; position?: string; active?: boolean;
    targetDevices?: ("desktop" | "mobile" | "tablet")[]; expiresAt?: string | null;
  };
  if (!name || (!imageBase64 && !imageUrlIn) || !link) {
    res.status(400).json({ error: "name, link e imageBase64 ou imageUrl são obrigatórios" }); return;
  }
  const safePosition: AdPosition = (VALID_AD_POSITIONS as string[]).includes(position ?? "")
    ? (position as AdPosition)
    : "slot_01";
  const { randomUUID } = await import("crypto");
  const now = new Date();
  const [row] = await db.insert(adsTable).values({
    id: randomUUID(),
    name, imageBase64: imageBase64 ?? "", imageUrl: imageUrlIn ?? null, link,
    position: safePosition,
    active: active !== false,
    clicks: 0,
    impressions: 0,
    targetDevices: serializeTargetDevices(targetDevices ?? ["desktop", "mobile", "tablet"]),
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    createdAt: now,
    updatedAt: now,
  }).returning();
  res.status(201).json({ ad: adRowToPublic(row!) });
});

/** PUT /api/admin/ads/:id */
router.put("/ads/:id", async (req, res) => {
  const id = req.params.id ?? "";
  const { name, imageBase64, imageUrl: imageUrlIn, link, position, active, targetDevices, expiresAt } = req.body as {
    name?: string; imageBase64?: string; imageUrl?: string; link?: string; position?: string; active?: boolean;
    targetDevices?: ("desktop" | "mobile" | "tablet")[]; expiresAt?: string | null;
  };
  const safePosition: AdPosition | undefined = position
    ? ((VALID_AD_POSITIONS as string[]).includes(position) ? (position as AdPosition) : undefined)
    : undefined;
  const updateData: Partial<typeof adsTable.$inferInsert> = { updatedAt: new Date() };
  if (name !== undefined) updateData.name = name;
  if (imageBase64 !== undefined) updateData.imageBase64 = imageBase64;
  if (imageUrlIn !== undefined) updateData.imageUrl = imageUrlIn;
  if (link !== undefined) updateData.link = link;
  if (safePosition !== undefined) updateData.position = safePosition;
  if (active !== undefined) updateData.active = active;
  if (targetDevices !== undefined) updateData.targetDevices = serializeTargetDevices(targetDevices);
  if (expiresAt !== undefined) updateData.expiresAt = expiresAt ? new Date(expiresAt) : null;
  const [row] = await db.update(adsTable).set(updateData).where(eq(adsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Ad not found" }); return; }
  res.json({ ad: adRowToPublic(row) });
});

/** DELETE /api/admin/ads/:id */
router.delete("/ads/:id", async (req, res) => {
  const result = await db.delete(adsTable).where(eq(adsTable.id, req.params.id ?? "")).returning({ id: adsTable.id });
  if (result.length === 0) { res.status(404).json({ error: "Ad not found" }); return; }
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
  const c = store.createColumnist({ name, bio: bio ?? "", specialty: "Outro", avatarBase64: avatarBase64 ?? "", active: !!active });
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

// ─── AI SEO ──────────────────────────────────────────────────────────────────

// ─── Máquina de Artigos ───────────────────────────────────────────────────────

/** Detect YouTube URL and extract video ID */
function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([A-Za-z0-9_-]{11})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = re.exec(url);
    if (m?.[1]) return m[1];
  }
  return null;
}

/**
 * Fetch the full transcript from a YouTube video using the youtube-transcript
 * library (uses YouTube's Innertube API — no API key required for public videos
 * that have captions/auto-generated subtitles).
 * Prefers Portuguese, falls back to any available language.
 */
async function fetchYouTubeTranscript(videoId: string): Promise<string> {
  // Try Portuguese first, then fall back to any available language
  const langs = ["pt", "pt-BR", "en", undefined] as const;
  let lastErr: unknown;
  for (const lang of langs) {
    try {
      const segments = lang
        ? await YoutubeTranscript.fetchTranscript(videoId, { lang })
        : await YoutubeTranscript.fetchTranscript(videoId);
      const text = segments.map((s) => s.text.replace(/\n/g, " ").trim()).filter(Boolean).join(" ");
      if (text.length > 50) return text;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error("No transcript available for this video");
}

/**
 * Best-quality YouTube thumbnail: tries maxresdefault (HD) then falls back
 * to hqdefault (always available).
 */
async function getBestYouTubeThumbnail(videoId: string): Promise<string> {
  const hd = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  const hq = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  try {
    const res = await fetch(hd, { method: "HEAD", signal: AbortSignal.timeout(5_000) });
    // maxresdefault returns 404 or a 120×90 "placeholder" (< 2 KB) when unavailable
    const len = Number(res.headers.get("content-length") ?? 0);
    if (res.ok && len > 5_000) return hd;
  } catch { /* ignore */ }
  return hq;
}

/** Fetch YouTube page metadata + transcript */
async function scrapeYouTube(url: string): Promise<{ title: string; text: string; imageUrl: string }> {
  const videoId = extractYouTubeId(url);

  // oEmbed for title
  let title = "";
  try {
    const oembed = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (oembed.ok) {
      const d = await oembed.json() as { title?: string };
      title = d.title ?? "";
    }
  } catch { /* ignore */ }

  // Best thumbnail
  const imageUrl = videoId ? await getBestYouTubeThumbnail(videoId) : "";

  // Full transcript (primary) — fallback to page description
  let transcriptText = "";
  let transcriptLang = "";
  if (videoId) {
    try {
      transcriptText = await fetchYouTubeTranscript(videoId);
      transcriptLang = "transcrição completa";
    } catch (err) {
      // Captions not available — fall back to page description
      try {
        const pageRes = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; SBC-Agora/1.0)" },
          signal: AbortSignal.timeout(12_000),
        });
        if (pageRes.ok) {
          const html = await pageRes.text();
          const og = /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/.exec(html)?.[1] ?? "";
          const meta = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/.exec(html)?.[1] ?? "";
          transcriptText = og.length >= meta.length ? og : meta;
          transcriptLang = "descrição do vídeo";
        }
      } catch { /* ignore */ }
    }
  }

  const context = transcriptLang === "transcrição completa"
    ? `Transcrição completa do vídeo do YouTube "${title}":\n\n${transcriptText}`
    : `Vídeo do YouTube: ${title}\n\n${transcriptText || "(sem transcrição disponível)"}`;

  return { title, text: context, imageUrl };
}

/** POST /api/admin/article-from-url — generate article from a URL */
router.post("/article-from-url", async (req, res) => {
  const { url, category, giveCredit } = req.body as {
    url?: string; category?: string; giveCredit?: boolean;
  };

  if (!url || !url.startsWith("http")) {
    res.status(400).json({ error: "URL inválida" });
    return;
  }

  const isYouTube = /youtube\.com|youtu\.be/.test(url);
  const settings  = store.getSettings();
  const diffbotKey = settings.diffbotApiKey;
  const outputPrompt = settings.rssAiOutputPrompt;

  try {
    let title = "";
    let text  = "";
    let imageUrl = "";
    let sourceName = "";

    if (isYouTube) {
      // Try Diffbot first for YouTube (extracts transcript/description better)
      if (diffbotKey) {
        const diffbot = await scrapeWithDiffbot(url, diffbotKey);
        if (diffbot && (diffbot.title || diffbot.text)) {
          title    = diffbot.title;
          text     = diffbot.text;
          imageUrl = diffbot.imageUrl;
        }
      }
      // Fallback to oEmbed + page scrape
      if (!title) {
        const yt = await scrapeYouTube(url);
        title    = title    || yt.title;
        text     = text     || yt.text;
        imageUrl = imageUrl || yt.imageUrl;
      }
      sourceName = "YouTube";
    } else {
      // Web article — try Diffbot first
      if (diffbotKey) {
        const diffbot = await scrapeWithDiffbot(url, diffbotKey);
        if (diffbot && (diffbot.title || diffbot.text)) {
          title    = diffbot.title;
          text     = diffbot.text;
          imageUrl = diffbot.imageUrl;
        }
      }
      // Fallback to cheerio scraping — also captures og:description for context
      let scrapedDescription = "";
      if (!text) {
        const scraped    = await scrapeArticle(url);
        text             = scraped.text;
        imageUrl         = imageUrl || scraped.imageUrl;
        scrapedDescription = scraped.description;
      }
      // Try og:title / og:image / og:description if still missing
      if (!title || !imageUrl || !scrapedDescription) {
        try {
          const pageRes = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; SBC-Agora/1.0)" },
            signal: AbortSignal.timeout(10_000),
          });
          if (pageRes.ok) {
            const html = await pageRes.text();
            if (!title) {
              const ogTitle   = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/.exec(html)?.[1] ??
                                /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/.exec(html)?.[1] ?? "";
              const metaTitle = /<title[^>]*>([^<]+)<\/title>/.exec(html)?.[1] ?? "";
              title = ogTitle || metaTitle;
            }
            if (!imageUrl) {
              imageUrl =
                /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/.exec(html)?.[1] ??
                /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/.exec(html)?.[1] ??
                /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/.exec(html)?.[1] ??
                /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/.exec(html)?.[1] ?? "";
            }
            if (!scrapedDescription) {
              scrapedDescription =
                /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/.exec(html)?.[1] ??
                /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/.exec(html)?.[1] ??
                /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/.exec(html)?.[1] ??
                /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/.exec(html)?.[1] ?? "";
            }
          }
        } catch { /* ignore */ }
      }
      try { sourceName = new URL(url).hostname.replace(/^www\./, ""); } catch { sourceName = "Web"; }

      // Always prepend og:description so the AI has the correct topic anchor even
      // when the article body was paywalled, JS-rendered, or partially extracted.
      // This prevents generating completely off-topic content.
      if (scrapedDescription && !text.includes(scrapedDescription.slice(0, 40))) {
        text = scrapedDescription + (text ? "\n\n" + text : "");
      }
    }

    if (!title && !text) {
      res.status(422).json({ error: "Não foi possível extrair conteúdo desta URL. Verifique se ela é acessível publicamente." });
      return;
    }

    // Generate article with AI (use custom output prompt if configured)
    const result = await rewriteWithAI(
      title || "Notícia sem título",
      text || title,
      sourceName,
      giveCredit ?? false,
      outputPrompt || undefined,
    );

    res.json({
      title:    result.title    || title,
      subtitle: result.subtitle || "",
      content:  result.content,
      keywords: result.keywords,
      slug:     result.slug,
      imageUrl,
      category: category ?? "geral",
      sourceUrl: url,
      sourceName,
    });
  } catch (err: unknown) {
    req.log.error({ err }, "article-from-url failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao gerar artigo" });
  }
});

/** POST /api/admin/ai-seo — generate meta description + keywords with Perplexity */
router.post("/ai-seo", authMiddleware, async (req, res) => {
  const { siteName, tagline, categories } = req.body as {
    siteName?: string; tagline?: string; categories?: string[];
  };

  const apiKey = process.env["PERPLEXITY_API_KEY"];
  if (!apiKey) {
    res.status(503).json({ error: "PERPLEXITY_API_KEY não configurada." });
    return;
  }

  const prompt = `Você é um especialista em SEO para portais de notícias brasileiros.
Gere uma meta descrição e palavras-chave otimizadas para o seguinte portal de notícias:

Nome: ${siteName ?? "Portal de notícias"}
Tagline: ${tagline ?? ""}
Editorias: ${(categories ?? []).join(", ") || "política, cidade, esportes, saúde, cultura, educação"}

Responda em JSON com exatamente este formato (sem markdown):
{
  "metaDescription": "descrição de até 155 caracteres, atraente e com palavras-chave relevantes",
  "keywords": "5 a 10 palavras-chave separadas por vírgula, relevantes para o portal"
}`;

  try {
    const r = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      }),
    });

    if (!r.ok) {
      res.status(502).json({ error: "Erro ao chamar Perplexity API." });
      return;
    }

    const data = await r.json() as { choices?: { message?: { content?: string } }[] };
    const raw = data.choices?.[0]?.message?.content ?? "";
    const jsonStr = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(jsonStr) as { metaDescription?: string; keywords?: string };
    res.json({ metaDescription: parsed.metaDescription ?? "", keywords: parsed.keywords ?? "" });
  } catch {
    res.status(500).json({ error: "Erro ao processar resposta da IA." });
  }
});

export default router;
