import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.js";
import { store } from "../lib/store.js";


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
  // new fields
  referrer?: string;      // "direto" | "busca" | "social" | "outro"
  scrollDepth?: number;   // 25 | 50 | 75 | 100
  platform?: string;      // "facebook" | "twitter" | "whatsapp" | "copy"
}

// In-memory circular buffer — max 50k events
const MAX_EVENTS = 50_000;
const events: AnalyticsEvent[] = [];

function pushEvent(ev: AnalyticsEvent) {
  if (events.length >= MAX_EVENTS) events.splice(0, 1000);
  events.push(ev);
}

function detectDevice(ua: string): "mobile" | "desktop" | "tablet" {
  if (/tablet|ipad|playbook|silk/i.test(ua)) return "tablet";
  if (/mobile|android|iphone|ipod|blackberry|opera mini|windows phone/i.test(ua)) return "mobile";
  return "desktop";
}

/** POST /api/analytics/event — public, no auth */
router.post("/event", (req, res) => {
  const {
    type, path, title, category, articleId, sessionId, duration,
    referrer, scrollDepth, platform,
  } = req.body as Partial<AnalyticsEvent>;
  if (!type || !path || !sessionId) { res.status(400).json({ ok: false }); return; }
  const ua = req.headers["user-agent"] ?? "";
  pushEvent({
    type: type as AnalyticsEvent["type"],
    path, title, category, articleId, sessionId, duration,
    device: detectDevice(ua),
    ts: Date.now(),
    ua,
    referrer,
    scrollDepth,
    platform,
  });

  // Persist category views to disk so counts survive server restarts
  if (type === "category" && category) {
    store.trackCategoryView(category);
  }

  res.json({ ok: true });
});

