import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";

/** Usuários do painel central (separados dos usuários de cada blog). */
export const centralUsersTable = pgTable("central_users", {
  id:           text("id").primaryKey(),
  email:        text("email").notNull().unique(),
  name:         text("name").notNull(),
  passwordHash: text("password_hash").notNull(), // scrypt (mesmo formato do blog)
  role:         text("role").notNull().default("admin"),
  isActive:     boolean("is_active").notNull().default(true),
  lastLoginAt:  timestamp("last_login_at", { withTimezone: true }),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CentralUserRow    = typeof centralUsersTable.$inferSelect;
export type CentralUserInsert = typeof centralUsersTable.$inferInsert;
