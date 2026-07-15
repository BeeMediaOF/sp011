import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import express, { Router } from "express";
import {
  db,
  blogsTable,
  newsItemsTable,
  rewritesTable,
  deliveriesTable,
} from "@workspace/central-db";
import { normalizeTitle, plainTextLength } from "@workspace/news-engine";
import { desc, eq, ilike, and, inArray, type SQL } from "drizzle-orm";
import { authMiddleware } from "../middlewares/auth.js";
import { logEvent } from "../lib/eventLog.js";
import {
  ensureImageDir,
  imageDir,
  isValidImageFileName,
  newImageFileName,
  IMAGE_EXT_BY_MIME,
} from "../lib/newsImageFiles.js";
import { centralPublicUrl } from "../lib/social/publicUrl.js";

const router = Router();

// ─── Rota PÚBLICA da imagem (antes do auth) ──────────────────────────────────
// Blogs (hotlink no artigo) e leitores baixam por URL; nome é não-adivinhável
// e imutável → cache longo.

router.get("/image/:name", (req, res) => {
  const name = req.params.name;
  if (!isValidImageFileName(name)) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.sendFile(name, {
    root: imageDir(),
    headers: { "Cache-Control": "public, max-age=31536000, immutable" },
  }, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "not_found" });
  });
});

router.use(authMiddleware);

/**
 * Upload da imagem de capa da "Nova notícia": corpo cru image/* (sem
 * multipart/dependência nova), grava no volume central_data e devolve a URL
 * pública absoluta — é ela que vai no imageUrl da notícia e nos blogs.
 */
router.post(
  "/upload-image",
  express.raw({ type: "image/*", limit: "10mb" }),
  async (req, res) => {
    const mime = (req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if (!IMAGE_EXT_BY_MIME[mime]) {
      res.status(400).json({
        error: `Formato não suportado (${mime || "sem Content-Type"}). Use JPEG, PNG, WebP ou GIF.`,
      });
      return;
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: "Arquivo vazio — envie a imagem no corpo da requisição." });
      return;
    }
    const base = centralPublicUrl();
    if (!base) {
      res.status(500).json({
        error: "CENTRAL_PUBLIC_URL não configurada no .env.central — necessária para montar a URL pública da imagem.",
      });
      return;
    }

    const fileName = newImageFileName(mime);
    if (!fileName) {
      res.status(400).json({ error: "Formato não suportado." });
      return;
    }
    await writeFile(path.join(ensureImageDir(), fileName), req.body);
    res.status(201).json({ fileName, url: `${base}/api/news/image/${fileName}` });
  },
);

/**
 * Publicação manual multi-blog: cria a notícia JÁ PRONTA (sem coleta nem IA)
 * e uma entrega para cada blog selecionado — daí em diante segue o caminho
 * padrão (deliveryWorker → /api/ingest com HMAC). Blog em idioma diferente
 * do texto recebe via localizer (tradução + categoria); blog com taxonomia e
 * sem targetCategory explícita tem a categoria classificada pela IA.
 * Entrega manual nasce `pending` (quem publica é o operador — não passa pela
 * fila de aprovação); a localização, quando existe, respeita o requireApproval
 * do blog ao voltar.
 */
