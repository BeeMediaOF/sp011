/**
 * Worker de reescrita central — porte do contrato do `rewriteQueue.ts` do blog:
 * poll 10s, concorrência = 1 item por chave Gemini disponível (teto 6, Ollama=1),
 * MAX_ATTEMPTS 3, quota não consome tentativa, recovery via extractFromRawAI e
 * quality gate. Diferenças: fila é a tabela `news_items` (status queued) e o
 * consumo de tokens é gravado em `ai_usage_events` (o blog nunca mediu).
 *
 * IAs de Apoio (mesmo card do blog):
 * - Fallback Perplexity: quando o Gemini está sem cota/chave, tenta a Perplexity
 *   na hora, para o artigo não ficar preso na fila (desligável no painel).
 * - Reforço (boost): Gemini/Perplexity drenam a fila EM PARALELO com a lane
 *   principal (Ollama), via rajadas agendadas (N×/dia) e/ou gatilho de fila
 *   cheia (fila ≥ limiar), com teto diário opcional.
 */
import { randomUUID } from "node:crypto";
import {
  db,
  newsItemsTable,
  rewritesTable,
  centralSourcesTable,
  aiUsageEventsTable,
  type NewsItemRow,
} from "@workspace/central-db";
import {
  extractFromRawAI,
  isKeyAuthError,
  resolvePrompt,
  rewriteNews,
  rewriteWithPerplexity,
  type RewriteEngineConfig,
  type TokenUsage,
} from "@workspace/news-engine";
import { and, asc, count, eq, notInArray } from "drizzle-orm";
import { getPrompts, getSettings, type HubSettings } from "../lib/store.js";
import { getGeminiPool } from "../lib/aiPool.js";
import { logger } from "../lib/logger.js";
import { logEvent } from "../lib/eventLog.js";

const POLL_MS = 10_000;
const MAX_ATTEMPTS = 3;
const MAX_CONCURRENCY = 6;
/** Quantos artigos o reforço processa em paralelo (além da lane principal). */
const HELPER_CONCURRENCY = 2;

let _timer: NodeJS.Timeout | null = null;
let _running = false;

/** Tentativas por notícia (em memória, como a fila do blog). */
const _attempts = new Map<string, number>();

type HelperProvider = "gemini" | "perplexity";

// ── Estado do reforço (mesmos contadores do blog) ─────────────────────────────
let _activeHelpers = 0;
let _boostDateKey = "";
let _boostUsedToday = 0;
let _lastBurstAt = 0;
let _burstRemaining = 0;
let _helperFlip = 0; // alterna gemini/perplexity quando provider = both

interface BoostConfig {
  enabled: boolean;
  provider: "gemini" | "perplexity" | "both";
  timesPerDay: number;
  batchSize: number;
  queueThreshold: number;
  maxPerDay: number;
}

function getBoostConfig(s: HubSettings): BoostConfig {
  return {
    enabled:        s.aiBoostEnabled ?? false,
    provider:       s.aiBoostProvider ?? "both",
    timesPerDay:    Math.max(0, Math.min(Math.floor(s.aiBoostTimesPerDay ?? 0), 48)),
    batchSize:      Math.max(1, Math.min(Math.floor(s.aiBoostBatchSize ?? 10), 100)),
    queueThreshold: Math.max(0, Math.min(Math.floor(s.aiBoostQueueThreshold ?? 0), 1000)),
    maxPerDay:      Math.max(0, Math.min(Math.floor(s.aiBoostMaxPerDay ?? 0), 2000)),
  };
}

function refreshBoostDay(): void {
  const today = new Date().toISOString().slice(0, 10);
  if (_boostDateKey !== today) { _boostDateKey = today; _boostUsedToday = 0; }
}

function burstIntervalMs(cfg: BoostConfig): number {
  return Math.floor((24 * 3600 * 1000) / Math.max(1, cfg.timesPerDay));
}

function perplexityKey(s: HubSettings): string | undefined {
  return s.perplexityApiKey || process.env["PERPLEXITY_API_KEY"] || undefined;
}

/** Escolhe a IA de apoio do próximo item. Com "both", alterna — e se o Gemini
 *  estiver sem chave disponível, manda tudo para a Perplexity. */
function pickHelperProvider(cfg: BoostConfig, s: HubSettings): HelperProvider {
  if (cfg.provider !== "both") return cfg.provider;
  if (!perplexityKey(s)) return "gemini";
  if (getGeminiPool().availableKeyCount() === 0) return "perplexity";
  return _helperFlip++ % 2 === 0 ? "gemini" : "perplexity";
}

