import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db, adsTable, parseTargetDevices } from "@workspace/db";

const router = Router();

/** GET /api/ads — list active ads (public) */
router.get("/", async (_req, res) => {
  const rows = await db
    .select()
    .from(adsTable)
    .where(eq(adsTable.active, true));

  const ads = rows.map((r) => ({
    id: r.id,
    imageUrl: r.imageUrl || undefined,
    imageBase64: r.imageUrl ? "" : r.imageBase64,
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

  res.json({ ok: true });
});

export default router;
