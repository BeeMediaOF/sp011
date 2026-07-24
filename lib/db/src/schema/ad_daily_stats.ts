import { pgTable, serial, text, integer, index, uniqueIndex } from "drizzle-orm/pg-core";

export const adDailyStatsTable = pgTable("ad_daily_stats", {
  id:                  serial("id").primaryKey(),
  adId:                text("ad_id").notNull(),
  date:                text("date").notNull(),      // YYYY-MM-DD (dia BRT)
  impressions:         integer("impressions").notNull().default(0),          // público
  clicks:              integer("clicks").notNull().default(0),               // público
  internalImpressions: integer("internal_impressions").notNull().default(0), // interno (PRD 04 RF3)
  internalClicks:      integer("internal_clicks").notNull().default(0),      // interno (PRD 04 RF3)
}, (t) => [
  // PRD 04 RF1: único em (ad_id, date) — o upsert atômico depende dele; substitui o
  // índice comum ad_daily_ad_date_idx (a ausência do único causava a inflação quadrática).
  uniqueIndex("ad_daily_ad_date_uniq").on(t.adId, t.date),
  index("ad_daily_date_idx").on(t.date),
]);

export type AdDailyStatRow    = typeof adDailyStatsTable.$inferSelect;
export type AdDailyStatInsert = typeof adDailyStatsTable.$inferInsert;
