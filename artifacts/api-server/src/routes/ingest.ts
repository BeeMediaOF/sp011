/**
 * POST /api/ingest — receptor de notícias do PAINEL CENTRAL.
 *
 * Diferenças em relação ao /api/publish (webhook key):
 * - credencial própria (centralIngestSecret) com ESCOPO restrito a esta rota —
 *   não passa pelo authMiddleware e nunca ganha papel admin;
 * - autenticação por assinatura HMAC-SHA256 do corpo cru + timestamp
 *   (anti-replay 300s), verificada via @workspace/news-engine/signing;
 * - IDEMPOTENTE: `centralId` repetido → 200 result:"replay" (nunca duplica);
 * - DEDUPLICA contra artigos locais (título/URL/imagem + overlap) → 200
 *   result:"duplicate" — essencial na operação paralela do piloto;
 * - grava `rssSourceUrl` com a URL ORIGINAL da matéria (âncora do dedup
 *   determinístico enquanto a coleta local estiver ligada).
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { db, articlesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifyIngestSignature } from "@workspace/news-engine/signing";
import { sanitizeSocialTitle, stripInlineHtml } from "@workspace/social-template";
import { articleService } from "../lib/articleService.js";
import { store } from "../lib/store.js";
import { TAG_MAP } from "../lib/rssProcessor.js";
import { endpointRateLimit } from "../middlewares/endpointRateLimit.js";
import { sendPushToAll } from "./push.js";
import { logAudit, getClientIp } from "../lib/audit.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Bytes crus do corpo (capturados no express.json de app.ts). */
      rawBody?: Buffer;
    }
  }
}

const router = Router();
const ingestRateLimit = endpointRateLimit("/api/ingest");

export const INGEST_VERSION = 1;

function getIngestSecret(): string {
  return store.getSettings().centralIngestSecret ?? process.env["CENTRAL_INGEST_SECRET"] ?? "";
}

/** Auth por assinatura HMAC — escopo exclusivo desta rota. */
function centralIngestAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = getIngestSecret();
  if (!secret) {
    res.status(503).json({ ok: false, error: "central_not_configured", message: "Segredo do painel central não configurado neste blog." });
    return;
  }
  const timestamp = req.headers["x-central-timestamp"];
  const signature = req.headers["x-central-signature"];
  const result = verifyIngestSignature(
    secret,
    typeof timestamp === "string" ? timestamp : undefined,
    req.rawBody ?? Buffer.alloc(0),
    typeof signature === "string" ? signature : undefined,
  );
  if (!result.ok) {
    res.status(401).json({ ok: false, error: result.reason === "timestamp_skew" ? "timestamp_skew" : "invalid_signature" });
    return;
  }
  next();
}

/** Probe de descoberta (sem auth) — padrão do GET /api/publish. */
router.get("/", (_req, res) => {
  res.json({
    ok: true,
    version: INGEST_VERSION,
    endpoint: "POST /api/ingest",
    description: "Recebe notícias do painel central (assinatura HMAC + idempotência + dedup)",
    authentication: "X-Central-Timestamp + X-Central-Signature (HMAC-SHA256 de `${timestamp}.${rawBody}`)",
  });
});

/** Ping assinado — valida credencial/conectividade sem criar nada. */
router.post("/test", ingestRateLimit, centralIngestAuth, (req, res) => {
  const body = (req.body ?? {}) as { ping?: unknown };
  res.json({ ok: true, version: INGEST_VERSION, pong: body.ping ?? Date.now() });
});

interface IngestArticle {
  title?: string;
  subtitle?: string;
  contentHtml?: string;
  category?: string;
  tag?: string;
  imageUrl?: string;
  slug?: string;
  keywords?: string;
  socialTitle?: string;
  socialSummary?: string;
  socialHashtags?: string;
  sourceName?: string;
  sourceUrl?: string;
  canonicalUrl?: string;
}

