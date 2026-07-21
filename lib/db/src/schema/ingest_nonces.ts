import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Nonces de ingest consumidos (PRD-14, anti-replay real): a assinatura de uma
 * requisição de ingest só vale UMA vez. Estado do BLOG receptor (não do módulo
 * puro `signing.ts`). Limpeza por TTL (≥ 2× a janela de 300s).
 */
export const ingestNoncesTable = pgTable("ingest_nonces", {
  signature: text("signature").primaryKey(),
  seenAt:    timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export type IngestNonceRow = typeof ingestNoncesTable.$inferSelect;
