import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, rolePermissionsTable } from "@workspace/db";
import { authMiddleware, requireAdmin } from "../middlewares/auth.js";
import { logAudit, getClientIp } from "../lib/audit.js";

const router = Router();

export interface PermissionDef {
  key: string;
  label: string;
  group: string;
  description: string;
}

export const ALL_PERMISSIONS: PermissionDef[] = [
  // Conteúdo
  { key: "articles.view",        label: "Ver artigos",              group: "Conteúdo",       description: "Acessar a lista de artigos" },
  { key: "articles.create",      label: "Criar novo artigo",        group: "Conteúdo",       description: "Criar e salvar rascunhos" },
  { key: "articles.edit",        label: "Editar artigos",           group: "Conteúdo",       description: "Editar artigos existentes" },
  { key: "articles.delete",      label: "Excluir artigos",          group: "Conteúdo",       description: "Remover artigos permanentemente" },
  { key: "articles.publish",     label: "Publicar artigos",         group: "Conteúdo",       description: "Publicar ou despublicar artigos" },
  { key: "upload.images",        label: "Upload de imagens",        group: "Conteúdo",       description: "Fazer upload de imagens e mídias" },
  // Plataforma
  { key: "dashboard.view",       label: "Dashboard",                group: "Plataforma",     description: "Acessar o painel inicial" },
  { key: "analytics.view",       label: "Analytics",                group: "Plataforma",     description: "Ver estatísticas de acesso" },
  { key: "menu.view",            label: "Ver menu",                 group: "Plataforma",     description: "Acessar o gerenciador de menus" },
  { key: "menu.edit",            label: "Alterar menus",            group: "Plataforma",     description: "Criar e editar itens de menu" },
  { key: "ads.view",             label: "Ver propagandas",          group: "Plataforma",     description: "Acessar o gerenciador de propagandas" },
  { key: "ads.manage",           label: "Alterar propagandas",      group: "Plataforma",     description: "Criar e editar propagandas" },
  { key: "home_blocks.view",     label: "Blocos Home",              group: "Plataforma",     description: "Acessar os blocos da página inicial" },
  { key: "home_blocks.manage",   label: "Alterar blocos home",      group: "Plataforma",     description: "Criar e editar blocos da home" },
  // Automações
  { key: "rss.view",             label: "Ver fontes RSS",           group: "Automações",     description: "Acessar fontes RSS cadastradas" },
  { key: "rss.manage",           label: "Gerenciar RSS",            group: "Automações",     description: "Adicionar e configurar fontes RSS" },
  { key: "social.view",          label: "Ver redes sociais",        group: "Automações",     description: "Ver configurações de redes sociais" },
  { key: "social.manage",        label: "Gerenciar redes sociais",  group: "Automações",     description: "Configurar publicação automática" },
  { key: "columnists.view",      label: "Ver colunistas",           group: "Automações",     description: "Acessar a lista de colunistas" },
  { key: "columnists.manage",    label: "Gerenciar colunistas",     group: "Automações",     description: "Criar e editar colunistas" },
  // Administração
  { key: "settings.view",        label: "Configurações",            group: "Administração",  description: "Acessar configurações do portal" },
  { key: "users.manage",         label: "Usuários e permissões",    group: "Administração",  description: "Gerenciar usuários da plataforma" },
  { key: "logs.view",            label: "Logs",                     group: "Administração",  description: "Ver logs de auditoria" },
  { key: "security.view",        label: "Segurança",                group: "Administração",  description: "Acessar o painel de segurança" },
];

const EDITOR_DEFAULTS = new Set([
  "dashboard.view",
  "analytics.view",
  "ads.view",
  "menu.view",
  "articles.create",
]);

