import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Notícia original coletada (antes da reescrita).
 * Âncoras de dedup: guid, originalUrl, titleNorm (+ overlap em memória).
 */
export const newsItemsTable = pgTable("news_items", {
  id:                text("id").primaryKey(),
  sourceId:          text("source_id").notNull(),
  sourceName:        text("source_name").notNull(),
  guid:              text("guid"),
  originalUrl:       text("original_url"),
  canonicalUrl:      text("canonical_url"),
  title:             text("title").notNull(),
  /** Título normalizado (lower/trim/espaços colapsados) para match exato. */
  titleNorm:         text("title_norm").notNull(),
  description:       text("description"),
  /** Texto bruto raspado da página (decisão pendente: purga > 90 dias). */
  contentRaw:        text("content_raw"),
  imageUrl:          text("image_url"),
  category:          text("category").notNull().default("geral"),
  tags:              text("tags"),
  publishedAtSource: timestamp("published_at_source", { withTimezone: true }),
  status:            text("status").notNull().default("collected"),
  // 'collected' | 'queued' | 'rewriting' | 'rewritten' | 'distributed'
  // | 'failed' | 'discarded'
  failReason:        text("fail_reason"),
  createdAt:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:         timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("news_items_title_norm_idx").on(t.titleNorm),
  index("news_items_guid_idx").on(t.guid),
  index("news_items_original_url_idx").on(t.originalUrl),
  index("news_items_status_idx").on(t.status),
  index("news_items_created_at_idx").on(t.createdAt),
]);

export type NewsItemRow    = typeof newsItemsTable.$inferSelect;
export type NewsItemInsert = typeof newsItemsTable.$inferInsert;
