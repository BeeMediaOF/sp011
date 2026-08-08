import { pgTable, serial, integer, text, boolean, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * Padrão do PERFIL (editor/colunista). Continua existindo como *modelo*: é o que
 * um usuário novo recebe copiado para si na criação, e o que responde por
 * usuários antigos que ainda não têm linhas próprias em `user_permissions`.
 * A verdade de quem já tem linhas próprias é sempre a tabela por usuário.
 */
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

/**
 * Permissão POR USUÁRIO — a fonte da verdade desde ago/2026. Editada na sub-aba
 * "Permissões" do modal do usuário (antes era uma aba única do perfil Editor em
 * Configurações). Admin ignora a tabela por definição (§13 do CLAUDE.md).
 */
export const userPermissionsTable = pgTable(
  "user_permissions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    permissionKey: text("permission_key").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("user_perm_unique").on(t.userId, t.permissionKey)],
);

export type RolePermission = typeof rolePermissionsTable.$inferSelect;
export type UserPermission = typeof userPermissionsTable.$inferSelect;
