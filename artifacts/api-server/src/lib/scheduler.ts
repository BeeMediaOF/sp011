/**
 * Background scheduler — checks RSS sources and Perplexity topics
 * periodically and auto-processes those that are due.
 */

import { store } from "./store.js";
import { articleService } from "./articleService.js";
import { processDueSource, addLog } from "./rssProcessor.js";
import { searchNews } from "./perplexitySearch.js";
import { rewriteWithAI } from "./rssProcessor.js";
import { logger } from "./logger.js";
import { startRewriteWorker } from "./rewriteQueue.js";

/** O tick roda a cada minuto e decide se um ciclo de coleta é devido (intervalo configurável). */
const TICK_MS = 60 * 1000;

// ─── Configuração global da coleta (Configurações da Coleta no painel) ────────

export interface CollectionConfig {
  /** Interruptor geral da coleta automática. */
  enabled: boolean;
  /** Intervalo entre ciclos de coleta, em minutos. */
  intervalMinutes: number;
  /** Teto de artigos importados por ciclo (0 = sem teto). */
  maxPerCycle: number;
  /** Teto diário de artigos importados (0 = sem teto). */
  maxPerDay: number;
  /** Janela de funcionamento (hora de Brasília, inclusive). início > fim = janela noturna. */
  startHour: number;
  endHour: number;
  /** Dias da semana permitidos (0=domingo … 6=sábado). */
  days: number[];
  /** Backpressure: adia fontes com reescrita quando a fila atinge este tamanho (0 = off). */
  maxPending: number;
}

function clampInt(v: unknown, min: number, max: number, dflt: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(n, max));
}

export function getCollectionConfig(): CollectionConfig {
  const s = store.getSettings();
  const days = (s.collectionDays ?? [0, 1, 2, 3, 4, 5, 6])
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  return {
    enabled:         s.collectionEnabled ?? true,
    intervalMinutes: clampInt(s.collectionIntervalMinutes, 5, 24 * 60, 20),
    maxPerCycle:     clampInt(s.collectionMaxPerCycle, 0, 500, 0),
    maxPerDay:       clampInt(s.collectionMaxPerDay, 0, 5000, 0),
    startHour:       clampInt(s.collectionStartHour, 0, 23, 0),
    endHour:         clampInt(s.collectionEndHour, 0, 23, 23),
    days:            days.length > 0 ? days : [0, 1, 2, 3, 4, 5, 6],
    maxPending:      clampInt(s.rssMaxPendingRewrites, 0, 1000, DEFAULT_MAX_PENDING_REWRITES),
  };
}

/** Hora e dia da semana atuais no fuso de Brasília (o servidor pode rodar em UTC). */
function nowInBrasilia(): { hour: number; day: number } {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return { hour: d.getHours(), day: d.getDay() };
}

export function isInCollectionWindow(cfg: CollectionConfig = getCollectionConfig()): boolean {
  const { hour, day } = nowInBrasilia();
  if (!cfg.days.includes(day)) return false;
  const { startHour: s, endHour: e } = cfg;
  if (s === e) return true; // início = fim → janela cobre o dia inteiro
  // Janela normal (ex.: 6→22 = 06:00–22:59) ou noturna (ex.: 22→5 = 22:00–05:59)
  return s < e ? hour >= s && hour <= e : hour >= s || hour <= e;
}

// ── Estado do ciclo (exposto ao painel via getCollectionStatus) ──
let _lastCycleAt = 0;
let _lastCycleCollected = 0;

export function getCollectionStatus() {
  const cfg = getCollectionConfig();
  const nextDue = _lastCycleAt + cfg.intervalMinutes * 60_000;
  return {
    enabled:            cfg.enabled,
    inWindow:           isInCollectionWindow(cfg),
    lastCycleAt:        _lastCycleAt ? new Date(_lastCycleAt).toISOString() : null,
    nextCycleAt:        cfg.enabled ? new Date(Math.max(Date.now(), nextDue)).toISOString() : null,
    lastCycleCollected: _lastCycleCollected,
  };
}

