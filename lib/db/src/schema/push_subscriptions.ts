import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const pushSubscriptionsTable = pgTable("push_subscriptions", {
  id:        text("id").primaryKey(),
  endpoint:  text("endpoint").notNull().unique(),
  p256dh:    text("p256dh"),
  auth:      text("auth"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PushSubscriptionRow    = typeof pushSubscriptionsTable.$inferSelect;
export type PushSubscriptionInsert = typeof pushSubscriptionsTable.$inferInsert;
