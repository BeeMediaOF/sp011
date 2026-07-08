import { Router } from "express";
import {
  db,
  blogsTable,
  deliveriesTable,
  deliveryAttemptsTable,
  newsItemsTable,
  rewritesTable,
} from "@workspace/central-db";
import { and, asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import { authMiddleware } from "../middlewares/auth.js";
import { logEvent } from "../lib/eventLog.js";
import { needsTranslation } from "../lib/localization.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const blogId = typeof req.query.blogId === "string" ? req.query.blogId : undefined;
  const limit = Math.min(Number(req.query.limit) || 100, 500);

  const conditions: SQL[] = [];
  if (status) conditions.push(eq(deliveriesTable.status, status));
  if (blogId) conditions.push(eq(deliveriesTable.blogId, blogId));

  const rows = await db
    .select({
      delivery: deliveriesTable,
      newsTitle: newsItemsTable.title,
      rewriteTitle: rewritesTable.title,
      blogName: blogsTable.name,
    })
    .from(deliveriesTable)
    .leftJoin(newsItemsTable, eq(newsItemsTable.id, deliveriesTable.newsItemId))
    .leftJoin(rewritesTable, eq(rewritesTable.id, deliveriesTable.rewriteId))
    .leftJoin(blogsTable, eq(blogsTable.id, deliveriesTable.blogId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(deliveriesTable.createdAt))
    .limit(limit);

  res.json(rows.map((r) => ({
    ...r.delivery,
    title: r.rewriteTitle ?? r.newsTitle,
    blogName: r.blogName,
  })));
});

/** Fila de revisão: entregas aguardando aprovação, mais antigas primeiro. */
router.get("/review", async (_req, res) => {
  const rows = await db
    .select({
      delivery: deliveriesTable,
      newsTitle: newsItemsTable.title,
      sourceName: newsItemsTable.sourceName,
      imageUrl: newsItemsTable.imageUrl,
      rewriteTitle: rewritesTable.title,
      rewriteSubtitle: rewritesTable.subtitle,
      contentHtml: rewritesTable.contentHtml,
      blogName: blogsTable.name,
    })
    .from(deliveriesTable)
    .leftJoin(newsItemsTable, eq(newsItemsTable.id, deliveriesTable.newsItemId))
    .leftJoin(rewritesTable, eq(rewritesTable.id, deliveriesTable.rewriteId))
    .leftJoin(blogsTable, eq(blogsTable.id, deliveriesTable.blogId))
    .where(eq(deliveriesTable.status, "awaiting_approval"))
    .orderBy(asc(deliveriesTable.createdAt))
    .limit(100);

  res.json(rows.map((r) => ({
    ...r.delivery,
    title: r.rewriteTitle ?? r.newsTitle,
    subtitle: r.rewriteSubtitle,
    contentHtml: r.contentHtml,
    sourceName: r.sourceName,
    imageUrl: r.imageUrl,
    blogName: r.blogName,
  })));
});

router.get("/:id/attempts", async (req, res) => {
  const rows = await db
    .select()
    .from(deliveryAttemptsTable)
    .where(eq(deliveryAttemptsTable.deliveryId, req.params.id))
    .orderBy(asc(deliveryAttemptsTable.attemptNo));
  res.json(rows);
});

/** Aprova uma entrega em revisão (vai para a fila de envio). */
router.post("/:id/approve", async (req, res) => {
  const [row] = await db
    .update(deliveriesTable)
    .set({
      status: "pending",
      approvedBy: req.centralUserId ?? null,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(deliveriesTable.id, req.params.id), eq(deliveriesTable.status, "awaiting_approval")))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Entrega não encontrada ou não está aguardando aprovação." });
    return;
  }
  logEvent({ module: "delivery", refType: "delivery", refId: row.id, message: "Entrega aprovada" });
  res.json(row);
});

/** Rejeita uma entrega em revisão. */
router.post("/:id/reject", async (req, res) => {
  const [row] = await db
    .update(deliveriesTable)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(deliveriesTable.id, req.params.id), eq(deliveriesTable.status, "awaiting_approval")))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Entrega não encontrada ou não está aguardando aprovação." });
    return;
  }
  logEvent({ module: "delivery", refType: "delivery", refId: row.id, message: "Entrega rejeitada" });
  res.json(row);
});

