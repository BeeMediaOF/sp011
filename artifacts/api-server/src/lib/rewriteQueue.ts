/**
 * Async rewrite queue — decouples RSS collection from AI rewriting.
 *
 * Articles are saved as raw drafts immediately when collected.
 * This queue processes them in PARALLEL, one article per available Gemini API key,
 * so N configured keys → N articles rewritten simultaneously → N× throughput.
 *
 * Retry logic:
 *  - QUOTA_COOLDOWN errors: article goes back to queue front WITHOUT consuming an attempt.
 *    Quota errors are temporary — they should never permanently drop an article.
 *  - Other errors (content, network, etc.): attempt counter incremented; dropped after MAX_ATTEMPTS.
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

// ── Content quality guard & JSON recovery ────────────────────────────────────

interface ExtractedAI {
  content: string;
  title?: string;
  subtitle?: string;
  keywords?: string;
  slug?: string;
}

/**
 * Robustly extracts structured fields from a raw AI response.
 *
 * Fixes the root-cause bug where `parseRewriteResult` in rssProcessor.ts drops
 * into the plain-text fallback when the AI returns `\n```json\n{...}` (leading
 * newline before the fence), because the `^` regex anchor does not match mid-string.
 * Here we `.trim()` first so the fence is always at position 0.
 *
 * Returns null when the content is neither valid HTML nor an extractable JSON blob,
 * meaning the article should be retried or deleted.
 */