/** Orçamento compartilhado do ciclo — decrementado a cada artigo importado. */
interface CycleBudget { remaining: number; collected: number }

async function computeCycleBudget(cfg: CollectionConfig): Promise<CycleBudget> {
  let remaining = Number.POSITIVE_INFINITY;
  if (cfg.maxPerCycle > 0) remaining = cfg.maxPerCycle;
  if (cfg.maxPerDay > 0) {
    try {
      const today = await articleService.countAutomatedToday();
      remaining = Math.min(remaining, Math.max(0, cfg.maxPerDay - today));
    } catch (err) {
      logger.warn({ err }, "Scheduler: failed to count today's automated articles — daily cap not applied this cycle");
    }
  }
  return { remaining, collected: 0 };
}

const TAG_MAP: Record<string, string> = {
  politica: "POLÍTICA", cidade: "CIDADE", seguranca: "SEGURANÇA",
  transporte: "TRANSPORTE", saude: "SAÚDE", educacao: "EDUCAÇÃO",
  cultura: "CULTURA", esportes: "ESPORTES", economia: "ECONOMIA",
  tecnologia: "TECNOLOGIA", brasil: "BRASIL", mundo: "MUNDO", geral: "GERAL",
};

function isDue(src: { scheduleHours: number; lastRunAt?: string; lastFetchedAt?: string }): boolean {
  if (!src.scheduleHours) return false;
  const last = src.lastRunAt ?? (src as { lastFetchedAt?: string }).lastFetchedAt;
  if (!last) return true;
  const elapsed = Date.now() - new Date(last).getTime();
  return elapsed >= src.scheduleHours * 3600 * 1000;
}

/** Padrão do backpressure: adia a coleta quando há ≥ N rascunhos aguardando reescrita. */
export const DEFAULT_MAX_PENDING_REWRITES = 30;

async function runRssCheck(cfg: CollectionConfig, budget: CycleBudget): Promise<void> {
  const sources = store.getRssSources().filter(
    (s) => s.active && s.scheduleHours > 0 && s.autoMode !== "none" && isDue(s)
  );
  if (!sources.length) return;

  logger.info({ count: sources.length }, "RSS scheduler: processing due sources");

  // Backpressure: a coleta é muito mais rápida que a reescrita (sobretudo no Ollama
  // em CPU). Sem esta trava a fila de rascunhos cresce sem limite. Fontes cujo
  // autoMode exige reescrita são adiadas enquanto o backlog estiver no limite;
  // como lastFetchedAt não é atualizado, elas voltam a ser "due" no próximo ciclo.
  let deferred = 0;
  let backlog = 0;
  let budgetStopped = false;

  for (const src of sources) {
    if (budget.remaining <= 0) { budgetStopped = true; break; }

    const needsRewrite = src.autoMode === "rewrite_draft" || src.autoMode === "rewrite_publish";
    if (needsRewrite && cfg.maxPending > 0) {
      try {
        backlog = await articleService.countPendingRewrites();
      } catch (err) {
        logger.warn({ err }, "RSS scheduler: failed to count pending rewrites — skipping backpressure check");
        backlog = 0;
      }
      if (backlog >= cfg.maxPending) {
        deferred++;
        continue;
      }
    }
    try {
      const cap = Number.isFinite(budget.remaining) ? budget.remaining : undefined;
      const n = await processDueSource(src, cap);
      budget.remaining -= n;
      budget.collected += n;
      logger.info({ sourceId: src.id, sourceName: src.name, articles: n }, "RSS scheduler: source processed");
    } catch (err) {
      logger.warn({ err, sourceId: src.id }, "RSS scheduler: error processing source");
    }
  }

  if (deferred > 0) {
    logger.info({ deferred, backlog, maxPending: cfg.maxPending }, "RSS scheduler: sources deferred — rewrite backlog full (backpressure)");
    addLog({
      type: "skip",
      sourceName: "Sistema",
      articleTitle: "Coleta adiada (fila cheia)",
      message: `Fila de reescrita com ${backlog} artigo(s) (limite: ${cfg.maxPending}). ${deferred} fonte(s) adiada(s) até a fila esvaziar.`,
    });
  }

  if (budgetStopped) {
    logger.info({ collected: budget.collected }, "RSS scheduler: cycle/day budget reached — remaining sources deferred");
    addLog({
      type: "skip",
      sourceName: "Sistema",
      articleTitle: "Coleta interrompida (teto atingido)",
      message: `Teto de artigos por ciclo/dia atingido (${budget.collected} importado(s) neste ciclo). Fontes restantes ficam para o próximo ciclo.`,
    });
  }
}

