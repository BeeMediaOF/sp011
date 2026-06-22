import { pgTable, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const perplexityTopicsTable = pgTable("perplexity_topics", {
  id:            text("id").primaryKey(),
  name:          text("name").notNull(),
  query:         text("query").notNull().default(""),
  category:      text("category").notNull().default("geral"),
  active:        boolean("active").notNull().default(true),
  scheduleHours: integer("schedule_hours").notNull().default(24),
  maxResults:    integer("max_results").notNull().default(3),
  autoMode:      text("auto_mode").notNull().default("draft"),
  lastRunAt:     timestamp("last_run_at", { withTimezone: true }),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PerplexityTopicRow    = typeof perplexityTopicsTable.$inferSelect;
export type PerplexityTopicInsert = typeof perplexityTopicsTable.$inferInsert;
