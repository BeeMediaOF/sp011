import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.js";
import { getQueueStats, pauseQueue, resumeQueue, forceResume, enqueueRewrite, clearQueue } from "../lib/rewriteQueue.js";
import { articleService } from "../lib/articleService.js";
import { store } from "../lib/store.js";
import { DEFAULT_MAX_PENDING_REWRITES } from "../lib/scheduler.js";

const router = Router();

router.use(authMiddleware);

/** GET /api/admin/queue/status — returns queue + quota stats + collection backpressure */
router.get("/status", async (_req, res) => {
  const stats = getQueueStats();
  const maxPending = store.getSettings().rssMaxPendingRewrites ?? DEFAULT_MAX_PENDING_REWRITES;
  // Backlog real vem do banco: a fila em memória só reflete o que a varredura já carregou.
  let backlogDb = stats.pending;
  try { backlogDb = await articleService.countPendingRewrites(); } catch { /* usa fila em memória */ }
  res.json({
    ...stats,
    backlogDb,
    maxPendingRewrites: maxPending,
    collectionPaused: maxPending > 0 && backlogDb >= maxPending,
  });
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

/** POST /api/admin/queue/force-resume — bypasses cooldown gate for one batch */
router.post("/force-resume", (_req, res) => {
  forceResume();
  res.json({ ok: true, forced: true });
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

/**
 * POST /api/admin/queue/clear — esvazia a fila em memória e exclui do banco os
 * rascunhos pendentes de reescrita criados pela automação (origem rss/perplexity).
 * Rascunhos criados manualmente por editores NÃO são afetados.
 */
router.post("/clear", async (_req, res) => {
  try {
    const removedFromQueue = clearQueue();
    const deleted = await articleService.deletePendingRewrites();
    res.json({ ok: true, removedFromQueue, deleted });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
