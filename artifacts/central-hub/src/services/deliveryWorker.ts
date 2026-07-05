/**
 * Worker de entregas — envia `deliveries` pendentes ao `/api/ingest` de cada
 * blog com assinatura HMAC, registra `delivery_attempts` e aplica a política:
 * - 2xx → delivered (ou duplicate, conforme o corpo);
 * - 400/422 → failed (payload rejeitado, sem retry);
 * - 401 → failed + alerta (segredo errado, sem retry);
 * - timeout/5xx/429/rede → retry com backoff 1m→5m→15m→1h→6h; 5 tentativas → dead.
 */
import {
  db,
  blogsTable,
  deliveriesTable,
  deliveryAttemptsTable,
  newsItemsTable,
  rewritesTable,
  type DeliveryRow,
} from "@workspace/central-db";
import { and, asc, eq, isNull, lte, or } from "drizzle-orm";
import { getSettings } from "../lib/store.js";
import { logger } from "../lib/logger.js";
import { logEvent } from "../lib/eventLog.js";
import { sendSigned, INGEST_API_VERSION } from "./blogClient.js";
import { backoffMsForAttempt, MAX_DELIVERY_ATTEMPTS } from "../lib/backoff.js";

const POLL_MS = 15_000;
const BATCH = 5;

let _timer: NodeJS.Timeout | null = null;
let _running = false;

async function processDelivery(delivery: DeliveryRow): Promise<void> {
  // Claim condicional
  const claimed = await db
    .update(deliveriesTable)
    .set({ status: "delivering", updatedAt: new Date() })
    .where(and(eq(deliveriesTable.id, delivery.id), eq(deliveriesTable.status, "pending")))
    .returning({ id: deliveriesTable.id });
  if (claimed.length === 0) return;

  const fail = async (status: string, error: string, httpStatus?: number) => {
    await db
      .update(deliveriesTable)
      .set({
        status,
        lastError: error.slice(0, 500),
        lastHttpStatus: httpStatus ?? null,
        updatedAt: new Date(),
      })
      .where(eq(deliveriesTable.id, delivery.id));
  };

  const [blog] = await db.select().from(blogsTable).where(eq(blogsTable.id, delivery.blogId)).limit(1);
  if (!blog) return void fail("cancelled", "Blog não existe mais");
  if (!blog.isActive) return void fail("cancelled", "Blog inativo");

  const [news] = await db.select().from(newsItemsTable).where(eq(newsItemsTable.id, delivery.newsItemId)).limit(1);
  const [rewrite] = await db.select().from(rewritesTable).where(eq(rewritesTable.id, delivery.rewriteId)).limit(1);
  if (!news || !rewrite) return void fail("failed", "Notícia/reescrita não encontrada no central");

  const payload = {
    v: INGEST_API_VERSION,
    deliveryId: delivery.id,
    centralId: news.id,
    mode: blog.deliveryMode === "draft" ? "draft" : "publish",
    article: {
      title: rewrite.title ?? news.title,
      subtitle: rewrite.subtitle ?? undefined,
      contentHtml: rewrite.contentHtml ?? "",
      category: delivery.targetCategory ?? news.category,
      tag: delivery.targetTag ?? undefined,
      imageUrl: news.imageUrl ?? undefined,
      slug: rewrite.slug ?? undefined,
      keywords: rewrite.keywords ?? undefined,
      socialTitle: rewrite.socialTitle ?? undefined,
      socialSummary: rewrite.socialSummary ?? undefined,
      socialHashtags: rewrite.socialHashtags ?? undefined,
      sourceName: news.sourceName,
      sourceUrl: news.originalUrl ?? undefined,
      canonicalUrl: news.canonicalUrl ?? undefined,
    },
  };

  const attemptNo = delivery.attempts + 1;
  const result = await sendSigned(blog, "", payload);

  await db.insert(deliveryAttemptsTable).values({
    deliveryId: delivery.id,
    attemptNo,
    httpStatus: result.httpStatus || null,
    ok: result.ok,
    errorMessage: result.error?.slice(0, 500) ?? null,
    durationMs: result.durationMs,
  });

  if (result.ok) {
    const remoteResult = (result.body?.["result"] as string | undefined) ?? "created";
    const finalStatus = remoteResult === "duplicate" ? "duplicate" : "delivered";
    await db
      .update(deliveriesTable)
      .set({
        status: finalStatus,
        attempts: attemptNo,
        deliveredAt: new Date(),
        remoteArticleId: (result.body?.["articleId"] as string | undefined) ?? null,
        remoteUrl: (result.body?.["url"] as string | undefined) ?? null,
        lastError: null,
        lastHttpStatus: result.httpStatus,
        updatedAt: new Date(),
      })
      .where(eq(deliveriesTable.id, delivery.id));
    await db
      .update(blogsTable)
      .set({ status: "online", lastSeenAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(eq(blogsTable.id, blog.id));
    logEvent({
      module: "delivery", refType: "delivery", refId: delivery.id,
      message: `Entregue a ${blog.name} (${remoteResult}): ${payload.article.title}`,
    });
    return;
  }

  // Falhas sem retry: payload rejeitado ou assinatura inválida
  const noRetry = result.httpStatus === 400 || result.httpStatus === 422 || result.httpStatus === 401;
  const exhausted = attemptNo >= MAX_DELIVERY_ATTEMPTS;

  await db
    .update(deliveriesTable)
    .set({
      status: noRetry ? "failed" : exhausted ? "dead" : "pending",
      attempts: attemptNo,
      nextRetryAt: noRetry || exhausted ? null : new Date(Date.now() + backoffMsForAttempt(attemptNo)),
      lastError: result.error?.slice(0, 500) ?? "erro desconhecido",
      lastHttpStatus: result.httpStatus || null,
      updatedAt: new Date(),
    })
    .where(eq(deliveriesTable.id, delivery.id));

  await db
    .update(blogsTable)
    .set({ status: "error", lastError: result.error?.slice(0, 300) ?? "erro", updatedAt: new Date() })
    .where(eq(blogsTable.id, blog.id));

  logEvent({
    module: "delivery",
    level: result.httpStatus === 401 ? "error" : "warn",
    refType: "delivery", refId: delivery.id,
    message: result.httpStatus === 401
      ? `ASSINATURA REJEITADA por ${blog.name} — verifique o segredo de integração`
      : `Entrega falhou (tentativa ${attemptNo}/${MAX_DELIVERY_ATTEMPTS}) p/ ${blog.name}: ${result.error}`,
    meta: { httpStatus: result.httpStatus },
  });
}

async function tick(): Promise<void> {
  if (_running) return;
  _running = true;
  try {
    const s = getSettings();
    if (!s.deliveryEnabled) return;

    const now = new Date();
    const due = await db
      .select()
      .from(deliveriesTable)
      .where(and(
        eq(deliveriesTable.status, "pending"),
        or(isNull(deliveriesTable.nextRetryAt), lte(deliveriesTable.nextRetryAt, now)),
        or(isNull(deliveriesTable.scheduledAt), lte(deliveriesTable.scheduledAt, now)),
      ))
      .orderBy(asc(deliveriesTable.createdAt))
      .limit(BATCH);

    for (const delivery of due) {
      await processDelivery(delivery);
    }
  } catch (err) {
    logger.error({ err }, "Erro no tick do worker de entregas");
  } finally {
    _running = false;
  }
}

export function startDeliveryWorker(): void {
  if (_timer) return;
  _timer = setInterval(() => { void tick(); }, POLL_MS);
  _timer.unref();
  logger.info("Worker de entregas iniciado (poll 15s)");
}
