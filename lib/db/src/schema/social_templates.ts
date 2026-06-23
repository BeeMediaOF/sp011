import { pgTable, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

export const socialTemplatesTable = pgTable("social_templates", {
  id:              text("id").primaryKey(),
  name:            text("name").notNull(),
  type:            text("type").notNull().default("feed"),
  width:           integer("width").notNull().default(1080),
  height:          integer("height").notNull().default(1350),
  backgroundColor: text("background_color").notNull().default("#1a1a1a"),
  elements:        jsonb("elements").notNull().default([]),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SocialTemplateRow    = typeof socialTemplatesTable.$inferSelect;
export type SocialTemplateInsert = typeof socialTemplatesTable.$inferInsert;
