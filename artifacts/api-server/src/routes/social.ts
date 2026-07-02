import { Router } from "express";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { randomUUID } from "crypto";
import { authMiddleware } from "../middlewares/auth.js";
import { requirePermission, requirePermissionForWrites } from "../middlewares/permissions.js";
import { db } from "@workspace/db";
import {
  socialAccountsTable, socialTemplatesTable, socialPublicationQueueTable, articlesTable,
  socialConnectionsTable,
} from "@workspace/db";
import type { SocialConnectionRow } from "@workspace/db";
import { eq, desc, and, inArray, gte, ne } from "drizzle-orm";
import { store } from "../lib/store.js";
import type { SocialAutomation } from "../lib/store.js";
import { getTempImage, saveTempImage, getPublicBase, processSocialQueue } from "../lib/social/queueProcessor.js";
import { runAutomationCycle } from "../lib/social/autoScheduler.js";
import { buildArticleCaption } from "../lib/social/caption.js";
import { renderArt } from "../lib/social/renderTemplate.js";
import { encryptSecret, decryptSecret } from "../lib/crypto.js";
import type { TemplateElement, SocialTemplate, ArticleData } from "@workspace/social-template";

const router = Router();

// ── Public: temp image serving (accessed by Meta servers) ─────────────────────

router.get("/image/:token", (req, res) => {
  const token = req.params["token"] ?? "";
  const entry = getTempImage(token);
  if (!entry) {
    res.status(404).json({ error: "Not found or expired" });
    return;
  }
  if (!existsSync(entry.path)) {
    res.status(404).json({ error: "File missing" });
    return;
  }
  const buf = readFileSync(entry.path);
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "no-cache, no-store");
  res.send(buf);
});

// ── All routes below require authentication ───────────────────────────────────
router.use(authMiddleware);
// Leituras exigem social.view; alterações (config, contas, tokens, fila)
// exigem social.manage. Admins passam direto em ambos.
router.use(requirePermission("social.view"));
router.use(requirePermissionForWrites("social.manage"));

// ── Legacy config endpoints ────────────────────────────────────────────────────

function maskConfig(cfg: ReturnType<typeof store.getSocialConfig>) {
  const masked = { ...cfg };
  if (masked.pageAccessToken && masked.pageAccessToken.length > 10) {
    masked.pageAccessToken = masked.pageAccessToken.slice(0, 6) + "••••••••" + masked.pageAccessToken.slice(-4);
  }
  if (masked.metaAppSecret) masked.metaAppSecret = "••••••••";
  return masked;
}

router.get("/config", (_req, res) => {
  res.json(maskConfig(store.getSocialConfig()));
});

router.post("/config", (req, res) => {
  const body = req.body as Record<string, unknown>;
  if (typeof body["pageAccessToken"] === "string" && body["pageAccessToken"].includes("••")) {
    delete body["pageAccessToken"];
  }
  if (typeof body["metaAppSecret"] === "string" && body["metaAppSecret"].includes("••")) {
    delete body["metaAppSecret"];
  }
  const cfg = store.updateSocialConfig(body);
  res.json({ ok: true, config: maskConfig(cfg) });
});

// ── Legacy direct publish ─────────────────────────────────────────────────────

