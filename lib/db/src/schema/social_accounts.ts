import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const socialAccountsTable = pgTable("social_accounts", {
  id:             text("id").primaryKey(),
  name:           text("name").notNull(),
  metaAppId:      text("meta_app_id"),
  metaAppSecret:  text("meta_app_secret"),
  pageId:         text("page_id"),
  pageName:       text("page_name"),
  instagramId:    text("instagram_id"),
  instagramName:  text("instagram_name"),
  accessToken:    text("access_token"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  isActive:       boolean("is_active").notNull().default(true),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SocialAccountRow    = typeof socialAccountsTable.$inferSelect;
export type SocialAccountInsert = typeof socialAccountsTable.$inferInsert;
