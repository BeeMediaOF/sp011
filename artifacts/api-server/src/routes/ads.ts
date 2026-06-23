import { Router } from "express";
import { and, eq, gte, isNull, or, sql } from "drizzle-orm";
import { db, adsTable, adDailyStatsTable, parseTargetDevices } from "@workspace/db";

const router = Router();

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

async function upsertDailyStat(adId: string, field: "impressions" | "clicks") {
  const date = todayStr();
  await db
    .insert(adDailyStatsTable)
    .values({ adId, date, impressions: field === "impressions" ? 1 : 0, clicks: field === "clicks" ? 1 : 0 })
    .onConflictDoNothing();
  await db
    .update(adDailyStatsTable)
    .set(
      field === "impressions"
        ? { impressions: sql`${adDailyStatsTable.impressions} + 1` }
        : { clicks: sql`${adDailyStatsTable.clicks} + 1` }
    )
    .where(and(eq(adDailyStatsTable.adId, adId), eq(adDailyStatsTable.date, date)));
}

/** GET /api/ads — list active non-expired ads (public) */
router.get("/", async (_req, res) => {
  const now = new Date();

  const rows = await db
    .select()
    .from(adsTable)
    .where(
      and(
        eq(adsTable.active, true),
        or(isNull(adsTable.expiresAt), gte(adsTable.expiresAt, now))
      )
    );

  const ads = rows.map((r) => ({
    id: r.id,
    ...(r.imageUrl ? { imageUrl: r.imageUrl } : { imageBase64: r.imageBase64 }),
    link: r.link,
    position: r.position,
    targetDevices: parseTargetDevices(r.targetDevices),
  }));

  res.json({ ads });
});

/** POST /api/ads/:id/click — track click (public) */
router.post("/:id/click", async (req, res) => {
  const id = req.params.id ?? "";

  const [row] = await db
    .select({ id: adsTable.id, active: adsTable.active })
    .from(adsTable)
    .where(eq(adsTable.id, id))
    .limit(1);

  if (!row || !row.active) {
    res.status(404).json({ ok: false, error: "Ad not found or inactive" });
    return;
  }

  await db
    .update(adsTable)
    .set({ clicks: sql`${adsTable.clicks} + 1`, updatedAt: new Date() })
    .where(eq(adsTable.id, id));

  void upsertDailyStat(id, "clicks");

  res.json({ ok: true, message: "Click tracked" });
});

/** POST /api/ads/:id/impression — track impression (public) */
router.post("/:id/impression", async (req, res) => {
  const id = req.params.id ?? "";

  const [row] = await db
    .select({ id: adsTable.id })
    .from(adsTable)
    .where(eq(adsTable.id, id))
    .limit(1);

  if (!row) { res.json({ ok: true }); return; }

  await db
    .update(adsTable)
    .set({ impressions: sql`${adsTable.impressions} + 1`, updatedAt: new Date() })
    .where(eq(adsTable.id, id));

  void upsertDailyStat(id, "impressions");

  res.json({ ok: true });
});

export default router;
