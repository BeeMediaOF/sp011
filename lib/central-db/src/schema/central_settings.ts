import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";

/**
 * Configurações do painel central (chave/valor JSON — espelho da `settings`
 * do blog, com jsonb em vez de texto). Campos secretos dentro dos blobs são
 * criptografados via news-engine/crypto (SECRET_FIELDS no store do central).
 */
export const centralSettingsTable = pgTable("central_settings", {
  key:       text("key").primaryKey(),
  value:     jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CentralSettingRow    = typeof centralSettingsTable.$inferSelect;
export type CentralSettingInsert = typeof centralSettingsTable.$inferInsert;