router.post("/manual", async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  const title = str(b["title"]);
  const contentHtml = str(b["contentHtml"]);
  const blogIds = Array.isArray(b["blogIds"])
    ? [...new Set((b["blogIds"] as unknown[]).filter((x): x is string => typeof x === "string" && !!x))]
    : [];

  if (!title || !contentHtml || blogIds.length === 0) {
    res.status(400).json({ error: "title, contentHtml e blogIds (≥1) são obrigatórios." });
    return;
  }
  if (plainTextLength(contentHtml) < 100) {
    res.status(400).json({ error: "Conteúdo curto demais (mínimo ~100 caracteres de texto visível)." });
    return;
  }

  const subtitle = str(b["subtitle"]);
  const imageUrl = str(b["imageUrl"]);
  const author = str(b["author"]);
  const category = (str(b["category"]) ?? "geral").toLowerCase();
  const targetCategory = str(b["targetCategory"])?.toLowerCase() ?? null;
  const language = b["language"] === "en" ? "en" : "pt-BR";

  const blogs = await db.select().from(blogsTable).where(inArray(blogsTable.id, blogIds));
  if (blogs.length !== blogIds.length) {
    res.status(400).json({ error: "Um ou mais blogs selecionados não existem." });
    return;
  }

  const newsId = randomUUID();
  await db.insert(newsItemsTable).values({
    id: newsId,
    sourceId: "manual",
    sourceName: "Manual",
    title,
    titleNorm: normalizeTitle(title),
    description: subtitle,
    contentRaw: contentHtml,
    imageUrl,
    author,
    category,
    // Entregas são criadas AQUI — "distributed" impede o distributor de
    // duplicá-las pelas regras automáticas.
    status: "distributed",
  });

  const rewriteId = randomUUID();
  await db.insert(rewritesTable).values({
    id: rewriteId,
    newsItemId: newsId,
    blogId: null,
    language,
    title,
    subtitle,
    socialTitle: str(b["socialTitle"]),
    socialSummary: str(b["socialSummary"]),
    socialHashtags: str(b["socialHashtags"]),
    contentHtml,
    slug: str(b["slug"]),
    keywords: str(b["keywords"]),
    provider: "manual",
    status: "ok",
  });

  const deliveries: Array<{ id: string; blogId: string; blogName: string; status: string }> = [];
  for (const blog of blogs) {
    const needsTranslation = blog.language !== language;
    const needsClassification = (blog.categories?.length ?? 0) > 0 && !targetCategory;
    const status = needsTranslation || needsClassification ? "awaiting_localization" : "pending";
    const id = randomUUID();
    await db.insert(deliveriesTable).values({
      id,
      newsItemId: newsId,
      rewriteId,
      blogId: blog.id,
      status,
      scheduledAt: new Date(),
      targetCategory,
    });
    deliveries.push({ id, blogId: blog.id, blogName: blog.name, status });
    logEvent({
      module: "distributor", refType: "delivery", refId: id,
      message: `Entrega manual criada p/ ${blog.name}${status === "awaiting_localization" ? " (aguardando tradução/categoria)" : ""}: ${title}`,
    });
  }

  res.status(201).json({ id: newsId, rewriteId, deliveries });
});

router.get("/", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const q = typeof req.query.q === "string" ? req.query.q.trim() : undefined;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  const conditions: SQL[] = [];
  if (status) conditions.push(eq(newsItemsTable.status, status));
  if (q) conditions.push(ilike(newsItemsTable.title, `%${q}%`));

  const rows = await db
    .select({
      id: newsItemsTable.id,
      sourceName: newsItemsTable.sourceName,
      title: newsItemsTable.title,
      category: newsItemsTable.category,
      imageUrl: newsItemsTable.imageUrl,
      originalUrl: newsItemsTable.originalUrl,
      status: newsItemsTable.status,
      failReason: newsItemsTable.failReason,
      createdAt: newsItemsTable.createdAt,
    })
    .from(newsItemsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(newsItemsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json(rows);
});

router.get("/:id", async (req, res) => {
  const rows = await db
    .select()
    .from(newsItemsTable)
    .where(eq(newsItemsTable.id, req.params.id))
    .limit(1);
  const item = rows[0];
  if (!item) {
    res.status(404).json({ error: "Notícia não encontrada." });
    return;
  }
  const rewrites = await db
    .select()
    .from(rewritesTable)
    .where(eq(rewritesTable.newsItemId, item.id));
  const deliveries = await db
    .select()
    .from(deliveriesTable)
    .where(eq(deliveriesTable.newsItemId, item.id));
  res.json({ ...item, rewrites, deliveries });
});

/** Recoloca uma notícia com falha na fila de reescrita. */
router.post("/:id/requeue", async (req, res) => {
  const [row] = await db
    .update(newsItemsTable)
    .set({ status: "queued", failReason: null, updatedAt: new Date() })
    .where(eq(newsItemsTable.id, req.params.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Notícia não encontrada." });
    return;
  }
  res.json(row);
});

/** Descarta uma notícia (não será reescrita nem distribuída). */
router.delete("/:id", async (req, res) => {
  const [row] = await db
    .update(newsItemsTable)
    .set({ status: "discarded", updatedAt: new Date() })
    .where(eq(newsItemsTable.id, req.params.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Notícia não encontrada." });
    return;
  }
  res.json({ ok: true });
});

export default router;