export async function ensurePermissionsSeeded(): Promise<void> {
  const existing = await db
    .select()
    .from(rolePermissionsTable)
    .where(eq(rolePermissionsTable.role, "editor"));

  const existingKeys = new Set(existing.map((p) => p.permissionKey));
  const toInsert: Array<{ role: string; permissionKey: string; enabled: boolean }> =
    ALL_PERMISSIONS.filter((p) => !existingKeys.has(p.key)).map((p) => ({
      role: "editor",
      permissionKey: p.key,
      enabled: EDITOR_DEFAULTS.has(p.key),
    }));

  if (toInsert.length > 0) {
    await db.insert(rolePermissionsTable).values(toInsert);
  }
}

/** GET /api/admin/permissions — all permissions + editor's current state (admin only) */
router.get("/", authMiddleware, requireAdmin, async (req, res) => {
  try {
    await ensurePermissionsSeeded();
    const dbPerms = await db
      .select()
      .from(rolePermissionsTable)
      .where(eq(rolePermissionsTable.role, "editor"));
    const permMap = new Map(dbPerms.map((p) => [p.permissionKey, p.enabled]));
    const permissions = ALL_PERMISSIONS.map((p) => ({
      key: p.key,
      label: p.label,
      group: p.group,
      description: p.description,
      enabled: permMap.get(p.key) ?? false,
    }));
    res.json({ permissions });
  } catch (err) {
    req.log.error({ err }, "Error fetching permissions");
    res.status(500).json({ error: "Erro ao buscar permissões" });
  }
});

/** GET /api/admin/permissions/me — current user's enabled permission keys */
router.get("/me", authMiddleware, async (req, res) => {
  try {
    if (req.userRole === "admin") {
      res.json({ permissions: ALL_PERMISSIONS.map((p) => p.key) });
      return;
    }
    await ensurePermissionsSeeded();
    const dbPerms = await db
      .select()
      .from(rolePermissionsTable)
      .where(
        and(
          eq(rolePermissionsTable.role, "editor"),
          eq(rolePermissionsTable.enabled, true),
        ),
      );
    res.json({ permissions: dbPerms.map((p) => p.permissionKey) });
  } catch (err) {
    req.log.error({ err }, "Error fetching my permissions");
    res.status(500).json({ error: "Erro ao buscar permissões" });
  }
});

/** PUT /api/admin/permissions/:key — enable or disable a permission (admin only) */
router.put("/:key", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const rawKey = req.params.key;
    const key = String(Array.isArray(rawKey) ? (rawKey[0] ?? "") : (rawKey ?? ""));
    const { enabled } = req.body as { enabled?: boolean };

    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "Campo 'enabled' é obrigatório e deve ser boolean" });
      return;
    }

    const validKey = ALL_PERMISSIONS.find((p) => p.key === key);
    if (!validKey) {
      res.status(404).json({ error: "Permissão não encontrada" });
      return;
    }

    const [existing] = await db
      .select()
      .from(rolePermissionsTable)
      .where(
        and(
          eq(rolePermissionsTable.role, "editor"),
          eq(rolePermissionsTable.permissionKey, key),
        ),
      );

    const oldValue = existing?.enabled ?? false;

    if (existing) {
      await db
        .update(rolePermissionsTable)
        .set({ enabled, updatedAt: new Date() })
        .where(
          and(
            eq(rolePermissionsTable.role, "editor"),
            eq(rolePermissionsTable.permissionKey, key),
          ),
        );
    } else {
      await db
        .insert(rolePermissionsTable)
        .values({ role: "editor", permissionKey: key, enabled });
    }

    await logAudit({
      userId: req.userId,
      action: enabled ? "permission_enabled" : "permission_disabled",
      module: "permissions",
      description: `Permissão "${validKey.label}" (${key}) ${enabled ? "ativada" : "desativada"} para o perfil Editor`,
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"],
      metadata: {
        permissionKey: key,
        role: "editor",
        previousValue: oldValue,
        newValue: enabled,
      },
    });

    res.json({ key, enabled });
  } catch (err) {
    req.log.error({ err }, "Error updating permission");
    res.status(500).json({ error: "Erro ao atualizar permissão" });
  }
});

export default router;
