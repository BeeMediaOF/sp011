import { Router } from "express";
import { eq, gte, isNull, or, and, sql } from "drizzle-orm";
import sharp from "sharp";
import { db, adsTable, adDailyStatsTable, parseTargetDevices } from "@workspace/db";
import { isBotRequest, overRateLimit, createDedupWindow, INGEST_RATE_LIMITS } from "../lib/trafficGuard.js";
import { cleanStr, normalizeIp, type InternalReason } from "../lib/analyticsShared.js";
import { detectInternalRequest } from "../lib/internalTraffic.js";
import { bumpEndpoint, bumpInternalReason, type IngestEndpointId } from "../lib/analyticsHealth.js";
import { logger } from "../lib/logger.js";
import { store } from "../lib/store.js";

const router = Router();

// ─── Dedup server-side por sessão/anúncio (PRD 04 RF4; mecanismo do PRD 03 RF5) ─
// O client já promete 1×/aba; o servidor garante ~1×/sessão/anúncio mesmo com N
// abas, storage bloqueado ou script direto. Chave: adimp|adclick:<adId>:<sessão|ip>.
// createDedupWindow (trafficGuard) tem varredura e teto próprios — janela fixa.
const adImpDedup   = createDedupWindow({ windowMs: 30 * 60_000 }); // 30 min
const adClickDedup = createDedupWindow({ windowMs: 10_000 });      // 10 s (mata double-fire)

/** Contabiliza um evento de anúncio ACEITO (PRD 03 RF1): `received` sempre; se
 *  interno (PRD 04 RF3), soma `flaggedInternal` + a razão. Espelha o /event. */
function noteAdAccept(ep: IngestEndpointId, det: { internal: boolean; reason: InternalReason | null }): void {
  bumpEndpoint(ep, "received");
  if (det.internal && det.reason) { bumpEndpoint(ep, "flaggedInternal"); bumpInternalReason(det.reason); }
}

// ─── Blocos "É uma propaganda" ────────────────────────────────────────────────
// Blocos de imagem/HTML da home ou da lateral da notícia marcados isAd também
// são inventário medido: chave `block:<id>`, contadores só em ad_daily_stats
// (não existe linha na tabela ads). A validação é contra as settings — id
// desconhecido/não marcado não vira métrica.
const BLOCK_PREFIX = "block:";

function findAdBlock(blockId: string): { visible: boolean } | null {
  const s = store.getSettings();
  // Pseudo-bloco: banner do cabeçalho (settings.headerBannerHtml) — também é
  // inventário medido, sob a chave fixa block:header-banner.
  if (blockId === "header-banner") {
    return s.headerBannerHtml?.trim() ? { visible: true } : null;
  }
  for (const list of [s.homeBlocks ?? [], s.articleSidebarBlocks ?? []]) {
    const b = list.find((x) => x.id === blockId && x.isAd === true);
    if (b) return { visible: b.visible !== false };
  }
  return null;
}