function engineConfig(s: HubSettings): RewriteEngineConfig {
  const pool = getGeminiPool();
  if (s.aiProvider === "openai") {
    return { provider: "openai", model: s.aiModel, openaiApiKey: s.openaiApiKey, logger };
  }
  if (s.aiProvider === "ollama") {
    return {
      provider: "ollama",
      model: s.aiModel,
      ollamaBaseUrl: s.ollamaBaseUrl || process.env["OLLAMA_BASE_URL"] || "http://ollama:11434",
      geminiPool: pool,
      fallbackToGemini: s.fallbackToGemini ?? true,
      logger,
    };
  }
  return { provider: "gemini", model: s.aiModel, geminiPool: pool, logger };
}

interface RewriteOutput {
  content: string;
  keywords?: string;
  slug?: string;
  title?: string;
  subtitle?: string;
  socialTitle?: string;
  socialSummary?: string;
  socialHashtags?: string;
  usage?: TokenUsage;
}

interface SourceCtx {
  customPrompt?: string;
  giveCredit: boolean;
  /** Idioma do conteúdo da fonte ("pt-BR" | "en") — carimbado na reescrita. */
  language: string;
}

async function loadSourceCtx(item: NewsItemRow): Promise<SourceCtx> {
  const rows = await db
    .select({
      customPrompt: centralSourcesTable.customPrompt,
      giveCredit: centralSourcesTable.giveCredit,
      language: centralSourcesTable.language,
    })
    .from(centralSourcesTable)
    .where(eq(centralSourcesTable.id, item.sourceId))
    .limit(1);
  return {
    customPrompt: rows[0]?.customPrompt ?? undefined,
    giveCredit: rows[0]?.giveCredit ?? false,
    language: rows[0]?.language ?? "pt-BR",
  };
}

async function runPerplexity(item: NewsItemRow, src: SourceCtx, s: HubSettings): Promise<RewriteOutput> {
  const apiKey = perplexityKey(s);
  if (!apiKey) throw new Error("PERPLEXITY_UNAVAILABLE: chave não configurada");
  const out = await rewriteWithPerplexity(
    {
      title: item.title,
      text: item.contentRaw ?? item.description ?? "",
      sourceName: item.sourceName,
      giveCredit: src.giveCredit,
    },
    { apiKey, model: s.perplexityModel },
  );
  return { content: out.raw, usage: out.usage };
}

/**
 * Valida (quality gate), grava a reescrita + consumo e marca o item como
 * rewritten. Devolve "unrenderable" quando o conteúdo é irrecuperável — cada
 * lane decide o que fazer (principal: failed; apoio/fallback: volta à fila).
 */
async function saveRewrite(
  item: NewsItemRow,
  out: RewriteOutput,
  s: HubSettings,
  via?: string,
  /** Idioma do texto reescrito = idioma da fonte (o prompt não traduz). */
  language = "pt-BR",
): Promise<"ok" | "unrenderable"> {
  const extracted = extractFromRawAI(out.content);
  if (!extracted) return "unrenderable";

  const rewriteId = randomUUID();
  await db.insert(rewritesTable).values({
    id: rewriteId,
    newsItemId: item.id,
    blogId: null, // reescrita compartilhada (MVP)
    language,
    title: out.title || extracted.title || item.title,
    subtitle: out.subtitle || extracted.subtitle || null,
    socialTitle: out.socialTitle ?? extracted.socialTitle ?? null,
    socialSummary: out.socialSummary ?? extracted.socialSummary ?? null,
    socialHashtags: out.socialHashtags ?? extracted.socialHashtags ?? null,
    contentHtml: extracted.content,
    slug: out.slug || extracted.slug || null,
    keywords: out.keywords || extracted.keywords || null,
    provider: out.usage?.provider ?? s.aiProvider,
    model: out.usage?.model ?? s.aiModel ?? null,
    attempts: (_attempts.get(item.id) ?? 0) + 1,
    status: "ok",
  });

  if (out.usage) {
    await db.insert(aiUsageEventsTable).values({
      newsItemId: item.id,
      rewriteId,
      provider: out.usage.provider,
      model: out.usage.model ?? null,
      keyHint: out.usage.keyHint ?? null,
      inputTokens: out.usage.inputTokens ?? null,
      outputTokens: out.usage.outputTokens ?? null,
      totalTokens: out.usage.totalTokens ?? null,
      purpose: "rewrite",
    });
  }

  await db
    .update(newsItemsTable)
    .set({ status: "rewritten", failReason: null, updatedAt: new Date() })
    .where(eq(newsItemsTable.id, item.id));
  _attempts.delete(item.id);

  logEvent({
    module: "rewriter", refType: "news_item", refId: item.id,
    message: `Reescrita concluída${via ? ` (${via})` : ""}: ${out.title || extracted.title || item.title}`,
    meta: out.usage ? { totalTokens: out.usage.totalTokens, provider: out.usage.provider } : undefined,
  });
  return "ok";
}

