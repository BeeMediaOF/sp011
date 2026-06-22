import { pgTable, text, boolean, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const adPositionEnum = pgEnum("ad_position", [
  "slot_01","slot_02","slot_03","slot_04","slot_05",
  "slot_06","slot_07","slot_08","slot_09","slot_10","slot_11",
  "topo","centro","lateral","rodape",
  "slidebar_250","slidebar_500",
  "banner","sidebar","central",
]);

export const adsTable = pgTable("ads", {
  id:            text("id").primaryKey(),
  name:          text("name").notNull(),
  imageBase64:   text("image_base64").notNull(),
  link:          text("link").notNull(),
  position:      adPositionEnum("position").notNull().default("slot_01"),
  active:        boolean("active").notNull().default(true),
  clicks:        integer("clicks").notNull().default(0),
  impressions:   integer("impressions").notNull().default(0),
  targetDevices: text("target_devices").notNull().default("desktop,mobile,tablet"),
  imageUrl:      text("image_url"),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAdSchema = createInsertSchema(adsTable).omit({
  clicks: true,
  impressions: true,
  createdAt: true,
  updatedAt: true,
});
export const selectAdSchema = createSelectSchema(adsTable);

export type AdRow    = typeof adsTable.$inferSelect;
export type AdInsert = typeof adsTable.$inferInsert;

export type AdPosition = typeof adPositionEnum.enumValues[number];

export const VALID_AD_POSITIONS: AdPosition[] = adPositionEnum.enumValues;

export function parseTargetDevices(raw: string): ("desktop"|"mobile"|"tablet")[] {
  return raw.split(",").filter((d): d is "desktop"|"mobile"|"tablet" =>
    ["desktop","mobile","tablet"].includes(d)
  );
}

export function serializeTargetDevices(devices: ("desktop"|"mobile"|"tablet")[]): string {
  return devices.join(",");
}

export type AdPublic = {
  id: string;
  name: string;
  imageBase64: string;
  link: string;
  position: AdPosition;
  active: boolean;
  clicks: number;
  impressions: number;
  targetDevices: ("desktop"|"mobile"|"tablet")[];
  createdAt: string;
  updatedAt: string;
};