async function runPerplexityCheck(budget: CycleBudget): Promise<void> {
  const topics = store.getPerplexityTopics().filter(
    (t) => t.active && t.scheduleHours > 0 && t.autoMode !== "none" && isDue({ scheduleHours: t.scheduleHours, lastRunAt: t.lastRunAt })
  );
  if (!topics.length) return;

  logger.info({ count: topics.length }, "Perplexity scheduler: processing due topics");

  for (const topic of topics) {
    // Teto por ciclo/dia vale para toda a coleta automática, Perplexity incluído.
    // Tópicos não iniciados mantêm o lastRunAt antigo e voltam no próximo ciclo.
    if (budget.remaining <= 0) break;
    try {
      store.updatePerplexityTopic(topic.id, { lastRunAt: new Date().toISOString() });

      const result = await searchNews(topic.query, topic.maxResults);
      let published = 0;

      for (const article of result.articles) {
        if (budget.remaining <= 0) break;
        try {
          // Skip duplicates
          if (await articleService.isDuplicateArticle(article.title, article.sourceUrl)) continue;

          let title    = article.title;
          let subtitle = article.summary;
          let content  = article.fullText;
          let keywords = "";
          let slug     = "";

          // Rewrite if autoMode requires publication
          if (topic.autoMode !== "none") {
            const rewritten = await rewriteWithAI(
              article.title, article.fullText || article.summary, article.sourceName, false
            );
            title    = rewritten.title    || title;
            subtitle = rewritten.subtitle || subtitle;
            content  = rewritten.content  || content;
            keywords = rewritten.keywords;
            slug     = rewritten.slug;
          }

          const cat = (topic.category ?? "geral").toLowerCase();
          await articleService.createArticle({
            title,
            subtitle,
            content,
            category:      cat,
            tag:           TAG_MAP[cat] ?? "GERAL",
            imageUrl:      article.imageUrl,
            author:        "Redação",
            publishedAt:   new Date().toISOString(),
            status:        topic.autoMode === "published" ? "published" : "draft",
            origin:        "perplexity",
            rssSourceName: article.sourceName,
            rssSourceUrl:  article.sourceUrl,
            aiRewritten:   true,
            keywords:      keywords || undefined,
            slug:          slug     || undefined,
          });
          published++;
          budget.remaining -= 1;
          budget.collected += 1;
        } catch (artErr) {
          logger.warn({ err: artErr, topicId: topic.id }, "Perplexity scheduler: error processing article");
        }
      }

      logger.info({ topicId: topic.id, topicName: topic.name, published }, "Perplexity scheduler: topic processed");
    } catch (err) {
      logger.warn({ err, topicId: topic.id }, "Perplexity scheduler: error processing topic");
    }
  }
}

/** Um ciclo completo de coleta: RSS + Perplexity, dividindo o mesmo orçamento. */
async function runCycle(): Promise<void> {
  const cfg = getCollectionConfig();
  const budget = await computeCycleBudget(cfg);
  if (budget.remaining <= 0) {
    logger.info("Scheduler: daily collection cap already reached — cycle skipped");
    return;
  }
  await runRssCheck(cfg, budget);
  await runPerplexityCheck(budget);
  _lastCycleCollected = budget.collected;
}

/**
 * Tick por minuto: dispara um ciclo quando (a) o intervalo configurado passou,
 * (b) a coleta está ligada e (c) estamos dentro da janela de horário/dias.
 * Fora da janela o ciclo NÃO conta como executado — assim a coleta dispara
 * no primeiro minuto em que a janela abrir.
 */
