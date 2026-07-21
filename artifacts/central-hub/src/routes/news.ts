import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import express, { Router } from "express";
import {
  db,
  aiUsageEventsTable,
  blogsTable,
  newsItemsTable,
  rewritesTable,
  deliveriesTable,
  type BlogRow,
} from "@workspace/central-db";
import {
  completeText,
  normalizeTitle,
  plainTextLength,
  plainTextOf,
  type RewriteEngineConfig,
} from "@workspace/news-engine";
import { desc, eq, ilike, and, inArray, isNull, type SQL } from "drizzle-orm";
import { authMiddleware } from "../middlewares/auth.js";
import { logEvent } from "../lib/eventLog.js";
import { getSettings } from "../lib/store.js";
import { getGeminiPool } from "../lib/aiPool.js";
import { logger } from "../lib/logger.js";
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
  // Capa servida para BLOGS (hotlink cross-origin no <img> do artigo) e leitores:
  // o helmet global (app.ts) carimba Cross-Origin-Resource-Policy: same-origin, que
  // faz o navegador bloquear a imagem quando embutida em outra origem
  // (ERR_BLOCKED_BY_RESPONSE.NotSameOrigin). Esta rota é pública e projetada para
  // hotlink → libera o embed cross-origin. setHeader roda depois do middleware e
  // sobrescreve o header. A API autenticada segue com o same-origin do helmet.
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
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

// ─── Publicação manual (editor "Nova notícia") ───────────────────────────────

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

function parseBlogIds(b: Record<string, unknown>): string[] {
  return Array.isArray(b["blogIds"])
    ? [...new Set((b["blogIds"] as unknown[]).filter((x): x is string => typeof x === "string" && !!x))]
    : [];
}

/** ISO/datetime → Date; ausente → agora; inválida → null (erro do chamador). */
function parseScheduledAt(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return new Date();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Cria 1 entrega por blog — daí em diante segue o caminho padrão
 * (localizer quando precisa de tradução/categoria → deliveryWorker → ingest).
 * Entrega manual nasce `pending` (quem publica é o operador); `scheduledAt`
 * futuro segura o envio até a hora (deliveryWorker só pega vencidas).
 */
async function createManualDeliveries(opts: {
  newsId: string;
  rewriteId: string;
  blogs: BlogRow[];
  language: string;
  targetCategory: string | null;
  scheduledAt: Date;
  title: string;
}): Promise<Array<{ id: string; blogId: string; blogName: string; status: string }>> {
  const deliveries: Array<{ id: string; blogId: string; blogName: string; status: string }> = [];
  for (const blog of opts.blogs) {
    const needsTranslation = blog.language !== opts.language;
    const needsClassification = (blog.categories?.length ?? 0) > 0 && !opts.targetCategory;
    const status = needsTranslation || needsClassification ? "awaiting_localization" : "pending";
    const id = randomUUID();
    await db.insert(deliveriesTable).values({
      id,
      newsItemId: opts.newsId,
      rewriteId: opts.rewriteId,
      blogId: blog.id,
      status,
      scheduledAt: opts.scheduledAt,
      targetCategory: opts.targetCategory,
    });
    deliveries.push({ id, blogId: blog.id, blogName: blog.name, status });
    logEvent({
      module: "distributor", refType: "delivery", refId: id,
      message: `Entrega manual criada p/ ${blog.name}${status === "awaiting_localization" ? " (aguardando tradução/categoria)" : ""}: ${opts.title}`,
    });
  }
  return deliveries;
}

/** Campos comuns POST/PUT → valores das tabelas. */
function manualNewsValues(b: Record<string, unknown>, title: string, contentHtml: string) {
  return {
    title,
    titleNorm: normalizeTitle(title),
    description: str(b["subtitle"]),
    contentRaw: contentHtml || null,
    imageUrl: str(b["imageUrl"]),
    author: str(b["author"]),
    imageCredit: str(b["imageCredit"]),
    canonicalUrl: str(b["canonicalUrl"]),
    category: (str(b["category"]) ?? "geral").toLowerCase(),
  };
}

function manualRewriteValues(b: Record<string, unknown>, title: string, contentHtml: string) {
  return {
    language: b["language"] === "en" ? "en" : "pt-BR",
    title,
    subtitle: str(b["subtitle"]),
    socialTitle: str(b["socialTitle"]),
    socialSummary: str(b["socialSummary"]),
    socialHashtags: str(b["socialHashtags"]),
    contentHtml: contentHtml || null,
    slug: str(b["slug"]),
    keywords: str(b["keywords"]),
  };
}

/** Valida blogs/conteúdo para publicar; responde o erro e devolve null. */
async function validatePublish(
  res: express.Response, contentHtml: string, blogIds: string[],
): Promise<BlogRow[] | null> {
  if (!contentHtml || blogIds.length === 0) {
    res.status(400).json({ error: "contentHtml e blogIds (≥1) são obrigatórios para publicar." });
    return null;
  }
  if (plainTextLength(contentHtml) < 100) {
    res.status(400).json({ error: "Conteúdo curto demais (mínimo ~100 caracteres de texto visível)." });
    return null;
  }
  const blogs = await db.select().from(blogsTable).where(inArray(blogsTable.id, blogIds));
  if (blogs.length !== blogIds.length) {
    res.status(400).json({ error: "Um ou mais blogs selecionados não existem." });
    return null;
  }
  return blogs;
}

/**
 * Publicação manual multi-blog: cria a notícia JÁ PRONTA (sem coleta nem IA).
 * `status: "draft"` salva rascunho (sem entregas — editar/publicar depois via
 * PUT /manual/:id); padrão publica criando 1 entrega por blog selecionado.
 * Blog em idioma diferente recebe via localizer (tradução + categoria); blog
 * com taxonomia e sem targetCategory tem a categoria classificada pela IA.
 * "manual_draft"/"distributed" ficam fora do alcance do distributor.
 */
router.post("/manual", async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const isDraft = b["status"] === "draft";

  const title = str(b["title"]);
  const contentHtml = str(b["contentHtml"]) ?? "";
  const blogIds = parseBlogIds(b);
  if (!title) {
    res.status(400).json({ error: "Informe o título." });
    return;
  }
  const scheduledAt = parseScheduledAt(b["scheduledAt"]);
  if (!scheduledAt) {
    res.status(400).json({ error: "Agendamento inválido." });
    return;
  }

  let blogs: BlogRow[] = [];
  if (!isDraft) {
    const validated = await validatePublish(res, contentHtml, blogIds);
    if (!validated) return;
    blogs = validated;
  }

  const newsId = randomUUID();
  await db.insert(newsItemsTable).values({
    id: newsId,
    sourceId: "manual",
    sourceName: "Manual",
    ...manualNewsValues(b, title, contentHtml),
    status: isDraft ? "manual_draft" : "distributed",
  });

  const rewriteId = randomUUID();
  await db.insert(rewritesTable).values({
    id: rewriteId,
    newsItemId: newsId,
    blogId: null,
    ...manualRewriteValues(b, title, contentHtml),
    provider: "manual",
    status: "ok",
  });

  const targetCategory = str(b["targetCategory"])?.toLowerCase() ?? null;
  const deliveries = isDraft
    ? []
    : await createManualDeliveries({
        newsId, rewriteId, blogs, targetCategory, scheduledAt, title,
        language: b["language"] === "en" ? "en" : "pt-BR",
      });

  res.status(201).json({ id: newsId, rewriteId, deliveries });
});

