import { pgTable, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const rssSourcesTable = pgTable("rss_sources", {
  id:            text("id").primaryKey(),
  name:          text("name").notNull(),
  url:           text("url").notNull(),
  category:      text("category").notNull().default("geral"),
  active:        boolean("active").notNull().default(true),
  scheduleHours: integer("schedule_hours").notNull().default(0),
  fetchLimit:    integer("fetch_limit"),
  giveCredit:    boolean("give_credit").notNull().default(false),
  autoMode:      text("auto_mode").notNull().default("none"),
  lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
  customPrompt:  text("custom_prompt"),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RssSourceRow    = typeof rssSourcesTable.$inferSelect;
export type RssSourceInsert = typeof rssSourcesTable.$inferInsert;
