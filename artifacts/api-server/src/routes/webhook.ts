import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.js";
import { articleService } from "../lib/articleService.js";
import { endpointRateLimit } from "../middlewares/endpointRateLimit.js";
import { sendPushToAll } from "./push.js";

const publishRateLimit = endpointRateLimit("/api/publish");

const router = Router();

/**
 * GET /api/publish  (also HEAD)
 * Endpoint discovery probe — used by external platforms to verify the endpoint is reachable.
 * Returns 200 with capability info. Does NOT require authentication.
 */
router.get("/", (_req, res) => {
  res.json({
    ok: true,
    endpoint: "POST /api/publish",
    description: "Cria e publica um artigo imediatamente",
    required_fields: ["title"],
    optional_fields: ["id", "subtitle", "content", "category", "tag", "imageUrl", "author"],
    note: "Se 'title' não for enviado, será derivado de 'subtitle' ou da primeira frase de 'content'. Se 'id' for enviado sem 'title', o rascunho existente é publicado.",
    authentication: "Bearer token (Authorization header)",
  });
});

/**
 * Derives a title from available text fields.
 * Priority: subtitle → first sentence of content → timestamp fallback.
 */
function deriveTitle(subtitle?: string, content?: string): string {
  const sub = subtitle?.trim();
  if (sub && sub.length >= 10) {
    return sub.length <= 120 ? sub : sub.slice(0, 120).replace(/\s+\S*$/, "…");
  }

  const body = content?.trim();
  if (body) {
    // Take first sentence (up to first period/exclamation/question mark)
    const sentence = /^([^.!?]{10,120})[.!?]/.exec(body)?.[1]?.trim();
    if (sentence) return sentence;
    // Fallback: first 100 chars of content
    const snippet = body.slice(0, 100).replace(/\s+\S*$/, "").trim();
    if (snippet.length >= 10) return snippet + "…";
  }

  // Last resort: timestamp
  return `Artigo ${new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * POST /api/publish
 *
 * Webhook endpoint to create and immediately publish an article.
 * Requires: Authorization: Bearer <token>
 *
 * Body:
 *   title       string  recommended (auto-derived from subtitle/content if absent)
 *   subtitle    string  optional
 *   content     string  optional
 *   category    string  optional  default: "geral"
 *   tag         string  optional  default: "GERAL"
 *   imageUrl    string  optional
 *   author      string  optional  default: "Redação SBC Agora"
 *   id          string  optional  if provided without title, publishes an existing draft
 */
router.post("/", publishRateLimit, authMiddleware, async (req, res) => {
  req.log.info({ webhookBody: req.body, contentType: String(req.headers["content-type"] ?? "") }, "POST /api/publish received");

  const {
    id, title, subtitle, content, category, tag, imageUrl, author,
  } = req.body as {
    id?: string; title?: string; subtitle?: string; content?: string; category?: string;
    tag?: string; imageUrl?: string; author?: string;
  };

  // If caller sent an article ID but no title → publish existing draft
  if (id?.trim() && !title?.trim()) {
    const article = await articleService.updateArticle(id.trim(), {
      status: "published",
      publishedAt: new Date().toISOString(),
    });
    if (!article) {
      res.status(404).json({ ok: false, error: "Artigo não encontrado", id: id.trim() });
      return;
    }
    void sendPushToAll({
      title: article.title.replace(/<[^>]*>/g, ""),
      body: (article.subtitle || "").replace(/<[^>]*>/g, "").slice(0, 100),
      url: `/artigo/${article.slug || article.id}`,
    });
    res.json({ ok: true, message: "Artigo publicado com sucesso", article });
    return;
  }

  // If no usable content at all, return a clear error
  const hasContent = title?.trim() || subtitle?.trim() || content?.trim();
  if (!hasContent) {
    res.status(400).json({
      ok: false,
      error: "Nenhum conteúdo fornecido. Envie ao menos 'title', 'subtitle' ou 'content'.",
      required_fields: ["title"],
      optional_fields: ["id", "subtitle", "content", "category", "tag", "imageUrl", "author"],
    });
    return;
  }

  // Derive title if not explicitly provided
  const resolvedTitle = title?.trim() || deriveTitle(subtitle, content);

  if (!resolvedTitle) {
    res.status(400).json({
      ok: false,
      error: "Não foi possível derivar um título. Envie o campo 'title'.",
      required_fields: ["title"],
      optional_fields: ["id", "subtitle", "content", "category", "tag", "imageUrl", "author"],
    });
    return;
  }

  if (!title?.trim()) {
    req.log.warn(
      { derivedTitle: resolvedTitle, providedFields: Object.keys(req.body as object).filter(k => !!(req.body as Record<string, unknown>)[k]) },
      "POST /api/publish: 'title' ausente — título derivado automaticamente"
    );
  }

  const article = await articleService.createArticle({
    title: resolvedTitle,
    subtitle: subtitle?.trim() ?? "",
    content: content?.trim() ?? "",
    category: category?.trim() ?? "geral",
    tag: tag?.trim() ?? "GERAL",
    imageUrl: imageUrl?.trim() ?? "",
    author: author?.trim() ?? "Redação SBC Agora",
    publishedAt: new Date().toISOString(),
    status: "published",
  });

  void sendPushToAll({
    title: article.title.replace(/<[^>]*>/g, ""),
    body: (article.subtitle || "").replace(/<[^>]*>/g, "").slice(0, 100),
    url: `/artigo/${article.slug || article.id}`,
  });
  const titleDerived = !title?.trim();
  res.status(201).json({
    ok: true,
    message: "Artigo criado e publicado com sucesso",
    article,
    ...(titleDerived ? { warning: "Campo 'title' ausente — título derivado automaticamente de outros campos." } : {}),
  });
});

/**
 * POST /api/publish/:id
 * Publish an existing draft by ID.
 */
router.post("/:id", authMiddleware, async (req, res) => {
  const article = await articleService.updateArticle(String(req.params["id"] ?? ""), {
    status: "published",
    publishedAt: new Date().toISOString(),
  });
  if (!article) {
    res.status(404).json({ ok: false, error: "Artigo não encontrado" });
    return;
  }
  void sendPushToAll({
    title: article.title.replace(/<[^>]*>/g, ""),
    body: (article.subtitle || "").replace(/<[^>]*>/g, "").slice(0, 100),
    url: `/artigo/${article.slug || article.id}`,
  });
  res.json({ ok: true, message: "Artigo publicado com sucesso", article });
});

export default router;
