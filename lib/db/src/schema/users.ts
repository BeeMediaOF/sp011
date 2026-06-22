import { pgTable, serial, text, timestamp, integer, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["admin", "editor"]);
export const userStatusEnum = pgEnum("user_status", ["active", "inactive", "blocked"]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("editor"),
  status: userStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  lastLogin: timestamp("last_login"),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  passwordChangedAt: timestamp("password_changed_at"),
  mustChangePassword: integer("must_change_password").notNull().default(0),
  avatarBase64: text("avatar_base64"),
  twoFactorSecret: text("two_factor_secret"),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  failedLoginAttempts: true,
  lockedUntil: true,
});
export const selectUserSchema = createSelectSchema(usersTable);
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
export type UserPublic = Omit<User, "passwordHash">;