/** Reenvia manualmente uma entrega dead/failed/cancelled. */
router.post("/:id/retry", async (req, res) => {
  const rows = await db.select().from(deliveriesTable).where(eq(deliveriesTable.id, req.params.id)).limit(1);
  const delivery = rows[0];
  if (!delivery) {
    res.status(404).json({ error: "Entrega não encontrada." });
    return;
  }
  if (!["dead", "failed", "cancelled"].includes(delivery.status)) {
    res.status(409).json({ error: `Entrega em status '${delivery.status}' não pode ser reenviada.` });
    return;
  }

  // Blog em idioma diferente da reescrita apontada → volta para a fila de
  // localização (reenviar direto como "pending" publicaria o texto no idioma
  // errado — ex.: PT num blog EN quando a tradução era o que tinha falhado).
  const [blog] = await db
    .select({ language: blogsTable.language })
    .from(blogsTable)
    .where(eq(blogsTable.id, delivery.blogId))
    .limit(1);
  const [rewrite] = await db
    .select({ language: rewritesTable.language })
    .from(rewritesTable)
    .where(eq(rewritesTable.id, delivery.rewriteId))
    .limit(1);
  const mustLocalize = !!blog && needsTranslation(blog.language, rewrite?.language);

  const [row] = await db
    .update(deliveriesTable)
    .set({
      status: mustLocalize ? "awaiting_localization" : "pending",
      nextRetryAt: null,
      scheduledAt: new Date(),
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(deliveriesTable.id, delivery.id))
    .returning();
  logEvent({
    module: "delivery", refType: "delivery", refId: delivery.id,
    message: mustLocalize ? "Reenvio manual: entrega voltou para tradução" : "Reenvio manual solicitado",
  });
  res.json(row);
});

/** Publica agora: fura o agendamento de uma entrega pendente e, se estava
 *  aguardando aprovação, aprova no mesmo ato. O worker envia no próximo tick. */
router.post("/:id/publish-now", async (req, res) => {
  const rows = await db.select().from(deliveriesTable).where(eq(deliveriesTable.id, req.params.id)).limit(1);
  const delivery = rows[0];
  if (!delivery) {
    res.status(404).json({ error: "Entrega não encontrada." });
    return;
  }
  if (!["pending", "awaiting_approval"].includes(delivery.status)) {
    res.status(409).json({ error: `Entrega em status '${delivery.status}' não pode ser publicada agora.` });
    return;
  }

  const [row] = await db
    .update(deliveriesTable)
    .set({
      status: "pending",
      scheduledAt: new Date(),
      nextRetryAt: null,
      ...(delivery.status === "awaiting_approval"
        ? { approvedBy: req.centralUserId ?? null, approvedAt: new Date() }
        : {}),
      updatedAt: new Date(),
    })
    // Condição no status original: se o worker/revisor mudou o estado no meio
    // tempo, não sobrescreve (evita "aprovar" uma entrega já cancelada).
    .where(and(eq(deliveriesTable.id, delivery.id), eq(deliveriesTable.status, delivery.status)))
    .returning();
  if (!row) {
    res.status(409).json({ error: "Entrega mudou de status — recarregue a lista." });
    return;
  }
  logEvent({
    module: "delivery", refType: "delivery", refId: row.id,
    message: delivery.status === "awaiting_approval" ? "Publicação imediata (aprovada no ato)" : "Publicação imediata solicitada",
  });
  res.json(row);
});

/** Cancela uma entrega pendente/agendada (inclui aguardando tradução). */
router.post("/:id/cancel", async (req, res) => {
  const [row] = await db
    .update(deliveriesTable)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(
      eq(deliveriesTable.id, req.params.id),
      inArray(deliveriesTable.status, ["pending", "awaiting_localization"]),
    ))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Entrega não encontrada ou não está pendente." });
    return;
  }
  res.json(row);
});

export default router;
