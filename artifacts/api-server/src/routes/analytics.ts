import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.js";

const router = Router();

export interface AnalyticsEvent {
  type: "pageview" | "read" | "category";
  path: string;
  title?: string;
  category?: string;
  articleId?: string;
  sessionId: string;
  duration?: number;
  device: "mobile" | "desktop" | "tablet";
  ts: number;
  ua?: string;
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
  const { type, path, title, category, articleId, sessionId, duration } = req.body as Partial<AnalyticsEvent>;
  if (!type || !path || !sessionId) { res.status(400).json({ ok: false }); return; }
  const ua = req.headers["user-agent"] ?? "";
  pushEvent({
    type: type as AnalyticsEvent["type"],
    path,
    title,
    category,
    articleId,
    sessionId,
    duration,
    device: detectDevice(ua),
    ts: Date.now(),
    ua,
  });
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

  // By hour (0-23)
  const byHour: number[] = Array(24).fill(0);

  // Top articles
  const articleMap: Record<string, { title: string; views: number }> = {};

  // Top categories
  const catMap: Record<string, number> = {};

  // Device breakdown
  const deviceMap: Record<string, number> = { mobile: 0, desktop: 0, tablet: 0 };

  // Totals
  let today = 0, week = 0, month = 0;

  for (const ev of events) {
    if (ev.type !== "pageview") continue;
    const age = now - ev.ts;
    const dayKey = new Date(ev.ts).toISOString().slice(0, 10);
    const hour = new Date(ev.ts).getHours();

    if (age <= 30 * DAY) {
      if (byDay[dayKey] !== undefined) byDay[dayKey]++;
      month++;
    }
    if (age <= 7 * DAY) week++;
    if (age <= DAY) today++;

    byHour[hour]++;
    deviceMap[ev.device]++;

    // Article
    if (ev.articleId) {
      if (!articleMap[ev.articleId]) articleMap[ev.articleId] = { title: ev.title ?? ev.articleId, views: 0 };
      articleMap[ev.articleId]!.views++;
    }

    // Category
    if (ev.category) {
      catMap[ev.category] = (catMap[ev.category] ?? 0) + 1;
    }
  }

  const topArticles = Object.entries(articleMap)
    .sort((a, b) => b[1].views - a[1].views)
    .slice(0, 10)
    .map(([id, { title, views }]) => ({ id, title, views }));

  const topCategories = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, views]) => ({ name, views }));

  const dailyChart = Object.entries(byDay).map(([date, views]) => ({ date, views }));
  const hourlyChart = byHour.map((views, hour) => ({ hour, views }));

  res.json({
    totals: { today, week, month, allTime: events.filter(e => e.type === "pageview").length },
    dailyChart,
    hourlyChart,
    topArticles,
    topCategories,
    devices: deviceMap,
  });
});

export default router;
