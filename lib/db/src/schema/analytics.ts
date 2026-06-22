import { pgTable, serial, text, integer, timestamp, pgEnum, index } from "drizzle-orm/pg-core";

export const analyticsEventTypeEnum = pgEnum("analytics_event_type", [
  "pageview", "read", "category", "scroll", "share",
]);
export const analyticsDeviceEnum = pgEnum("analytics_device", [
  "mobile", "desktop", "tablet",
]);

export const analyticsEventsTable = pgTable("analytics_events", {
  id:          serial("id").primaryKey(),
  type:        analyticsEventTypeEnum("type").notNull(),
  path:        text("path").notNull(),
  title:       text("title"),
  category:    text("category"),
  articleId:   text("article_id"),
  sessionId:   text("session_id").notNull(),
  duration:    integer("duration"),
  device:      analyticsDeviceEnum("device").notNull(),
  ts:          timestamp("ts", { withTimezone: true }).notNull(),
  ua:          text("ua"),
  referrer:    text("referrer"),
  scrollDepth: integer("scroll_depth"),
  platform:    text("platform"),
  city:        text("city"),
  region:      text("region"),
}, (t) => [
  index("analytics_ts_idx").on(t.ts),
  index("analytics_type_ts_idx").on(t.type, t.ts),
  index("analytics_session_idx").on(t.sessionId),
  index("analytics_article_idx").on(t.articleId),
]);

export type AnalyticsEventRow    = typeof analyticsEventsTable.$inferSelect;
export type AnalyticsEventInsert = typeof analyticsEventsTable.$inferInsert;
