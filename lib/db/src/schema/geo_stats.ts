import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export const geoStatsTable = pgTable("geo_stats", {
  id:        text("id").primaryKey(),
  city:      text("city"),
  region:    text("region"),
  country:   text("country").notNull().default("BR"),
  views:     integer("views").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("geo_stats_region_idx").on(t.region),
  index("geo_stats_city_idx").on(t.city),
]);

export type GeoStatsRow    = typeof geoStatsTable.$inferSelect;
export type GeoStatsInsert = typeof geoStatsTable.$inferInsert;
