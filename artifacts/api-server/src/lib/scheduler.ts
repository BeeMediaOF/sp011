/**
 * Background scheduler — checks RSS sources and Perplexity topics
 * periodically and auto-processes those that are due.
 */

import { store } from "./store.js";
import { articleService } from "./articleService.js";
import { processDueSource } from "./rssProcessor.js";
import { searchNews } from "./perplexitySearch.js";
import { rewriteWithAI } from "./rssProcessor.js";
import { logger } from "./logger.js";
import { startRewriteWorker } from "./rewriteQueue.js";

const CHECK_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes

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

async function runRssCheck(): Promise<void> {
  const sources = store.getRssSources().filter(
    (s) => s.active && s.scheduleHours > 0 && s.autoMode !== "none" && isDue(s)
  );
  if (!sources.length) return;

  logger.info({ count: sources.length }, "RSS scheduler: processing due sources");

  for (const src of sources) {
    try {
      const n = await processDueSource(src);
      logger.info({ sourceId: src.id, sourceName: src.name, articles: n }, "RSS scheduler: source processed");
    } catch (err) {
      logger.warn({ err, sourceId: src.id }, "RSS scheduler: error processing source");
    }
  }
}

async function runPerplexityCheck(): Promise<void> {
  const topics = store.getPerplexityTopics().filter(
    (t) => t.active && t.scheduleHours > 0 && t.autoMode !== "none" && isDue({ scheduleHours: t.scheduleHours, lastRunAt: t.lastRunAt })
  );
  if (!topics.length) return;

  logger.info({ count: topics.length }, "Perplexity scheduler: processing due topics");

  for (const topic of topics) {
    try {
      store.updatePerplexityTopic(topic.id, { lastRunAt: new Date().toISOString() });

      const result = await searchNews(topic.query, topic.maxResults);
      let published = 0;

      for (const article of result.articles) {
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

async function runCheck(): Promise<void> {
  await runRssCheck();
  await runPerplexityCheck();
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

  // Initial run after 1 minute (let the server warm up)
  setTimeout(() => {
    void runCheck();
    setInterval(() => { void runCheck(); }, CHECK_INTERVAL_MS);
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

  logger.info("RSS scheduler started (checking every 20 min)");
}