router.post("/publish/:articleId", async (req, res) => {
  const { imageBase64, caption, storyCaption, publishFeed, publishStory, publishFacebook } =
    req.body as {
      imageBase64?: string;
      storyImageBase64?: string;
      caption?: string;
      storyCaption?: string;
      publishFeed?: boolean;
      publishStory?: boolean;
      publishFacebook?: boolean;
    };

  const cfg = store.getSocialConfig();
  if (!cfg.pageAccessToken) { res.status(400).json({ error: "Page Access Token não configurado" }); return; }

  const base = getPublicBase();
  if (!base) { res.status(500).json({ error: "URL pública não disponível" }); return; }
  if (!imageBase64) { res.status(400).json({ error: "Imagem não enviada" }); return; }

  const b64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  const { token, path: imgPath } = saveTempImage(Buffer.from(b64, "base64"));
  const imageUrl = `${base}/api/admin/social/image/${token}`;
  const results: Record<string, unknown> = {};
  const igId = cfg.instagramUserId;
  const pageId = cfg.facebookPageId;
  const accessToken = cfg.pageAccessToken;

  try {
    if (publishFeed && igId) {
      try {
        const cRes = await fetch(`https://graph.facebook.com/v20.0/${igId}/media`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_url: imageUrl, caption: caption ?? "", access_token: accessToken }),
        });
        const c = (await cRes.json()) as { id?: string; error?: { message: string } };
        if (c.error) throw new Error(c.error.message);
        await new Promise((r) => setTimeout(r, 3000));
        const pRes = await fetch(`https://graph.facebook.com/v20.0/${igId}/media_publish`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creation_id: c.id, access_token: accessToken }),
        });
        const p = (await pRes.json()) as { id?: string; error?: { message: string } };
        if (p.error) throw new Error(p.error.message);
        results["instagram_feed"] = { ok: true, id: p.id };
      } catch (e) { results["instagram_feed"] = { ok: false, error: (e as Error).message }; }
    }
    if (publishStory && igId) {
      try {
        const cRes = await fetch(`https://graph.facebook.com/v20.0/${igId}/media`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_url: imageUrl, media_type: "STORIES", access_token: accessToken }),
        });
        const c = (await cRes.json()) as { id?: string; error?: { message: string } };
        if (c.error) throw new Error(c.error.message);
        await new Promise((r) => setTimeout(r, 3000));
        const pRes = await fetch(`https://graph.facebook.com/v20.0/${igId}/media_publish`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creation_id: c.id, access_token: accessToken }),
        });
        const p = (await pRes.json()) as { id?: string; error?: { message: string } };
        if (p.error) throw new Error(p.error.message);
        results["instagram_story"] = { ok: true, id: p.id };
      } catch (e) { results["instagram_story"] = { ok: false, error: (e as Error).message }; }
    }
    if (publishFacebook && pageId) {
      try {
        const fRes = await fetch(`https://graph.facebook.com/v20.0/${pageId}/photos`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: imageUrl, caption: caption ?? "", access_token: accessToken }),
        });
        const f = (await fRes.json()) as { id?: string; error?: { message: string } };
        if (f.error) throw new Error(f.error.message);
        results["facebook"] = { ok: true, id: f.id };
      } catch (e) { results["facebook"] = { ok: false, error: (e as Error).message }; }
    }
    store.updateSocialConfig({ lastPublishedAt: new Date().toISOString() });
    res.json({ ok: true, results });
  } finally {
    setTimeout(() => { try { unlinkSync(imgPath); } catch {} }, 5 * 60 * 1000);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ACCOUNTS — /api/admin/social/accounts
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/accounts", async (_req, res) => {
  const rows = await db.select().from(socialAccountsTable).orderBy(desc(socialAccountsTable.createdAt));
  res.json(rows.map((r) => maskAccount(r)));
});

router.post("/accounts", async (req, res) => {
  const b = req.body as Record<string, string>;
  const row = await db.insert(socialAccountsTable).values({
    id:             randomUUID(),
    name:           b["name"] ?? "Nova Conta",
    metaAppId:      b["metaAppId"] || null,
    metaAppSecret:  b["metaAppSecret"] ? encryptSecret(b["metaAppSecret"]) : null,
    pageId:         b["pageId"] || null,
    pageName:       b["pageName"] || null,
    instagramId:    b["instagramId"] || null,
    instagramName:  b["instagramName"] || null,
    accessToken:    b["accessToken"] ? encryptSecret(b["accessToken"]) : null,
    isActive:       true,
  }).returning();
  res.json(maskAccount(row[0]!));
});

router.put("/accounts/:id", async (req, res) => {
  const b = req.body as Record<string, string | boolean>;
  // Drizzle `.set()` mapeia por nome de propriedade JS (camelCase), não pelo nome
  // da coluna no banco — por isso usamos as chaves camelCase do schema aqui.
  const updates: Partial<typeof socialAccountsTable.$inferInsert> = {};
  if (typeof b["name"]          === "string")  updates.name          = b["name"];
  if (typeof b["metaAppId"]     === "string")  updates.metaAppId     = b["metaAppId"]     || null;
  if (typeof b["pageId"]        === "string")  updates.pageId        = b["pageId"]        || null;
  if (typeof b["pageName"]      === "string")  updates.pageName      = b["pageName"]      || null;
  if (typeof b["instagramId"]   === "string")  updates.instagramId   = b["instagramId"]   || null;
  if (typeof b["instagramName"] === "string")  updates.instagramName = b["instagramName"] || null;
  if (typeof b["isActive"]      === "boolean") updates.isActive      = b["isActive"];
  // Segredos: só regrava quando enviado sem máscara (evita salvar "••••••••").
  if (typeof b["metaAppSecret"] === "string" && b["metaAppSecret"] && !b["metaAppSecret"].includes("••")) {
    updates.metaAppSecret = encryptSecret(b["metaAppSecret"]);
  }
  if (typeof b["accessToken"] === "string" && b["accessToken"] && !b["accessToken"].includes("••")) {
    updates.accessToken = encryptSecret(b["accessToken"]);
  }
  if (Object.keys(updates).length > 0) {
    await db.update(socialAccountsTable).set(updates).where(eq(socialAccountsTable.id, req.params["id"]!));
  }
  const [row] = await db.select().from(socialAccountsTable).where(eq(socialAccountsTable.id, req.params["id"]!)).limit(1);
  res.json(row ? maskAccount(row) : { error: "Not found" });
});

