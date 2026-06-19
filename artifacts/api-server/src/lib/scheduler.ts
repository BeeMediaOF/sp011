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

export function startScheduler(): void {
  // Start the async rewrite queue worker (processes 1 article/5s)
  startRewriteWorker();

  // Initial run after 1 minute (let the server warm up)
  setTimeout(() => {
    void runCheck();
    setInterval(() => { void runCheck(); }, CHECK_INTERVAL_MS);
  }, 60_000);
  logger.info("RSS scheduler started (checking every 20 min)");
}