/**
 * Atualiza uma notícia manual (rascunho ou não) e, com `status: "publish"`,
 * cria as entregas (só para blogs que ainda não têm — republicar não duplica).
 */
router.put("/manual/:id", async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const publishing = b["status"] === "publish";

  const [item] = await db
    .select()
    .from(newsItemsTable)
    .where(and(eq(newsItemsTable.id, req.params.id), eq(newsItemsTable.sourceId, "manual")))
    .limit(1);
  if (!item) {
    res.status(404).json({ error: "Notícia manual não encontrada." });
    return;
  }

  const title = str(b["title"]);
  const contentHtml = str(b["contentHtml"]) ?? "";
  const blogIds = parseBlogIds(b);
  if (!title) {
    res.status(400).json({ error: "Informe o título." });
    return;
  }
  const scheduledAt = parseScheduledAt(b["scheduledAt"]);
  if (!scheduledAt) {
    res.status(400).json({ error: "Agendamento inválido." });
    return;
  }

  let blogs: BlogRow[] = [];
  if (publishing) {
    const validated = await validatePublish(res, contentHtml, blogIds);
    if (!validated) return;
    blogs = validated;
  }

  await db
    .update(newsItemsTable)
    .set({
      ...manualNewsValues(b, title, contentHtml),
      status: publishing ? "distributed" : item.status,
      updatedAt: new Date(),
    })
    .where(eq(newsItemsTable.id, item.id));

  // Reescrita compartilhada (blogId null) — a que as entregas apontam
  const [rw] = await db
    .select()
    .from(rewritesTable)
    .where(and(eq(rewritesTable.newsItemId, item.id), isNull(rewritesTable.blogId)))
    .limit(1);
  let rewriteId = rw?.id;
  if (rewriteId) {
    await db
      .update(rewritesTable)
      .set(manualRewriteValues(b, title, contentHtml))
      .where(eq(rewritesTable.id, rewriteId));
  } else {
    rewriteId = randomUUID();
    await db.insert(rewritesTable).values({
      id: rewriteId,
      newsItemId: item.id,
      blogId: null,
      ...manualRewriteValues(b, title, contentHtml),
      provider: "manual",
      status: "ok",
    });
  }

  let deliveries: Array<{ id: string; blogId: string; blogName: string; status: string }> = [];
  if (publishing) {
    // Republicar não duplica: só cria para blogs ainda sem entrega desta notícia
    const existing = await db
      .select({ blogId: deliveriesTable.blogId })
      .from(deliveriesTable)
      .where(eq(deliveriesTable.newsItemId, item.id));
    const already = new Set(existing.map((d) => d.blogId));
    deliveries = await createManualDeliveries({
      newsId: item.id, rewriteId, targetCategory: str(b["targetCategory"])?.toLowerCase() ?? null,
      scheduledAt, title, language: b["language"] === "en" ? "en" : "pt-BR",
      blogs: blogs.filter((bl) => !already.has(bl.id)),
    });
  }

  res.json({ id: item.id, rewriteId, deliveries });
});

