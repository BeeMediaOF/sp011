import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const settingsTable = pgTable("settings", {
  key:       text("key").primaryKey(),
  value:     text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SettingRow    = typeof settingsTable.$inferSelect;
export type SettingInsert = typeof settingsTable.$inferInsert;
