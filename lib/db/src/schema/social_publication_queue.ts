import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const socialPublicationQueueTable = pgTable("social_publication_queue", {
  id:             text("id").primaryKey(),
  articleId:      text("article_id").notNull(),
  socialAccountId: text("social_account_id").notNull(),
  templateId:     text("template_id"),
  type:           text("type").notNull().default("feed"),
  status:         text("status").notNull().default("pending"),
  caption:        text("caption"),
  scheduledAt:    timestamp("scheduled_at", { withTimezone: true }).notNull(),
  publishedAt:    timestamp("published_at", { withTimezone: true }),
  metaPostId:     text("meta_post_id"),
  errorMessage:   text("error_message"),
  retryCount:     integer("retry_count").notNull().default(0),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SocialQueueRow    = typeof socialPublicationQueueTable.$inferSelect;
export type SocialQueueInsert = typeof socialPublicationQueueTable.$inferInsert;
