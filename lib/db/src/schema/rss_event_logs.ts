import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const rssEventLogsTable = pgTable("rss_event_logs", {
  id:           text("id").primaryKey(),
  ts:           timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  type:         text("type").notNull(),
  sourceName:   text("source_name").notNull(),
  articleTitle: text("article_title").notNull(),
  message:      text("message"),
});

export type RssEventLogRow    = typeof rssEventLogsTable.$inferSelect;
export type RssEventLogInsert = typeof rssEventLogsTable.$inferInsert;
