import app from "./app";
import { logger } from "./lib/logger";
import { seedAdminUser } from "./lib/seed.js";
import { initStore, seedDefaultRssSources } from "./lib/store.js";
import { articleService } from "./lib/articleService.js";
import { startSocialCron } from "./lib/social/queueProcessor.js";
import { db, articlesTable } from "@workspace/db";
import { desc, isNotNull } from "drizzle-orm";
import { warmImageCache } from "./routes/image.js";

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

  /*
   * Pré-aquece o cache de imagens dos artigos mais recentes em background.
   * Executa após o servidor já estar aceitando requisições, sem bloquear o startup.
   * Garante que o primeiro usuário veja as fotos dos artigos recentes em < 10 ms
   * (cache hit) em vez de esperar 1-5 s pelo fetch+sharp cold-start.
   */
  setImmediate(async () => {
    try {
      const rows = await db
        .select({ imageUrl: articlesTable.imageUrl })
        .from(articlesTable)
        .where(isNotNull(articlesTable.imageUrl))
        .orderBy(desc(articlesTable.publishedAt))
        .limit(40);

      const urls = rows
        .map((r) => r.imageUrl)
        .filter((u): u is string => Boolean(u));

      const warmed = await warmImageCache(urls, [480, 768]);
      logger.info({ total: urls.length, warmed }, "Image cache warmed on startup");
    } catch (warmErr) {
      logger.warn({ err: warmErr }, "Image cache warming failed (non-fatal)");
    }
  });
});
