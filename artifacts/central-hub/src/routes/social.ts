/**
 * Rotas da Automação Social (vídeos TikTok/Instagram → blogs da rede).
 *
 * ORDEM CRÍTICA: GET /video-file/:name é PÚBLICA (Meta e Buffer baixam o mp4
 * por URL) e está registrada ANTES do authMiddleware — nome de arquivo
 * não-adivinhável + validação estrita fazem o controle de acesso.
 */
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import {
  db,
  blogsTable,
  blogSocialAccountsTable,
  socialVideosTable,
  aiUsageEventsTable,
} from "@workspace/central-db";
import { and, desc, eq, inArray, type SQL } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "@workspace/news-engine";
import { authMiddleware } from "../middlewares/auth.js";
import { getSettings, type HubSettings } from "../lib/store.js";
import { getGeminiPool } from "../lib/aiPool.js";
import { logEvent } from "../lib/eventLog.js";
import { detectPlatform } from "../lib/social/apify.js";
import { buildCaption, buildCaptionPrompt, parseCaptionOutput } from "../lib/social/caption.js";
import { isValidVideoFileName, videoDir } from "../lib/social/videoFiles.js";
import { centralPublicUrl, publicVideoUrl } from "../lib/social/publicUrl.js";
import { kickVideoQueue } from "../services/videoDownloader.js";

const router = Router();

// ─── Rota PÚBLICA do arquivo (antes do auth) ─────────────────────────────────

router.get("/video-file/:name", (req, res) => {
  const name = req.params.name;
  if (!isValidVideoFileName(name)) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.sendFile(name, {
    root: videoDir(),
    headers: { "Cache-Control": "private, max-age=3600" },
  }, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "not_found" });
  });
});

router.use(authMiddleware);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VALID_TARGETS = ["instagram", "tiktok"] as const;

function normalizeTargets(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set<string>();
  for (const t of raw) {
    const norm = String(t).trim().toLowerCase();
    if ((VALID_TARGETS as readonly string[]).includes(norm)) set.add(norm);
  }
  return [...set];
}

function parseDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

type VideoRowOut = Record<string, unknown>;

function videoOut(video: typeof socialVideosTable.$inferSelect, blogName?: string | null): VideoRowOut {
  return {
    ...video,
    blogName: blogName ?? null,
    fileUrl: video.fileName ? publicVideoUrl(video.fileName) : null,
  };
}

// ─── Fila de vídeos ──────────────────────────────────────────────────────────