/** Devolve o item à fila sem consumir tentativa. */
async function requeue(item: NewsItemRow): Promise<void> {
  await db
    .update(newsItemsTable)
    .set({ status: "queued", updatedAt: new Date() })
    .where(eq(newsItemsTable.id, item.id));
}

async function processItem(item: NewsItemRow, helperProvider?: HelperProvider): Promise<void> {
  // Claim condicional: só processa se ainda estiver "queued"
  const claimed = await db
    .update(newsItemsTable)
    .set({ status: "rewriting", updatedAt: new Date() })
    .where(and(eq(newsItemsTable.id, item.id), eq(newsItemsTable.status, "queued")))
    .returning({ id: newsItemsTable.id });
  if (claimed.length === 0) return;

  const isHelper = !!helperProvider;
  if (isHelper) _activeHelpers++;
  const s = getSettings();

  try {
    // Prompt: fonte > categoria > global > default (mesma hierarquia do blog)
    const src = await loadSourceCtx(item);
    const template = resolvePrompt(
      { customPrompt: src.customPrompt, category: item.category },
      getPrompts(),
    );

    let out: RewriteOutput;
    if (helperProvider === "perplexity") {
      out = await runPerplexity(item, src, s);
    } else if (helperProvider === "gemini") {
      // Lane de reforço: força o pool Gemini (modelo padrão do pool)
      out = await rewriteNews(
        {
          title: item.title,
          text: item.contentRaw ?? item.description ?? "",
          sourceName: item.sourceName,
          giveCredit: src.giveCredit,
          promptTemplate: template,
        },
        { provider: "gemini", geminiPool: getGeminiPool(), logger },
      );
    } else {
      out = await rewriteNews(
        {
          title: item.title,
          text: item.contentRaw ?? item.description ?? "",
          sourceName: item.sourceName,
          giveCredit: src.giveCredit,
          promptTemplate: template,
        },
        engineConfig(s),
      );
    }

    const saved = await saveRewrite(item, out, s, isHelper ? `apoio: ${helperProvider}` : undefined, src.language);
    if (saved === "unrenderable") {
      if (isHelper) {
        // Falha da IA de apoio não pune o artigo: volta à fila para a lane principal
        await requeue(item);
        logger.warn({ newsItemId: item.id, helperProvider }, "Reforço: conteúdo ilegível — item devolvido à lane principal");
        return;
      }
      // Conteúdo irrecuperável na lane principal: falha imediata, sem novas tentativas
      await db
        .update(newsItemsTable)
        .set({ status: "failed", failReason: "unrenderable", updatedAt: new Date() })
        .where(eq(newsItemsTable.id, item.id));
      _attempts.delete(item.id);
      logEvent({
        module: "rewriter", level: "warn", refType: "news_item", refId: item.id,
        message: `Reescrita ilegível descartada: ${item.title}`,
      });
      return;
    }

    if (isHelper) { refreshBoostDay(); _boostUsedToday++; }
  } catch (err) {
    const msg = String(err);

    if (isHelper) {
      // Falha na IA de apoio não pode punir o artigo: volta à fila sem consumir
      // tentativa — a lane principal (Ollama) processa normalmente.
      await requeue(item);
      logger.warn({ err, newsItemId: item.id, helperProvider }, "Reforço: falha na IA de apoio — item devolvido à lane principal");
      return;
    }

    const isQuota = msg.includes("QUOTA_COOLDOWN") || msg.includes("QUOTA_EXHAUSTED");
    // Falhas de provider/configuração (sem chave, chave inválida, 401/403) não
    // são culpa do artigo: tenta a Perplexity na hora e, se não der, devolve à
    // fila sem consumir tentativa (mesmo desenho do blog).
    const isProviderError = isQuota || msg.includes("não configurada") || isKeyAuthError(msg);

    if (isProviderError) {
      if ((s.fallbackPerplexityEnabled ?? true) && perplexityKey(s)) {
        try {
          const src = await loadSourceCtx(item);
          const out = await runPerplexity(item, src, s);
          const saved = await saveRewrite(item, out, s, "fallback: perplexity", src.language);
          if (saved === "ok") return;
        } catch (pErr) {
          logger.warn({ err: pErr, newsItemId: item.id }, "Fallback Perplexity falhou — item volta à fila");
        }
      }
      await requeue(item);
      return;
    }

    const attempts = (_attempts.get(item.id) ?? 0) + 1;
    _attempts.set(item.id, attempts);

    if (attempts >= MAX_ATTEMPTS) {
      await db
        .update(newsItemsTable)
        .set({ status: "failed", failReason: msg.slice(0, 500), updatedAt: new Date() })
        .where(eq(newsItemsTable.id, item.id));
      _attempts.delete(item.id);
      logEvent({
        module: "rewriter", level: "error", refType: "news_item", refId: item.id,
        message: `Reescrita falhou após ${MAX_ATTEMPTS} tentativas: ${item.title}`,
        meta: { error: msg.slice(0, 300) },
      });
    } else {
      await requeue(item);
      logger.warn({ err, newsItemId: item.id, attempts }, "Reescrita falhou — retentará");
    }
  } finally {
    if (isHelper) _activeHelpers--;
  }
}

