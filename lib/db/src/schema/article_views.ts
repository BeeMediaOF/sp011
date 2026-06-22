import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const articleViewsTable = pgTable("article_views", {
  articleId: text("article_id").primaryKey(),
  title:     text("title").notNull().default(""),
  views:     integer("views").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ArticleViewRow    = typeof articleViewsTable.$inferSelect;
export type ArticleViewInsert = typeof articleViewsTable.$inferInsert;