// ─── Autofill de SEO/AIO com IA (botão "Gerar com IA" do editor) ─────────────

let _openaiIdx = 0;

function autofillEngineConfig(): RewriteEngineConfig {
  const s = getSettings();
  // Mesmo default do localizer: sem escolha explícita, segue o provider
  // principal da reescrita (produção: Ollama).
  const provider = s.translationProvider ?? s.aiProvider ?? "gemini";
  if (provider === "openai") {
    const keys = [...new Set(
      [s.openaiApiKey, ...(s.openaiApiKeys ?? [])].map((k) => k?.trim()).filter((k): k is string => !!k),
    )];
    return {
      provider, model: s.translationModel,
      openaiApiKey: keys[_openaiIdx++ % Math.max(keys.length, 1)],
      openaiBaseUrl: s.openaiBaseUrl, logger,
    };
  }
  if (provider === "ollama") {
    return {
      provider,
      model: s.translationModel,
      ollamaBaseUrl: s.ollamaBaseUrl || process.env["OLLAMA_BASE_URL"] || "http://ollama:11434",
      geminiPool: getGeminiPool(),
      fallbackToGemini: s.fallbackToGemini ?? true,
      logger,
    };
  }
  return { provider: "gemini", model: s.translationModel, geminiPool: getGeminiPool(), logger };
}

/** Espelho do autofill do blog (admin.ts), rodando no provider da central. */
router.post("/manual/autofill", async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const title = str(b["title"]);
  const content = typeof b["content"] === "string" ? b["content"] : "";
  if (!title || title.length < 5) {
    res.status(400).json({ error: "Informe o título (mínimo 5 caracteres)." });
    return;
  }
  const textSample = plainTextOf(content).slice(0, 1_200);

  const prompt = `Você é especialista em SEO para portais de notícias brasileiros e em AIO (AI Optimization) para destaque no Google e em buscas por IA.

Dado o título e conteúdo de uma matéria jornalística, gere os seguintes campos de forma otimizada para SEO/AIO:

TÍTULO DA MATÉRIA: ${title}
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
- Todos os campos em português brasileiro`;

  try {
    const { text, usage } = await completeText(prompt, autofillEngineConfig());
    if (usage) {
      await db.insert(aiUsageEventsTable).values({
        newsItemId: null,
        rewriteId: null,
        provider: usage.provider,
        model: usage.model ?? null,
        keyHint: usage.keyHint ?? null,
        inputTokens: usage.inputTokens ?? null,
        outputTokens: usage.outputTokens ?? null,
        totalTokens: usage.totalTokens ?? null,
        purpose: "autofill",
      });
    }

    const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(clean) as Record<string, unknown>;
    } catch {
      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) {
        res.status(502).json({ error: "Resposta da IA não contém JSON válido." });
        return;
      }
      parsed = JSON.parse(match[0]) as Record<string, unknown>;
    }

    res.json({
      subtitle: typeof parsed["subtitle"] === "string" ? parsed["subtitle"] : "",
      summary: typeof parsed["summary"] === "string" ? parsed["summary"] : "",
      tags: Array.isArray(parsed["tags"])
        ? (parsed["tags"] as unknown[]).filter((t): t is string => typeof t === "string").slice(0, 5)
        : [],
      seoTitle: typeof parsed["seoTitle"] === "string" ? parsed["seoTitle"] : "",
      metaDesc: typeof parsed["metaDesc"] === "string" ? parsed["metaDesc"] : "",
      slug: typeof parsed["slug"] === "string" ? parsed["slug"] : "",
    });
  } catch (err) {
    logger.warn({ err: String(err) }, "Autofill manual falhou");
    res.status(502).json({ error: "IA indisponível para o preenchimento automático — tente de novo." });
  }
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
