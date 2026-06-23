import { pgTable, serial, text, integer, index } from "drizzle-orm/pg-core";

export const adDailyStatsTable = pgTable("ad_daily_stats", {
  id:          serial("id").primaryKey(),
  adId:        text("ad_id").notNull(),
  date:        text("date").notNull(),      // YYYY-MM-DD
  impressions: integer("impressions").notNull().default(0),
  clicks:      integer("clicks").notNull().default(0),
}, (t) => [
  index("ad_daily_ad_date_idx").on(t.adId, t.date),
  index("ad_daily_date_idx").on(t.date),
]);

export type AdDailyStatRow    = typeof adDailyStatsTable.$inferSelect;
export type AdDailyStatInsert = typeof adDailyStatsTable.$inferInsert;