function todayStr(): string {
  // Dia calendário de Brasília (UTC-3 fixo — sem horário de verão desde 2019).
  return new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * Grava +1 no par (ad_id, date) de forma ATÔMICA (PRD 04 RF1). O índice único
 * ad_daily_ad_date_uniq (criado pelo reparo no boot) faz o ON CONFLICT colapsar tudo
 * numa linha: 1º evento do dia = 1 (não 2), demais = +1, concorrência resolvida pelo
 * banco. Interno (RF3) vai para internal_*, sem tocar impressions/clicks públicos.
 * Fire-and-forget: try/catch evita unhandled rejection (chamado via `void`); se o
 * índice ainda não existir (reparo falhou), o ON CONFLICT erra, é logado e o boot
 * seguinte reexecuta o reparo — o all-time de adsTable continua correto.
 */
async function upsertDailyStat(adId: string, field: "impressions" | "clicks", internal: boolean) {
  const date = todayStr();
  const set =
    internal && field === "impressions"
      ? { internalImpressions: sql`${adDailyStatsTable.internalImpressions} + 1` }
      : internal
        ? { internalClicks: sql`${adDailyStatsTable.internalClicks} + 1` }
        : field === "impressions"
          ? { impressions: sql`${adDailyStatsTable.impressions} + 1` }
          : { clicks: sql`${adDailyStatsTable.clicks} + 1` };
  try {
    await db
      .insert(adDailyStatsTable)
      .values({
        adId,
        date,
        impressions:         !internal && field === "impressions" ? 1 : 0,
        clicks:              !internal && field === "clicks"      ? 1 : 0,
        internalImpressions: internal && field === "impressions"  ? 1 : 0,
        internalClicks:      internal && field === "clicks"       ? 1 : 0,
      })
      .onConflictDoUpdate({ target: [adDailyStatsTable.adId, adDailyStatsTable.date], set });
  } catch (err) {
    logger.warn({ err, adId }, "ads: falha ao gravar stat diário (não-fatal)");
  }
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

  // Bots e flood não viram métrica de cobrança — descarte silencioso, agora contado.
  if (isBotRequest(req)) { bumpEndpoint("adClick", "droppedBot"); res.json({ ok: true }); return; }
  if (overRateLimit(`adclick:${req.ip ?? ""}`, INGEST_RATE_LIMITS.adClick)) {
    bumpEndpoint("adClick", "droppedRate"); res.json({ ok: true }); return;
  }

  const b = (req.body ?? {}) as Record<string, unknown>;
  const ip = normalizeIp(req.ip ?? "");
  const sessionId = cleanStr(b["sessionId"], 100);
  const det = detectInternalRequest(b["internal"] === true, ip);
  const internal = det.internal;

  // Dedup server-side (RF4): mesmo (sessão|ip, anúncio) em 10s = duplo clique.
  if (adClickDedup.hit(`adclick:${id}:${sessionId ?? `ip:${ip}`}`)) {
    bumpEndpoint("adClick", "droppedDuplicate");
    res.json({ ok: true });
    return;
  }

  // Bloco da home marcado "É uma propaganda" — só o histórico diário.
  if (id.startsWith(BLOCK_PREFIX)) {
    const blk = findAdBlock(id.slice(BLOCK_PREFIX.length));
    if (!blk || !blk.visible) {
      bumpEndpoint("adClick", "droppedInvalid");
      res.status(404).json({ ok: false, error: "Ad not found or inactive" });
      return;
    }
    noteAdAccept("adClick", det);
    void upsertDailyStat(id, "clicks", internal);
    res.json({ ok: true, message: "Click tracked" });
    return;
  }

  const [row] = await db
    .select({ id: adsTable.id, active: adsTable.active })
    .from(adsTable)
    .where(eq(adsTable.id, id))
    .limit(1);

  if (!row || !row.active) {
    bumpEndpoint("adClick", "droppedInvalid");
    res.status(404).json({ ok: false, error: "Ad not found or inactive" });
    return;
  }

  // Interno (RF3) não incrementa o all-time público — só a coluna internal_*.
  if (!internal) {
    await db
      .update(adsTable)
      .set({ clicks: sql`${adsTable.clicks} + 1`, updatedAt: new Date() })
      .where(eq(adsTable.id, id));
  }
  noteAdAccept("adClick", det);

  void upsertDailyStat(id, "clicks", internal);

  res.json({ ok: true, message: "Click tracked" });
});

/** POST /api/ads/:id/impression — registra impressão (público) */
router.post("/:id/impression", async (req, res) => {
  const id = req.params.id ?? "";

  if (isBotRequest(req)) { bumpEndpoint("adImpression", "droppedBot"); res.json({ ok: true }); return; }
  if (overRateLimit(`adimp:${req.ip ?? ""}`, INGEST_RATE_LIMITS.adImpression)) {
    bumpEndpoint("adImpression", "droppedRate"); res.json({ ok: true }); return;
  }

  const b = (req.body ?? {}) as Record<string, unknown>;
  const ip = normalizeIp(req.ip ?? "");
  const sessionId = cleanStr(b["sessionId"], 100);
  const det = detectInternalRequest(b["internal"] === true, ip);
  const internal = det.internal;

  // Dedup server-side (RF4): mesmo (sessão|ip, anúncio) em 30min = mesma visita.
  if (adImpDedup.hit(`adimp:${id}:${sessionId ?? `ip:${ip}`}`)) {
    bumpEndpoint("adImpression", "droppedDuplicate");
    res.json({ ok: true });
    return;
  }

  // Bloco da home marcado "É uma propaganda" — só bloco visível conta.
  if (id.startsWith(BLOCK_PREFIX)) {
    const blk = findAdBlock(id.slice(BLOCK_PREFIX.length));
    if (blk && blk.visible) {
      noteAdAccept("adImpression", det);
      void upsertDailyStat(id, "impressions", internal);
    } else {
      bumpEndpoint("adImpression", "droppedInvalid");
    }
    res.json({ ok: true });
    return;
  }

  // Só anúncio ativo e não expirado gera impressão (clique já checava active).
  const [row] = await db
    .select({ id: adsTable.id, active: adsTable.active, expiresAt: adsTable.expiresAt })
    .from(adsTable)
    .where(eq(adsTable.id, id))
    .limit(1);

  if (!row || !row.active || (row.expiresAt && row.expiresAt < new Date())) {
    bumpEndpoint("adImpression", "droppedInvalid");
    res.json({ ok: true });
    return;
  }

  // Interno (RF3) não incrementa o all-time público — só a coluna internal_*.
  if (!internal) {
    await db
      .update(adsTable)
      .set({ impressions: sql`${adsTable.impressions} + 1`, updatedAt: new Date() })
      .where(eq(adsTable.id, id));
  }
  noteAdAccept("adImpression", det);

  void upsertDailyStat(id, "impressions", internal);

  res.json({ ok: true });
});

export default router;
