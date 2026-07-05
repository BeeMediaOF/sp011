/**
 * Log de eventos do pipeline central em banco (padrão `rss_event_logs` do
 * blog): fire-and-forget, nunca derruba o fluxo que está logando.
 */
import { db, centralEventLogsTable } from "@workspace/central-db";
import { logger } from "./logger.js";

export type EventModule = "collector" | "rewriter" | "distributor" | "delivery" | "auth" | "api";
export type EventLevel = "info" | "warn" | "error";

export function logEvent(entry: {
  module: EventModule;
  message: string;
  level?: EventLevel;
  refType?: string;
  refId?: string;
  meta?: Record<string, unknown>;
}): void {
  db.insert(centralEventLogsTable)
    .values({
      level: entry.level ?? "info",
      module: entry.module,
      refType: entry.refType ?? null,
      refId: entry.refId ?? null,
      message: entry.message,
      meta: entry.meta ?? null,
    })
    .catch((err) => {
      logger.warn({ err, entry: entry.message }, "Falha ao gravar event log (não-fatal)");
    });
}
