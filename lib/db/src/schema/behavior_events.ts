import { pgTable, serial, text, timestamp, index, boolean } from "drizzle-orm/pg-core";

export const behaviorEventsTable = pgTable("behavior_events", {
  id:        serial("id").primaryKey(),
  // 'search' | 'link_click' | 'newsletter' | 'video_play' | 'download'
  // (video_play/download RESERVADOS — sem emissor no client; ver docs/ANALYTICS.md).
  eventType: text("event_type").notNull(),
  value:     text("value"),               // search query, link URL, e-mail…
  sessionId: text("session_id").notNull(),
  device:    text("device"),
  articleId: text("article_id"),
  ts:        timestamp("ts", { withTimezone: true }).notNull(),
  // Tráfego interno (PRD 01: coluna; PRD 03: marcação no ingest). Até o PRD 03,
  // o handler continua DROPANDO interno — toda linha gravada é false.
  isInternal: boolean("is_internal").notNull().default(false),
}, (t) => [
  index("behavior_type_ts_idx").on(t.eventType, t.ts),
  index("behavior_ts_idx").on(t.ts),
  index("behavior_session_idx").on(t.sessionId),
]);

export type BehaviorEventRow    = typeof behaviorEventsTable.$inferSelect;
export type BehaviorEventInsert = typeof behaviorEventsTable.$inferInsert;
