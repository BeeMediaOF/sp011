/**
 * Background scheduler — checks RSS sources every 20 minutes
 * and auto-processes those that are due based on their scheduleHours setting.
 */

import { store } from "./store.js";
import { processDueSource } from "./rssProcessor.js";
import { logger } from "./logger.js";

const CHECK_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes

function isDue(src: { scheduleHours: number; lastFetchedAt?: string }): boolean {
  if (!src.scheduleHours) return false;
  if (!src.lastFetchedAt) return true;
  const elapsed = Date.now() - new Date(src.lastFetchedAt).getTime();
  return elapsed >= src.scheduleHours * 3600 * 1000;
}

async function runCheck(): Promise<void> {
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

export function startScheduler(): void {
  // Initial run after 1 minute (let the server warm up)
  setTimeout(() => {
    void runCheck();
    setInterval(() => { void runCheck(); }, CHECK_INTERVAL_MS);
  }, 60_000);
  logger.info("RSS scheduler started (checking every 20 min)");
}
