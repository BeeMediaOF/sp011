import { Router } from "express";
import { and, eq, gte, isNull, or, sql } from "drizzle-orm";
import sharp from "sharp";
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

/*
 * In-memory WebP cache keyed by ad ID.
 * Evitamos re-processar base64→WebP a cada request.
 * TTL: 1h — suficiente para absorver bursts de tráfego.
 */
interface CachedImage { webp: Buffer; at: number }
const imgCache = new Map<string, CachedImage>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hora

/** GET /api/ads/:id/image — serve a imagem do anúncio como WebP otimizado */
router.get("/:id/image", async (req, res) => {
  const id = req.params.id ?? "";

  const cached = imgCache.get(id);
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800");
    res.setHeader("X-Cache", "HIT");
    res.end(cached.webp);
    return;
  }

  const [row] = await db
    .select({ imageBase64: adsTable.imageBase64, imageUrl: adsTable.imageUrl, active: adsTable.active })
    .from(adsTable)
    .where(eq(adsTable.id, id))
    .limit(1);

  if (!row) { res.status(404).end(); return; }

  if (row.imageUrl) {
    const proxyUrl = `/api/image?url=${encodeURIComponent(row.imageUrl)}&w=960&q=80`;
    res.redirect(302, proxyUrl);
    return;
  }

  if (!row.imageBase64) { res.status(404).end(); return; }

  try {
    const b64 = row.imageBase64.replace(/^data:image\/[^;]+;base64,/, "");
    const buf = Buffer.from(b64, "base64");
    const webp = await sharp(buf)
      .resize({ width: 960, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    imgCache.set(id, { webp, at: Date.now() });

    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800");
    res.setHeader("X-Cache", "MISS");
    res.end(webp);
  } catch {
    res.status(500).json({ error: "Image processing failed" });
  }
});

/** GET /api/ads — lista anúncios ativos sem base64 (payload enxuto) */
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

  /*
   * ANTES: retornava imageBase64 inline → payload de 51MB.
   * AGORA: sempre retorna imageUrl apontando para /api/ads/:id/image
   *        que serve WebP com cache de 24h — payload < 1KB por anúncio.
   */
  const ads = rows.map((r) => ({
    id: r.id,
    imageUrl: `/api/ads/${r.id}/image`,
    link: r.link,
    position: r.position,
    targetDevices: parseTargetDevices(r.targetDevices),
  }));

  res.setHeader("Cache-Control", "public, max-age=10, stale-while-revalidate=60");
  res.json({ ads });
});

/** POST /api/ads/:id/click — registra clique (público) */
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

/** POST /api/ads/:id/impression — registra impressão (público) */
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