async function tick(): Promise<void> {
  const cfg = getCollectionConfig();
  if (!cfg.enabled) return;
  if (Date.now() - _lastCycleAt < cfg.intervalMinutes * 60_000) return;
  if (!isInCollectionWindow(cfg)) return;
  _lastCycleAt = Date.now();
  await runCycle();
}

// ─── Log retention (daily cleanup) ───────────────────────────────────────────

async function runLogRetention(): Promise<void> {
  try {
    const { db, auditLogsTable, securityLogsTable, rssEventLogsTable } = await import("@workspace/db");
    const { lt } = await import("drizzle-orm");

    const auditCutoff    = new Date(Date.now() - 90  * 24 * 3600 * 1000); // 90 days
    const securityCutoff = new Date(Date.now() - 180 * 24 * 3600 * 1000); // 180 days
    const rssCutoff      = new Date(Date.now() - 30  * 24 * 3600 * 1000); // 30 days

    const [a, s, r] = await Promise.all([
      db.delete(auditLogsTable).where(lt(auditLogsTable.createdAt, auditCutoff)),
      db.delete(securityLogsTable).where(lt(securityLogsTable.createdAt, securityCutoff)),
      db.delete(rssEventLogsTable).where(lt(rssEventLogsTable.ts, rssCutoff)),
    ]);

    logger.info({ auditDeleted: a.rowCount, securityDeleted: s.rowCount, rssDeleted: r.rowCount }, "Log retention: cleanup complete");
  } catch (err) {
    logger.warn({ err }, "Log retention: cleanup failed");
  }
}

// ─── Article retention (daily cleanup) ───────────────────────────────────────
// Exclui automaticamente notícias antigas para manter o banco enxuto. Só roda
// quando o admin habilita em Configurações → Exclusão de artigos.

async function runArticleRetention(): Promise<void> {
  try {
    const s = store.getSettings();
    if (!s.articleRetentionEnabled) return;

    const opts = {
      days:  s.articleRetentionDays  ?? 180,
      scope: s.articleRetentionScope ?? "all",
      protectCategories: s.articleRetentionProtectCategories ?? [],
      onlyAutomated:     s.articleRetentionOnlyAutomated ?? false,
      minViews:          s.articleRetentionMinViews ?? 0,
      keepRecent:        s.articleRetentionKeepRecent ?? 0,
      maxPerRun:         s.articleRetentionMaxPerRun ?? 0,
    } as const;
    const deleted = await articleService.purgeOlderThan(opts);

    store.updateSettings({
      articleRetentionLastRunAt: new Date().toISOString(),
      articleRetentionLastCount: deleted,
    });
    logger.info({ deleted, days: opts.days, scope: opts.scope }, "Article retention: cleanup complete");
  } catch (err) {
    logger.warn({ err }, "Article retention: cleanup failed");
  }
}

const LOG_RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function startScheduler(): void {
  // Start the async rewrite queue worker (processes 1 article/5s)
  startRewriteWorker();

  // Primeiro tick após 1 minuto (deixa o servidor aquecer); depois avalia a cada
  // minuto se um ciclo é devido — o intervalo real vem das Configurações da Coleta.
  setTimeout(() => {
    void tick();
    setInterval(() => { void tick(); }, TICK_MS);
  }, 60_000);

  // Log retention: run once per day (first run after 2 minutes)
  setTimeout(() => {
    void runLogRetention();
    setInterval(() => { void runLogRetention(); }, LOG_RETENTION_INTERVAL_MS);
  }, 2 * 60_000);

  // Article retention: run once per day (first run after 3 minutes)
  setTimeout(() => {
    void runArticleRetention();
    setInterval(() => { void runArticleRetention(); }, LOG_RETENTION_INTERVAL_MS);
  }, 3 * 60_000);

  logger.info("RSS scheduler started (tick every 60s; cycle interval from collection settings)");
}
