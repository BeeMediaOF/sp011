import app from "./app.js";
import { logger } from "./lib/logger.js";
import { ensureSchema } from "./lib/ensureSchema.js";
import { initStore } from "./lib/store.js";
import { seedCentralAdmin } from "./lib/seed.js";
import { startCollector } from "./services/collector.js";
import { startRewriteWorker } from "./services/rewriter.js";
import { startDistributor } from "./services/distributor.js";
import { startLocalizer } from "./services/localizer.js";
import { startDeliveryWorker } from "./services/deliveryWorker.js";
import { startVideoDownloader } from "./services/videoDownloader.js";
import { startVideoPublisher } from "./services/videoPublisher.js";

process.once("SIGTERM", () => process.exit(0));
process.once("SIGINT", () => process.exit(0));

const port = Number(process.env["PORT"] ?? 8090);
if (!Number.isFinite(port) || port <= 0) {
  throw new Error(`PORT inválida: "${process.env["PORT"]}"`);
}

app.listen(port, async (err?: Error) => {
  if (err) {
    logger.error({ err }, "Erro ao escutar na porta");
    process.exit(1);
  }
  logger.info({ port }, "central-hub escutando");

  // Estrutura do banco antes de qualquer SELECT
  await ensureSchema();
  await initStore();
  await seedCentralAdmin();

  // Workers in-process (instância única — mesma restrição do blog)
  startCollector();
  startRewriteWorker();
  startDistributor();
  startLocalizer();
  startDeliveryWorker();
  // Automação Social (vídeos) — só trabalham com socialEnabled ligado
  startVideoDownloader();
  startVideoPublisher();

  logger.info("Pipeline central ativo: collector + rewriter + distributor + localizer + delivery + social");
});
