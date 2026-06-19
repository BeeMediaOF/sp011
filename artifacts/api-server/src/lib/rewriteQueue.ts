/**
 * Async rewrite queue — decouples RSS article collection from AI rewriting.
 *
 * Articles are saved as raw drafts immediately when collected.
 * This queue processes them one at a time every PROCESS_INTERVAL_MS,
 * staying comfortably within Gemini free-tier limits (15 RPM, 1500 RPD).
 *
 * Usage: call startRewriteWorker() at server startup.
 * rssProcessor.ts registers the enqueue callback via registerRewriteQueue().
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

// 1 article every 5 s = max 12/min — safely below Gemini free-tier 15 RPM
const PROCESS_INTERVAL_MS = 5_000;

const _queue: RewriteJobItem[] = [];

export function enqueueRewrite(item: RewriteJobItem): void {
  _queue.push(item);
  logger.info({ articleId: item.articleId, queueLength: _queue.length }, "Article queued for AI rewrite");
}

export function getQueueStats(): { pending: number } {
  return { pending: _queue.length };
}

async function processNext(): Promise<void> {
  if (_queue.length === 0) return;

  const quota = getAIQuotaStatus();
  if (quota.isOnCooldown) {
    const secs = Math.ceil(quota.cooldownRemainingMs / 1_000);
    logger.debug({ cooldownSecs: secs }, "Rewrite queue paused — quota cooldown active");
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

    addLog({ type: "rewrite",  sourceName: item.sourceName, articleTitle: result.title || item.title });
    if (item.finalStatus === "published") {
      addLog({ type: "publish", sourceName: item.sourceName, articleTitle: result.title || item.title, message: "Publicado após reescrita" });
    }

    logger.info({ articleId: item.articleId }, "Rewrite queue: article updated successfully");
  } catch (err) {
    const msg = String(err);
    logger.warn({ err, articleId: item.articleId }, "Rewrite queue: item failed");
    addLog({ type: "error", sourceName: item.sourceName, articleTitle: item.title, message: `Reescrita falhou: ${msg}` });

    // On quota errors, return item to front of queue to retry later
    if (msg.includes("QUOTA_COOLDOWN") || msg.includes("QUOTA_EXHAUSTED")) {
      _queue.unshift(item);
      logger.info({ articleId: item.articleId, queueLength: _queue.length }, "Article returned to queue front — quota limit");
    }
  }
}

export function startRewriteWorker(): void {
  // Register our enqueue function so rssProcessor can use it without circular import
  registerRewriteQueue(enqueueRewrite);

  setInterval(() => { void processNext(); }, PROCESS_INTERVAL_MS);
  logger.info("Rewrite queue worker started (1 article / 5s)");
}
