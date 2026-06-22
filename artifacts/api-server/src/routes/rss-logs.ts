import { Router } from "express";
import { sql } from "drizzle-orm";
import { db, rssEventLogsTable } from "@workspace/db";
import { authMiddleware } from "../middlewares/auth.js";
import { getRssLog } from "../lib/rssProcessor.js";

const router = Router();

/**
 * GET /api/admin/rss-logs?limit=100&offset=0
 * Returns RSS event log entries from DB (persistent) with memory fallback.
 */
router.get("/", authMiddleware, async (req, res) => {
  const limit  = Math.min(Number(req.query["limit"]  ?? 100), 500);
  const offset = Math.max(Number(req.query["offset"] ?? 0),   0);

  try {
    const rows = await db.select()
      .from(rssEventLogsTable)
      .orderBy(sql`${rssEventLogsTable.ts} DESC`)
      .limit(limit)
      .offset(offset);

    const logs = rows.map((r) => ({
      id:           r.id,
      ts:           r.ts instanceof Date ? r.ts.toISOString() : String(r.ts),
      type:         r.type,
      sourceName:   r.sourceName,
      articleTitle: r.articleTitle,
      message:      r.message ?? undefined,
    }));

    res.json({ logs, total: logs.length });
  } catch {
    // Fallback to in-memory log if DB fails
    const memLogs = getRssLog();
    const sliced  = memLogs.slice(offset, offset + limit);
    res.json({ logs: sliced, total: memLogs.length, source: "memory" });
  }
});

export default router;
