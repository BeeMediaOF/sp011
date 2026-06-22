import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const loginAttemptsTable = pgTable("login_attempts", {
  ip:        text("ip").primaryKey(),
  count:     integer("count").notNull().default(0),
  resetAt:   timestamp("reset_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LoginAttemptRow = typeof loginAttemptsTable.$inferSelect;
