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
  isKeyAuthError,
  type RewriteJobItem,
} from "./rssProcessor.js";
import { logger } from "./logger.js";
import { sanitizeHighlightMarkers } from "@workspace/social-template";

// ── Content quality guard & JSON recovery ────────────────────────────────────

interface ExtractedAI {
  content: string;
  title?: string;
  subtitle?: string;
  socialTitle?: string;
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
        title:       ((parsed["title"]    as string | undefined) ?? "").trim() || undefined,
        subtitle:    ((parsed["subtitle"] as string | undefined) ?? "").trim() || undefined,
        socialTitle: sanitizeHighlightMarkers(((parsed["social_title"] as string | undefined) ?? "").trim()) || undefined,
        keywords:    ((parsed["keywords"] as string | undefined) ?? "").trim() || undefined,
        slug:        ((parsed["slug"]     as string | undefined) ?? "").trim() || undefined,
      };
    }
  } catch { /* fall through to regex */ }

  // ── Step 4: regex fallback for truncated JSON ─────────────────────────────
  const mHtml = stripped.match(/"content_html"\s*:\s*"([\s\S]+?)(?:(?<!\\)"\s*[,}]|(?<!\\)"\s*$)/);
  if (mHtml?.[1]) {
    const content = mHtml[1]
      .replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\").trim();
    if (content.length > 20) {
      const mTitle  = stripped.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const mSub    = stripped.match(/"subtitle"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const mSocial = stripped.match(/"social_title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const mKw     = stripped.match(/"keywords"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const mSlug   = stripped.match(/"slug"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      return {
        content,
        title:       mTitle?.[1]?.replace(/\\"/g, '"').trim() || undefined,
        subtitle:    mSub?.[1]?.replace(/\\"/g, '"').trim()   || undefined,
        socialTitle: sanitizeHighlightMarkers(mSocial?.[1]?.replace(/\\"/g, '"').trim() || "") || undefined,
        keywords:    mKw?.[1]?.replace(/\\"/g, '"').trim()    || undefined,
        slug:        mSlug?.[1]?.replace(/\\"/g, '"').trim()  || undefined,
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

// ── Perplexity fallback rewriter ──────────────────────────────────────────────
// Called when Gemini is on quota cooldown so articles don't pile up in queue.

interface PerplexityChoice {
  message: { content: string };
}
interface PerplexityResponse {
  choices: PerplexityChoice[];
}

async function rewriteWithPerplexity(item: RewriteJobItem): Promise<ExtractedAI | null> {
  const apiKey = process.env["PERPLEXITY_API_KEY"];
  if (!apiKey) return null;

  const systemPrompt = [
    "Você é um editor de notícias brasileiro experiente do portal SBC Agora (Brasília).",
    "Reescreva o artigo de forma original, profissional e envolvente, preservando todos os fatos.",
    "Escreva APENAS em português do Brasil. Nunca use inglês.",
    "Responda SOMENTE com um JSON válido (sem markdown fences) no formato:",
    '{"title":"Título reescrito","subtitle":"Subtítulo curto","social_title":"TÍTULO CURTO COM *DESTAQUE* NO TRECHO PRINCIPAL","content_html":"<p>...</p>","keywords":"palavra1, palavra2","slug":"slug-do-artigo"}',
    "O social_title é uma versão CURTA e direta do título (máx 60 caracteres, 4 a 8 palavras) para uma arte de rede social. Envolva com asteriscos (*assim*) apenas o trecho de maior impacto da manchete (nome, resultado, prazo, valor ou consequência), em qualquer posição. Nunca destaque a manchete inteira nem palavras genéricas.",
  ].join("\n");

  const creditLine = item.giveCredit
    ? `\n\nFonte original: ${item.sourceName}. Mencione discretamente ao final.`
    : "";

  const userPrompt = `Artigo de ${item.sourceName}:\nTítulo: ${item.title}\n\n${item.text}${creditLine}`;

  const resp = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt },
      ],
      max_tokens: 2_000,
      temperature: 0.6,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Perplexity ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = (await resp.json()) as PerplexityResponse;
  const raw  = data.choices[0]?.message?.content ?? "";
  return extractFromRawAI(raw);
}

// ── Timing constants ─────────────────────────────────────────────────────────
// Gemini 2.5 Flash free tier: 10 RPM per key.
// Interval of 10 s gives 6 req/min per key — safely under the 10 RPM cap.
const PROCESS_INTERVAL_MS = 10_000;
// Stagger start times within each batch so the 6 keys spread across the 10 s window:
// article[0] at t=0, article[1] at t=800 ms … article[5] at t=4 s.
const STAGGER_MS = 800;
// Sweep for pending drafts frequently so the queue is always full.
// Every 90 s ensures a fresh batch is ready before the current one drains.
const SWEEP_INTERVAL_MS = 90_000;
// Maximum content/network error retries before permanently dropping an article.
// NOTE: quota errors do NOT consume this counter — they retry indefinitely.
const MAX_ATTEMPTS = 3;
// Use 6 keys in parallel: 6 req / 10 s = 36 req/min total, ≤ 6 req/min per key
// (well under the 10 RPM per-key cap). Leaves 3 keys as reserve if some are in cooldown.
const MAX_CONCURRENCY = 6;

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

// ── Throttled "all providers down" panel notification ─────────────────────────
let _lastProvidersDownLogAt = 0;
const PROVIDERS_DOWN_LOG_INTERVAL_MS = 5 * 60 * 1000; // at most one panel log / 5 min

/** Write a single, clear, throttled warning to the panel log when both AI providers are unavailable. */
function notifyProvidersDown(isKeyProblem: boolean): void {
  const now = Date.now();
  if (now - _lastProvidersDownLogAt < PROVIDERS_DOWN_LOG_INTERVAL_MS) return;
  _lastProvidersDownLogAt = now;
  const message = isKeyProblem
    ? "Todas as chaves Gemini estão indisponíveis (inválidas, vazadas ou sem cota) e o fallback Perplexity falhou. Os artigos ficam aguardando na fila. Verifique as chaves em Configurações de IA."
    : "Gemini sem cota no momento e o fallback Perplexity falhou. Os artigos ficam aguardando na fila e serão reescritos assim que a cota voltar.";
  addLog({ type: "error", sourceName: "Sistema", articleTitle: "Reescrita de IA pausada", message });
  logger.warn({ isKeyProblem }, "Rewrite queue: both AI providers unavailable — articles held in queue");
}

// ── Cooldown wake-up: schedule processBatch exactly when cooldown expires ─────
let _cooldownWakeupHandle: ReturnType<typeof setTimeout> | null = null;
// ── Force-bypass: admin can request one immediate batch attempt ───────────────
let _forceNextBatch = false;

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

/**
 * Force the queue to attempt one immediate batch, bypassing the cooldown gate.
 * Useful when the admin wants to manually unstick a queue that appears frozen.
 * The underlying Gemini call still enforces its own quota — if quota is truly
 * active the article will be silently re-queued, not logged as an error.
 */
export function forceResume(): void {
  _paused = false;
  _forceNextBatch = true;
  // Cancel any pending wake-up so we don't double-fire
  if (_cooldownWakeupHandle !== null) {
    clearTimeout(_cooldownWakeupHandle);
    _cooldownWakeupHandle = null;
  }
  void processBatch();
  logger.info("Rewrite queue: admin forced immediate batch attempt");
}

function pushHistory(entry: HistoryEntry) {
  _recentHistory.unshift(entry);
  if (_recentHistory.length > HISTORY_MAX) _recentHistory.length = HISTORY_MAX;
}

// ── Sweep: pick up drafts that haven't been rewritten yet ─────────────────────
// How many drafts to load per sweep. High enough to keep the queue full between
// 90-second sweeps even at maximum throughput (36 req/min × 1.5 min = 54 max).
// 200 gives a comfortable buffer while staying memory-efficient.
const SWEEP_BATCH = 200;

async function sweepPendingDrafts(): Promise<void> {
  try {
    // Only sweep when the queue is running low — avoids redundant DB reads.
    if (_queue.length >= SWEEP_BATCH / 2) return;

    const drafts = await articleService.getPendingRewrites(SWEEP_BATCH);
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
    let finalContent     = result.content;
    let finalTitle       = result.title;
    let finalSubtitle    = result.subtitle;
    let finalSocialTitle = result.socialTitle;
    let finalKeywords    = result.keywords;
    let finalSlug        = result.slug;

    const contentLooksRaw =
      result.content.trimStart().startsWith("{") ||
      result.content.trimStart().startsWith("```");

    if (contentLooksRaw) {
      const recovered = extractFromRawAI(result.content);
      if (recovered) {
        finalContent     = recovered.content;
        finalTitle       = recovered.title       ?? result.title;
        finalSubtitle    = recovered.subtitle    ?? result.subtitle;
        finalSocialTitle = recovered.socialTitle ?? result.socialTitle;
        finalKeywords    = recovered.keywords    ?? result.keywords;
        finalSlug        = recovered.slug        ?? result.slug;
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
      ...(finalTitle       && { title:       finalTitle }),
      ...(finalSubtitle    && { subtitle:    finalSubtitle }),
      ...(finalSocialTitle && { socialTitle: finalSocialTitle }),
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
    const msg = String(err);
    const isQuotaError = msg.includes("QUOTA_COOLDOWN") || msg.includes("QUOTA_EXHAUSTED");
    // Provider/config failures (no key, invalid/leaked key, 401/403) are NOT the
    // article's fault — they must never cause the article to be deleted. Treat them
    // like a quota error: try Perplexity, otherwise keep the draft queued until the
    // admin fixes the keys.
    const isProviderError =
      isQuotaError ||
      msg.includes("não configurada") ||
      isKeyAuthError(msg);

    if (isProviderError) {
      // Gemini unavailable (quota or bad key) — try Perplexity as an instant fallback
      // so the article doesn't just pile up waiting for Gemini to recover.
      logger.warn({ articleId: item.articleId, attempt }, "Rewrite queue: Gemini unavailable — trying Perplexity fallback");
      let perplexityOk = false;
      try {
        const pResult = await rewriteWithPerplexity(item);
        if (pResult && isContentRenderable(pResult.content)) {
          await articleService.updateArticle(item.articleId, {
            ...(pResult.title       && { title:       pResult.title }),
            ...(pResult.subtitle    && { subtitle:    pResult.subtitle }),
            ...(pResult.socialTitle && { socialTitle: pResult.socialTitle }),
            content:     pResult.content,
            ...(pResult.keywords && { keywords: pResult.keywords }),
            ...(pResult.slug     && { slug:     pResult.slug }),
            aiRewritten: true,
            status:      item.finalStatus,
            ...(item.finalStatus === "published" && { publishedAt: new Date().toISOString() }),
          });
          _processedTotal++;
          addLog({ type: "rewrite",  sourceName: item.sourceName, articleTitle: pResult.title || item.title });
          if (item.finalStatus === "published") {
            addLog({ type: "publish", sourceName: item.sourceName, articleTitle: pResult.title || item.title, message: "Publicado após reescrita (Perplexity)" });
          }
          pushHistory({ articleId: item.articleId, title: pResult.title || item.title, status: "ok", at: Date.now() });
          logger.info({ articleId: item.articleId }, "Rewrite queue: article rewritten via Perplexity fallback ✓");
          perplexityOk = true;
        }
      } catch (perplexityErr) {
        logger.warn({ err: perplexityErr, articleId: item.articleId }, "Perplexity fallback failed — re-queuing for Gemini");
      }

      if (!perplexityOk) {
        // Both providers unavailable — re-queue at front (attempt NOT consumed, never deleted).
        if (!_queue.some((q) => q.articleId === item.articleId)) {
          _queue.unshift({ ...item, attempts: item.attempts ?? 0 });
          logger.info(
            { articleId: item.articleId, attempt, queueLength: _queue.length },
            "Article returned to queue front — provider unavailable, attempt NOT consumed",
          );
        }
        // Surface a clear, throttled warning in the admin panel log so the cause is
        // obvious (no working Gemini key AND Perplexity unavailable). Throttled so a
        // full queue doesn't flood the log every few seconds.
        const isKeyProblem = !isQuotaError; // invalid/leaked/missing key (not just quota)
        notifyProvidersDown(isKeyProblem);
      }
    } else {
      // Real error: count + log it
      _failedTotal++;
      logger.warn({ err, articleId: item.articleId, attempt }, "Rewrite queue: item failed");
      addLog({ type: "error", sourceName: item.sourceName, articleTitle: item.title, message: `Reescrita falhou (tentativa ${attempt}/${MAX_ATTEMPTS}): ${msg}` });
      pushHistory({ articleId: item.articleId, title: item.title, status: "failed", at: Date.now(), error: msg });

      if (attempt < MAX_ATTEMPTS) {
        // Retry up to MAX_ATTEMPTS times, push to back
        if (!_queue.some((q) => q.articleId === item.articleId)) {
          _queue.push({ ...item, attempts: attempt });
          logger.info(
            { articleId: item.articleId, attempt, maxAttempts: MAX_ATTEMPTS },
            "Article re-queued after content/network error",
          );
        }
      } else {
        // Max attempts reached: delete the article so it never shows as broken
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
    }
  } finally {
    _activeCount--;
  }
}

// ── Batch worker: process N articles in parallel ──────────────────────────────
async function processBatch(): Promise<void> {
  if (_paused || _queue.length === 0) return;

  const quota = getAIQuotaStatus();

  if (quota.isQuotaExhausted) {
    logger.debug("Rewrite queue paused — daily quota exhausted");
    return;
  }

  if (quota.isOnCooldown && !_forceNextBatch) {
    const remaining = quota.cooldownRemainingMs;
    logger.debug(
      { cooldownSecs: Math.ceil(remaining / 1_000) },
      "Rewrite queue paused — quota cooldown; scheduling wake-up",
    );
    // Schedule a precise wake-up so the queue resumes the moment cooldown expires
    // rather than waiting for an arbitrary 10 s interval tick.
    if (_cooldownWakeupHandle === null) {
      _cooldownWakeupHandle = setTimeout(() => {
        _cooldownWakeupHandle = null;
        logger.info("Rewrite queue: cooldown expired — waking up");
        void processBatch();
      }, remaining + 5_000); // +5 s extra so the 60 s Gemini window is fully past
    }
    return;
  }

  // Clear the forced-batch flag regardless of outcome
  _forceNextBatch = false;
  // Cancel any stale wake-up timer (cooldown may have been bypassed)
  if (_cooldownWakeupHandle !== null) {
    clearTimeout(_cooldownWakeupHandle);
    _cooldownWakeupHandle = null;
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
    {
      maxConcurrency:  MAX_CONCURRENCY,
      maxAttempts:     MAX_ATTEMPTS,
      intervalMs:      PROCESS_INTERVAL_MS,
      sweepIntervalMs: SWEEP_INTERVAL_MS,
      sweepBatch:      SWEEP_BATCH,
    },
    "Rewrite queue worker started — parallel mode",
  );
}
