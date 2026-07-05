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
import { store } from "./store.js";
import { sanitizePlainField, sanitizeSocialTitle } from "@workspace/social-template";

// ── Content quality guard & JSON recovery ────────────────────────────────────

interface ExtractedAI {
  content: string;
  title?: string;
  subtitle?: string;
  socialTitle?: string;
  socialSummary?: string;
  socialHashtags?: string;
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
        title:       sanitizePlainField(((parsed["title"]    as string | undefined) ?? "").trim()) || undefined,
        subtitle:    sanitizePlainField(((parsed["subtitle"] as string | undefined) ?? "").trim()) || undefined,
        socialTitle: sanitizeSocialTitle(((parsed["social_title"] as string | undefined) ?? "").trim()) || undefined,
        socialSummary:  sanitizePlainField(((parsed["social_summary"]  as string | undefined) ?? "").trim()) || undefined,
        socialHashtags: sanitizePlainField(((parsed["social_hashtags"] as string | undefined) ?? "").trim()) || undefined,
        keywords:    sanitizePlainField(((parsed["keywords"] as string | undefined) ?? "").trim()) || undefined,
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
      const mSummary = stripped.match(/"social_summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const mTags    = stripped.match(/"social_hashtags"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const mKw     = stripped.match(/"keywords"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const mSlug   = stripped.match(/"slug"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      return {
        content,
        title:       sanitizePlainField(mTitle?.[1]?.replace(/\\"/g, '"').trim() ?? "") || undefined,
        subtitle:    sanitizePlainField(mSub?.[1]?.replace(/\\"/g, '"').trim() ?? "")   || undefined,
        socialTitle: sanitizeSocialTitle(mSocial?.[1]?.replace(/\\"/g, '"').trim() || "") || undefined,
        socialSummary:  sanitizePlainField(mSummary?.[1]?.replace(/\\"/g, '"').trim() ?? "") || undefined,
        socialHashtags: sanitizePlainField(mTags?.[1]?.replace(/\\"/g, '"').trim() ?? "")   || undefined,
        keywords:    sanitizePlainField(mKw?.[1]?.replace(/\\"/g, '"').trim() ?? "")    || undefined,
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
  // Chave do painel (Configurações → IAs de Apoio) tem prioridade sobre a env var
  const settings = store.getSettings();
  const apiKey = settings.perplexityApiKey || process.env["PERPLEXITY_API_KEY"];
  if (!apiKey) return null;
  const model = settings.perplexityModel || "sonar";

  const systemPrompt = [
    "Você é um editor de notícias brasileiro experiente do portal SBC Agora (Brasília).",
    "Reescreva o artigo de forma original, profissional e envolvente, preservando todos os fatos.",
    "Escreva APENAS em português do Brasil. Nunca use inglês.",
    "Responda SOMENTE com um JSON válido (sem markdown fences) no formato:",
    '{"title":"Título reescrito","subtitle":"Subtítulo curto","social_title":"MANCHETE DE 70 A 85 CARACTERES COM *DESTAQUE* NO TRECHO DE MAIOR IMPACTO","content_html":"<p>...</p>","keywords":"palavra1, palavra2","slug":"slug-do-artigo"}',
    "O social_title é a manchete da arte de rede social: analise o conteúdo completo e escolha o ângulo mais chamativo para o público (fato surpreendente, número, prazo, consequência prática), em voz ativa e tempo presente.",
    "TAMANHO OBRIGATÓRIO do social_title: entre 70 e 85 caracteres (10 a 13 palavras) — NUNCA menos de 70, a arte do Instagram precisa de 3 linhas cheias de título; NUNCA mais de 90. Sem reticências, sem cortar palavras, sem clickbait enganoso.",
    "Envolva com asteriscos (*assim*) apenas o trecho de maior impacto da manchete (nome, resultado, prazo, valor ou consequência), em qualquer posição. Nunca destaque a manchete inteira nem palavras genéricas.",
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
      model,
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

// ── Reforço de IA (boost) ─────────────────────────────────────────────────────
// IAs de apoio (Gemini/Perplexity) drenam a fila em paralelo com o provider
// principal, SEM esperar o Ollama falhar. Dois gatilhos independentes:
//   1. Rajadas agendadas: N vezes por dia (ex.: 3 = a cada 8h), cada rajada
//      processa até `batchSize` artigos.
//   2. Fila cheia: enquanto a fila ≥ `queueThreshold`, o reforço fica ativo.
// `maxPerDay` limita o total diário de reescritas via apoio (protege créditos).

/** Quantos artigos o reforço processa em paralelo (além da lane principal). */
const HELPER_CONCURRENCY = 2;

interface BoostConfig {
  enabled: boolean;
  provider: "gemini" | "perplexity" | "both";
  timesPerDay: number;
  batchSize: number;
  queueThreshold: number;
  maxPerDay: number;
}

function getBoostConfig(): BoostConfig {
  const s = store.getSettings();
  return {
    enabled:        s.aiBoostEnabled ?? false,
    provider:       s.aiBoostProvider ?? "both",
    timesPerDay:    Math.max(0, Math.min(Math.floor(s.aiBoostTimesPerDay ?? 0), 48)),
    batchSize:      Math.max(1, Math.min(Math.floor(s.aiBoostBatchSize ?? 10), 100)),
    queueThreshold: Math.max(0, Math.min(Math.floor(s.aiBoostQueueThreshold ?? 0), 1000)),
    maxPerDay:      Math.max(0, Math.min(Math.floor(s.aiBoostMaxPerDay ?? 0), 2000)),
  };
}

let _activeHelperCount = 0;
let _boostDateKey = "";
let _boostUsedToday = 0;
let _lastBurstAt = 0;
let _burstRemaining = 0;
let _helperFlip = 0; // alterna gemini/perplexity quando provider = both

function refreshBoostDay(): void {
  const today = new Date().toISOString().slice(0, 10);
  if (_boostDateKey !== today) { _boostDateKey = today; _boostUsedToday = 0; }
}

function burstIntervalMs(cfg: BoostConfig): number {
  return Math.floor((24 * 3600 * 1000) / Math.max(1, cfg.timesPerDay));
}

/** Escolhe a IA de apoio do próximo item. Com "both", alterna — e se o Gemini
 *  estiver em cooldown de cota, manda tudo para a Perplexity. */
function pickHelperProvider(cfg: BoostConfig): "gemini" | "perplexity" {
  if (cfg.provider !== "both") return cfg.provider;
  if (getAIQuotaStatus().isOnCooldown) return "perplexity";
  return _helperFlip++ % 2 === 0 ? "gemini" : "perplexity";
}

/**
 * Despacha itens da fila para as IAs de apoio quando o reforço está ativo.
 * Roda a cada tick do processBatch, independente da lane principal (Ollama),
 * que costuma ficar ocupada por minutos com um único artigo.
 */
function dispatchHelpers(): void {
  const cfg = getBoostConfig();
  if (!cfg.enabled || _queue.length === 0) return;
  refreshBoostDay();
  if (cfg.maxPerDay > 0 && _boostUsedToday >= cfg.maxPerDay) return;

  // Gatilho contínuo: fila acima do limiar
  let active = cfg.queueThreshold > 0 && _queue.length >= cfg.queueThreshold;
  let fromBurst = false;

  // Gatilho agendado: rajadas N vezes por dia
  if (!active && cfg.timesPerDay > 0) {
    if (_burstRemaining > 0) {
      active = true; fromBurst = true;
    } else if (Date.now() - _lastBurstAt >= burstIntervalMs(cfg)) {
      _lastBurstAt = Date.now();
      _burstRemaining = cfg.batchSize;
      active = true; fromBurst = true;
      logger.info({ batchSize: cfg.batchSize, provider: cfg.provider }, "AI boost: scheduled burst started");
      addLog({ type: "rewrite", sourceName: "Sistema", articleTitle: "Rajada de reforço iniciada", message: `IAs de apoio (${cfg.provider === "both" ? "Gemini+Perplexity" : cfg.provider}) vão processar até ${cfg.batchSize} artigo(s) da fila.` });
    }
  }
  if (!active) return;

  let free = Math.min(HELPER_CONCURRENCY - _activeHelperCount, _queue.length);
  if (cfg.maxPerDay > 0) free = Math.min(free, cfg.maxPerDay - _boostUsedToday);
  if (fromBurst) free = Math.min(free, _burstRemaining);
  if (free <= 0) return;

  const batch = _queue.splice(0, free);
  if (fromBurst) _burstRemaining -= batch.length;

  logger.info(
    { batchSize: batch.length, fromBurst, usedToday: _boostUsedToday, queueLeft: _queue.length },
    "AI boost: dispatching items to helper AIs",
  );
  for (const item of batch) {
    void processItem(item, pickHelperProvider(cfg));
  }
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
  const boostCfg = getBoostConfig();
  refreshBoostDay();
  return {
    pending:        _queue.length,
    paused:         _paused,
    processedTotal: _processedTotal,
    failedTotal:    _failedTotal,
    activeworkers:  _activeCount + _activeHelperCount,
    boost: {
      enabled:        boostCfg.enabled,
      provider:       boostCfg.provider,
      activeHelpers:  _activeHelperCount,
      usedToday:      _boostUsedToday,
      maxPerDay:      boostCfg.maxPerDay,
      burstRemaining: _burstRemaining,
      nextBurstAt:    boostCfg.enabled && boostCfg.timesPerDay > 0
        ? new Date(Math.max(Date.now(), _lastBurstAt + burstIntervalMs(boostCfg))).toISOString()
        : null,
    },
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
 * Esvazia a fila em memória (itens ainda não iniciados). Não toca no banco —
 * a exclusão dos rascunhos pendentes é feita à parte pelo articleService.
 * Retorna quantos itens foram removidos da fila.
 */
export function clearQueue(): number {
  const removed = _queue.length;
  _queue.length = 0;
  logger.info({ removed }, "Rewrite queue cleared by admin");
  return removed;
}

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
// `helperProvider` (opcional): item despachado pela lane de reforço — reescreve
// direto na IA de apoio indicada, sem passar pelo provider principal (Ollama).
async function processItem(item: RewriteJobItem, helperProvider?: "gemini" | "perplexity"): Promise<void> {
  const isHelper = !!helperProvider;
  if (isHelper) _activeHelperCount++; else _activeCount++;
  const attempt = (item.attempts ?? 0) + 1;

  try {
    logger.info(
      { articleId: item.articleId, attempt, helperProvider, queueLeft: _queue.length },
      "Rewriting queued article",
    );

    let result: Awaited<ReturnType<typeof rewriteWithAI>>;
    if (helperProvider === "perplexity") {
      const p = await rewriteWithPerplexity(item);
      if (!p) throw new Error("PERPLEXITY_UNAVAILABLE: chave não configurada ou resposta vazia");
      result = {
        content:        p.content,
        keywords:       p.keywords ?? "",
        slug:           p.slug ?? "",
        title:          p.title,
        subtitle:       p.subtitle,
        socialTitle:    p.socialTitle,
        socialSummary:  p.socialSummary,
        socialHashtags: p.socialHashtags,
      };
    } else {
      result = await rewriteWithAI(
        item.title,
        item.text,
        item.sourceName,
        item.giveCredit,
        item.customPrompt,
        helperProvider, // "gemini" força o Gemini na lane de reforço; undefined = provider configurado
      );
    }

    /*
     * Recovery pass: rssProcessor.parseRewriteResult may fall through to the
     * plain-text fallback (saving raw JSON/fence as content) when the AI response
     * starts with a leading newline before the ``` fence, because the ^ regex anchor
     * doesn't match mid-string. We re-apply the full extraction here with a proper
     * trim() before the fence-strip so we always catch the right content.
     */
    let finalContent        = result.content;
    let finalTitle          = result.title;
    let finalSubtitle       = result.subtitle;
    let finalSocialTitle    = result.socialTitle;
    let finalSocialSummary  = result.socialSummary;
    let finalSocialHashtags = result.socialHashtags;
    let finalKeywords       = result.keywords;
    let finalSlug           = result.slug;

    const contentLooksRaw =
      result.content.trimStart().startsWith("{") ||
      result.content.trimStart().startsWith("```");

    if (contentLooksRaw) {
      const recovered = extractFromRawAI(result.content);
      if (recovered) {
        finalContent        = recovered.content;
        finalTitle          = recovered.title          ?? result.title;
        finalSubtitle       = recovered.subtitle       ?? result.subtitle;
        finalSocialTitle    = recovered.socialTitle    ?? result.socialTitle;
        finalSocialSummary  = recovered.socialSummary  ?? result.socialSummary;
        finalSocialHashtags = recovered.socialHashtags ?? result.socialHashtags;
        finalKeywords       = recovered.keywords       ?? result.keywords;
        finalSlug           = recovered.slug           ?? result.slug;
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
      ...(finalTitle          && { title:          finalTitle }),
      ...(finalSubtitle       && { subtitle:       finalSubtitle }),
      ...(finalSocialTitle    && { socialTitle:    finalSocialTitle }),
      ...(finalSocialSummary  && { socialSummary:  finalSocialSummary }),
      ...(finalSocialHashtags && { socialHashtags: finalSocialHashtags }),
      content:     finalContent,
      ...(finalKeywords && { keywords: finalKeywords }),
      ...(finalSlug     && { slug:     finalSlug }),
      aiRewritten: true,
      status:      item.finalStatus,
      ...(item.finalStatus === "published" && { publishedAt: new Date().toISOString() }),
    });

    _processedTotal++;
    if (isHelper) { refreshBoostDay(); _boostUsedToday++; }
    const rewriteMsg = isHelper ? `Reescrito pela IA de apoio (${helperProvider})` : undefined;
    addLog({ type: "rewrite",  sourceName: item.sourceName, articleTitle: result.title || item.title, message: rewriteMsg });
    if (item.finalStatus === "published") {
      addLog({ type: "publish", sourceName: item.sourceName, articleTitle: result.title || item.title, message: isHelper ? `Publicado após reescrita (apoio: ${helperProvider})` : "Publicado após reescrita" });
    }
    pushHistory({ articleId: item.articleId, title: result.title || item.title, status: "ok", at: Date.now() });
    logger.info({ articleId: item.articleId, attempt, helperProvider }, "Rewrite queue: article updated successfully");

  } catch (err) {
    const msg = String(err);

    if (isHelper) {
      // Falha na IA de apoio não pode punir o artigo: volta ao FIM da fila sem
      // consumir tentativa — a lane principal (Ollama) processa normalmente.
      if (!_queue.some((q) => q.articleId === item.articleId)) {
        _queue.push({ ...item });
      }
      logger.warn(
        { err, articleId: item.articleId, helperProvider },
        "AI boost: helper rewrite failed — item returned to queue for main lane",
      );
      return;
    }
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
        // Fallback Perplexity desligável no painel (card IAs de Apoio)
        const pResult = (store.getSettings().fallbackPerplexityEnabled ?? true)
          ? await rewriteWithPerplexity(item)
          : null;
        if (pResult && isContentRenderable(pResult.content)) {
          await articleService.updateArticle(item.articleId, {
            ...(pResult.title          && { title:          pResult.title }),
            ...(pResult.subtitle       && { subtitle:       pResult.subtitle }),
            ...(pResult.socialTitle    && { socialTitle:    pResult.socialTitle }),
            ...(pResult.socialSummary  && { socialSummary:  pResult.socialSummary }),
            ...(pResult.socialHashtags && { socialHashtags: pResult.socialHashtags }),
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
    if (isHelper) _activeHelperCount--; else _activeCount--;
  }
}

// ── Batch worker: process N articles in parallel ──────────────────────────────
async function processBatch(): Promise<void> {
  if (_paused || _queue.length === 0) return;

  // Lane de reforço: roda ANTES dos gates de cota/concorrência da lane principal —
  // com o Ollama ocupado por minutos, o reforço é o que mantém a fila drenando.
  dispatchHelpers();
  if (_queue.length === 0) return;

  // Ollama roda local, sem cota nem limite diário: não pausa por cota do Gemini
  // e processa 1 artigo por vez (inferência em CPU não paraleliza bem).
  const isOllama = store.getSettings().rssAiProvider === "ollama";

  const quota = getAIQuotaStatus();

  if (!isOllama && quota.isQuotaExhausted) {
    logger.debug("Rewrite queue paused — daily quota exhausted");
    return;
  }

  if (!isOllama && quota.isOnCooldown && !_forceNextBatch) {
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
  const concurrency = isOllama
    ? Math.min(1, _queue.length)                                  // Ollama: 1 por vez (CPU)
    : Math.min(availableKeys, _queue.length, MAX_CONCURRENCY);

  if (concurrency <= 0) return;

  // Respeita os artigos já em processamento: processBatch roda a cada
  // PROCESS_INTERVAL_MS independentemente do batch anterior ter terminado. Sem esta
  // trava, com o Ollama (cada reescrita leva minutos) cada tick de 10 s empilharia
  // outra requisição no servidor Ollama (1 slot só) e todas estourariam o timeout.
  const freeSlots = concurrency - _activeCount;
  if (freeSlots <= 0) return;

  // Dequeue up to `freeSlots` items at once
  const batch = _queue.splice(0, freeSlots);

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
