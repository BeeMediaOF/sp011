import { Router } from "express";
import { gte, eq, count, sql, desc } from "drizzle-orm";
import { db, analyticsEventsTable, geoStatsTable, adsTable, adDailyStatsTable, behaviorEventsTable } from "@workspace/db";
import { authMiddleware } from "../middlewares/auth.js";
import { store } from "../lib/store.js";
import { articleService } from "../lib/articleService.js";
import { logger } from "../lib/logger.js";
import { isBotRequest, overRateLimit } from "../lib/trafficGuard.js";

const router = Router();

export interface AnalyticsEvent {
  type: "pageview" | "read" | "category" | "scroll" | "share";
  path: string;
  title?: string;
  category?: string;
  articleId?: string;
  sessionId: string;
  duration?: number;
  device: "mobile" | "desktop" | "tablet";
  ts: number;
  ua?: string;
  referrer?: string;
  scrollDepth?: number;
  platform?: string;
  city?: string;
  region?: string;
}

// ─── Fuso de exibição ─────────────────────────────────────────────────────────
// America/Sao_Paulo é UTC-3 fixo (o horário de verão foi abolido em 2019).
// Todo o bucketing por dia/hora usa o relógio de Brasília, não o do container.
const BRT_OFFSET_MS = 3 * 3_600_000;
const DAY = 86_400_000;
const brtDayKey = (tsMs: number): string => new Date(tsMs - BRT_OFFSET_MS).toISOString().slice(0, 10);
const brtHour   = (tsMs: number): number => new Date(tsMs - BRT_OFFSET_MS).getUTCHours();
const brtDow    = (tsMs: number): number => new Date(tsMs - BRT_OFFSET_MS).getUTCDay();

// ─── Validação de entrada ─────────────────────────────────────────────────────
// O endpoint é público: tudo que chega é hostil até prova em contrário. Um único
// valor fora do enum do Postgres faria o INSERT em lote falhar e travaria o
// buffer inteiro — por isso whitelist + clamps aqui, antes de enfileirar.
const VALID_TYPES: ReadonlySet<string>     = new Set(["pageview", "read", "category", "scroll", "share"]);
const VALID_REFERRERS: ReadonlySet<string> = new Set(["direto", "busca", "social", "outro"]);
const SCROLL_MILESTONES: ReadonlySet<number> = new Set([25, 50, 75, 100]);
/** Teto de duração de leitura — aba esquecida aberta não pode distorcer a média. */
const MAX_READ_SECONDS = 1800;

function cleanStr(v: unknown, max: number): string | undefined {
  return typeof v === "string" && v.length > 0 ? v.slice(0, max) : undefined;
}

// ─── In-memory buffer ─────────────────────────────────────────────────────────
const BUFFER_MAX = 500;
let _buffer: AnalyticsEvent[] = [];
let _flushing = false;

function toRow(ev: AnalyticsEvent) {
  return {
    type:        ev.type,
    path:        ev.path,
    title:       ev.title ?? null,
    category:    ev.category ?? null,
    articleId:   ev.articleId ?? null,
    sessionId:   ev.sessionId,
    duration:    ev.duration ?? null,
    device:      ev.device,
    ts:          new Date(ev.ts),
    ua:          ev.ua ?? null,
    referrer:    ev.referrer ?? null,
    scrollDepth: ev.scrollDepth ?? null,
    platform:    ev.platform ?? null,
    city:        ev.city ?? null,
    region:      ev.region ?? null,
  };
}