router.delete("/accounts/:id", async (req, res) => {
  await db.delete(socialAccountsTable).where(eq(socialAccountsTable.id, req.params["id"]!));
  res.json({ ok: true });
});

router.post("/accounts/:id/test", async (req, res) => {
  const [account] = await db.select().from(socialAccountsTable).where(eq(socialAccountsTable.id, req.params["id"]!)).limit(1);
  if (!account?.accessToken) { res.status(400).json({ ok: false, error: "Conta ou token não encontrado" }); return; }
  try {
    const testRes = await fetch(
      `https://graph.facebook.com/v20.0/me?access_token=${decryptSecret(account.accessToken)}`,
      { signal: AbortSignal.timeout(10000) },
    );
    const data = (await testRes.json()) as { name?: string; id?: string; error?: { message: string } };
    if (data.error) { res.json({ ok: false, error: data.error.message }); return; }
    res.json({ ok: true, name: data.name, id: data.id });
  } catch (e) {
    res.json({ ok: false, error: (e as Error).message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATES — /api/admin/social/templates
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/templates", async (_req, res) => {
  const rows = await db.select().from(socialTemplatesTable).orderBy(desc(socialTemplatesTable.updatedAt));
  res.json(rows);
});

router.get("/templates/:id", async (req, res) => {
  const [row] = await db.select().from(socialTemplatesTable).where(eq(socialTemplatesTable.id, req.params["id"]!)).limit(1);
  row ? res.json(row) : res.status(404).json({ error: "Not found" });
});

router.post("/templates", async (req, res) => {
  const b = req.body as Partial<SocialTemplate> & { name?: string; type?: string };
  const [row] = await db.insert(socialTemplatesTable).values({
    id:              randomUUID(),
    name:            b.name ?? "Novo Template",
    type:            b.type === "story" ? "story" : "feed",
    width:           b.width  ?? 1080,
    height:          b.height ?? (b.type === "story" ? 1920 : 1350),
    backgroundColor: b.backgroundColor ?? "#1a1a1a",
    elements:        (b.elements ?? []) as unknown as Record<string, unknown>[],
  }).returning();
  res.json(row);
});

router.put("/templates/:id", async (req, res) => {
  const b = req.body as Partial<SocialTemplate> & { name?: string; type?: string };
  const updates: Record<string, unknown> = { updated_at: new Date() };
  if (b.name            !== undefined) updates["name"]             = b.name;
  if (b.type            !== undefined) updates["type"]             = b.type;
  if (b.width           !== undefined) updates["width"]            = b.width;
  if (b.height          !== undefined) updates["height"]           = b.height;
  if (b.backgroundColor !== undefined) updates["background_color"] = b.backgroundColor;
  if (b.elements        !== undefined) updates["elements"]         = b.elements as unknown as Record<string, unknown>[];
  await db.update(socialTemplatesTable).set(updates).where(eq(socialTemplatesTable.id, req.params["id"]!));
  const [row] = await db.select().from(socialTemplatesTable).where(eq(socialTemplatesTable.id, req.params["id"]!)).limit(1);
  res.json(row ?? { error: "Not found" });
});

router.delete("/templates/:id", async (req, res) => {
  await db.delete(socialTemplatesTable).where(eq(socialTemplatesTable.id, req.params["id"]!));
  res.json({ ok: true });
});

// Preview generation for a template + article combo.
// Aceita um `template` inline (ainda não salvo) OU usa o template salvo por :id.
router.post("/templates/:id/preview", async (req, res) => {
  const b = req.body as { articleId?: string; template?: Partial<SocialTemplate> };

  let tmpl: { width: number; height: number; backgroundColor: string; elements: TemplateElement[] };
  if (b.template && Array.isArray(b.template.elements)) {
    tmpl = {
      width: b.template.width ?? 1080,
      height: b.template.height ?? 1350,
      backgroundColor: b.template.backgroundColor ?? "#1a1a1a",
      elements: b.template.elements as TemplateElement[],
    };
  } else {
    const [row] = await db.select().from(socialTemplatesTable).where(eq(socialTemplatesTable.id, req.params["id"]!)).limit(1);
    if (!row) { res.status(404).json({ error: "Template não encontrado" }); return; }
    tmpl = {
      width: row.width,
      height: row.height,
      backgroundColor: row.backgroundColor,
      elements: (row.elements as unknown[]) as TemplateElement[],
    };
  }

  let article: ArticleData = { title: "Título de exemplo para visualização do template", category: "Geral" };
  if (b.articleId) {
    const [a] = await db.select().from(articlesTable).where(eq(articlesTable.id, b.articleId)).limit(1);
    if (a) {
      article = {
        // Preview usa o mesmo título compacto da publicação real (WYSIWYG).
        title: a.socialTitle || a.title,
        category: a.category,
        subtitle: a.subtitle || undefined,
        author: a.author || undefined,
        imageUrl: a.imageUrl || undefined,
        publishedAt: a.publishedAt ? a.publishedAt.toISOString() : undefined,
      };
    }
  }

  try {
    const buf = await renderArt(tmpl, article, { baseHref: getPublicBase() ?? undefined });
    const { token } = saveTempImage(buf);
    // URL relativa: o preview é consumido pelo navegador do admin (mesma origem),
    // não pela Meta. Usar APP_URL aqui quebraria o preview ao testar fora de prod.
    res.json({ url: `/api/admin/social/image/${token}` });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// QUEUE — /api/admin/social/queue
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/queue", async (req, res) => {
  const { status, type } = req.query as Record<string, string>;
  const conditions = [];
  if (status && status !== "all") conditions.push(eq(socialPublicationQueueTable.status, status));
  if (type   && type   !== "all") conditions.push(eq(socialPublicationQueueTable.type,   type));

  const rows = await db
    .select({
      id:             socialPublicationQueueTable.id,
      articleId:      socialPublicationQueueTable.articleId,
      articleTitle:   articlesTable.title,
      socialAccountId: socialPublicationQueueTable.socialAccountId,
      accountName:    socialAccountsTable.name,
      templateId:     socialPublicationQueueTable.templateId,
      type:           socialPublicationQueueTable.type,
      status:         socialPublicationQueueTable.status,
      caption:        socialPublicationQueueTable.caption,
      scheduledAt:    socialPublicationQueueTable.scheduledAt,
      publishedAt:    socialPublicationQueueTable.publishedAt,
      metaPostId:     socialPublicationQueueTable.metaPostId,
      errorMessage:   socialPublicationQueueTable.errorMessage,
      retryCount:     socialPublicationQueueTable.retryCount,
      createdAt:      socialPublicationQueueTable.createdAt,
    })
    .from(socialPublicationQueueTable)
    .leftJoin(articlesTable,      eq(socialPublicationQueueTable.articleId,      articlesTable.id))
    .leftJoin(socialAccountsTable, eq(socialPublicationQueueTable.socialAccountId, socialAccountsTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(socialPublicationQueueTable.createdAt))
    .limit(100);

  res.json(rows);
});

router.post("/queue", async (req, res) => {
  const b = req.body as {
    articleId: string;
    accountIds: string[];
    templateFeedId?: string;
    templateStoryId?: string;
    caption?: string;
    scheduledAt?: string;
    types?: string[];
  };
  if (!b.articleId || !b.accountIds?.length) {
    res.status(400).json({ error: "articleId e accountIds são obrigatórios" });
    return;
  }
  const scheduledAt = b.scheduledAt ? new Date(b.scheduledAt) : new Date();
  const types = b.types?.length ? b.types : ["feed"];

  // Legenda: se o cliente não mandou (ou mandou vazia), o SERVIDOR monta a partir
  // do template + dados do artigo — garante resumo/link/hashtags e evita posts
  // incompletos vindos de qualquer tela.
  let caption = b.caption?.trim() ? b.caption : null;
  if (!caption) {
    const [article] = await db.select().from(articlesTable).where(eq(articlesTable.id, b.articleId)).limit(1);
    if (article) caption = buildArticleCaption(article, store.getSocialConfig().captionTemplate ?? "", getPublicBase());
  }

  const inserted = [];
  for (const accountId of b.accountIds) {
    for (const type of types) {
      const templateId = type === "story" ? (b.templateStoryId ?? b.templateFeedId ?? null) : (b.templateFeedId ?? null);
      const [row] = await db.insert(socialPublicationQueueTable).values({
        id: randomUUID(),
        articleId: b.articleId,
        socialAccountId: accountId,
        templateId,
        type,
        status: "pending",
        caption: caption ?? null,
        scheduledAt,
      }).returning();
      inserted.push(row);
    }
  }
  res.json({ ok: true, count: inserted.length, items: inserted });
});

router.delete("/queue/:id", async (req, res) => {
  await db.delete(socialPublicationQueueTable).where(eq(socialPublicationQueueTable.id, req.params["id"]!));
  res.json({ ok: true });
});

router.post("/queue/:id/retry", async (req, res) => {
  await db
    .update(socialPublicationQueueTable)
    .set({ status: "pending", errorMessage: null, retryCount: 0 })
    .where(eq(socialPublicationQueueTable.id, req.params["id"]!));
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLISH — /api/admin/social/process
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/process", async (_req, res) => {
  try {
    const count = await processSocialQueue(5);
    res.json({ ok: true, processed: count });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUTOMATION — /api/admin/social/automation  (robô de postagem no Instagram)
// Config guardada em social_config.automation; o motor de publish é a fila.
// ═══════════════════════════════════════════════════════════════════════════════

const AUTOMATION_DEFAULTS: SocialAutomation = {
  enabled: false,
  intervalMinutes: 120,
  maxPerRun: 3,
  spacingMinutes: 5,
  accountIds: [],
  templateIds: [],
  types: ["feed"],
  onlyWithImage: true,
};

function currentAutomation(): SocialAutomation {
  return { ...AUTOMATION_DEFAULTS, ...(store.getSocialConfig().automation ?? {}) };
}

function nextRunAt(auto: SocialAutomation): string | null {
  if (!auto.enabled) return null;
  const base = auto.lastRunAt ? new Date(auto.lastRunAt).getTime() : Date.now();
  return new Date(base + Math.max(1, auto.intervalMinutes) * 60 * 1000).toISOString();
}

router.get("/automation", (_req, res) => {
  const auto = currentAutomation();
  res.json({ ...auto, nextRunAt: nextRunAt(auto) });
});

router.put("/automation", (req, res) => {
  const b = req.body as Partial<SocialAutomation>;
  const prev = currentAutomation();

  const next: SocialAutomation = {
    ...prev,
    enabled:       typeof b.enabled       === "boolean" ? b.enabled       : prev.enabled,
    intervalMinutes: typeof b.intervalMinutes === "number" ? Math.max(1, b.intervalMinutes) : prev.intervalMinutes,
    maxPerRun:     typeof b.maxPerRun     === "number"  ? Math.max(1, b.maxPerRun)  : prev.maxPerRun,
    spacingMinutes: typeof b.spacingMinutes === "number" ? Math.max(0, b.spacingMinutes) : prev.spacingMinutes,
    accountIds:    Array.isArray(b.accountIds)  ? b.accountIds.map(String)  : prev.accountIds,
    templateIds:   Array.isArray(b.templateIds) ? b.templateIds.map(String) : prev.templateIds,
    types:         Array.isArray(b.types) && b.types.length
                     ? (b.types.filter((t) => t === "feed" || t === "story") as ("feed" | "story")[])
                     : prev.types,
    onlyWithImage: typeof b.onlyWithImage === "boolean" ? b.onlyWithImage : prev.onlyWithImage,
    minAgeMinutes: typeof b.minAgeMinutes === "number"  ? Math.max(0, b.minAgeMinutes) : prev.minAgeMinutes,
  };

  // Marca d'água: ao LIGAR sem enabledAt, ancora "agora" para não postar o acervo.
  if (next.enabled && !prev.enabled && !next.enabledAt) {
    next.enabledAt = new Date().toISOString();
  }

  store.updateSocialConfig({ automation: next });
  res.json({ ok: true, automation: { ...next, nextRunAt: nextRunAt(next) } });
});

router.post("/automation/run", async (req, res) => {
  const b = req.body as { backfillHours?: number };
  try {
    const result = await runAutomationCycle({
      force: true,
      backfillHours: typeof b?.backfillHours === "number" ? b.backfillHours : undefined,
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get("/automation/preview", async (req, res) => {
  const auto = currentAutomation();
  const backfillHours = Number((req.query as Record<string, string>)["backfillHours"] ?? 0);
  const now = new Date();
  const cutoff = backfillHours > 0
    ? new Date(now.getTime() - backfillHours * 3600 * 1000)
    : (auto.enabledAt ? new Date(auto.enabledAt) : now);

  const conds = [
    eq(articlesTable.status, "published"),
    gte(articlesTable.publishedAt, cutoff),
  ];
  if (auto.onlyWithImage !== false) conds.push(ne(articlesTable.imageUrl, ""));

  const rows = await db
    .select({
      id:          articlesTable.id,
      title:       articlesTable.title,
      category:    articlesTable.category,
      publishedAt: articlesTable.publishedAt,
    })
    .from(articlesTable)
    .where(and(...conds))
    .orderBy(desc(articlesTable.publishedAt))
    .limit(Math.max(1, auto.maxPerRun) * 3);

  res.json({ articles: rows, cutoff: cutoff.toISOString() });
});

// Prévia da legenda resolvida de um artigo com o template atual (para o
// compositor manual pré-preencher exatamente o que será publicado).
router.get("/caption-preview", async (req, res) => {
  const articleId = String((req.query as Record<string, string>)["articleId"] ?? "");
  if (!articleId) { res.status(400).json({ error: "articleId é obrigatório" }); return; }
  const [article] = await db.select().from(articlesTable).where(eq(articlesTable.id, articleId)).limit(1);
  if (!article) { res.status(404).json({ error: "Artigo não encontrado" }); return; }
  const caption = buildArticleCaption(article, store.getSocialConfig().captionTemplate ?? "", getPublicBase());
  res.json({ caption });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONNECTIONS — /api/admin/social/connections  (WordPress, Site Externo, …)
// A Meta continua em /accounts (fila lê social_accounts).
// ═══════════════════════════════════════════════════════════════════════════════

const CONNECTION_PLATFORMS = ["wordpress", "site_externo", "blogger"] as const;

router.get("/connections", async (_req, res) => {
  const rows = await db.select().from(socialConnectionsTable).orderBy(desc(socialConnectionsTable.createdAt));
  res.json(rows.map(maskConnection));
});

router.post("/connections", async (req, res) => {
  const b = req.body as Record<string, unknown>;
  const platform = String(b["platform"] ?? "");
  if (!CONNECTION_PLATFORMS.includes(platform as (typeof CONNECTION_PLATFORMS)[number])) {
    res.status(400).json({ error: "platform inválido" });
    return;
  }
  const secret = typeof b["secret"] === "string" && b["secret"] && !b["secret"].includes("••")
    ? encryptSecret(b["secret"])
    : null;
  const [row] = await db.insert(socialConnectionsTable).values({
    id:          randomUUID(),
    platform,
    name:        String(b["name"] || defaultConnectionName(platform)),
    siteUrl:     typeof b["siteUrl"]  === "string" ? b["siteUrl"]  : null,
    username:    typeof b["username"] === "string" ? b["username"] : null,
    secretEnc:   secret,
    config:      b["config"] != null ? JSON.stringify(b["config"]) : null,
    autoPublish: Boolean(b["autoPublish"]),
  }).returning();
  res.json(maskConnection(row!));
});

router.put("/connections/:id", async (req, res) => {
  const b = req.body as Record<string, unknown>;
  const updates: Partial<typeof socialConnectionsTable.$inferInsert> = { updatedAt: new Date() };
  if (typeof b["name"]     === "string")  updates.name     = b["name"];
  if (typeof b["siteUrl"]  === "string")  updates.siteUrl  = b["siteUrl"]  || null;
  if (typeof b["username"] === "string")  updates.username = b["username"] || null;
  if (typeof b["autoPublish"] === "boolean") updates.autoPublish = b["autoPublish"];
  if (typeof b["isActive"]    === "boolean") updates.isActive    = b["isActive"];
  if (b["config"] !== undefined) updates.config = b["config"] != null ? JSON.stringify(b["config"]) : null;
  if (typeof b["secret"] === "string" && b["secret"] && !b["secret"].includes("••")) {
    updates.secretEnc = encryptSecret(b["secret"]);
  }
  await db.update(socialConnectionsTable).set(updates).where(eq(socialConnectionsTable.id, req.params["id"]!));
  const [row] = await db.select().from(socialConnectionsTable).where(eq(socialConnectionsTable.id, req.params["id"]!)).limit(1);
  res.json(row ? maskConnection(row) : { error: "Not found" });
});

router.delete("/connections/:id", async (req, res) => {
  await db.delete(socialConnectionsTable).where(eq(socialConnectionsTable.id, req.params["id"]!));
  res.json({ ok: true });
});

router.post("/connections/:id/test", async (req, res) => {
  const [conn] = await db.select().from(socialConnectionsTable).where(eq(socialConnectionsTable.id, req.params["id"]!)).limit(1);
  if (!conn) { res.status(404).json({ ok: false, error: "Conexão não encontrada" }); return; }
  const result = await testConnection(conn);
  await db.update(socialConnectionsTable).set({
    status:     result.ok ? "online" : "error",
    lastTestAt: new Date(),
    lastError:  result.ok ? null : (result.error ?? null),
    updatedAt:  new Date(),
  }).where(eq(socialConnectionsTable.id, conn.id));
  res.json(result);
});

// ═══════════════════════════════════════════════════════════════════════════════
// META OAUTH — /api/admin/social/meta/*
// ═══════════════════════════════════════════════════════════════════════════════

const META_GRAPH  = "https://graph.facebook.com/v20.0";
const META_DIALOG = "https://www.facebook.com/v20.0/dialog/oauth";
const META_SCOPES = [
  "pages_show_list", "pages_read_engagement", "pages_manage_posts",
  "instagram_basic", "instagram_content_publish", "business_management",
];

// state anti-CSRF do OAuth + tokens de página temporários (memória, com expiração).
const metaStates     = new Map<string, number>();
const metaOauthCache = new Map<string, { expires: number; pages: MetaPage[] }>();

interface MetaPage {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string; username?: string };
}

function metaRedirectUri(): string {
  const base = getPublicBase();
  return base ? `${base}/meta-auth-complete.html` : "";
}

// App Meta (App ID/Secret globais) — nunca devolve o secret em texto.
router.get("/meta/app", (_req, res) => {
  const cfg = store.getSocialConfig();
  res.json({
    appId:       cfg.metaAppId ?? "",
    hasSecret:   !!cfg.metaAppSecret,
    redirectUri: metaRedirectUri(),
    scopes:      META_SCOPES,
  });
});

router.post("/meta/app", (req, res) => {
  const b = req.body as { appId?: string; appSecret?: string };
  const updates: { metaAppId?: string; metaAppSecret?: string } = {};
  if (typeof b.appId === "string") updates.metaAppId = b.appId.trim();
  if (typeof b.appSecret === "string" && b.appSecret && !b.appSecret.includes("••")) {
    updates.metaAppSecret = b.appSecret;
  }
  store.updateSocialConfig(updates);
  const cfg = store.getSocialConfig();
  res.json({ ok: true, appId: cfg.metaAppId ?? "", hasSecret: !!cfg.metaAppSecret, redirectUri: metaRedirectUri() });
});

router.get("/meta/oauth/start", (_req, res) => {
  const cfg = store.getSocialConfig();
  if (!cfg.metaAppId) { res.status(400).json({ error: "Configure o App ID da Meta primeiro." }); return; }
  const redirectUri = metaRedirectUri();
  if (!redirectUri.startsWith("http")) {
    res.status(500).json({ error: "URL pública (APP_URL) não configurada no servidor." });
    return;
  }
  const state = randomUUID();
  metaStates.set(state, Date.now() + 10 * 60 * 1000);
  const params = new URLSearchParams({
    client_id:     cfg.metaAppId,
    redirect_uri:  redirectUri,
    state,
    response_type: "code",
    scope:         META_SCOPES.join(","),
  });
  res.json({ url: `${META_DIALOG}?${params.toString()}`, state });
});

router.post("/meta/oauth/exchange", async (req, res) => {
  const { code, state } = req.body as { code?: string; state?: string };
  if (!code) { res.status(400).json({ error: "code ausente" }); return; }
  const exp = state ? metaStates.get(state) : undefined;
  if (!state || !exp || exp < Date.now()) { res.status(400).json({ error: "Sessão OAuth inválida ou expirada." }); return; }
  metaStates.delete(state);

  const cfg = store.getSocialConfig();
  if (!cfg.metaAppId || !cfg.metaAppSecret) { res.status(400).json({ error: "App Meta (ID/Secret) não configurado." }); return; }
  const redirectUri = metaRedirectUri();

  try {
    // 1. code → token curto
    const shortRes = await fetch(`${META_GRAPH}/oauth/access_token?` + new URLSearchParams({
      client_id: cfg.metaAppId, client_secret: cfg.metaAppSecret, redirect_uri: redirectUri, code,
    }), { signal: AbortSignal.timeout(15000) });
    const short = (await shortRes.json()) as { access_token?: string; error?: { message: string } };
    if (short.error) throw new Error(short.error.message);
    let userToken = short.access_token ?? "";

    // 2. token curto → token de longa duração
    const longRes = await fetch(`${META_GRAPH}/oauth/access_token?` + new URLSearchParams({
      grant_type: "fb_exchange_token", client_id: cfg.metaAppId, client_secret: cfg.metaAppSecret, fb_exchange_token: userToken,
    }), { signal: AbortSignal.timeout(15000) });
    const long = (await longRes.json()) as { access_token?: string };
    if (long.access_token) userToken = long.access_token;

    // 3. lista de Páginas (+ Instagram Business vinculado)
    const pagesRes = await fetch(
      `${META_GRAPH}/me/accounts?fields=name,id,access_token,instagram_business_account{id,username}&access_token=${userToken}`,
      { signal: AbortSignal.timeout(15000) },
    );
    const pages = (await pagesRes.json()) as { data?: MetaPage[]; error?: { message: string } };
    if (pages.error) throw new Error(pages.error.message);

    const list = pages.data ?? [];
    const sessionId = randomUUID();
    metaOauthCache.set(sessionId, { expires: Date.now() + 10 * 60 * 1000, pages: list });

    res.json({
      sessionId,
      pages: list.map((p) => ({
        id: p.id, name: p.name,
        instagramId:   p.instagram_business_account?.id ?? null,
        instagramName: p.instagram_business_account?.username ?? null,
      })),
    });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post("/meta/oauth/save", async (req, res) => {
  const { sessionId, pageIds } = req.body as { sessionId?: string; pageIds?: string[] };
  const sess = sessionId ? metaOauthCache.get(sessionId) : undefined;
  if (!sess || sess.expires < Date.now()) {
    if (sessionId) metaOauthCache.delete(sessionId);
    res.status(400).json({ error: "Sessão OAuth expirada — refaça a conexão." });
    return;
  }
  const chosen = pageIds?.length ? sess.pages.filter((p) => pageIds.includes(p.id)) : sess.pages;
  const appId = store.getSocialConfig().metaAppId ?? null;
  let count = 0;
  for (const p of chosen) {
    const values = {
      name:          p.name,
      metaAppId:     appId,
      pageId:        p.id,
      pageName:      p.name,
      instagramId:   p.instagram_business_account?.id ?? null,
      instagramName: p.instagram_business_account?.username ?? null,
      accessToken:   encryptSecret(p.access_token),
      isActive:      true,
    };
    const [existing] = await db.select().from(socialAccountsTable).where(eq(socialAccountsTable.pageId, p.id)).limit(1);
    if (existing) {
      await db.update(socialAccountsTable).set(values).where(eq(socialAccountsTable.id, existing.id));
    } else {
      await db.insert(socialAccountsTable).values({ id: randomUUID(), ...values });
    }
    count++;
  }
  metaOauthCache.delete(sessionId!);
  res.json({ ok: true, count });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function defaultConnectionName(platform: string): string {
  return platform === "wordpress" ? "WordPress"
    : platform === "site_externo" ? "Site Externo"
    : platform === "blogger" ? "Blogger"
    : "Conexão";
}

function maskConnection(row: SocialConnectionRow) {
  return {
    id:          row.id,
    platform:    row.platform,
    name:        row.name,
    siteUrl:     row.siteUrl,
    username:    row.username,
    hasSecret:   !!row.secretEnc,
    secret:      row.secretEnc ? "••••••••" : null,
    config:      row.config ? safeJsonParse(row.config) : null,
    autoPublish: row.autoPublish,
    status:      row.status,
    lastTestAt:  row.lastTestAt,
    lastError:   row.lastError,
    isActive:    row.isActive,
    createdAt:   row.createdAt,
    updatedAt:   row.updatedAt,
  };
}

function safeJsonParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

/** Teste de comunicação por plataforma. Atualiza status no chamador. */
async function testConnection(conn: SocialConnectionRow): Promise<{ ok: boolean; error?: string; info?: unknown }> {
  const secret = conn.secretEnc ? decryptSecret(conn.secretEnc) : "";
  const url = (conn.siteUrl ?? "").replace(/\/+$/, "");
  if (!url) return { ok: false, error: "URL não configurada." };

  try {
    if (conn.platform === "wordpress") {
      if (!conn.username || !secret) return { ok: false, error: "Usuário e Application Password são obrigatórios." };
      const auth = Buffer.from(`${conn.username}:${secret}`).toString("base64");
      const r = await fetch(`${url}/wp-json/wp/v2/users/me?context=edit`, {
        headers: { Authorization: `Basic ${auth}` },
        signal: AbortSignal.timeout(12000),
      });
      if (r.status === 401) return { ok: false, error: "401 — credenciais inválidas ou firewall bloqueando Basic Auth." };
      if (r.status === 403) return { ok: false, error: "403 — usuário sem permissão de publicar (precisa ser Admin/Editor)." };
      if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
      const data = (await r.json()) as { name?: string; id?: number; capabilities?: Record<string, boolean> };
      if (data.capabilities && data.capabilities["publish_posts"] === false) {
        return { ok: false, error: "Usuário conectado não pode publicar posts." };
      }
      return { ok: true, info: { name: data.name, id: data.id } };
    }

    if (conn.platform === "site_externo") {
      const cfg = conn.config ? (safeJsonParse(conn.config) as { headers?: Record<string, string> } | null) : null;
      const headers: Record<string, string> = { ...(cfg?.headers ?? {}) };
      if (secret && !headers["Authorization"]) headers["Authorization"] = `Bearer ${secret}`;
      const r = await fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(12000) });
      if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
      return { ok: true };
    }

    return { ok: false, error: "Teste não implementado para esta plataforma." };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function maskAccount(row: typeof socialAccountsTable.$inferSelect) {
  // Tokens ficam criptografados at-rest; nunca devolver o valor real ao cliente.
  return {
    ...row,
    accessToken:   row.accessToken   ? "••••••••" : null,
    metaAppSecret: row.metaAppSecret ? "••••••••" : null,
  };
}

export default router;
