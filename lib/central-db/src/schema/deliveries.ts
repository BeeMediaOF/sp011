import { pgTable, text, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Fila de entregas central→blog (modelo: `social_publication_queue` do blog).
 * UNIQUE (newsItemId, blogId) garante no máximo 1 entrega por notícia por blog.
 */
export const deliveriesTable = pgTable("deliveries", {
  id:              text("id").primaryKey(),
  newsItemId:      text("news_item_id").notNull(),
  rewriteId:       text("rewrite_id").notNull(),
  blogId:          text("blog_id").notNull(),
  status:          text("status").notNull().default("pending"),
  // 'awaiting_approval' | 'pending' | 'delivering' | 'delivered' | 'duplicate'
  // | 'failed' | 'dead' | 'cancelled'
  attempts:        integer("attempts").notNull().default(0),
  nextRetryAt:     timestamp("next_retry_at", { withTimezone: true }),
  scheduledAt:     timestamp("scheduled_at", { withTimezone: true }),
  deliveredAt:     timestamp("delivered_at", { withTimezone: true }),
  /** Overrides da regra que casou (categoria/tag no blog de destino). */
  targetCategory:  text("target_category"),
  targetTag:       text("target_tag"),
  /** id do artigo criado no blog (resposta do /api/ingest). */
  remoteArticleId: text("remote_article_id"),
  remoteUrl:       text("remote_url"),
  lastError:       text("last_error"),
  lastHttpStatus:  integer("last_http_status"),
  approvedBy:      text("approved_by"),
  approvedAt:      timestamp("approved_at", { withTimezone: true }),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("deliveries_news_blog_uniq").on(t.newsItemId, t.blogId),
  index("deliveries_status_retry_idx").on(t.status, t.nextRetryAt),
  index("deliveries_blog_idx").on(t.blogId),
]);

export type DeliveryRow    = typeof deliveriesTable.$inferSelect;
export type DeliveryInsert = typeof deliveriesTable.$inferInsert;
