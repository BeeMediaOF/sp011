import { Router } from "express";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { randomUUID } from "crypto";
import { authMiddleware } from "../middlewares/auth.js";
import { db } from "@workspace/db";
import {
  socialAccountsTable, socialTemplatesTable, socialPublicationQueueTable, articlesTable,
} from "@workspace/db";
import { eq, desc, and, inArray } from "drizzle-orm";
import { store } from "../lib/store.js";
import { getTempImage, saveTempImage, getPublicBase, processSocialQueue } from "../lib/social/queueProcessor.js";
import { renderArt } from "../lib/social/renderTemplate.js";
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

// ── Legacy config endpoints ────────────────────────────────────────────────────

router.get("/config", (_req, res) => {
  const cfg = store.getSocialConfig();
  const masked = { ...cfg };
  if (masked.pageAccessToken && masked.pageAccessToken.length > 10) {
    masked.pageAccessToken = masked.pageAccessToken.slice(0, 6) + "••••••••" + masked.pageAccessToken.slice(-4);
  }
  res.json(masked);
});

router.post("/config", (req, res) => {
  const body = req.body as Record<string, unknown>;
  if (typeof body["pageAccessToken"] === "string" && body["pageAccessToken"].includes("••")) {
    delete body["pageAccessToken"];
  }
  const cfg = store.updateSocialConfig(body);
  const masked = { ...cfg };
  if (masked.pageAccessToken && masked.pageAccessToken.length > 10) {
    masked.pageAccessToken = masked.pageAccessToken.slice(0, 6) + "••••••••" + masked.pageAccessToken.slice(-4);
  }
  res.json({ ok: true, config: masked });
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
    metaAppSecret:  b["metaAppSecret"] || null,
    pageId:         b["pageId"] || null,
    pageName:       b["pageName"] || null,
    instagramId:    b["instagramId"] || null,
    instagramName:  b["instagramName"] || null,
    accessToken:    b["accessToken"] || null,
    isActive:       true,
  }).returning();
  res.json(maskAccount(row[0]!));
});

router.put("/accounts/:id", async (req, res) => {
  const b = req.body as Record<string, string | boolean>;
  const updates: Record<string, unknown> = {};
  const fields = ["name","metaAppId","metaAppSecret","pageId","pageName","instagramId","instagramName","isActive"] as const;
  for (const f of fields) if (f in b) updates[snakeCase(f)] = b[f];
  if ("accessToken" in b && typeof b["accessToken"] === "string" && !b["accessToken"].includes("••")) {
    updates["access_token"] = b["accessToken"];
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
      `https://graph.facebook.com/v20.0/me?access_token=${account.accessToken}`,
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
        title: a.title,
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
        caption: b.caption ?? null,
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function maskAccount(row: typeof socialAccountsTable.$inferSelect) {
  return {
    ...row,
    accessToken: row.accessToken
      ? row.accessToken.slice(0, 6) + "••••••••" + row.accessToken.slice(-4)
      : null,
    metaAppSecret: row.metaAppSecret ? "••••••••" : null,
  };
}

function snakeCase(s: string): string {
  return s.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`);
}

export default router;
