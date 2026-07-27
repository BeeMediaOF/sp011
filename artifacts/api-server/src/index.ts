import app from "./app";
import { logger } from "./lib/logger";
import { seedAdminUser } from "./lib/seed.js";
import { initStore, isStoreHydrated, seedDefaultRssSources, startSettingsSync } from "./lib/store.js";
import { articleService } from "./lib/articleService.js";
import { startSocialCron } from "./lib/social/queueProcessor.js";
import { startSocialAutomation } from "./lib/social/autoScheduler.js";
import { startScheduler } from "./lib/scheduler.js";
import { startSanityMonitor } from "./lib/sanityMonitor.js";
import { migrateJsonContent } from "./lib/migrateJsonContent.js";
import { migrateTwoFactorSecrets } from "./lib/migrateTwoFactorSecrets.js";
import { ensureSchema } from "./lib/ensureSchema.js";
import { assertEncryptionConfigured } from "./lib/crypto.js";
import { db, pool, articlesTable, initDb, isDbInitialized } from "@workspace/db";
import { desc, isNotNull } from "drizzle-orm";
import { warmImageCache } from "./routes/image.js";
import { logUploadsStorage } from "./routes/uploads.js";
import { flushAnalyticsBuffer } from "./routes/analytics.js";
import { resolveDbBoot, describeDbError, dbConfigPath } from "./lib/dbConfig.js";
import { ensureSetupToken, isDbReady, setSetupMode } from "./lib/setupState.js";

// ── Shutdown gracioso ─────────────────────────────────────────────────────────
// O buffer de analytics vive em memória entre flushes; sem drenar aqui, cada
// deploy/restart descartava até 30s de eventos coletados.
async function shutdown(signal: string): Promise<void> {
  try {
    await flushAnalyticsBuffer();
    logger.info({ signal }, "Analytics buffer drenado — encerrando");
  } catch (err) {
    logger.warn({ err, signal }, "Falha ao drenar o buffer de analytics no shutdown");
  } finally {
    process.exit(0);
  }
}
process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
process.once("SIGINT",  () => { void shutdown("SIGINT"); });

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

/**
 * Resolve a conexão de banco ANTES do listen: env (deploy atual, intocado) →
 * arquivo criptografado do assistente → modo instalação. Decidido uma vez por
 * processo; a troca de banco sempre passa por restart controlado.
 */
async function resolveDatabase(): Promise<void> {
  const boot = resolveDbBoot();

  switch (boot.source) {
    case "env":
      // initDb já aconteceu no import de @workspace/db — comportamento idêntico
      // ao deploy atual, inclusive sem probe (falhas aparecem nas queries).
      setSetupMode({ required: false });
      return;

    case "file": {
      if (!isDbInitialized()) initDb(boot.connectionString);
      // Storage de mídia do arquivo → env (uploads leem sob demanda); a env
      // explícita, quando existir, continua mandando.
      const c = boot.config;
      if (c.supabaseUrl && !process.env["SUPABASE_URL"]) process.env["SUPABASE_URL"] = c.supabaseUrl;
      if (c.supabaseServiceRoleKey && !process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
        process.env["SUPABASE_SERVICE_ROLE_KEY"] = c.supabaseServiceRoleKey;
      }
      if (c.supabaseStorageBucket && !process.env["SUPABASE_STORAGE_BUCKET"]) {
        process.env["SUPABASE_STORAGE_BUCKET"] = c.supabaseStorageBucket;
      }
      // Arquivo pode apontar p/ um banco que morreu → modo recuperação (o
      // mesmo assistente, com o erro legível e o arquivo antigo preservado).
      try {
        await pool.query("SELECT 1");
        setSetupMode({ required: false });
      } catch (err) {
        setSetupMode({ required: true, reason: "recovery", error: describeDbError(err) });
      }
      return;
    }

    case "file-error":
      setSetupMode({ required: true, reason: "recovery", error: boot.error });
      return;

    case "none":
      setSetupMode({ required: true, reason: "not_configured" });
      return;
  }
}

// PRD-01b/F16: em produção, recusa subir sem chave de envelope (segredos não
// podem ser gravados em texto puro). Antes de tocar o banco.
assertEncryptionConfigured();

await resolveDatabase();

if (!isDbReady()) {
  const token = ensureSetupToken();
  logger.warn(
    `MODO INSTALAÇÃO — banco não configurado (${dbConfigPath()} ausente/inválido e sem SUPABASE_DATABASE_URL/DATABASE_URL). ` +
      `Abra /admin/setup no navegador e informe o setup token: ${token}`,
  );
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");

  if (!isDbReady()) {
    logger.warn("Aguardando instalação — apenas /api/setup está ativo (resto responde 503).");
    return;
  }

  // Loga o destino dos uploads (checado após resolver a conexão, pois o
  // arquivo do assistente pode ter injetado as envs do fallback legado).
  logUploadsStorage();

  try {
    await bootWithDb();
  } catch (bootErr) {
    // Banco configurado (env ou arquivo) mas inacessível no boot: sem este
    // catch o processo subia "instalado" servindo os DEFAULTs (site
    // errado/vazio) em silêncio — agora /api responde 503 até reconectar.
    logger.warn(
      { err: bootErr },
      "Banco inacessível no boot — /api responde 503 db_unavailable até reconectar (nova tentativa a cada 15s)",
    );
    scheduleBootRetry();
  }
});

/**
 * Cadeia de boot dependente do banco (schema → hidratação do store → seeds →
 * jobs). Lança se o banco estiver inacessível ou a hidratação falhar; o
 * chamador agenda o retry e o gate de /api (app.ts) segura 503 db_unavailable
 * até uma execução completar. Idempotente: pode rodar de novo após falha
 * parcial (schema/seeds toleram re-execução; startSettingsSync tem guard).
 */
async function bootWithDb(): Promise<void> {
  // Garante colunas novas/opcionais ANTES de qualquer SELECT em articles
  // (o schema do Drizzle já referencia social_title).
  await ensureSchema();

  // PRD-01b/F16: cifra os twoFactorSecret legados em texto puro (idempotente,
  // não-fatal — não pode travar o boot).
  try {
    await migrateTwoFactorSecrets();
  } catch (err) {
    logger.warn({ err }, "migrateTwoFactorSecrets falhou (não-fatal)");
  }

  // Initialize store from PostgreSQL (migrates store.json data if needed)
  await initStore();
  if (!isStoreHydrated()) {
    throw new Error("initStore não conseguiu hidratar o cache a partir do banco");
  }
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

  // Coleta RSS + fila de reescrita — antes rodava no import de app.ts; agora
  // só inicia com o banco inicializado (e nunca em modo instalação).
  startScheduler();

  // Start social media publication queue cron (every 5 min)
  startSocialCron();

  // Start Instagram auto-posting scheduler (checks due automation every 5 min)
  startSocialAutomation();

  // Malha de sanidade cross-metric (PRD 11): valida invariantes do dashboard a cada
  // ~15min contra o banco do próprio blog. Depois do banco pronto (como o scheduler).
  startSanityMonitor();

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
}

/** Re-tenta o bootWithDb a cada 15s até o banco voltar (o site volta sozinho, sem restart). */
function scheduleBootRetry(): void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void bootWithDb()
      .then(() => {
        clearInterval(timer);
        logger.info("Banco reconectou — cache hidratado, /api voltou a servir o site");
      })
      .catch((err: unknown) => {
        logger.warn({ err }, "Banco ainda inacessível — /api segue em 503 db_unavailable");
      })
      .finally(() => { running = false; });
  }, 15000);
  if (typeof timer.unref === "function") timer.unref();
}
