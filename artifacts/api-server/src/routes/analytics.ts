import { Router } from "express";
import { gte, eq, count, sql, and, desc } from "drizzle-orm";
import { db, analyticsEventsTable, geoStatsTable, adsTable, adDailyStatsTable, behaviorEventsTable } from "@workspace/db";
import { authMiddleware } from "../middlewares/auth.js";
import { store } from "../lib/store.js";
import { articleService } from "../lib/articleService.js";
import { logger } from "../lib/logger.js";

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

// ─── In-memory buffer ─────────────────────────────────────────────────────────
const BUFFER_MAX = 500;
let _buffer: AnalyticsEvent[] = [];
let _flushing = false;

async function flushBuffer(): Promise<void> {
  if (_flushing || _buffer.length === 0) return;
  _flushing = true;
  const batch = _buffer.splice(0, _buffer.length);
  try {
    await db.insert(analyticsEventsTable).values(
      batch.map((ev) => ({
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
      }))
    );
  } catch (err) {
    _buffer.unshift(...batch.slice(0, BUFFER_MAX - _buffer.length));
    void err;
  } finally {
    _flushing = false;
  }
}

setInterval(() => { void flushBuffer(); }, 60_000);

function pushEvent(ev: AnalyticsEvent): void {
  _buffer.push(ev);
  if (_buffer.length >= BUFFER_MAX) void flushBuffer();
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

function isPrivateIp(ip: string): boolean {
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip) ||
    ip === "" ||
    ip === "::ffff:127.0.0.1"
  );
}

function lookupGeoAsync(ip: string): void {
  if (isPrivateIp(ip)) return;
  if (_geoCache.has(ip) || _geoPending.has(ip)) return;

  _geoPending.add(ip);
  fetch(`http://ip-api.com/json/${ip}?fields=status,city,regionName,countryCode&lang=pt-BR`, {
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
    })
    .catch(() => { _geoCache.set(ip, null); })
    .finally(() => { _geoPending.delete(ip); });
}