router.post("/", ingestRateLimit, centralIngestAuth, async (req, res) => {
  req.log.info(
    { fields: Object.keys((req.body ?? {}) as object) },
    "POST /api/ingest recebido",
  );

  const { centralId, mode, article } = (req.body ?? {}) as {
    v?: number;
    centralId?: string;
    mode?: string;
    article?: IngestArticle;
  };

  if (!centralId?.trim() || !article?.title?.trim() || !article.contentHtml?.trim()) {
    res.status(422).json({
      ok: false,
      error: "payload_invalido",
      message: "Campos obrigatórios: centralId, article.title, article.contentHtml.",
    });
    return;
  }

  // ── Idempotência: reenvio do mesmo centralId nunca duplica ────────────────
  const existing = await db
    .select({ id: articlesTable.id, slug: articlesTable.slug })
    .from(articlesTable)
    .where(eq(articlesTable.centralId, centralId.trim()))
    .limit(1);
  if (existing.length > 0) {
    res.json({
      ok: true,
      result: "replay",
      articleId: existing[0]!.id,
      url: `/artigo/${existing[0]!.slug || existing[0]!.id}`,
    });
    return;
  }

  // ── Dedup local (título/URL original/imagem + overlap de palavras) ────────
  if (await articleService.isDuplicateArticle(article.title, article.sourceUrl, article.imageUrl)) {
    req.log.info({ centralId, title: article.title }, "Ingest: duplicado local — ignorado");
    res.json({ ok: true, result: "duplicate" });
    return;
  }

  // ── Guarda anti-"publicação fantasma" (paridade com o pipeline local) ─────
  const hasImage = !!article.imageUrl?.trim();
  const intendedStatus: "draft" | "published" = mode === "draft" ? "draft" : "published";
  const status = hasImage ? intendedStatus : "draft";
  const draftReason = !hasImage ? "no_image" : undefined;

  const category = article.category?.trim() || "geral";
  const saved = await articleService.createArticle({
    // Campos de texto puro: nunca aceitar HTML vindo de fora (título com <b>
    // literal quebra card, notificação, legenda social e SEO)
    title: stripInlineHtml(article.title.trim()),
    socialTitle: sanitizeSocialTitle(article.socialTitle?.trim() ?? "") || undefined,
    socialSummary: stripInlineHtml(article.socialSummary?.trim() ?? "") || undefined,
    socialHashtags: stripInlineHtml(article.socialHashtags?.trim() ?? "") || undefined,
    subtitle: stripInlineHtml(article.subtitle?.trim() ?? ""),
    content: article.contentHtml.trim(),
    category,
    tag: article.tag?.trim() || TAG_MAP[category] || "GERAL",
    imageUrl: article.imageUrl?.trim() ?? "",
    author: "Redação",
    publishedAt: new Date().toISOString(),
    status,
    origin: "rss",
    rssSourceName: article.sourceName?.trim() || "Painel Central",
    // Âncora do dedup determinístico durante a operação paralela do piloto
    rssSourceUrl: article.sourceUrl?.trim() || undefined,
    aiRewritten: true,
    slug: article.slug?.trim() || undefined,
    keywords: article.keywords?.trim() || undefined,
    canonicalUrl: article.canonicalUrl?.trim() || undefined,
    draftReason,
  });

  // Vincula o id central (idempotência de reenvios futuros)
  await db
    .update(articlesTable)
    .set({ centralId: centralId.trim() })
    .where(eq(articlesTable.id, saved.id));

  if (status === "published") {
    void sendPushToAll({
      title: saved.title.replace(/<[^>]*>/g, ""),
      body: (saved.subtitle || "").replace(/<[^>]*>/g, "").slice(0, 100),
      url: `/artigo/${saved.slug || saved.id}`,
    });
  }

  await logAudit({
    action: status === "published" ? "publish" : "create",
    module: "ingest",
    description: `Artigo recebido do painel central${status === "draft" ? " (rascunho)" : ""}: "${saved.title}"`,
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"],
    metadata: { source: "central_ingest", centralId, articleId: saved.id, status, draftReason },
  });

  res.status(201).json({
    ok: true,
    result: "created",
    articleId: saved.id,
    url: `/artigo/${saved.slug || saved.id}`,
    status,
  });
});

export default router;