async function flushBuffer(): Promise<void> {
  if (_flushing || _buffer.length === 0) return;
  _flushing = true;
  const batch = _buffer.splice(0, _buffer.length);
  try {
    await db.insert(analyticsEventsTable).values(batch.map(toRow));
  } catch {
    // Lote falhou. Tenta um a um: um evento inválido é descartado sozinho em vez
    // de envenenar o buffer para sempre; se NENHUM entrar (banco fora do ar),
    // re-enfileira para tentar no próximo ciclo.
    let ok = 0;
    let consecutiveFails = 0;
    const failed: AnalyticsEvent[] = [];
    for (const ev of batch) {
      if (ok === 0 && consecutiveFails >= 10) { failed.push(ev); continue; } // banco fora — para de insistir
      try {
        await db.insert(analyticsEventsTable).values(toRow(ev));
        ok++;
      } catch {
        consecutiveFails++;
        failed.push(ev);
      }
    }
    if (ok === 0 && failed.length > 0) {
      _buffer.unshift(...failed.slice(0, Math.max(0, BUFFER_MAX - _buffer.length)));
    } else if (failed.length > 0) {
      logger.warn({ dropped: failed.length }, "analytics: eventos inválidos descartados no flush");
    }
  } finally {
    _flushing = false;
  }
}

setInterval(() => { void flushBuffer(); }, 30_000);

function pushEvent(ev: AnalyticsEvent): void {
  _buffer.push(ev);
  if (_buffer.length >= BUFFER_MAX) void flushBuffer();
}

/** Drena o buffer imediatamente — chamado no shutdown para não perder eventos no deploy. */
export async function flushAnalyticsBuffer(): Promise<void> {
  await flushBuffer();
}

/** Eventos ainda não persistidos (usado pelo realtime-stats para dados sem atraso). */
export function getPendingAnalyticsEvents(): AnalyticsEvent[] {
  return [..._buffer];
}

// ─── Device detection ─────────────────────────────────────────────────────────
function detectDevice(ua: string): "mobile" | "desktop" | "tablet" {
  if (/tablet|ipad|playbook|silk/i.test(ua)) return "tablet";
  if (/mobile|android|iphone|ipod|blackberry|opera mini|windows phone/i.test(ua)) return "mobile";
  return "desktop";
}

// ─── IP Geolocation via ip-api.com (async, cached, non-blocking) ──────────────
interface GeoResult { city: string; region: string; country: string }
const _geoCache = new Map<string, GeoResult | null>();
const _geoPending = new Set<string>();

function normalizeIp(raw: string): string {
  return raw.replace(/^::ffff:/i, "");
}

function isPrivateIp(raw: string): boolean {
  const ip = normalizeIp(raw);
  return (
    ip === "" ||
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
  );
}

/** Soma 1 view da cidade em geo_stats — chamado a cada pageview com geo conhecida,
 *  então `views` ≈ pageviews por cidade (não "IPs novos", como era antes). */
function bumpGeoViews(geo: GeoResult): void {
  const id = `${geo.city}::${geo.region}`;
  void db
    .insert(geoStatsTable)
    .values({ id, city: geo.city, region: geo.region, country: geo.country, views: 1, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: geoStatsTable.id,
      set: {
        views:     sql`${geoStatsTable.views} + 1`,
        updatedAt: new Date(),
      },
    })
    .catch(() => { /* ignore */ });
}

function lookupGeoAsync(ip: string): void {
  if (isPrivateIp(ip)) return;
  if (_geoCache.has(ip) || _geoPending.has(ip)) return;

  _geoPending.add(ip);
  fetch(`http://ip-api.com/json/${normalizeIp(ip)}?fields=status,city,regionName,countryCode&lang=pt-BR`, {
    signal: AbortSignal.timeout(3000),
  })
    .then(async (r) => {
      if (!r.ok) return;
      const d = await r.json() as { status: string; city?: string; regionName?: string; countryCode?: string };
      if (d.status !== "success" || !d.city) return;
      const geo: GeoResult = {
        city:    d.city,
        region:  d.regionName ?? "",
        country: d.countryCode ?? "BR",
      };
      _geoCache.set(ip, geo);
      bumpGeoViews(geo); // conta o pageview que originou o lookup
    })
    .catch(() => { _geoCache.set(ip, null); })
    .finally(() => { _geoPending.delete(ip); });
}

