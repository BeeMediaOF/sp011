import { pgTable, serial, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Consumo de tokens por chamada de IA (capturado do usageMetadata/usage).
 * Base do dashboard de custo — o blog nunca mediu isso.
 */
export const aiUsageEventsTable = pgTable("ai_usage_events", {
  id:           serial("id").primaryKey(),
  newsItemId:   text("news_item_id"),
  rewriteId:    text("rewrite_id"),
  provider:     text("provider").notNull(),
  model:        text("model"),
  /** Últimos 4 caracteres da chave usada (nunca a chave inteira). */
  keyHint:      text("key_hint"),
  inputTokens:  integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  totalTokens:  integer("total_tokens"),
  purpose:      text("purpose").notNull().default("rewrite"),
  /** Duração da chamada em ms (F2 dos PRDs — antes só a entrega HTTP media). */
  durationMs:   integer("duration_ms"),
  /** false = chamada falhou (antes só sucesso era registrado). */
  ok:           boolean("ok").notNull().default(true),
  /** Classe do erro quando ok=false (quota | auth | timeout | parse | other). */
  errorKind:    text("error_kind"),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("ai_usage_created_at_idx").on(t.createdAt),
  index("ai_usage_provider_idx").on(t.provider),
]);

export type AiUsageEventRow    = typeof aiUsageEventsTable.$inferSelect;
export type AiUsageEventInsert = typeof aiUsageEventsTable.$inferInsert;
