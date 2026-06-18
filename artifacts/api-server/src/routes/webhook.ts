import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.js";
import { articleService } from "../lib/articleService.js";

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
    optional_fields: ["subtitle", "content", "category", "tag", "imageUrl", "author"],
    authentication: "Bearer token (Authorization header)",
  });
});

/**
 * POST /api/publish
 *
 * Webhook endpoint to create and immediately publish an article.
 * Requires: Authorization: Bearer <token>
 *
 * Body:
 *   title       string  required
 *   subtitle    string  optional
 *   content     string  optional
 *   category    string  optional  default: "geral"
 *   tag         string  optional  default: "GERAL"
 *   imageUrl    string  optional
 *   author      string  optional  default: "Redação Brasília Hoje"
 */
router.post("/", authMiddleware, async (req, res) => {
  // Log the raw body to help debug integration issues
  req.log.info({ webhookBody: req.body, contentType: req.headers["content-type"] }, "POST /api/publish received");

  const {
    id, title, subtitle, content, category, tag, imageUrl, author,
  } = req.body as {
    id?: string; title?: string; subtitle?: string; content?: string; category?: string;
    tag?: string; imageUrl?: string; author?: string;
  };

  // If caller sent an article ID but no title → publish existing draft (same as POST /api/publish/:id)
  if (id?.trim() && !title?.trim()) {
    const article = await articleService.updateArticle(id.trim(), {
      status: "published",
      publishedAt: new Date().toISOString(),
    });
    if (!article) {
      res.status(404).json({ ok: false, error: "Artigo não encontrado", id: id.trim() });
      return;
    }
    res.json({ ok: true, message: "Artigo publicado com sucesso", article });
    return;
  }

  if (!title?.trim()) {
    res.status(400).json({
      ok: false,
      error: "O campo 'title' é obrigatório (ou envie 'id' para publicar um rascunho existente)",
      required_fields: ["title"],
      optional_fields: ["id", "subtitle", "content", "category", "tag", "imageUrl", "author"],
    });
    return;
  }

  const article = await articleService.createArticle({
    title: title.trim(),
    subtitle: subtitle?.trim() ?? "",
    content: content?.trim() ?? "",
    category: category?.trim() ?? "geral",
    tag: tag?.trim() ?? "GERAL",
    imageUrl: imageUrl?.trim() ?? "",
    author: author?.trim() ?? "Redação Brasília Hoje",
    publishedAt: new Date().toISOString(),
    status: "published",
  });

  res.status(201).json({
    ok: true,
    message: "Artigo criado e publicado com sucesso",
    article,
  });
});

/**
 * POST /api/publish/:id
 * Publish an existing draft by ID.
 */
router.post("/:id", authMiddleware, async (req, res) => {
  const article = await articleService.updateArticle(req.params.id ?? "", {
    status: "published",
    publishedAt: new Date().toISOString(),
  });
  if (!article) {
    res.status(404).json({ ok: false, error: "Artigo não encontrado" });
    return;
  }
  res.json({ ok: true, message: "Artigo publicado com sucesso", article });
});

export default router;
