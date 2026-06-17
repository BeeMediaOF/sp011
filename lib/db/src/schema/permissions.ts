import { pgTable, serial, text, boolean, timestamp, unique } from "drizzle-orm/pg-core";

export const rolePermissionsTable = pgTable(
  "role_permissions",
  {
    id: serial("id").primaryKey(),
    role: text("role").notNull().default("editor"),
    permissionKey: text("permission_key").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("role_perm_unique").on(t.role, t.permissionKey)],
);

export type RolePermission = typeof rolePermissionsTable.$inferSelect;
