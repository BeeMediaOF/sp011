/**
 * Async rewrite queue — decouples RSS collection from AI rewriting.
 *
 * Articles are saved as raw drafts immediately when collected.
 * This queue processes them in PARALLEL, one article per available Gemini API key,
 * so N configured keys → N articles rewritten simultaneously → N× throughput.
 *
 * Retry logic:
 *  - QUOTA_COOLDOWN errors: article goes back to queue front (up to MAX_ATTEMPTS times)
 *  - Other errors (content, network, etc.): dropped immediately (no infinite retry)
 *  - After MAX_ATTEMPTS failures the article is permanently dropped from the queue
 */

import { articleService } from "./articleService.js";
import {
  rewriteWithAI,
  getAIQuotaStatus,
  getAvailableKeyCount,
  addLog,
  registerRewriteQueue,
  type RewriteJobItem,
} from "./rssProcessor.js";
import { logger } from "./logger.js";

// ── Timing constants ─────────────────────────────────────────────────────────
// Batch runs every 4 s. With N parallel workers each batch processes N articles,
// so effective throughput = N × 15 RPM (Gemini free tier per key).
const PROCESS_INTERVAL_MS = 4_000;
// Sweep for new unprocessed drafts every 5 minutes
const SWEEP_INTERVAL_MS = 5 * 60_000;
// Maximum number of times an article can be attempted before being permanently dropped
const MAX_ATTEMPTS = 3;
// Maximum parallel workers regardless of key count (safety cap)
const MAX_CONCURRENCY = 8;

// ── History entry ─────────────────────────────────────────────────────────────
export interface HistoryEntry {
  articleId: string;
  title:     string;
  status:    "ok" | "failed";
  at:        number; // unix ms
  error?:    string;
}

// ── In-memory queue ───────────────────────────────────────────────────────────
const _queue: RewriteJobItem[] = [];
let _paused = false;
let _processedTotal = 0;
let _failedTotal = 0;
let _activeCount = 0; // number of articles currently being processed in parallel
const _recentHistory: HistoryEntry[] = [];
const HISTORY_MAX = 30;

export function enqueueRewrite(item: RewriteJobItem): void {
  if (_queue.some((q) => q.articleId === item.articleId)) return;
  _queue.push(item);
  logger.info({ articleId: item.articleId, queueLength: _queue.length }, "Article queued for AI rewrite (sweep)");
}

export function enqueueRewriteFront(item: RewriteJobItem): void {
  if (_queue.some((q) => q.articleId === item.articleId)) return;
  _queue.unshift(item);
  logger.info({ articleId: item.articleId, queueLength: _queue.length }, "Article queued at FRONT for AI rewrite (new)");
}

export function getQueueStats() {
  const quota = getAIQuotaStatus();
  return {
    pending:        _queue.length,
    paused:         _paused,
    processedTotal: _processedTotal,
    failedTotal:    _failedTotal,
    activeworkers:  _activeCount,
    queuedIds:      _queue.map((i) => i.articleId),
    currentItem:    null, // kept for API compat — use activeWorkers instead
    recentHistory:  [..._recentHistory],
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

function pushHistory(entry: HistoryEntry) {
  _recentHistory.unshift(entry);
  if (_recentHistory.length > HISTORY_MAX) _recentHistory.length = HISTORY_MAX;
}

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

// ── Single article processor ───────────────────────────────────────────────────
async function processItem(item: RewriteJobItem): Promise<void> {
  _activeCount++;
  const attempt = (item.attempts ?? 0) + 1;

  try {
    logger.info(
      { articleId: item.articleId, attempt, queueLeft: _queue.length },
      "Rewriting queued article",
    );

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
    pushHistory({ articleId: item.articleId, title: result.title || item.title, status: "ok", at: Date.now() });
    logger.info({ articleId: item.articleId, attempt }, "Rewrite queue: article updated successfully");

  } catch (err) {
    _failedTotal++;
    const msg = String(err);
    logger.warn({ err, articleId: item.articleId, attempt }, "Rewrite queue: item failed");
    addLog({ type: "error", sourceName: item.sourceName, articleTitle: item.title, message: `Reescrita falhou (tentativa ${attempt}/${MAX_ATTEMPTS}): ${msg}` });
    pushHistory({ articleId: item.articleId, title: item.title, status: "failed", at: Date.now(), error: msg });

    const isQuotaError = msg.includes("QUOTA_COOLDOWN") || msg.includes("QUOTA_EXHAUSTED");

    if (isQuotaError && attempt < MAX_ATTEMPTS) {
      // Quota error: return to front of queue to retry after cooldown lifts
      // Only if we haven't exceeded max attempts — prevents infinite loops
      if (!_queue.some((q) => q.articleId === item.articleId)) {
        _queue.unshift({ ...item, attempts: attempt });
        logger.info(
          { articleId: item.articleId, attempt, maxAttempts: MAX_ATTEMPTS, queueLength: _queue.length },
          "Article returned to queue front — quota limit, will retry after cooldown",
        );
      }
    } else if (isQuotaError) {
      logger.warn(
        { articleId: item.articleId, attempt },
        `Article permanently dropped after ${MAX_ATTEMPTS} quota failures`,
      );
    }
    // Non-quota errors (content issues, network, etc.): drop permanently — no retry
  } finally {
    _activeCount--;
  }
}

// ── Batch worker: process N articles in parallel ──────────────────────────────
async function processBatch(): Promise<void> {
  if (_paused || _queue.length === 0) return;

  const quota = getAIQuotaStatus();
  if (quota.isOnCooldown) {
    logger.debug(
      { cooldownSecs: Math.ceil(quota.cooldownRemainingMs / 1_000) },
      "Rewrite queue paused — quota cooldown",
    );
    return;
  }
  if (quota.isQuotaExhausted) {
    logger.debug("Rewrite queue paused — daily quota exhausted");
    return;
  }

  // Determine how many articles to process in parallel:
  // = number of Gemini keys currently not on per-key cooldown, capped at queue size and MAX_CONCURRENCY
  const availableKeys = getAvailableKeyCount();
  const concurrency = Math.min(availableKeys, _queue.length, MAX_CONCURRENCY);

  if (concurrency <= 0) return;

  // Dequeue up to `concurrency` items at once
  const batch = _queue.splice(0, concurrency);

  logger.info(
    { batchSize: batch.length, availableKeys, queueLeft: _queue.length },
    "Rewrite queue: starting parallel batch",
  );

  // Process all items in the batch simultaneously — each uses a different Gemini key
  await Promise.allSettled(batch.map((item) => processItem(item)));
}

// ── Startup ───────────────────────────────────────────────────────────────────
export function startRewriteWorker(): void {
  // New articles from RSS → front of queue (highest priority)
  registerRewriteQueue(enqueueRewriteFront);

  setInterval(() => { void processBatch(); }, PROCESS_INTERVAL_MS);
  setInterval(() => { void sweepPendingDrafts(); }, SWEEP_INTERVAL_MS);

  // Initial sweep after 30 s to catch drafts that already exist at boot
  setTimeout(() => { void sweepPendingDrafts(); }, 30_000);

  logger.info(
    { maxConcurrency: MAX_CONCURRENCY, maxAttempts: MAX_ATTEMPTS, intervalMs: PROCESS_INTERVAL_MS },
    "Rewrite queue worker started — parallel mode (N articles per key)",
  );
}
