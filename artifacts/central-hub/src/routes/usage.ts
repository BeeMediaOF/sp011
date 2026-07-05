import { Router } from "express";
import { db, aiUsageEventsTable } from "@workspace/central-db";
import { gte, sql } from "drizzle-orm";
import { authMiddleware } from "../middlewares/auth.js";

const router = Router();
router.use(authMiddleware);

/** Agregados de consumo de tokens: hoje, por dia (30d) e por provider (30d). */
router.get("/", async (_req, res) => {
  const since = new Date(Date.now() - 30 * 24 * 3600_000);

  const byDay = await db
    .select({
      day: sql<string>`to_char(${aiUsageEventsTable.createdAt} AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')`,
      calls: sql<number>`count(*)::int`,
      inputTokens: sql<number>`coalesce(sum(${aiUsageEventsTable.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${aiUsageEventsTable.outputTokens}), 0)::int`,
      totalTokens: sql<number>`coalesce(sum(${aiUsageEventsTable.totalTokens}), 0)::int`,
    })
    .from(aiUsageEventsTable)
    .where(gte(aiUsageEventsTable.createdAt, since))
    .groupBy(sql`1`)
    .orderBy(sql`1 desc`);

  const byProvider = await db
    .select({
      provider: aiUsageEventsTable.provider,
      model: aiUsageEventsTable.model,
      calls: sql<number>`count(*)::int`,
      totalTokens: sql<number>`coalesce(sum(${aiUsageEventsTable.totalTokens}), 0)::int`,
    })
    .from(aiUsageEventsTable)
    .where(gte(aiUsageEventsTable.createdAt, since))
    .groupBy(aiUsageEventsTable.provider, aiUsageEventsTable.model)
    .orderBy(sql`4 desc`);

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  res.json({
    today: byDay.find((d) => d.day === today) ?? { day: today, calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    byDay,
    byProvider,
  });
});

export default router;
