import { pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";

export const behaviorEventsTable = pgTable("behavior_events", {
  id:        serial("id").primaryKey(),
  eventType: text("event_type").notNull(), // 'search' | 'link_click' | 'newsletter'
  value:     text("value"),               // search query, link URL, etc.
  sessionId: text("session_id").notNull(),
  device:    text("device"),
  articleId: text("article_id"),
  ts:        timestamp("ts", { withTimezone: true }).notNull(),
}, (t) => [
  index("behavior_type_ts_idx").on(t.eventType, t.ts),
  index("behavior_ts_idx").on(t.ts),
  index("behavior_session_idx").on(t.sessionId),
]);

export type BehaviorEventRow    = typeof behaviorEventsTable.$inferSelect;
export type BehaviorEventInsert = typeof behaviorEventsTable.$inferInsert;
