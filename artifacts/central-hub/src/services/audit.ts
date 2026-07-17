/**
 * Worker da IA Auditora (PRD 02, F5) — poll 20s, lote 2. Pega reescritas
 * compartilhadas com `audit_status = 'pending'` (marcadas pelo rewriter nos
 * casos suspeitos), roda a auditoria comparativa fonte × reescrita e resolve:
 * - publishable e sem invenção → `passed` (segue o fluxo normal);
 * - invenção confirmada        → `rejected` + news_item `failed`
 *   (fail_reason `audit_rejected`) — nunca publica;
 * - qualquer outro problema    → `flagged` → o distributor cria as entregas
 *   como `awaiting_approval` (página Revisão), independente do blog.
 *
 * Provider indisponível/quota NUNCA decide (adia 5 min, mesmo desenho do
 * localizer); resposta imprestável 3x → `flagged` (revisão humana decide).
 * Com `auditEnabled` desligado o worker não roda e o distributor ignora
 * `pending` — nada fica preso.
 */
import {
  db,
  newsItemsTable,
  rewritesTable,
  aiUsageEventsTable,
  type RewriteRow,
} from "@workspace/central-db";
import {
  auditRewrite,
  plainTextOf,
  type RewriteEngineConfig,
} from "@workspace/news-engine";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getSettings, type HubSettings } from "../lib/store.js";
import { getGeminiPool } from "../lib/aiPool.js";
import { logAiCallError } from "../lib/aiUsage.js";
import { logger } from "../lib/logger.js";
import { logEvent } from "../lib/eventLog.js";

const POLL_MS = 20_000;
const BATCH = 2;
const MAX_ATTEMPTS = 3;
const DEFER_MS = 5 * 60_000;

let _timer: NodeJS.Timeout | null = null;
let _running = false;
const _attempts = new Map<string, number>();
const _deferUntil = new Map<string, number>();

function auditCfg(s: HubSettings): RewriteEngineConfig {
  const provider = s.auditProvider ?? "gemini";
  if (provider === "ollama") {
    return {
      provider, model: s.auditModel,
      ollamaBaseUrl: s.ollamaBaseUrl || process.env["OLLAMA_BASE_URL"] || "http://ollama:11434",
      geminiPool: getGeminiPool(),
      fallbackToGemini: false,
      logger,
    };
  }
  if (provider === "openai") {
    return { provider, model: s.auditModel, openaiApiKey: s.openaiApiKey, openaiBaseUrl: s.openaiBaseUrl, logger };
  }
  return { provider: "gemini", model: s.auditModel, geminiPool: getGeminiPool(), logger };
}

function isProviderError(msg: string): boolean {
  return msg.includes("QUOTA_COOLDOWN") || msg.includes("QUOTA_EXHAUSTED")
    || msg.includes("não configurada") || /\b(401|403|429|5\d\d)\b/.test(msg)
    || /timeout|timed out|ECONNREFUSED|fetch failed/i.test(msg);
}

async function setAudit(rewrite: RewriteRow, status: string, notes?: string): Promise<void> {
  await db
    .update(rewritesTable)
    .set({ auditStatus: status, auditNotes: notes?.slice(0, 500) ?? null })
    .where(eq(rewritesTable.id, rewrite.id));
  _attempts.delete(rewrite.id);
  _deferUntil.delete(rewrite.id);
}

