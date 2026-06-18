import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const contactMessagesTable = pgTable("contact_messages", {
  id:        serial("id").primaryKey(),
  name:      text("name").notNull(),
  email:     text("email").notNull(),
  subject:   text("subject"),
  message:   text("message").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  read:      boolean("read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ContactMessage = typeof contactMessagesTable.$inferSelect;
