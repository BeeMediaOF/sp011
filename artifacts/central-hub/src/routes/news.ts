import { Router } from "express";
import {
  db,
  newsItemsTable,
  rewritesTable,
  deliveriesTable,
} from "@workspace/central-db";
import { desc, eq, ilike, and, type SQL } from "drizzle-orm";
import { authMiddleware } from "../middlewares/auth.js";

const router = Router();
router.use(authMiddleware);

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
