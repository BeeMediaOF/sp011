/**
 * Worker de reescrita central — porte do contrato do `rewriteQueue.ts` do blog:
 * poll 10s, concorrência = 1 item por chave Gemini disponível (teto 6, Ollama=1),
 * MAX_ATTEMPTS 3, quota não consome tentativa, recovery via extractFromRawAI e
 * quality gate. Diferenças: fila é a tabela `news_items` (status queued) e o
 * consumo de tokens é gravado em `ai_usage_events` (o blog nunca mediu).
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
  resolvePrompt,
  rewriteNews,
  type RewriteEngineConfig,
} from "@workspace/news-engine";
import { and, asc, eq } from "drizzle-orm";
import { getPrompts, getSettings, type HubSettings } from "../lib/store.js";
import { getGeminiPool } from "../lib/aiPool.js";
import { logger } from "../lib/logger.js";
import { logEvent } from "../lib/eventLog.js";

const POLL_MS = 10_000;
const MAX_ATTEMPTS = 3;
const MAX_CONCURRENCY = 6;

let _timer: NodeJS.Timeout | null = null;
let _running = false;

/** Tentativas por notícia (em memória, como a fila do blog). */
const _attempts = new Map<string, number>();

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

async function processItem(item: NewsItemRow): Promise<void> {
  // Claim condicional: só processa se ainda estiver "queued"
  const claimed = await db
    .update(newsItemsTable)
    .set({ status: "rewriting", updatedAt: new Date() })
    .where(and(eq(newsItemsTable.id, item.id), eq(newsItemsTable.status, "queued")))
    .returning({ id: newsItemsTable.id });
  if (claimed.length === 0) return;

  const s = getSettings();

  try {
    // Prompt: fonte > categoria > global > default (mesma hierarquia do blog)
    const srcRows = await db
      .select({ customPrompt: centralSourcesTable.customPrompt, giveCredit: centralSourcesTable.giveCredit })
      .from(centralSourcesTable)
      .where(eq(centralSourcesTable.id, item.sourceId))
      .limit(1);
    const src = srcRows[0];
    const template = resolvePrompt(
      { customPrompt: src?.customPrompt ?? undefined, category: item.category },
      getPrompts(),
    );

    const out = await rewriteNews(
      {
        title: item.title,
        text: item.contentRaw ?? item.description ?? "",
        sourceName: item.sourceName,
        giveCredit: src?.giveCredit ?? false,
        promptTemplate: template,
      },
      engineConfig(s),
    );

    // Recovery + quality gate (mesmo desenho do blog)
    const extracted = extractFromRawAI(out.content);
    if (!extracted) {
      // Conteúdo irrecuperável: falha imediata, sem novas tentativas
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

    const rewriteId = randomUUID();
    await db.insert(rewritesTable).values({
      id: rewriteId,
      newsItemId: item.id,
      blogId: null, // reescrita compartilhada (MVP)
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
      message: `Reescrita concluída: ${out.title || item.title}`,
      meta: out.usage ? { totalTokens: out.usage.totalTokens, provider: out.usage.provider } : undefined,
    });
  } catch (err) {
    const msg = String(err);
    const isQuota = msg.includes("QUOTA_COOLDOWN") || msg.includes("QUOTA_EXHAUSTED");

    if (isQuota) {
      // Quota é temporária: volta à fila SEM consumir tentativa
      await db
        .update(newsItemsTable)
        .set({ status: "queued", updatedAt: new Date() })
        .where(eq(newsItemsTable.id, item.id));
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
      await db
        .update(newsItemsTable)
        .set({ status: "queued", updatedAt: new Date() })
        .where(eq(newsItemsTable.id, item.id));
      logger.warn({ err, newsItemId: item.id, attempts }, "Reescrita falhou — retentará");
    }
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
    if (slots <= 0) return;

    const items = await db
      .select()
      .from(newsItemsTable)
      .where(eq(newsItemsTable.status, "queued"))
      .orderBy(asc(newsItemsTable.createdAt))
      .limit(slots);
    if (items.length === 0) return;

    await Promise.allSettled(items.map((item) => processItem(item)));
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
