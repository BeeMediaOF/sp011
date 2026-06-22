import { Router } from "express";
import { eq, count, sql } from "drizzle-orm";
import { db, articlesTable, adsTable, usersTable, articleViewsTable, categoryViewsTable, analyticsEventsTable } from "@workspace/db";
import { authMiddleware } from "../middlewares/auth.js";
import { store } from "../lib/store.js";
import process from "process";

const router = Router();

/** GET /api/admin/realtime-stats */
router.get("/", authMiddleware, async (_req, res) => {
  const [
    articleCounts,
    adCounts,
    userCounts,
    topArticleViews,
    topCategoryViews,
    recentEvents,
  ] = await Promise.all([
    // Articles by status
    db.select({ status: articlesTable.status, count: count() })
      .from(articlesTable)
      .groupBy(articlesTable.status),

    // Ads: total and active
    db.select({ active: adsTable.active, count: count() })
      .from(adsTable)
      .groupBy(adsTable.active),

    // Users: total and active
    db.select({ status: usersTable.status, count: count() })
      .from(usersTable)
      .groupBy(usersTable.status),

    // Top article views
    db.select({
      articleId: articleViewsTable.articleId,
      title:     articleViewsTable.title,
      views:     articleViewsTable.views,
    })
      .from(articleViewsTable)
      .orderBy(sql`${articleViewsTable.views} DESC`)
      .limit(10),

    // Top category views
    db.select({
      category: categoryViewsTable.category,
      views:    categoryViewsTable.views,
    })
      .from(categoryViewsTable)
      .orderBy(sql`${categoryViewsTable.views} DESC`)
      .limit(10),

    // Recent analytics events (last 20)
    db.select({
      type:         analyticsEventsTable.type,
      path:         analyticsEventsTable.path,
      title:        analyticsEventsTable.title,
      sessionId:    analyticsEventsTable.sessionId,
      device:       analyticsEventsTable.device,
      ts:           analyticsEventsTable.ts,
    })
      .from(analyticsEventsTable)
      .orderBy(sql`${analyticsEventsTable.ts} DESC`)
      .limit(20),
  ]);

  // Parse article counts
  let activeArticles = 0, draftArticles = 0;
  for (const row of articleCounts) {
    if (row.status === "published") activeArticles = Number(row.count);
    if (row.status === "draft")     draftArticles  = Number(row.count);
  }
  const totalArticles = activeArticles + draftArticles;

  // Parse ad counts
  let activeAds = 0, totalAds = 0;
  for (const row of adCounts) {
    totalAds += Number(row.count);
    if (row.active) activeAds = Number(row.count);
  }

  // Parse user counts
  let activeUsers = 0, totalUsers = 0;
  for (const row of userCounts) {
    totalUsers += Number(row.count);
    if (row.status === "active") activeUsers = Number(row.count);
  }

  // RSS and Perplexity topic counts from store cache
  const rssSourcesCount        = store.getRssSources().length;
  const perplexityTopicsCount  = store.getPerplexityTopics().length;

  res.json({
    activeArticles,
    draftArticles,
    totalArticles,
    totalAds,
    activeAds,
    totalUsers,
    activeUsers,
    topArticleViews: topArticleViews.map((r) => ({ id: r.articleId, title: r.title, views: r.views })),
    topCategoryViews: topCategoryViews.map((r) => ({ category: r.category, views: r.views })),
    recentAnalyticsEvents: recentEvents.map((r) => ({
      type: r.type, path: r.path, title: r.title,
      sessionId: r.sessionId, device: r.device,
      ts: r.ts?.toISOString(),
    })),
    rssSourcesCount,
    perplexityTopicsCount,
    serverUptime: process.uptime(),
    nodeVersion:  process.version,
    dbStatus:     "ok",
  });
});

export default router;
