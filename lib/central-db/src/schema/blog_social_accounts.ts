import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Conexões de redes sociais POR BLOG para a Automação Social da central
 * (1 linha por blog): Instagram via Meta Graph direto (OAuth → página FB +
 * IG business + page token de longa duração) e TikTok via Buffer (channel id;
 * API key global das settings com override por blog). Tokens/keys sempre
 * criptografados at-rest (AES-256-GCM via news-engine/crypto).
 */
export const blogSocialAccountsTable = pgTable("blog_social_accounts", {
  id:                 text("id").primaryKey(),
  blogId:             text("blog_id").notNull(),
  // ── Meta (Instagram Reels via Graph API) ──
  metaPageId:         text("meta_page_id"),
  metaPageName:       text("meta_page_name"),
  igUserId:           text("ig_user_id"),
  igUsername:         text("ig_username"),
  metaAccessTokenEnc: text("meta_access_token_enc"),
  metaConnectedAt:    timestamp("meta_connected_at", { withTimezone: true }),
  /** Ex.: token expirado (code 190) → UI pede reconexão. */
  metaLastError:      text("meta_last_error"),
  // ── Buffer (TikTok) ──
  bufferChannelId:    text("buffer_channel_id"),
  bufferChannelName:  text("buffer_channel_name"),
  /** Override por blog; null → usa a bufferApiKey global das settings. */
  bufferApiKeyEnc:    text("buffer_api_key_enc"),
  bufferConnectedAt:  timestamp("buffer_connected_at", { withTimezone: true }),
  createdAt:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:          timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("blog_social_accounts_blog_uniq").on(t.blogId),
]);

export type BlogSocialAccountRow    = typeof blogSocialAccountsTable.$inferSelect;
export type BlogSocialAccountInsert = typeof blogSocialAccountsTable.$inferInsert;
