import { pgTable, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Reescrita de uma notícia.
 * `blogId = null` → reescrita COMPARTILHADA (única do MVP).
 * `blogId` preenchido → variação por blog (fase posterior, mesma tabela).
 */
export const rewritesTable = pgTable("rewrites", {
  id:             text("id").primaryKey(),
  newsItemId:     text("news_item_id").notNull(),
  blogId:         text("blog_id"),
  title:          text("title"),
  subtitle:       text("subtitle"),
  socialTitle:    text("social_title"),
  socialSummary:  text("social_summary"),
  socialHashtags: text("social_hashtags"),
  contentHtml:    text("content_html"),
  slug:           text("slug"),
  keywords:       text("keywords"),
  provider:       text("provider"),
  model:          text("model"),
  attempts:       integer("attempts").notNull().default(0),
  status:         text("status").notNull().default("ok"), // 'ok' | 'failed'
  errorMessage:   text("error_message"),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // No máximo UMA reescrita compartilhada por notícia
  uniqueIndex("rewrites_shared_uniq").on(t.newsItemId).where(sql`blog_id is null`),
]);

export type RewriteRow    = typeof rewritesTable.$inferSelect;
export type RewriteInsert = typeof rewritesTable.$inferInsert;
