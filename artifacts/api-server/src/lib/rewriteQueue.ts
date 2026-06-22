/**
 * Async rewrite queue — decouples RSS article collection from AI rewriting.
 *
 * Articles are saved as raw drafts immediately when collected.
 * This queue processes them one at a time, staying within Gemini free-tier
 * limits (15 RPM, 1 500 RPD). It also sweeps existing unprocessed drafts
 * every SWEEP_INTERVAL_MS so nothing gets permanently stuck.
 */

import { articleService } from "./articleService.js";
import {
  rewriteWithAI,
  getAIQuotaStatus,
  addLog,
  registerRewriteQueue,
  type RewriteJobItem,
} from "./rssProcessor.js";
import { logger } from "./logger.js";

// ── Timing constants ─────────────────────────────────────────────────────────
// 1 article every 6 s = 10/min — safely below Gemini free-tier 15 RPM
const PROCESS_INTERVAL_MS = 6_000;
// Sweep for new unprocessed drafts every 5 minutes
const SWEEP_INTERVAL_MS = 5 * 60_000;

// ── In-memory queue ───────────────────────────────────────────────────────────
const _queue: RewriteJobItem[] = [];
let _paused = false;
let _processedTotal = 0;
let _failedTotal = 0;

export function enqueueRewrite(item: RewriteJobItem): void {
  // Avoid duplicates already in queue
  if (_queue.some((q) => q.articleId === item.articleId)) return;
  _queue.push(item);
  logger.info({ articleId: item.articleId, queueLength: _queue.length }, "Article queued for AI rewrite");
}

export function getQueueStats() {
  const quota = getAIQuotaStatus();
  return {
    pending:        _queue.length,
    paused:         _paused,
    processedTotal: _processedTotal,
    failedTotal:    _failedTotal,
    quota: {
      usedToday:    quota.usedToday,
      dailyLimit:   quota.dailyLimit,
      remaining:    quota.remaining,
      isOnCooldown: quota.isOnCooldown,
      isExhausted:  quota.isQuotaExhausted,
      cooldownSecs: quota.isOnCooldown ? Math.ceil(quota.cooldownRemainingMs / 1_000) : 0,
    },
  };
}

export function pauseQueue(): void  { _paused = true;  logger.info("Rewrite queue paused by admin"); }
export function resumeQueue(): void { _paused = false; logger.info("Rewrite queue resumed by admin"); }

// ── Sweep: pick up drafts that haven't been rewritten yet ─────────────────────
async function sweepPendingDrafts(): Promise<void> {
  try {
    const drafts = await articleService.getPendingRewrites(50);
    if (drafts.length === 0) return;

    let added = 0;
    for (const article of drafts) {
      if (_queue.some((q) => q.articleId === article.id)) continue;
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

    if (added > 0) {
      logger.info({ added, queueLength: _queue.length }, "Sweep: drafts enqueued for AI rewrite");
    }
  } catch (err) {
    logger.warn({ err }, "Sweep: failed to query pending drafts");
  }
}

// ── Worker ────────────────────────────────────────────────────────────────────
async function processNext(): Promise<void> {
  if (_paused || _queue.length === 0) return;

  const quota = getAIQuotaStatus();
  if (quota.isOnCooldown) {
    logger.debug({ cooldownSecs: Math.ceil(quota.cooldownRemainingMs / 1_000) }, "Rewrite queue paused — quota cooldown");
    return;
  }
  if (quota.isQuotaExhausted) {
    logger.debug("Rewrite queue paused — daily quota exhausted");
    return;
  }

  const item = _queue.shift()!;

  try {
    logger.info({ articleId: item.articleId, queueLeft: _queue.length }, "Rewriting queued article");

    const result = await rewriteWithAI(
      item.title,
      item.text,
      item.sourceName,
      item.giveCredit,
      item.customPrompt,
    );

    await articleService.updateArticle(item.articleId, {
      ...(result.title    && { title:    result.title }),
      ...(result.subtitle && { subtitle: result.subtitle }),
      content:     result.content,
      ...(result.keywords && { keywords: result.keywords }),
      ...(result.slug     && { slug:     result.slug }),
      aiRewritten: true,
      status:      item.finalStatus,
      ...(item.finalStatus === "published" && { publishedAt: new Date().toISOString() }),
    });

    _processedTotal++;
    addLog({ type: "rewrite",  sourceName: item.sourceName, articleTitle: result.title || item.title });
    if (item.finalStatus === "published") {
      addLog({ type: "publish", sourceName: item.sourceName, articleTitle: result.title || item.title, message: "Publicado após reescrita" });
    }
    logger.info({ articleId: item.articleId }, "Rewrite queue: article updated successfully");

  } catch (err) {
    _failedTotal++;
    const msg = String(err);
    logger.warn({ err, articleId: item.articleId }, "Rewrite queue: item failed");
    addLog({ type: "error", sourceName: item.sourceName, articleTitle: item.title, message: `Reescrita falhou: ${msg}` });

    // On quota errors, return item to front to retry after cooldown lifts
    if (msg.includes("QUOTA_COOLDOWN") || msg.includes("QUOTA_EXHAUSTED")) {
      _queue.unshift(item);
      logger.info({ articleId: item.articleId, queueLength: _queue.length }, "Article returned to queue front — quota limit");
    }
    // Other errors: drop the item (content issues, network, etc.)
  }
}

// ── Startup ───────────────────────────────────────────────────────────────────
export function startRewriteWorker(): void {
  registerRewriteQueue(enqueueRewrite);

  setInterval(() => { void processNext(); }, PROCESS_INTERVAL_MS);
  setInterval(() => { void sweepPendingDrafts(); }, SWEEP_INTERVAL_MS);

  // Initial sweep after 30 s to catch drafts that already exist at boot
  setTimeout(() => { void sweepPendingDrafts(); }, 30_000);

  logger.info("Rewrite queue worker started (1 article / 6s, sweep every 5 min)");
}