router.get("/videos", async (req, res) => {
  const status = typeof req.query["status"] === "string" ? req.query["status"] : undefined;
  const blogId = typeof req.query["blogId"] === "string" ? req.query["blogId"] : undefined;
  const limit = Math.min(Number(req.query["limit"]) || 50, 100);
  const offset = Number(req.query["offset"]) || 0;

  const conditions: SQL[] = [];
  if (status) conditions.push(eq(socialVideosTable.status, status));
  if (blogId) conditions.push(eq(socialVideosTable.blogId, blogId));

  const rows = await db
    .select({ video: socialVideosTable, blogName: blogsTable.name })
    .from(socialVideosTable)
    .leftJoin(blogsTable, eq(socialVideosTable.blogId, blogsTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(socialVideosTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json(rows.map((r) => videoOut(r.video, r.blogName)));
});

/**
 * Enqueue manual: cria 1 linha por blog selecionado (fan-out — o download é
 * feito uma vez e propagado). postNow → scheduled_at = agora; scheduledAt
 * futuro → agenda; nenhum → fica "ready" aguardando ação manual.
 */
router.post("/videos", async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const url = typeof b["url"] === "string" ? b["url"].trim() : "";
  const platform = detectPlatform(url);
  if (!url || !platform) {
    res.status(400).json({ error: "Informe um link válido do TikTok ou do Instagram." });
    return;
  }

  const blogIds = Array.isArray(b["blogIds"])
    ? [...new Set((b["blogIds"] as unknown[]).filter((x): x is string => typeof x === "string" && !!x))]
    : [];
  if (blogIds.length === 0) {
    res.status(400).json({ error: "Selecione pelo menos um blog de destino." });
    return;
  }
  const blogs = await db.select().from(blogsTable).where(inArray(blogsTable.id, blogIds));
  if (blogs.length !== blogIds.length) {
    res.status(400).json({ error: "Um ou mais blogs selecionados não existem." });
    return;
  }

  const targets = normalizeTargets(b["targets"]);
  if (targets.length === 0) {
    res.status(400).json({ error: "Selecione pelo menos um destino (Instagram/TikTok)." });
    return;
  }

  const postNow = b["postNow"] === true;
  let scheduledAt: Date | null = null;
  if (postNow) {
    scheduledAt = new Date();
  } else {
    scheduledAt = parseDate(b["scheduledAt"]);
    if (b["scheduledAt"] && !scheduledAt) {
      res.status(400).json({ error: "Data de agendamento inválida." });
      return;
    }
    if (scheduledAt && scheduledAt.getTime() <= Date.now()) {
      res.status(400).json({ error: "O horário de agendamento deve ser no futuro." });
      return;
    }
  }

  const str = (k: string) => (typeof b[k] === "string" ? (b[k] as string) : "");
  const finalCaption = buildCaption({
    caption: str("caption"),
    cta: str("cta"),
    credits: str("credits"),
    hashtags: str("hashtags"),
  });

  const now = new Date();
  const created: VideoRowOut[] = [];
  for (const blog of blogs) {
    const id = randomUUID();
    const [row] = await db
      .insert(socialVideosTable)
      .values({
        id,
        blogId: blog.id,
        sourceUrl: url,
        platform,
        targets,
        status: "queued",
        caption: finalCaption || null,
        captionSource: finalCaption ? "user" : null,
        scheduledAt,
        queuedAt: now,
      })
      .returning();
    created.push(videoOut(row!, blog.name));
    logEvent({
      module: "social", refType: "social_video", refId: id,
      message: `Vídeo enfileirado p/ ${blog.name} (${targets.join("+")}${scheduledAt ? postNow ? ", postar agora" : ", agendado" : ""}): ${url}`,
    });
  }

  kickVideoQueue();
  res.status(201).json({ videos: created });
});

const EDITABLE_STATUSES = ["ready", "scheduled", "error"];

router.patch("/videos/:id", async (req, res) => {
  const [video] = await db.select().from(socialVideosTable).where(eq(socialVideosTable.id, req.params.id)).limit(1);
  if (!video) { res.status(404).json({ error: "Vídeo não encontrado." }); return; }
  if (!EDITABLE_STATUSES.includes(video.status)) {
    res.status(409).json({ error: `Vídeo não é editável no status "${video.status}".` });
    return;
  }

  const b = (req.body ?? {}) as Record<string, unknown>;
  const updates: Partial<typeof socialVideosTable.$inferInsert> = { updatedAt: new Date() };

  if (typeof b["title"] === "string") updates.title = b["title"].trim() || null;
  if (typeof b["caption"] === "string") {
    updates.caption = b["caption"].trim() || null;
    updates.captionSource = b["caption"].trim() ? "user" : null;
  }
  const targets = b["targets"] !== undefined ? normalizeTargets(b["targets"]) : null;
  if (targets) {
    if (targets.length === 0) { res.status(400).json({ error: "Pelo menos um destino." }); return; }
    updates.targets = targets;
  }
  if ("scheduledAt" in b) {
    const d = parseDate(b["scheduledAt"]);
    if (b["scheduledAt"] && !d) { res.status(400).json({ error: "Data inválida." }); return; }
    updates.scheduledAt = d;
    if (video.status === "ready" && d) updates.status = "scheduled";
    if (video.status === "scheduled" && !d) updates.status = "ready";
  }

  const [row] = await db.update(socialVideosTable).set(updates).where(eq(socialVideosTable.id, video.id)).returning();
  res.json(videoOut(row!));
});

router.delete("/videos/:id", async (req, res) => {
  const [video] = await db.select().from(socialVideosTable).where(eq(socialVideosTable.id, req.params.id)).limit(1);
  if (!video) { res.status(404).json({ error: "Vídeo não encontrado." }); return; }

  await db.delete(socialVideosTable).where(eq(socialVideosTable.id, video.id));

  // Apaga o mp4 do disco se nenhuma irmã ainda referencia o arquivo
  if (video.fileName) {
    const [other] = await db
      .select({ id: socialVideosTable.id })
      .from(socialVideosTable)
      .where(eq(socialVideosTable.fileName, video.fileName))
      .limit(1);
    if (!other) {
      await unlink(path.join(videoDir(), video.fileName)).catch(() => undefined);
    }
  }
  res.json({ ok: true });
});

/** Postar agora: agenda para já — o publisher pega no próximo tick (≤15s). */
router.post("/videos/:id/post-now", async (req, res) => {
  const [video] = await db.select().from(socialVideosTable).where(eq(socialVideosTable.id, req.params.id)).limit(1);
  if (!video) { res.status(404).json({ error: "Vídeo não encontrado." }); return; }
  if (["publishing", "sent"].includes(video.status)) {
    res.status(409).json({ error: `Vídeo já está "${video.status}".` });
    return;
  }
  const updates: Partial<typeof socialVideosTable.$inferInsert> = {
    scheduledAt: new Date(),
    nextRetryAt: null,
    updatedAt: new Date(),
  };
  if (video.status === "ready") updates.status = "scheduled";
  if (video.status === "error") {
    // erro de publicação com arquivo → volta p/ fila de publicação; sem arquivo → rebaixa
    updates.status = video.fileName ? "scheduled" : "queued";
    updates.attempts = 0;
    updates.errorMessage = null;
    if (!video.fileName) updates.queuedAt = new Date();
  }
  const [row] = await db.update(socialVideosTable).set(updates).where(eq(socialVideosTable.id, video.id)).returning();
  if (row!.status === "queued") kickVideoQueue();
  res.json(videoOut(row!));
});

router.post("/videos/:id/schedule", async (req, res) => {
  const d = parseDate((req.body ?? {})["scheduledAt"]);
  if (!d || d.getTime() <= Date.now()) {
    res.status(400).json({ error: "Informe um horário futuro." });
    return;
  }
  const [video] = await db.select().from(socialVideosTable).where(eq(socialVideosTable.id, req.params.id)).limit(1);
  if (!video) { res.status(404).json({ error: "Vídeo não encontrado." }); return; }
  if (["publishing", "sent"].includes(video.status)) {
    res.status(409).json({ error: `Vídeo já está "${video.status}".` });
    return;
  }
  const updates: Partial<typeof socialVideosTable.$inferInsert> = {
    scheduledAt: d,
    nextRetryAt: null,
    updatedAt: new Date(),
  };
  if (video.status === "ready") updates.status = "scheduled";
  if (video.status === "error") {
    updates.status = video.fileName ? "scheduled" : "queued";
    updates.attempts = 0;
    updates.errorMessage = null;
    if (!video.fileName) updates.queuedAt = new Date();
  }
  const [row] = await db.update(socialVideosTable).set(updates).where(eq(socialVideosTable.id, video.id)).returning();
  if (row!.status === "queued") kickVideoQueue();
  res.json(videoOut(row!));
});

/** Tentar de novo (erro): com arquivo volta p/ publicação; sem arquivo, refaz o download. */
router.post("/videos/:id/retry", async (req, res) => {
  const [video] = await db.select().from(socialVideosTable).where(eq(socialVideosTable.id, req.params.id)).limit(1);
  if (!video) { res.status(404).json({ error: "Vídeo não encontrado." }); return; }
  if (video.status !== "error") { res.status(409).json({ error: "Só vídeos com erro podem ser retentados." }); return; }

  const updates: Partial<typeof socialVideosTable.$inferInsert> = {
    attempts: 0,
    nextRetryAt: null,
    errorMessage: null,
    updatedAt: new Date(),
  };
  if (video.fileName) {
    updates.status = video.scheduledAt ? "scheduled" : "ready";
  } else {
    updates.status = "queued";
    updates.queuedAt = new Date();
  }
  const [row] = await db.update(socialVideosTable).set(updates).where(eq(socialVideosTable.id, video.id)).returning();
  if (row!.status === "queued") kickVideoQueue();
  res.json(videoOut(row!));
});

/** Regera a legenda com IA a partir da legenda original coletada. */
router.post("/videos/:id/regenerate-caption", async (req, res) => {
  const [video] = await db.select().from(socialVideosTable).where(eq(socialVideosTable.id, req.params.id)).limit(1);
  if (!video) { res.status(404).json({ error: "Vídeo não encontrado." }); return; }
  if (!EDITABLE_STATUSES.includes(video.status)) {
    res.status(409).json({ error: `Vídeo não é editável no status "${video.status}".` });
    return;
  }
  const s = getSettings();
  const original = video.metadata?.originalCaption ?? video.caption ?? "";
  try {
    const prompt = buildCaptionPrompt(String(original), video.creator ?? "", s.socialCaptionPromptTemplate);
    const out = await getGeminiPool().call(s.captionModel?.trim() || "gemini-2.5-flash", prompt);
    const parsed = parseCaptionOutput(out.text);
    if (!parsed.title && !parsed.caption) {
      res.status(502).json({ error: "IA devolveu resposta vazia — tente de novo." });
      return;
    }
    await db.insert(aiUsageEventsTable).values({
      provider: out.usage.provider,
      model: out.usage.model ?? null,
      keyHint: out.usage.keyHint ?? null,
      inputTokens: out.usage.inputTokens ?? null,
      outputTokens: out.usage.outputTokens ?? null,
      totalTokens: out.usage.totalTokens ?? null,
      purpose: "caption",
    });
    const [row] = await db
      .update(socialVideosTable)
      .set({
        title: parsed.title || video.title,
        caption: parsed.caption || parsed.title,
        captionSource: "ai",
        updatedAt: new Date(),
      })
      .where(eq(socialVideosTable.id, video.id))
      .returning();
    res.json(videoOut(row!));
  } catch (err) {
    res.status(502).json({ error: `Falha na IA: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300) });
  }
});

// ─── Conexões por blog ───────────────────────────────────────────────────────

interface ConnectionOut {
  blogId: string;
  blogName: string;
  isActive: boolean;
  hasMeta: boolean;
  metaPageId: string | null;
  metaPageName: string | null;
  igUsername: string | null;
  metaLastError: string | null;
  bufferChannelId: string | null;
  bufferChannelName: string | null;
  hasBufferKey: boolean;
  hasGlobalBufferKey: boolean;
  /** App Meta do próprio blog (ID é público; secret só como flag). */
  metaAppId: string | null;
  hasMetaAppSecret: boolean;
  hasGlobalMetaApp: boolean;
}

async function listConnections(s: HubSettings): Promise<ConnectionOut[]> {
  const blogs = await db.select().from(blogsTable);
  const accounts = await db.select().from(blogSocialAccountsTable);
  const byBlog = new Map(accounts.map((a) => [a.blogId, a]));
  return blogs.map((blog) => {
    const a = byBlog.get(blog.id);
    return {
      blogId: blog.id,
      blogName: blog.name,
      isActive: blog.isActive,
      hasMeta: !!(a?.igUserId && a?.metaAccessTokenEnc),
      metaPageId: a?.metaPageId ?? null,
      metaPageName: a?.metaPageName ?? null,
      igUsername: a?.igUsername ?? null,
      metaLastError: a?.metaLastError ?? null,
      bufferChannelId: a?.bufferChannelId ?? null,
      bufferChannelName: a?.bufferChannelName ?? null,
      hasBufferKey: !!a?.bufferApiKeyEnc,
      hasGlobalBufferKey: !!s.bufferApiKey,
      metaAppId: a?.metaAppId ?? null,
      hasMetaAppSecret: !!a?.metaAppSecretEnc,
      hasGlobalMetaApp: !!(s.metaAppId && s.metaAppSecret),
    };
  });
}

/**
 * App Meta efetivo de um blog: o cadastrado na aba Redes Sociais do próprio
 * blog vence; sem ele, cai no App ID/Secret global das settings (legado).
 */
async function resolveMetaApp(blogId: string, s: HubSettings): Promise<{ appId: string; appSecret: string }> {
  const [a] = await db
    .select({ appId: blogSocialAccountsTable.metaAppId, secretEnc: blogSocialAccountsTable.metaAppSecretEnc })
    .from(blogSocialAccountsTable)
    .where(eq(blogSocialAccountsTable.blogId, blogId))
    .limit(1);
  if (a?.appId && a?.secretEnc) {
    return { appId: a.appId, appSecret: decryptSecret(a.secretEnc) };
  }
  return { appId: s.metaAppId?.trim() ?? "", appSecret: s.metaAppSecret?.trim() ?? "" };
}

router.get("/connections", async (_req, res) => {
  res.json(await listConnections(getSettings()));
});

router.get("/connections/:blogId", async (req, res) => {
  const all = await listConnections(getSettings());
  const one = all.find((c) => c.blogId === req.params.blogId);
  if (!one) { res.status(404).json({ error: "Blog não encontrado." }); return; }
  res.json(one);
});

async function upsertAccount(blogId: string, values: Partial<typeof blogSocialAccountsTable.$inferInsert>): Promise<void> {
  const [existing] = await db
    .select({ id: blogSocialAccountsTable.id })
    .from(blogSocialAccountsTable)
    .where(eq(blogSocialAccountsTable.blogId, blogId))
    .limit(1);
  if (existing) {
    await db
      .update(blogSocialAccountsTable)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(blogSocialAccountsTable.id, existing.id));
  } else {
    await db.insert(blogSocialAccountsTable).values({ id: randomUUID(), blogId, ...values });
  }
}

router.put("/connections/:blogId/buffer", async (req, res) => {
  const blogId = req.params.blogId;
  const [blog] = await db.select().from(blogsTable).where(eq(blogsTable.id, blogId)).limit(1);
  if (!blog) { res.status(404).json({ error: "Blog não encontrado." }); return; }

  const b = (req.body ?? {}) as Record<string, unknown>;
  const channelId = typeof b["channelId"] === "string" ? b["channelId"].trim() : "";
  if (!channelId) { res.status(400).json({ error: "channelId do TikTok no Buffer é obrigatório." }); return; }

  const values: Partial<typeof blogSocialAccountsTable.$inferInsert> = {
    bufferChannelId: channelId,
    bufferChannelName: typeof b["channelName"] === "string" ? b["channelName"].trim() || null : null,
    bufferConnectedAt: new Date(),
  };
  const apiKey = typeof b["apiKey"] === "string" ? b["apiKey"].trim() : "";
  if (apiKey && !apiKey.includes("•")) values.bufferApiKeyEnc = encryptSecret(apiKey);
  if (b["clearApiKey"] === true) values.bufferApiKeyEnc = null;

  await upsertAccount(blogId, values);
  logEvent({ module: "social", refType: "blog", refId: blogId, message: `Buffer/TikTok conectado no blog ${blog.name}` });
  res.json((await listConnections(getSettings())).find((c) => c.blogId === blogId));
});

router.delete("/connections/:blogId/buffer", async (req, res) => {
  await upsertAccount(req.params.blogId, {
    bufferChannelId: null,
    bufferChannelName: null,
    bufferApiKeyEnc: null,
    bufferConnectedAt: null,
  });
  logEvent({ module: "social", refType: "blog", refId: req.params.blogId, message: "Buffer/TikTok desconectado" });
  res.json({ ok: true });
});

router.delete("/connections/:blogId/meta", async (req, res) => {
  await upsertAccount(req.params.blogId, {
    metaPageId: null,
    metaPageName: null,
    igUserId: null,
    igUsername: null,
    metaAccessTokenEnc: null,
    metaConnectedAt: null,
    metaLastError: null,
  });
  logEvent({ module: "social", refType: "blog", refId: req.params.blogId, message: "Conta Meta desconectada" });
  res.json({ ok: true });
});

// App Meta do PRÓPRIO blog (aba Redes Sociais). Trim SEMPRE — espaço/quebra
// colada junto do secret causava "Error validating client secret" (cf67b35).
router.put("/connections/:blogId/meta-app", async (req, res) => {
  const blogId = req.params.blogId;
  const [blog] = await db.select().from(blogsTable).where(eq(blogsTable.id, blogId)).limit(1);
  if (!blog) { res.status(404).json({ error: "Blog não encontrado." }); return; }

  const b = (req.body ?? {}) as Record<string, unknown>;
  const appId = typeof b["appId"] === "string" ? b["appId"].trim() : "";
  if (!appId) { res.status(400).json({ error: "App ID da Meta é obrigatório." }); return; }

  const values: Partial<typeof blogSocialAccountsTable.$inferInsert> = { metaAppId: appId };
  const appSecret = typeof b["appSecret"] === "string" ? b["appSecret"].trim() : "";
  // Vazio/mascarado mantém o secret já salvo (mesmo padrão da key do Buffer).
  if (appSecret && !appSecret.includes("•")) values.metaAppSecretEnc = encryptSecret(appSecret);

  await upsertAccount(blogId, values);
  logEvent({ module: "social", refType: "blog", refId: blogId, message: `App Meta salvo no blog ${blog.name}` });
  res.json((await listConnections(getSettings())).find((c) => c.blogId === blogId));
});

router.delete("/connections/:blogId/meta-app", async (req, res) => {
  await upsertAccount(req.params.blogId, { metaAppId: null, metaAppSecretEnc: null });
  logEvent({ module: "social", refType: "blog", refId: req.params.blogId, message: "App Meta do blog removido (volta ao global, se houver)" });
  res.json({ ok: true });
});

// ─── OAuth Meta (por blog) — adaptado de api-server/routes/social.ts ─────────

const META_GRAPH = "https://graph.facebook.com/v20.0";
const META_DIALOG = "https://www.facebook.com/v20.0/dialog/oauth";
const META_SCOPES = [
  "pages_show_list", "pages_read_engagement", "pages_manage_posts",
  "instagram_basic", "instagram_content_publish", "business_management",
];

interface MetaPage {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string; username?: string };
}

const metaStates = new Map<string, { expires: number; blogId: string }>();
const metaOauthCache = new Map<string, { expires: number; blogId: string; pages: MetaPage[] }>();

function metaRedirectUri(): string {
  const base = centralPublicUrl();
  return base ? `${base}/meta-auth-complete.html` : "";
}

router.get("/meta/app", async (req, res) => {
  const s = getSettings();
  // Com ?blogId= devolve o app EFETIVO do blog (próprio ou fallback global).
  const blogId = typeof req.query["blogId"] === "string" ? req.query["blogId"].trim() : "";
  const app = blogId
    ? await resolveMetaApp(blogId, s)
    : { appId: s.metaAppId?.trim() ?? "", appSecret: s.metaAppSecret?.trim() ?? "" };
  res.json({
    appId: app.appId,
    hasSecret: !!app.appSecret,
    redirectUri: metaRedirectUri(),
    scopes: META_SCOPES,
  });
});

router.get("/meta/oauth/start", async (req, res) => {
  const blogId = typeof req.query["blogId"] === "string" ? req.query["blogId"] : "";
  if (!blogId) { res.status(400).json({ error: "blogId é obrigatório." }); return; }
  const app = await resolveMetaApp(blogId, getSettings());
  if (!app.appId) {
    res.status(400).json({ error: "Configure o App ID/Secret da Meta na aba Redes Sociais deste blog." });
    return;
  }
  const redirectUri = metaRedirectUri();
  if (!redirectUri.startsWith("http")) {
    res.status(500).json({ error: "CENTRAL_PUBLIC_URL não configurada no servidor." });
    return;
  }
  const state = randomUUID();
  metaStates.set(state, { expires: Date.now() + 10 * 60_000, blogId });
  const params = new URLSearchParams({
    client_id: app.appId,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    scope: META_SCOPES.join(","),
  });
  res.json({ url: `${META_DIALOG}?${params.toString()}`, state });
});

router.post("/meta/oauth/exchange", async (req, res) => {
  const { code, state } = (req.body ?? {}) as { code?: string; state?: string };
  if (!code) { res.status(400).json({ error: "code ausente" }); return; }
  const sess = state ? metaStates.get(state) : undefined;
  if (!state || !sess || sess.expires < Date.now()) {
    res.status(400).json({ error: "Sessão OAuth inválida ou expirada." });
    return;
  }
  metaStates.delete(state);

  const app = await resolveMetaApp(sess.blogId, getSettings());
  if (!app.appId || !app.appSecret) {
    res.status(400).json({ error: "App Meta (ID/Secret) não configurado na aba Redes Sociais deste blog." });
    return;
  }
  const redirectUri = metaRedirectUri();

  try {
    // 1. code → token curto
    const shortRes = await fetch(`${META_GRAPH}/oauth/access_token?` + new URLSearchParams({
      client_id: app.appId, client_secret: app.appSecret, redirect_uri: redirectUri, code,
    }), { signal: AbortSignal.timeout(15000) });
    const short = (await shortRes.json()) as { access_token?: string; error?: { message: string } };
    if (short.error) throw new Error(short.error.message);
    let userToken = short.access_token ?? "";

    // 2. token curto → longa duração (page tokens derivados não expiram)
    const longRes = await fetch(`${META_GRAPH}/oauth/access_token?` + new URLSearchParams({
      grant_type: "fb_exchange_token", client_id: app.appId, client_secret: app.appSecret, fb_exchange_token: userToken,
    }), { signal: AbortSignal.timeout(15000) });
    const long = (await longRes.json()) as { access_token?: string };
    if (long.access_token) userToken = long.access_token;

    // 3. Páginas + IG business vinculado
    const pagesRes = await fetch(
      `${META_GRAPH}/me/accounts?fields=name,id,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(userToken)}`,
      { signal: AbortSignal.timeout(15000) },
    );
    const pages = (await pagesRes.json()) as { data?: MetaPage[]; error?: { message: string } };
    if (pages.error) throw new Error(pages.error.message);

    const list = pages.data ?? [];
    const sessionId = randomUUID();
    metaOauthCache.set(sessionId, { expires: Date.now() + 10 * 60_000, blogId: sess.blogId, pages: list });

    res.json({
      sessionId,
      pages: list.map((p) => ({
        id: p.id,
        name: p.name,
        instagramId: p.instagram_business_account?.id ?? null,
        instagramName: p.instagram_business_account?.username ?? null,
      })),
    });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post("/meta/oauth/save", async (req, res) => {
  const { sessionId, pageId } = (req.body ?? {}) as { sessionId?: string; pageId?: string };
  const sess = sessionId ? metaOauthCache.get(sessionId) : undefined;
  if (!sess || sess.expires < Date.now()) {
    if (sessionId) metaOauthCache.delete(sessionId);
    res.status(400).json({ error: "Sessão OAuth expirada — refaça a conexão." });
    return;
  }
  const page = sess.pages.find((p) => p.id === pageId);
  if (!page) { res.status(400).json({ error: "Página não encontrada na sessão." }); return; }
  if (!page.instagram_business_account?.id) {
    res.status(400).json({ error: "Essa Página não tem Instagram Business vinculado — os Reels precisam dele." });
    return;
  }

  await upsertAccount(sess.blogId, {
    metaPageId: page.id,
    metaPageName: page.name,
    igUserId: page.instagram_business_account.id,
    igUsername: page.instagram_business_account.username ?? null,
    metaAccessTokenEnc: encryptSecret(page.access_token),
    metaConnectedAt: new Date(),
    metaLastError: null,
  });
  metaOauthCache.delete(sessionId!);

  const [blog] = await db.select().from(blogsTable).where(eq(blogsTable.id, sess.blogId)).limit(1);
  logEvent({
    module: "social", refType: "blog", refId: sess.blogId,
    message: `Meta conectada no blog ${blog?.name ?? sess.blogId}: @${page.instagram_business_account.username ?? page.name}`,
  });
  res.json((await listConnections(getSettings())).find((c) => c.blogId === sess.blogId));
});

export default router;