async function processRewrite(rewrite: RewriteRow, s: HubSettings): Promise<void> {
  const deferred = _deferUntil.get(rewrite.id);
  if (deferred && Date.now() < deferred) return;

  const [news] = await db
    .select()
    .from(newsItemsTable)
    .where(eq(newsItemsTable.id, rewrite.newsItemId))
    .limit(1);
  if (!news) {
    await setAudit(rewrite, "flagged", "notícia de origem não encontrada");
    return;
  }

  const t0 = Date.now();
  try {
    const out = await auditRewrite(
      {
        sourceTitle: news.title,
        sourceText: `${news.description ?? ""}\n${plainTextOf(news.contentRaw ?? "")}`,
        title: rewrite.title ?? "",
        subtitle: rewrite.subtitle ?? undefined,
        contentText: plainTextOf(rewrite.contentHtml ?? ""),
      },
      auditCfg(s),
    );

    if (out.usage) {
      await db.insert(aiUsageEventsTable).values({
        newsItemId: news.id,
        rewriteId: rewrite.id,
        provider: out.usage.provider,
        model: out.usage.model ?? null,
        keyHint: out.usage.keyHint ?? null,
        inputTokens: out.usage.inputTokens ?? null,
        outputTokens: out.usage.outputTokens ?? null,
        totalTokens: out.usage.totalTokens ?? null,
        purpose: "audit",
        durationMs: Date.now() - t0,
      });
    }

    if (out.invented) {
      await setAudit(rewrite, "rejected", out.notes ?? "auditoria: informação inventada");
      await db
        .update(newsItemsTable)
        .set({ status: "failed", failReason: "audit_rejected", updatedAt: new Date() })
        .where(eq(newsItemsTable.id, news.id));
      logEvent({
        module: "rewriter", level: "warn", refType: "news_item", refId: news.id,
        message: `IA Auditora REPROVOU (invenção): ${news.title}`,
        meta: { notes: out.notes },
      });
      return;
    }

    if (out.publishable && out.titleOk && !out.contradiction && !out.exaggeration) {
      await setAudit(rewrite, "passed", out.notes);
      return;
    }

    const problemas = [
      !out.titleOk ? "título não representa o texto" : null,
      out.contradiction ? "contradição com a fonte" : null,
      out.exaggeration ? "exagero/distorção" : null,
      !out.publishable ? "não publicável sem revisão" : null,
    ].filter(Boolean).join("; ");
    await setAudit(rewrite, "flagged", out.notes ? `${problemas} — ${out.notes}` : problemas);
    logEvent({
      module: "rewriter", level: "warn", refType: "news_item", refId: news.id,
      message: `IA Auditora sinalizou p/ revisão humana (${problemas}): ${news.title}`,
      meta: { notes: out.notes },
    });
  } catch (err) {
    const msg = String(err);
    void logAiCallError({
      newsItemId: news.id, rewriteId: rewrite.id,
      provider: s.auditProvider ?? "gemini", purpose: "audit",
      errorMessage: msg, durationMs: Date.now() - t0,
    });

    // Falha de provider nunca aprova nem reprova: adia e tenta de novo
    if (isProviderError(msg)) {
      _deferUntil.set(rewrite.id, Date.now() + DEFER_MS);
      logger.warn({ rewriteId: rewrite.id, err: msg }, "Auditoria: provider indisponível — adiada 5 min");
      return;
    }

    const attempts = (_attempts.get(rewrite.id) ?? 0) + 1;
    _attempts.set(rewrite.id, attempts);
    if (attempts >= MAX_ATTEMPTS) {
      // Inconclusiva: melhor um humano olhar do que travar ou aprovar às cegas
      await setAudit(rewrite, "flagged", `auditoria inconclusiva após ${MAX_ATTEMPTS} tentativas: ${msg.slice(0, 200)}`);
    } else {
      logger.warn({ rewriteId: rewrite.id, attempts, err: msg }, "Auditoria falhou — retentará");
    }
  }
}

async function tick(): Promise<void> {
  if (_running) return;
  _running = true;
  try {
    const s = getSettings();
    if (!(s.auditEnabled ?? false)) return;
    const pending = await db
      .select()
      .from(rewritesTable)
      .where(and(
        eq(rewritesTable.auditStatus, "pending"),
        isNull(rewritesTable.blogId),
        eq(rewritesTable.status, "ok"),
      ))
      .orderBy(asc(rewritesTable.createdAt))
      .limit(BATCH);
    for (const rewrite of pending) {
      await processRewrite(rewrite, s);
    }
  } catch (err) {
    logger.error({ err }, "Erro no ciclo da IA Auditora");
  } finally {
    _running = false;
  }
}

export function startAuditor(): void {
  if (_timer) return;
  _timer = setInterval(() => { void tick(); }, POLL_MS);
  _timer.unref();
  logger.info("IA Auditora iniciada (poll 20s; só roda com auditEnabled)");
}
