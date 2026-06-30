import app from "./app";
import { logger } from "./lib/logger";
import { seedAdminUser } from "./lib/seed.js";
import { initStore, seedDefaultRssSources, startSettingsSync } from "./lib/store.js";
import { articleService } from "./lib/articleService.js";
import { startSocialCron } from "./lib/social/queueProcessor.js";
import { migrateJsonContent } from "./lib/migrateJsonContent.js";
import { ensureSchema } from "./lib/ensureSchema.js";
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

  // Garante colunas novas/opcionais ANTES de qualquer SELECT em articles
  // (o schema do Drizzle já referencia social_title).
  await ensureSchema();

  // Initialize store from PostgreSQL (migrates store.json data if needed)
  await initStore();
  // Re-read editable settings from DB periodically so multiple processes
  // (Replit + VPS sharing one database) stay in sync without a restart.
  startSettingsSync();
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

  // Repair any articles whose content is a raw JSON blob or code-fenced JSON.
  // Idempotent: reads all articles, detects zero candidates on a clean DB,
  // and returns immediately without any writes. Safe to run on every boot.
  try {
    await migrateJsonContent();
  } catch (jsonMigrateErr) {
    logger.warn({ err: jsonMigrateErr }, "JSON-content migration failed (non-fatal)");
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

      // Cards (todos): larguras de thumbnail. Hero/LCP (apenas os mais recentes —
      // o destaque é sempre um dos primeiros): larguras grandes (1024/1280), para
      // que a imagem do LCP já saia pré-codificada do cache e não pague fetch+encode
      // dentro do caminho crítico do Largest Contentful Paint.
      const warmedCards = await warmImageCache(urls, [480, 768]);
      const warmedHero = await warmImageCache(urls.slice(0, 8), [1024, 1280]);
      logger.info(
        { total: urls.length, warmedCards, warmedHero },
        "Image cache warmed on startup",
      );
    } catch (warmErr) {
      logger.warn({ err: warmErr }, "Image cache warming failed (non-fatal)");
    }
  });
});