function extractFromRawAI(raw: string): ExtractedAI | null {
  if (!raw || raw.trim().length < 20) return null;

  // ── Step 1: strip markdown fences ────────────────────────────────────────
  // IMPORTANT: trim() BEFORE the regex so leading newlines don't break the ^ anchor
  const stripped = raw.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/,        "")
    .trim();

  // ── Step 2: plain HTML or prose → keep as-is ─────────────────────────────
  if (!stripped.startsWith("{") && !stripped.startsWith("[")) {
    return stripped.length > 20 ? { content: stripped } : null;
  }

  // ── Step 3: try clean JSON parse ─────────────────────────────────────────
  try {
    const parsed = JSON.parse(stripped) as Record<string, unknown>;
    const content = (
      (parsed["content_html"] as string | undefined) ??
      (parsed["contentHtml"]  as string | undefined) ??
      (parsed["content"]      as string | undefined) ??
      ""
    ).trim();
    if (content.length > 20) {
      return {
        content,
        title:    ((parsed["title"]    as string | undefined) ?? "").trim() || undefined,
        subtitle: ((parsed["subtitle"] as string | undefined) ?? "").trim() || undefined,
        keywords: ((parsed["keywords"] as string | undefined) ?? "").trim() || undefined,
        slug:     ((parsed["slug"]     as string | undefined) ?? "").trim() || undefined,
      };
    }
  } catch { /* fall through to regex */ }

  // ── Step 4: regex fallback for truncated JSON ─────────────────────────────
  const mHtml = stripped.match(/"content_html"\s*:\s*"([\s\S]+?)(?:(?<!\\)"\s*[,}]|(?<!\\)"\s*$)/);
  if (mHtml?.[1]) {
    const content = mHtml[1]
      .replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\").trim();
    if (content.length > 20) {
      const mTitle = stripped.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const mSub   = stripped.match(/"subtitle"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const mKw    = stripped.match(/"keywords"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const mSlug  = stripped.match(/"slug"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      return {
        content,
        title:    mTitle?.[1]?.replace(/\\"/g, '"').trim() || undefined,
        subtitle: mSub?.[1]?.replace(/\\"/g, '"').trim()   || undefined,
        keywords: mKw?.[1]?.replace(/\\"/g, '"').trim()    || undefined,
        slug:     mSlug?.[1]?.replace(/\\"/g, '"').trim()  || undefined,
      };
    }
  }

  return null; // truly unextractable
}

/**
 * Returns true if the content string can be rendered to the reader.
 * HTML and plain text always pass. JSON-like content is accepted only if
 * a `content_html` (or similar) field can be extracted from it.
 */
function isContentRenderable(content: string): boolean {
  return extractFromRawAI(content) !== null;
}

// ── Timing constants ─────────────────────────────────────────────────────────
// Gemini 2.5 Flash free tier: 10 RPM per key.
// With N keys each getting 1 request per batch, interval must be > 6 s (60s / 10 RPM).
// 7 s gives ~8.5 RPM per key — safely under the cap.
const PROCESS_INTERVAL_MS = 7_000;
// Within each batch, stagger requests by this many ms so all keys don't fire simultaneously.
// 9 keys × 700 ms = 6.3 s spread — distributes load evenly across the interval.
const STAGGER_MS = 700;
// Sweep for new unprocessed drafts every 5 minutes
const SWEEP_INTERVAL_MS = 5 * 60_000;
// Maximum content/network error retries before permanently dropping an article.
// NOTE: quota errors do NOT consume this counter — they retry indefinitely.
const MAX_ATTEMPTS = 3;
// Maximum parallel workers = max number of configured Gemini keys (currently 9).
const MAX_CONCURRENCY = 9;

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

    /*
     * Recovery pass: rssProcessor.parseRewriteResult may fall through to the
     * plain-text fallback (saving raw JSON/fence as content) when the AI response
     * starts with a leading newline before the ``` fence, because the ^ regex anchor
     * doesn't match mid-string. We re-apply the full extraction here with a proper
     * trim() before the fence-strip so we always catch the right content.
     */
    let finalContent  = result.content;
    let finalTitle    = result.title;
    let finalSubtitle = result.subtitle;
    let finalKeywords = result.keywords;
    let finalSlug     = result.slug;

    const contentLooksRaw =
      result.content.trimStart().startsWith("{") ||
      result.content.trimStart().startsWith("```");

    if (contentLooksRaw) {
      const recovered = extractFromRawAI(result.content);
      if (recovered) {
        finalContent  = recovered.content;
        finalTitle    = recovered.title    ?? result.title;
        finalSubtitle = recovered.subtitle ?? result.subtitle;
        finalKeywords = recovered.keywords ?? result.keywords;
        finalSlug     = recovered.slug     ?? result.slug;
        logger.info({ articleId: item.articleId }, "Rewrite queue: recovered content from raw JSON blob");
      }
    }

    // Final quality gate: if content is still unreadable, delete rather than publish garbage
    if (!isContentRenderable(finalContent)) {
      await articleService.deleteArticle(item.articleId);
      _failedTotal++;
      addLog({ type: "error", sourceName: item.sourceName, articleTitle: item.title, message: "Conteúdo reescrito ilegível após tentativa de recuperação — artigo excluído" });
      pushHistory({ articleId: item.articleId, title: item.title, status: "failed", at: Date.now(), error: "unrenderable_content" });
      logger.warn({ articleId: item.articleId, attempt }, "Rewrite queue: deleted article — content unrenderable after recovery attempt");
      return;
    }

    await articleService.updateArticle(item.articleId, {
      ...(finalTitle    && { title:    finalTitle }),
      ...(finalSubtitle && { subtitle: finalSubtitle }),
      content:     finalContent,
      ...(finalKeywords && { keywords: finalKeywords }),
      ...(finalSlug     && { slug:     finalSlug }),
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

    if (isQuotaError) {
      // Quota errors are TEMPORARY — re-queue at front WITHOUT consuming an attempt.
      // The article will be retried once the cooldown lifts.
      if (!_queue.some((q) => q.articleId === item.articleId)) {
        _queue.unshift({ ...item, attempts: item.attempts ?? 0 }); // keep original attempt count
        logger.info(
          { articleId: item.articleId, attempt, queueLength: _queue.length },
          "Article returned to queue front — quota cooldown, attempt NOT consumed",
        );
      }
    } else if (attempt < MAX_ATTEMPTS) {
      // Real error (content/network): retry up to MAX_ATTEMPTS times, push to back
      if (!_queue.some((q) => q.articleId === item.articleId)) {
        _queue.push({ ...item, attempts: attempt });
        logger.info(
          { articleId: item.articleId, attempt, maxAttempts: MAX_ATTEMPTS },
          "Article re-queued after content/network error",
        );
      }
    } else {
      // Real error, max attempts reached: delete the article so it never shows as broken
      try {
        await articleService.deleteArticle(item.articleId);
        logger.warn(
          { articleId: item.articleId, attempt },
          `Article deleted after ${MAX_ATTEMPTS} failed rewrite attempts`,
        );
        addLog({ type: "error", sourceName: item.sourceName, articleTitle: item.title, message: `Artigo excluído após ${MAX_ATTEMPTS} tentativas de reescrita sem sucesso` });
      } catch (delErr) {
        logger.warn({ err: delErr, articleId: item.articleId }, "Failed to delete article after max attempts");
      }
    }
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

  // Process items in parallel but stagger start times so all keys don't fire at once.
  // e.g. 9 keys × 700 ms = item[0] at t=0, item[1] at t=700ms … item[8] at t=5.6s
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  await Promise.allSettled(
    batch.map((item, i) => sleep(i * STAGGER_MS).then(() => processItem(item))),
  );
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
