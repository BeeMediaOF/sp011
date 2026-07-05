import { Router } from "express";
import {
  db,
  blogsTable,
  deliveriesTable,
  newsItemsTable,
  aiUsageEventsTable,
} from "@workspace/central-db";
import { gte, sql } from "drizzle-orm";
import { authMiddleware } from "../middlewares/auth.js";

const router = Router();
router.use(authMiddleware);

/** Contadores do dashboard: notícias/entregas por status, blogs, tokens de hoje. */
router.get("/", async (_req, res) => {
  const newsByStatus = await db
    .select({ status: newsItemsTable.status, n: sql<number>`count(*)::int` })
    .from(newsItemsTable)
    .groupBy(newsItemsTable.status);

  const deliveriesByStatus = await db
    .select({ status: deliveriesTable.status, n: sql<number>`count(*)::int` })
    .from(deliveriesTable)
    .groupBy(deliveriesTable.status);

  const blogsByStatus = await db
    .select({
      status: blogsTable.status,
      n: sql<number>`count(*)::int`,
    })
    .from(blogsTable)
    .groupBy(blogsTable.status);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [usageToday] = await db
    .select({
      calls: sql<number>`count(*)::int`,
      totalTokens: sql<number>`coalesce(sum(${aiUsageEventsTable.totalTokens}), 0)::int`,
    })
    .from(aiUsageEventsTable)
    .where(gte(aiUsageEventsTable.createdAt, startOfDay));

  const toMap = (rows: Array<{ status: string; n: number }>) =>
    Object.fromEntries(rows.map((r) => [r.status, r.n]));

  res.json({
    news: toMap(newsByStatus),
    deliveries: toMap(deliveriesByStatus),
    blogs: toMap(blogsByStatus),
    usageToday: usageToday ?? { calls: 0, totalTokens: 0 },
  });
});

export default router;
