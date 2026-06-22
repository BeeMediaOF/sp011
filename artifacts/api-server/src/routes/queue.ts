import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.js";
import { getQueueStats, pauseQueue, resumeQueue, enqueueRewrite } from "../lib/rewriteQueue.js";
import { articleService } from "../lib/articleService.js";

const router = Router();

router.use(authMiddleware);

/** GET /api/admin/queue/status — returns queue + quota stats */
router.get("/status", (_req, res) => {
  res.json(getQueueStats());
});

/** POST /api/admin/queue/pause */
router.post("/pause", (_req, res) => {
  pauseQueue();
  res.json({ ok: true, paused: true });
});

/** POST /api/admin/queue/resume */
router.post("/resume", (_req, res) => {
  resumeQueue();
  res.json({ ok: true, paused: false });
});

/** POST /api/admin/queue/process-drafts — enqueues all unprocessed drafts */
router.post("/process-drafts", async (_req, res) => {
  try {
    const drafts = await articleService.getPendingRewrites(100);
    let added = 0;
    for (const article of drafts) {
      enqueueRewrite({
        articleId:   article.id,
        title:       article.title,
        text:        article.content || article.subtitle || article.title,
        sourceName:  article.tag || "RSS",
        giveCredit:  false,
        finalStatus: "published",
      });
      added++;
    }
    const stats = getQueueStats();
    res.json({ ok: true, added, pending: stats.pending });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
