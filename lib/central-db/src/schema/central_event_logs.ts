import { pgTable, serial, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";

/** Log de eventos do pipeline central (padrão `rss_event_logs` do blog). */
export const centralEventLogsTable = pgTable("central_event_logs", {
  id:      serial("id").primaryKey(),
  ts:      timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  level:   text("level").notNull().default("info"), // 'info' | 'warn' | 'error'
  module:  text("module").notNull(),
  // 'collector' | 'rewriter' | 'distributor' | 'delivery' | 'auth' | 'api'
  refType: text("ref_type"), // 'news_item' | 'delivery' | 'blog' | 'source' ...
  refId:   text("ref_id"),
  message: text("message").notNull(),
  meta:    jsonb("meta").$type<Record<string, unknown>>(),
}, (t) => [
  index("central_event_logs_ts_idx").on(t.ts),
  index("central_event_logs_module_ts_idx").on(t.module, t.ts),
]);

export type CentralEventLogRow    = typeof centralEventLogsTable.$inferSelect;
export type CentralEventLogInsert = typeof centralEventLogsTable.$inferInsert;