// ─── POST /api/analytics/event ────────────────────────────────────────────────
router.post("/event", (req, res) => {
  // Bots e flood: descarte silencioso — nunca falha para o cliente.
  if (isBotRequest(req)) { res.json({ ok: true }); return; }
  // trust proxy (app.ts) já resolve o X-Forwarded-For adicionado pelo Caddy;
  // ler o header na mão pegaria o primeiro valor, que o cliente pode forjar.
  const ip = req.ip ?? "";
  if (overRateLimit(`ev:${ip}`, 120)) { res.json({ ok: true }); return; }

  const b = (req.body ?? {}) as Record<string, unknown>;

  const type = typeof b["type"] === "string" && VALID_TYPES.has(b["type"] as string)
    ? (b["type"] as AnalyticsEvent["type"])
    : null;
  const path      = cleanStr(b["path"], 500);
  const sessionId = cleanStr(b["sessionId"], 100);
  if (!type || !path || !sessionId) { res.status(400).json({ ok: false }); return; }
  // Navegação no painel não é audiência do site (o cliente já filtra; defesa extra).
  if (path.startsWith("/admin")) { res.json({ ok: true }); return; }

  const title     = cleanStr(b["title"], 300);
  const category  = cleanStr(b["category"], 100);
  const articleId = cleanStr(b["articleId"], 100);
  const platform  = cleanStr(b["platform"], 50);

  let referrer = cleanStr(b["referrer"], 20);
  if (referrer && !VALID_REFERRERS.has(referrer)) referrer = "outro";

  const durationRaw = Number(b["duration"]);
  const duration = Number.isFinite(durationRaw) && durationRaw > 0
    ? Math.min(Math.round(durationRaw), MAX_READ_SECONDS)
    : undefined;

  const scrollRaw   = Number(b["scrollDepth"]);
  const scrollDepth = SCROLL_MILESTONES.has(scrollRaw) ? scrollRaw : undefined;

  const ua = String(req.headers["user-agent"] ?? "");

  const cachedGeo = _geoCache.get(ip);
  if (type === "pageview") {
    if (cachedGeo) bumpGeoViews(cachedGeo);
    else lookupGeoAsync(ip);
  }

  pushEvent({
    type, path, title, category, articleId, sessionId, duration,
    device: detectDevice(ua),
    ts: Date.now(),
    ua,
    referrer,
    scrollDepth,
    platform,
    city:   cachedGeo?.city,
    region: cachedGeo?.region,
  });

  if (type === "category" && category) store.trackCategoryView(category);
  if (type === "pageview" && articleId && title) store.trackArticleView(articleId, title);

  res.json({ ok: true });
});

// ─── POST /api/analytics/behavior — track search / link_click / newsletter ────
router.post("/behavior", async (req, res) => {
  try {
    if (isBotRequest(req)) { res.json({ ok: true }); return; }
    const ip = req.ip ?? "";
    if (overRateLimit(`bh:${ip}`, 30)) { res.json({ ok: true }); return; }

    const b = (req.body ?? {}) as Record<string, unknown>;
    const eventType = cleanStr(b["eventType"], 30);
    const sessionId = cleanStr(b["sessionId"], 100);
    if (!eventType || !sessionId) { res.status(400).json({ ok: false }); return; }

    const ALLOWED = new Set(["search", "link_click", "newsletter", "video_play", "download"]);
    if (!ALLOWED.has(eventType)) { res.status(400).json({ ok: false }); return; }

    const value     = cleanStr(b["value"], 500);
    const articleId = cleanStr(b["articleId"], 100);

    const ua = String(req.headers["user-agent"] ?? "");
    await db.insert(behaviorEventsTable).values({
      eventType,
      value:     value ?? null,
      sessionId,
      device:    detectDevice(ua),
      articleId: articleId ?? null,
      ts:        new Date(),
    });
    res.json({ ok: true });
  } catch {
    res.json({ ok: true }); // silent — never fail the client
  }
});