// ─── POST /api/analytics/event ────────────────────────────────────────────────
router.post("/event", (req, res) => {
  const {
    type, path, title, category, articleId, sessionId, duration,
    referrer, scrollDepth, platform,
  } = req.body as Partial<AnalyticsEvent>;
  if (!type || !path || !sessionId) { res.status(400).json({ ok: false }); return; }

  const ua  = req.headers["user-agent"] ?? "";
  const ip  = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? req.ip ?? "";

  if (type === "pageview") lookupGeoAsync(ip);

  const cachedGeo = _geoCache.get(ip);

  pushEvent({
    type: type as AnalyticsEvent["type"],
    path, title, category, articleId, sessionId, duration,
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
    const { eventType, value, sessionId, articleId } = req.body as {
      eventType?: string; value?: string; sessionId?: string; articleId?: string;
    };
    if (!eventType || !sessionId) { res.status(400).json({ ok: false }); return; }

    const ALLOWED = new Set(["search", "link_click", "newsletter", "video_play", "download"]);
    if (!ALLOWED.has(eventType)) { res.status(400).json({ ok: false }); return; }

    const ua = req.headers["user-agent"] ?? "";
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
  const DAY = 86_400_000;
  const thirtyDaysAgo = new Date(now - 30 * DAY);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);

  const [dbRows, allTimeResult, geoRows, allAds, adDailyRows, behaviorRows] = await Promise.all([
    db.select().from(analyticsEventsTable).where(gte(analyticsEventsTable.ts, thirtyDaysAgo)),
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
  ]);

  type EventLike = {
    type: string; path: string; title?: string | null; category?: string | null;
    articleId?: string | null; sessionId: string; duration?: number | null;
    device: string; ts: Date | number; referrer?: string | null;
    scrollDepth?: number | null; platform?: string | null;
    city?: string | null; region?: string | null;
  };
  const rows: EventLike[] = [
    ...dbRows,
    ..._buffer.map((ev) => ({ ...ev, ts: new Date(ev.ts) })),
  ];

  const byDay: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * DAY);
    byDay[d.toISOString().slice(0, 10)] = 0;
  }

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

  let today = 0, week = 0, month = 0;
  let totalReadTime = 0, readCount = 0;

  for (const ev of rows) {
    const evTs  = ev.ts instanceof Date ? ev.ts.getTime() : ev.ts;
    const age   = now - evTs;
    const evType = ev.type;

    if (evType === "pageview") {
      const dayKey = new Date(evTs).toISOString().slice(0, 10);
      const hour   = new Date(evTs).getHours();

      if (age <= 30 * DAY) {
        if (byDay[dayKey] !== undefined) byDay[dayKey]++;
        month++;
      }
      if (age <= 7 * DAY) week++;
      if (age <= DAY)      today++;

      byHour[hour]++;
      byDayOfWeek[new Date(evTs).getDay()]++;
      deviceMap[ev.device] = (deviceMap[ev.device] ?? 0) + 1;

      const ref = ev.referrer ?? "direto";
      referrerMap[ref] = (referrerMap[ref] ?? 0) + 1;
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
      totalReadTime += ev.duration;
      readCount++;
      if (ev.articleId && articleMap[ev.articleId]) {
        articleMap[ev.articleId]!.totalReadTime += ev.duration;
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

  const uniqueSessions = Object.keys(sessionPageviews).length;
  const avgReadTime    = readCount > 0 ? Math.round(totalReadTime / readCount) : 0;
  const bounceSessions = Object.values(sessionPageviews).filter((v) => v === 1).length;
  const bounceRate     = uniqueSessions > 0 ? Math.round((bounceSessions / uniqueSessions) * 100) : 0;
  const readCompletions = scrollMap[100] ?? 0;
  const allTime = (allTimeResult[0]?.count ?? 0) + _buffer.filter((e) => e.type === "pageview").length;

  const persistedArticleViews = store.getArticleViews();
  const allArticleIds = new Set([...Object.keys(articleMap), ...Object.keys(persistedArticleViews)]);
  const topArticles = Array.from(allArticleIds).map((id) => {
    const mem  = articleMap[id];
    const disk = persistedArticleViews[id];
    return {
      id,
      title:   disk?.title   ?? mem?.title ?? id,
      views:   disk?.views   ?? mem?.views ?? 0,
      avgTime: mem && mem.readSessions > 0 ? Math.round(mem.totalReadTime / mem.readSessions) : undefined,
    };
  }).sort((a, b) => b.views - a.views).slice(0, 10);

  const persistedClicks = store.getCategoryViews();
  const mergedClickMap: Record<string, number> = { ...persistedClicks };
  for (const [cat, cnt] of Object.entries(catClickMap)) {
    mergedClickMap[cat] = (mergedClickMap[cat] ?? 0) + cnt;
  }

  const publishedArticles = (await articleService.getArticles()).filter((a) => a.status === "published");
  const articleCountByCategory: Record<string, number> = {};
  for (const a of publishedArticles) {
    if (a.category) articleCountByCategory[a.category] = (articleCountByCategory[a.category] ?? 0) + 1;
  }
  const allCatNames = new Set([
    ...Object.keys(catViewMap),
    ...Object.keys(mergedClickMap),
    ...Object.keys(articleCountByCategory),
  ]);
  const topCategories = Array.from(allCatNames).map((name) => ({
    name,
    views:    catViewMap[name]     ?? 0,
    clicks:   mergedClickMap[name] ?? 0,
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
    const d = new Date(now - i * DAY).toISOString().slice(0, 10);
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

  res.json({
    totals: { today, week, month, allTime },
    engagement: { uniqueSessions, avgReadTime, bounceRate, readCompletions },
    dailyChart:      Object.entries(byDay).map(([date, views]) => ({ date, views })),
    hourlyChart:     byHour.map((views, hour) => ({ hour, views })),
    peakHour:        byHour.indexOf(Math.max(...byHour)),
    dayOfWeekChart:  byDayOfWeek.map((views, day) => ({ day: DAY_NAMES[day]!, views })),
    peakDay:         DAY_NAMES[byDayOfWeek.indexOf(Math.max(...byDayOfWeek))]!,
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