/** GET /api/analytics/stats — admin only */
router.get("/stats", authMiddleware, (_req, res) => {
  const now = Date.now();
  const DAY = 86_400_000;

  // Last 30 days pageviews by day
  const byDay: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * DAY);
    byDay[d.toISOString().slice(0, 10)] = 0;
  }

  const byHour: number[]                = Array(24).fill(0);
  const articleMap: Record<string, { title: string; views: number; totalReadTime: number; readSessions: number }> = {};
  const catViewMap:  Record<string, number> = {}; // pageviews with category (article reads)
  const catClickMap: Record<string, number> = {}; // explicit category-tab clicks
  const deviceMap:  Record<string, number> = { mobile: 0, desktop: 0, tablet: 0 };
  const referrerMap: Record<string, number> = { direto: 0, busca: 0, social: 0, outro: 0 };
  const scrollMap:  Record<number, number>  = { 25: 0, 50: 0, 75: 0, 100: 0 };
  const shareMap:   Record<string, number>  = {};
  const sessionPageviews: Record<string, number> = {};

  let today = 0, week = 0, month = 0;
  let totalReadTime = 0, readCount = 0;

  for (const ev of events) {
    const age = now - ev.ts;

    // ── pageview ──────────────────────────────────────────────────────
    if (ev.type === "pageview") {
      const dayKey = new Date(ev.ts).toISOString().slice(0, 10);
      const hour   = new Date(ev.ts).getHours();

      if (age <= 30 * DAY) {
        if (byDay[dayKey] !== undefined) byDay[dayKey]++;
        month++;
      }
      if (age <= 7 * DAY) week++;
      if (age <= DAY)      today++;

      byHour[hour]++;
      deviceMap[ev.device]++;

      // referrer
      const ref = ev.referrer ?? "direto";
      referrerMap[ref] = (referrerMap[ref] ?? 0) + 1;

      // session bounce tracking
      sessionPageviews[ev.sessionId] = (sessionPageviews[ev.sessionId] ?? 0) + 1;

      // article
      if (ev.articleId) {
        if (!articleMap[ev.articleId]) {
          articleMap[ev.articleId] = { title: ev.title ?? ev.articleId, views: 0, totalReadTime: 0, readSessions: 0 };
        }
        articleMap[ev.articleId]!.views++;
      }

        // category from pageview (article reads in that category)
      if (ev.category) catViewMap[ev.category] = (catViewMap[ev.category] ?? 0) + 1;
    }

    // ── category click (user navigated to the category page) ──────────
    if (ev.type === "category" && ev.category) {
      catClickMap[ev.category] = (catClickMap[ev.category] ?? 0) + 1;
    }

    // ── read ──────────────────────────────────────────────────────────
    if (ev.type === "read" && ev.duration) {
      totalReadTime += ev.duration;
      readCount++;
      if (ev.articleId && articleMap[ev.articleId]) {
        articleMap[ev.articleId]!.totalReadTime += ev.duration;
        articleMap[ev.articleId]!.readSessions++;
      }
    }

    // ── scroll ────────────────────────────────────────────────────────
    if (ev.type === "scroll" && ev.scrollDepth) {
      scrollMap[ev.scrollDepth] = (scrollMap[ev.scrollDepth] ?? 0) + 1;
    }

    // ── share ─────────────────────────────────────────────────────────
    if (ev.type === "share" && ev.platform) {
      shareMap[ev.platform] = (shareMap[ev.platform] ?? 0) + 1;
    }
  }

  // Derived stats
  const uniqueSessions  = Object.keys(sessionPageviews).length;
  const avgReadTime     = readCount > 0 ? Math.round(totalReadTime / readCount) : 0;
  const bounceSessions  = Object.values(sessionPageviews).filter((v) => v === 1).length;
  const bounceRate      = uniqueSessions > 0 ? Math.round((bounceSessions / uniqueSessions) * 100) : 0;
  const readCompletions = scrollMap[100] ?? 0;

  const topArticles = Object.entries(articleMap)
    .sort((a, b) => b[1].views - a[1].views)
    .slice(0, 10)
    .map(([id, { title, views, totalReadTime: rt, readSessions: rs }]) => ({
      id, title, views,
      avgTime: rs > 0 ? Math.round(rt / rs) : undefined,
    }));

  // Top categories: merge in-memory counts + persistent store counts (survive restarts)
  // persistedClicks holds explicit category-page navigation events saved to disk
  const persistedClicks = store.getCategoryViews();
  const mergedClickMap: Record<string, number> = { ...persistedClicks };
  for (const [cat, count] of Object.entries(catClickMap)) {
    mergedClickMap[cat] = (mergedClickMap[cat] ?? 0) + count;
  }

  const publishedArticles = store.getArticles().filter((a) => a.status === "published");
  const articleCountByCategory: Record<string, number> = {};
  for (const a of publishedArticles) {
    if (a.category) articleCountByCategory[a.category] = (articleCountByCategory[a.category] ?? 0) + 1;
  }
  const allCatNames = new Set([
    ...Object.keys(catViewMap),
    ...Object.keys(mergedClickMap),
    ...Object.keys(articleCountByCategory),
  ]);
  const topCategories = Array.from(allCatNames)
    .map((name) => ({
      name,
      views:   catViewMap[name]    ?? 0,
      clicks:  mergedClickMap[name] ?? 0,
      articles: articleCountByCategory[name] ?? 0,
    }))
    .sort((a, b) => (b.clicks + b.views || b.articles) - (a.clicks + a.views || a.articles))
    .slice(0, 10);

  const dailyChart  = Object.entries(byDay).map(([date, views]) => ({ date, views }));
  const hourlyChart = byHour.map((views, hour) => ({ hour, views }));

  const scrollDepthChart = [25, 50, 75, 100].map((depth) => ({
    depth, count: scrollMap[depth] ?? 0,
  }));

  const referrerChart = Object.entries(referrerMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const shareChart = Object.entries(shareMap)
    .map(([platform, count]) => ({ platform, count }))
    .sort((a, b) => b.count - a.count);

  res.json({
    totals: { today, week, month, allTime: events.filter(e => e.type === "pageview").length },
    engagement: { uniqueSessions, avgReadTime, bounceRate, readCompletions },
    dailyChart,
    hourlyChart,
    topArticles,
    topCategories,
    devices: deviceMap,
    scrollDepthChart,
    referrerChart,
    shareChart,
  });
});

export default router;
