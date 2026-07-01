import { pgTable, text, timestamp, boolean, pgEnum, index } from "drizzle-orm/pg-core";

export const articleStatusEnum  = pgEnum("article_status",  ["draft", "published"]);
export const articleOriginEnum  = pgEnum("article_origin",  ["manual", "rss", "perplexity"]);

export const articlesTable = pgTable("articles", {
  id:            text("id").primaryKey(),
  title:         text("title").notNull(),
  /**
   * Título curto/compacto reescrito pela IA, usado APENAS nas artes sociais
   * (imagem do Instagram/Facebook). O blog continua usando `title`. Pode conter
   * marcação de destaque inline (*trecho*). Nulo → cai de volta para `title`.
   */
  socialTitle:   text("social_title"),
  /** Resumo curto gerado pela IA p/ legenda de rede social ({{summary}}). */
  socialSummary:  text("social_summary"),
  /** Hashtags geradas pela IA p/ legenda ({{hashtags}}); ex.: "#brasilia #eleicoes". */
  socialHashtags: text("social_hashtags"),
  subtitle:      text("subtitle").notNull().default(""),
  content:       text("content").notNull().default(""),
  category:      text("category").notNull().default("geral"),
  tag:           text("tag").notNull().default("GERAL"),
  imageUrl:      text("image_url").notNull().default(""),
  author:        text("author").notNull().default("Redação"),
  publishedAt:   timestamp("published_at", { withTimezone: true }),
  status:        articleStatusEnum("status").notNull().default("draft"),
  origin:        articleOriginEnum("origin"),
  rssSourceId:   text("rss_source_id"),
  rssSourceName: text("rss_source_name"),
  rssSourceUrl:  text("rss_source_url"),
  aiRewritten:   boolean("ai_rewritten").default(false),
  slug:          text("slug"),
  keywords:      text("keywords"),
  draftReason:   text("draft_reason"),
  canonicalUrl:  text("canonical_url"),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  slugIdx:        index("articles_slug_idx").on(table.slug),
  statusIdx:      index("articles_status_idx").on(table.status),
  categoryIdx:    index("articles_category_idx").on(table.category),
  publishedAtIdx: index("articles_published_at_idx").on(table.publishedAt),
}));

export type ArticleRow    = typeof articlesTable.$inferSelect;
export type ArticleInsert = typeof articlesTable.$inferInsert;