/**
 * Despacha itens da fila para as IAs de apoio quando o reforço está ativo —
 * roda a cada tick, independente da lane principal (que fica minutos ocupada
 * com um único artigo no Ollama). Itens rodam em background (sem await).
 */
async function dispatchBoost(s: HubSettings, excludeIds: string[]): Promise<void> {
  const cfg = getBoostConfig(s);
  if (!cfg.enabled) return;
  if (cfg.provider === "perplexity" && !perplexityKey(s)) return;
  refreshBoostDay();
  if (cfg.maxPerDay > 0 && _boostUsedToday >= cfg.maxPerDay) return;

  const queuedFilter = excludeIds.length > 0
    ? and(eq(newsItemsTable.status, "queued"), notInArray(newsItemsTable.id, excludeIds))
    : eq(newsItemsTable.status, "queued");
  const [row] = await db.select({ n: count() }).from(newsItemsTable).where(queuedFilter);
  const queued = row?.n ?? 0;
  if (queued === 0) return;

  // Gatilho contínuo: fila acima do limiar
  let active = cfg.queueThreshold > 0 && queued >= cfg.queueThreshold;
  let fromBurst = false;

  // Gatilho agendado: rajadas N vezes por dia
  if (!active && cfg.timesPerDay > 0) {
    if (_burstRemaining > 0) {
      active = true; fromBurst = true;
    } else if (Date.now() - _lastBurstAt >= burstIntervalMs(cfg)) {
      _lastBurstAt = Date.now();
      _burstRemaining = cfg.batchSize;
      active = true; fromBurst = true;
      logEvent({
        module: "rewriter",
        message: `Rajada de reforço iniciada: IAs de apoio (${cfg.provider === "both" ? "Gemini+Perplexity" : cfg.provider}) vão processar até ${cfg.batchSize} artigo(s) da fila.`,
      });
    }
  }
  if (!active) return;

  let free = Math.min(HELPER_CONCURRENCY - _activeHelpers, queued);
  if (cfg.maxPerDay > 0) free = Math.min(free, cfg.maxPerDay - _boostUsedToday);
  if (fromBurst) free = Math.min(free, _burstRemaining);
  if (free <= 0) return;

  const batch = await db
    .select()
    .from(newsItemsTable)
    .where(queuedFilter)
    .orderBy(asc(newsItemsTable.createdAt))
    .limit(free);
  if (batch.length === 0) return;
  if (fromBurst) _burstRemaining -= batch.length;

  logger.info(
    { batchSize: batch.length, fromBurst, usedToday: _boostUsedToday, queued },
    "Reforço: despachando itens para as IAs de apoio",
  );
  for (const item of batch) {
    void processItem(item, pickHelperProvider(cfg, s));
  }
}

async function tick(): Promise<void> {
  if (_running) return;
  _running = true;
  try {
    const s = getSettings();
    if (!s.rewriteEnabled) return;

    const slots = s.aiProvider === "gemini"
      ? Math.min(getGeminiPool().availableKeyCount(), MAX_CONCURRENCY)
      : 1;

    let mainIds: string[] = [];
    let mainRun: Promise<unknown> = Promise.resolve();
    if (slots > 0) {
      const items = await db
        .select()
        .from(newsItemsTable)
        .where(eq(newsItemsTable.status, "queued"))
        .orderBy(asc(newsItemsTable.createdAt))
        .limit(slots);
      mainIds = items.map((i) => i.id);
      mainRun = Promise.allSettled(items.map((item) => processItem(item)));
    }

    // Lane de reforço roda em paralelo com a principal
    await dispatchBoost(s, mainIds);
    await mainRun;
  } catch (err) {
    logger.error({ err }, "Erro no tick do rewriter");
  } finally {
    _running = false;
  }
}

export function startRewriteWorker(): void {
  if (_timer) return;
  _timer = setInterval(() => { void tick(); }, POLL_MS);
  _timer.unref();
  logger.info("Worker de reescrita central iniciado (poll 10s)");
}
