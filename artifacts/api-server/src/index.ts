import app from "./app";
import { logger } from "./lib/logger";
import { seedAdminUser } from "./lib/seed.js";
import { initStore, seedDefaultRssSources } from "./lib/store.js";
import { articleService } from "./lib/articleService.js";
import { startSocialCron } from "./lib/social/queueProcessor.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");

  // Initialize store from PostgreSQL (migrates store.json data if needed)
  await initStore();
  await seedDefaultRssSources();
  await seedAdminUser();

  // Migrate articles from store.json to DB (runs only when DB table is empty)
  try {
    const migrated = await articleService.migrateFromStore([]);
    if (migrated > 0) {
      logger.info({ migrated }, "Migrated articles from store.json to PostgreSQL");
    }
  } catch (migrateErr) {
    logger.warn({ err: migrateErr }, "Article migration skipped or failed");
  }

  // Start social media publication queue cron (every 5 min)
  startSocialCron();
});