// ─── GET /api/analytics/stats ─────────────────────────────────────────────────
router.get("/stats", authMiddleware, async (_req, res) => {
  const now = Date.now();
  const thirtyDaysAgo = new Date(now - 30 * DAY);
  const sixtyDaysAgo  = new Date(now - 60 * DAY);
  const thirtyDaysAgoStr = brtDayKey(now - 30 * DAY);

  const [dbRows, allTimeResult, geoRows, allAds, adDailyRows, behaviorRows, prevAggRes, prevBounceRes] = await Promise.all([
    // Projeção: só as colunas usadas na agregação (ua/path/city ficam de fora —
    // ua sozinho costuma ser o campo mais pesado da tabela).
    db.select({
      type:        analyticsEventsTable.type,
      title:       analyticsEventsTable.title,
      category:    analyticsEventsTable.category,
      articleId:   analyticsEventsTable.articleId,
      sessionId:   analyticsEventsTable.sessionId,
      duration:    analyticsEventsTable.duration,
      device:      analyticsEventsTable.device,
      ts:          analyticsEventsTable.ts,
      referrer:    analyticsEventsTable.referrer,
      scrollDepth: analyticsEventsTable.scrollDepth,
      platform:    analyticsEventsTable.platform,
    }).from(analyticsEventsTable).where(gte(analyticsEventsTable.ts, thirtyDaysAgo)),
    db.select({ count: count() }).from(analyticsEventsTable).where(eq(analyticsEventsTable.type, "pageview")),
    db.select().from(geoStatsTable),
    db.select({
      id: adsTable.id, name: adsTable.name, position: adsTable.position,
      impressions: adsTable.impressions, clicks: adsTable.clicks,
      active: adsTable.active, createdAt: adsTable.createdAt,
    }).from(adsTable).orderBy(desc(adsTable.impressions)),
    db.select().from(adDailyStatsTable)
      .where(gte(adDailyStatsTable.date, thirtyDaysAgoStr)),
    db.select().from(behaviorEventsTable)
      .where(gte(behaviorEventsTable.ts, thirtyDaysAgo)),
    // Janela anterior (30-60 dias atrás) — base das tendências reais dos KPIs.
    db.execute(sql`
      SELECT
        count(*) FILTER (WHERE type = 'pageview')::int                   AS pv,
        count(DISTINCT session_id) FILTER (WHERE type = 'pageview')::int AS sessions,
        COALESCE(avg(LEAST(duration, ${MAX_READ_SECONDS})) FILTER (WHERE type = 'read' AND duration > 0), 0)::float AS avg_read
      FROM analytics_events
      WHERE ts >= ${sixtyDaysAgo} AND ts < ${thirtyDaysAgo}
    `),
    db.execute(sql`
      SELECT count(*)::int AS total, count(*) FILTER (WHERE c = 1)::int AS bounced
      FROM (
        SELECT session_id, count(*) AS c
        FROM analytics_events
        WHERE type = 'pageview' AND ts >= ${sixtyDaysAgo} AND ts < ${thirtyDaysAgo}
        GROUP BY session_id
      ) s
    `),
  ]);

  type EventLike = {
    type: string; title?: string | null; category?: string | null;
    articleId?: string | null; sessionId: string; duration?: number | null;
    device: string; ts: Date | number; referrer?: string | null;
    scrollDepth?: number | null; platform?: string | null;
  };
  const rows: EventLike[] = [
    ...dbRows,
    ..._buffer.map((ev) => ({ ...ev, ts: new Date(ev.ts) })),
  ];

  const byDay: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) {
    byDay[brtDayKey(now - i * DAY)] = 0;
  }
  const todayKey     = brtDayKey(now);
  const yesterdayKey = brtDayKey(now - DAY);

  const byHour: number[]       = Array(24).fill(0);
  const byDayOfWeek: number[]  = Array(7).fill(0);
  const articleMap: Record<string, { title: string; views: number; totalReadTime: number; readSessions: number }> = {};
  const catViewMap:  Record<string, number> = {};
  const catClickMap: Record<string, number> = {};
  const deviceMap:   Record<string, number> = { mobile: 0, desktop: 0, tablet: 0 };
  const referrerMap: Record<string, number> = { direto: 0, busca: 0, social: 0, outro: 0 };
  const scrollMap:   Record<number, number> = { 25: 0, 50: 0, 75: 0, 100: 0 };
  const shareMap:    Record<string, number> = {};
  const sessionPageviews: Record<string, number> = {};

  let week = 0, prevWeek = 0, month = 0;
  let totalReadTime = 0, readCount = 0;

  for (const ev of rows) {
    const evTs  = ev.ts instanceof Date ? ev.ts.getTime() : ev.ts;
    const age   = now - evTs;
    const evType = ev.type;

    if (evType === "pageview") {
      const dayKey = brtDayKey(evTs);

      if (age <= 30 * DAY) {
        if (byDay[dayKey] !== undefined) byDay[dayKey]++;
        month++;
      }
      if (age <= 7 * DAY) week++;
      else if (age <= 14 * DAY) prevWeek++;

      byHour[brtHour(evTs)]++;
      byDayOfWeek[brtDow(evTs)]++;
      deviceMap[ev.device] = (deviceMap[ev.device] ?? 0) + 1;

      // Origem é atribuída por sessão: só o pageview de entrada carrega referrer
      // (o cliente não reenvia nas navegações internas).
      if (ev.referrer) referrerMap[ev.referrer] = (referrerMap[ev.referrer] ?? 0) + 1;
      sessionPageviews[ev.sessionId] = (sessionPageviews[ev.sessionId] ?? 0) + 1;

      if (ev.articleId) {
        if (!articleMap[ev.articleId]) {
          articleMap[ev.articleId] = { title: ev.title ?? ev.articleId, views: 0, totalReadTime: 0, readSessions: 0 };
        }
        articleMap[ev.articleId]!.views++;
      }
      if (ev.category) catViewMap[ev.category] = (catViewMap[ev.category] ?? 0) + 1;
    }

    if (evType === "category" && ev.category) {
      catClickMap[ev.category] = (catClickMap[ev.category] ?? 0) + 1;
    }

    if (evType === "read" && ev.duration) {
      const dur = Math.min(ev.duration, MAX_READ_SECONDS);
      totalReadTime += dur;
      readCount++;
      if (ev.articleId && articleMap[ev.articleId]) {
        articleMap[ev.articleId]!.totalReadTime += dur;
        articleMap[ev.articleId]!.readSessions++;
      }
    }

    if (evType === "scroll" && ev.scrollDepth) {
      scrollMap[ev.scrollDepth] = (scrollMap[ev.scrollDepth] ?? 0) + 1;
    }

    if (evType === "share" && ev.platform) {
      shareMap[ev.platform] = (shareMap[ev.platform] ?? 0) + 1;
    }
  }

  const today     = byDay[todayKey] ?? 0;
  const yesterday = byDay[yesterdayKey] ?? 0;

  const uniqueSessions = Object.keys(sessionPageviews).length;
  const avgReadTime    = readCount > 0 ? Math.round(totalReadTime / readCount) : 0;
  const bounceSessions = Object.values(sessionPageviews).filter((v) => v === 1).length;
  const bounceRate     = uniqueSessions > 0 ? Math.round((bounceSessions / uniqueSessions) * 100) : 0;
  const readCompletions = scrollMap[100] ?? 0;
  const allTime = (allTimeResult[0]?.count ?? 0) + _buffer.filter((e) => e.type === "pageview").length;

  // ── Tendências reais (janela atual vs janela anterior de mesmo tamanho) ──
  const prevAgg = (prevAggRes.rows?.[0] ?? {}) as { pv?: number; sessions?: number; avg_read?: number };
  const prevBounceRow = (prevBounceRes.rows?.[0] ?? {}) as { total?: number; bounced?: number };
  const prevPv        = prevAgg.pv ?? 0;
  const prevSessions  = prevAgg.sessions ?? 0;
  const prevAvgRead   = Math.round(prevAgg.avg_read ?? 0);
  const prevBounceTotal = prevBounceRow.total ?? 0;
  const prevBounceRate  = prevBounceTotal > 0
    ? Math.round(((prevBounceRow.bounced ?? 0) / prevBounceTotal) * 100)
    : null;

  const pctChange = (cur: number, prev: number): number | null =>
    prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null;

  const trends = {
    today:          pctChange(today, yesterday),
    week:           pctChange(week, prevWeek),
    month:          pctChange(month, prevPv),
    uniqueSessions: pctChange(uniqueSessions, prevSessions),
    avgReadTime:    pctChange(avgReadTime, prevAvgRead),
    // Rejeição: diferença em pontos percentuais (variação % de uma taxa confunde).
    bounceRate:     prevBounceRate !== null ? Math.round((bounceRate - prevBounceRate) * 10) / 10 : null,
  };

  // ── Rankings: SEMPRE janela de 30 dias (o contador all-time persistido serve
  //    só de fallback de título — antes ele vazava contagens históricas aqui). ──
  const persistedTitles = store.getArticleViews();
  const topArticles = Object.entries(articleMap)
    .map(([id, a]) => ({
      id,
      title:   a.title || persistedTitles[id]?.title || id,
      views:   a.views,
      avgTime: a.readSessions > 0 ? Math.round(a.totalReadTime / a.readSessions) : undefined,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  const publishedArticles = (await articleService.getArticles()).filter((a) => a.status === "published");
  const articleCountByCategory: Record<string, number> = {};
  for (const a of publishedArticles) {
    if (a.category) articleCountByCategory[a.category] = (articleCountByCategory[a.category] ?? 0) + 1;
  }
  const allCatNames = new Set([
    ...Object.keys(catViewMap),
    ...Object.keys(catClickMap),
    ...Object.keys(articleCountByCategory),
  ]);
  const topCategories = Array.from(allCatNames).map((name) => ({
    name,
    views:    catViewMap[name]  ?? 0,
    clicks:   catClickMap[name] ?? 0,
    articles: articleCountByCategory[name] ?? 0,
  })).sort((a, b) => (b.clicks + b.views || b.articles) - (a.clicks + a.views || a.articles)).slice(0, 10);

  const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  const cityTotals:   Record<string, number> = {};
  const regionTotals: Record<string, number> = {};
  for (const row of geoRows) {
    if (row.city)   cityTotals[row.city]     = (cityTotals[row.city]     ?? 0) + row.views;
    if (row.region) regionTotals[row.region] = (regionTotals[row.region] ?? 0) + row.views;
  }

  // ── Ad stats ──────────────────────────────────────────────────────────────
  const adStats = allAds.map((ad) => ({
    id:          ad.id,
    name:        ad.name,
    position:    ad.position,
    active:      ad.active,
    impressions: ad.impressions,
    clicks:      ad.clicks,
    ctr:         ad.impressions > 0 ? Number(((ad.clicks / ad.impressions) * 100).toFixed(2)) : 0,
  }));

  // Build 30-day daily chart for top 3 ads by impressions
  const top3AdIds = adStats.slice(0, 3).map((a) => a.id);
  const adDailyByDate: Record<string, Record<string, { impressions: number; clicks: number }>> = {};
  for (let i = 29; i >= 0; i--) {
    const d = brtDayKey(now - i * DAY);
    adDailyByDate[d] = {};
    for (const adId of top3AdIds) adDailyByDate[d]![adId] = { impressions: 0, clicks: 0 };
  }
  for (const row of adDailyRows) {
    if (top3AdIds.includes(row.adId) && adDailyByDate[row.date]) {
      adDailyByDate[row.date]![row.adId] = { impressions: row.impressions, clicks: row.clicks };
    }
  }
  const adDailyChart = Object.entries(adDailyByDate).map(([date, byAd]) => {
    const entry: Record<string, unknown> = { date };
    for (const adId of top3AdIds) {
      const adName = adStats.find((a) => a.id === adId)?.name ?? adId;
      entry[adName] = byAd[adId]?.impressions ?? 0;
    }
    return entry;
  });

  // Total ad KPIs
  const totalAdImpressions = adStats.reduce((s, a) => s + a.impressions, 0);
  const totalAdClicks       = adStats.reduce((s, a) => s + a.clicks, 0);
  const avgCtr              = totalAdImpressions > 0
    ? Number(((totalAdClicks / totalAdImpressions) * 100).toFixed(2))
    : 0;
  const bestAd = adStats.length > 0
    ? adStats.reduce((best, a) => (a.ctr > best.ctr ? a : best), adStats[0]!)
    : null;

  // ── Behavior stats ────────────────────────────────────────────────────────
  const searchTerms: Record<string, number> = {};
  const linkDomains: Record<string, number> = {};
  let newsletterSignups = 0;

  for (const ev of behaviorRows) {
    if (ev.eventType === "search" && ev.value) {
      const term = ev.value.toLowerCase().trim();
      searchTerms[term] = (searchTerms[term] ?? 0) + 1;
    }
    if (ev.eventType === "link_click" && ev.value) {
      try {
        const domain = new URL(ev.value).hostname.replace(/^www\./, "");
        linkDomains[domain] = (linkDomains[domain] ?? 0) + 1;
      } catch { /* invalid URL */ }
    }
    if (ev.eventType === "newsletter") newsletterSignups++;
  }

  const topSearchTerms = Object.entries(searchTerms)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([term, count]) => ({ term, count }));

  const topLinkDomains = Object.entries(linkDomains)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([domain, count]) => ({ domain, count }));

  const totalBehaviorEvents = behaviorRows.length;

  const maxHourViews = Math.max(...byHour);
  const maxDowViews  = Math.max(...byDayOfWeek);

  res.json({
    totals: { today, week, month, allTime },
    engagement: { uniqueSessions, avgReadTime, bounceRate, readCompletions },
    trends,
    dailyChart:      Object.entries(byDay).map(([date, views]) => ({ date, views })),
    hourlyChart:     byHour.map((views, hour) => ({ hour, views })),
    peakHour:        maxHourViews > 0 ? byHour.indexOf(maxHourViews) : null,
    dayOfWeekChart:  byDayOfWeek.map((views, day) => ({ day: DAY_NAMES[day]!, views })),
    peakDay:         maxDowViews > 0 ? DAY_NAMES[byDayOfWeek.indexOf(maxDowViews)]! : null,
    topArticles,
    topCategories,
    topCities:  Object.entries(cityTotals).sort((a,b) => b[1]-a[1]).slice(0, 8).map(([name, views]) => ({ name, views })),
    topRegions: Object.entries(regionTotals).sort((a,b) => b[1]-a[1]).slice(0, 8).map(([name, views]) => ({ name, views })),
    devices:         deviceMap,
    scrollDepthChart: [25,50,75,100].map((depth) => ({ depth, count: scrollMap[depth] ?? 0 })),
    referrerChart:   Object.entries(referrerMap).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value),
    shareChart:      Object.entries(shareMap).map(([platform,count])=>({platform,count})).sort((a,b)=>b.count-a.count),
    // Ad analytics
    adStats,
    adDailyChart,
    adTopNames: top3AdIds.map((id) => adStats.find((a) => a.id === id)?.name ?? id),
    adKpis: {
      totalImpressions: totalAdImpressions,
      totalClicks:      totalAdClicks,
      avgCtr,
      bestAdName:       bestAd?.name ?? null,
      bestAdCtr:        bestAd?.ctr ?? 0,
    },
    // Behavior analytics
    behaviorStats: {
      totalEvents:     totalBehaviorEvents,
      newsletterSignups,
      topSearchTerms,
      topLinkDomains,
    },
  });
});

export default router;
