import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";

/**
 * Conexões de publicação genéricas (WordPress, Site Externo, e futuramente
 * Blogger). A Meta continua em `social_accounts` porque a fila de publicação
 * (`social_publication_queue`) referencia essa tabela.
 *
 * `secretEnc` guarda o segredo criptografado (AES-256-GCM via crypto.ts):
 * WordPress = Application Password; Site Externo = token/API key.
 * `config` guarda JSON com campos extra não-secretos (método HTTP, headers…).
 */
export const socialConnectionsTable = pgTable("social_connections", {
  id:          text("id").primaryKey(),
  platform:    text("platform").notNull(), // 'wordpress' | 'site_externo' | 'blogger'
  name:        text("name").notNull(),
  siteUrl:     text("site_url"),
  username:    text("username"),
  secretEnc:   text("secret_enc"),
  config:      text("config"), // JSON string
  autoPublish: boolean("auto_publish").notNull().default(false),
  status:      text("status").notNull().default("offline"), // 'online' | 'offline' | 'error'
  lastTestAt:  timestamp("last_test_at", { withTimezone: true }),
  lastError:   text("last_error"),
  isActive:    boolean("is_active").notNull().default(true),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SocialConnectionRow    = typeof socialConnectionsTable.$inferSelect;
export type SocialConnectionInsert = typeof socialConnectionsTable.$inferInsert;
