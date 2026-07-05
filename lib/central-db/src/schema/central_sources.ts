import { pgTable, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";

/** Fontes RSS do painel central (espelho de `rss_sources` do blog). */
export const centralSourcesTable = pgTable("central_sources", {
  id:            text("id").primaryKey(),
  name:          text("name").notNull(),
  url:           text("url").notNull(),
  category:      text("category").notNull().default("geral"),
  active:        boolean("active").notNull().default(true),
  /** Coleta quando `agora - lastFetchedAt >= scheduleHours`; 0 = nunca automático. */
  scheduleHours: integer("schedule_hours").notNull().default(0),
  fetchLimit:    integer("fetch_limit"),
  giveCredit:    boolean("give_credit").notNull().default(false),
  customPrompt:  text("custom_prompt"),
  lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CentralSourceRow    = typeof centralSourcesTable.$inferSelect;
export type CentralSourceInsert = typeof centralSourcesTable.$inferInsert;
