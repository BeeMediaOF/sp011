import { pgTable, text, integer, timestamp, primaryKey } from "drizzle-orm/pg-core";

export const endpointRateLimitsTable = pgTable("endpoint_rate_limits", {
  ip:        text("ip").notNull(),
  endpoint:  text("endpoint").notNull(),
  count:     integer("count").notNull().default(0),
  resetAt:   timestamp("reset_at", { withTimezone: true }).notNull(),
  blockedUntil: timestamp("blocked_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.ip, t.endpoint] })]);

export type EndpointRateLimitRow    = typeof endpointRateLimitsTable.$inferSelect;
export type EndpointRateLimitInsert = typeof endpointRateLimitsTable.$inferInsert;
