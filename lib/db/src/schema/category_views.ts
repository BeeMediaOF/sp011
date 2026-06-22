import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const categoryViewsTable = pgTable("category_views", {
  category:  text("category").primaryKey(),
  views:     integer("views").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CategoryViewRow    = typeof categoryViewsTable.$inferSelect;
export type CategoryViewInsert = typeof categoryViewsTable.$inferInsert;
