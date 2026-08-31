/**
 * Catálogo de permissões + resolução do que CADA USUÁRIO pode fazer.
 *
 * Desde ago/2026 a permissão é POR USUÁRIO (`user_permissions`), editada na
 * sub-aba "Permissões" do modal do usuário. `role_permissions` continua sendo o
 * MODELO do perfil: é o que um usuário novo recebe copiado e o que responde por
 * usuários antigos que ainda não têm linhas próprias — assim nenhum editor já
 * existente perde acesso no deploy que criou a tabela.
 */
import { Router } from "express";
import { eq, and, inArray, sql } from "drizzle-orm";
import { db, rolePermissionsTable, userPermissionsTable } from "@workspace/db";
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
  { key: "transfers.view",       label: "Ver transferências",       group: "Conteúdo",       description: "Acessar o módulo de possíveis transferências" },
  { key: "transfers.manage",     label: "Gerenciar transferências", group: "Conteúdo",       description: "Cadastrar, editar e excluir rumores e clubes" },
  // Plataforma
  { key: "dashboard.view",       label: "Dashboard",                group: "Plataforma",     description: "Acessar o painel inicial" },
  { key: "analytics.view",       label: "Analytics",                group: "Plataforma",     description: "Ver estatísticas de acesso" },
  { key: "menu.view",            label: "Ver menu",                 group: "Plataforma",     description: "Acessar o gerenciador de menus" },
  { key: "menu.edit",            label: "Alterar menus",            group: "Plataforma",     description: "Criar e editar itens de menu" },
  { key: "ads.view",             label: "Ver propagandas",          group: "Plataforma",     description: "Acessar o gerenciador de propagandas" },
  { key: "ads.manage",           label: "Alterar propagandas",      group: "Plataforma",     description: "Criar e editar propagandas" },
  { key: "home_blocks.view",     label: "Blocos Home",              group: "Plataforma",     description: "Acessar os blocos da página inicial" },
  { key: "home_blocks.manage",   label: "Alterar blocos home",      group: "Plataforma",     description: "Criar e editar blocos da home" },
  { key: "categories.view",      label: "Ver categorias",           group: "Plataforma",     description: "Acessar o gerenciador de categorias" },
  { key: "categories.manage",    label: "Alterar categorias",       group: "Plataforma",     description: "Criar, editar e excluir categorias" },
  // Automações
  { key: "rss.view",             label: "Ver fontes RSS",           group: "Automações",     description: "Acessar fontes RSS cadastradas" },
  { key: "rss.manage",           label: "Gerenciar RSS",            group: "Automações",     description: "Adicionar e configurar fontes RSS" },
  { key: "social.view",          label: "Ver redes sociais",        group: "Automações",     description: "Ver configurações de redes sociais" },
  { key: "social.manage",        label: "Gerenciar redes sociais",  group: "Automações",     description: "Configurar publicação automática" },
  { key: "columnists.view",      label: "Ver colunistas",           group: "Automações",     description: "Acessar a lista de colunistas" },
  { key: "columnists.manage",    label: "Gerenciar colunistas",     group: "Automações",     description: "Criar e editar colunistas" },
  // Newsletter
  { key: "newsletter.view",        label: "Ver newsletter",           group: "Newsletter",     description: "Acessar inscritos, campanhas e modelos" },
  { key: "newsletter.campaigns",   label: "Criar/editar campanhas",   group: "Newsletter",     description: "Criar e editar campanhas (rascunhos)" },
  { key: "newsletter.send",        label: "Disparar campanhas",       group: "Newsletter",     description: "Enviar, agendar ou cancelar campanhas" },
  { key: "newsletter.subscribers", label: "Gerenciar inscritos",      group: "Newsletter",     description: "Exportar a lista de inscritos (CSV)" },
  { key: "newsletter.templates",   label: "Gerenciar modelos",        group: "Newsletter",     description: "Criar e editar molduras de e-mail" },
  { key: "newsletter.settings",    label: "Configurar remetente",     group: "Newsletter",     description: "Editar remetente/Gmail e enviar e-mail de teste" },
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

/** Colunista nasce podendo escrever a própria coluna — e nada além disso.
 *  Publicar NÃO entra: a coluna vai para o editor/admin aprovar. */
const COLUMNIST_DEFAULTS = new Set([
  "dashboard.view",
  "articles.view",
  "articles.create",
  "articles.edit",
  "upload.images",
]);

/** Perfis que passam pela checagem de permissão (admin ignora — §13). */
export const MANAGED_ROLES = ["editor", "columnist"] as const;
export type ManagedRole = (typeof MANAGED_ROLES)[number];

export function normalizeRole(role: string | undefined): ManagedRole {
  return role === "columnist" ? "columnist" : "editor";
}

function defaultsFor(role: ManagedRole): Set<string> {
  return role === "columnist" ? COLUMNIST_DEFAULTS : EDITOR_DEFAULTS;
}

/** Semeia o MODELO de cada perfil (linhas faltantes apenas — no-op depois). */
export async function ensurePermissionsSeeded(): Promise<void> {
  const existing = await db
    .select()
    .from(rolePermissionsTable)
    .where(inArray(rolePermissionsTable.role, [...MANAGED_ROLES]));

  const toInsert: Array<{ role: string; permissionKey: string; enabled: boolean }> = [];
  for (const role of MANAGED_ROLES) {
    const have = new Set(existing.filter((p) => p.role === role).map((p) => p.permissionKey));
    for (const p of ALL_PERMISSIONS) {
      if (have.has(p.key)) continue;
      toInsert.push({ role, permissionKey: p.key, enabled: defaultsFor(role).has(p.key) });
    }
  }
  if (toInsert.length > 0) {
    await db.insert(rolePermissionsTable).values(toInsert);
  }
}

/** Chaves ligadas no MODELO do perfil (fallback de quem não tem linhas próprias). */
export async function roleDefaultKeys(role: ManagedRole): Promise<Set<string>> {
  await ensurePermissionsSeeded();
  const rows = await db
    .select()
    .from(rolePermissionsTable)
    .where(and(eq(rolePermissionsTable.role, role), eq(rolePermissionsTable.enabled, true)));
  if (rows.length > 0) return new Set(rows.map((r) => r.permissionKey));
  return new Set(defaultsFor(role));
}

/**
 * Permissões efetivas de um usuário. Admin recebe tudo. Quem tem QUALQUER linha
 * em `user_permissions` é resolvido só por ela (a ausência de uma chave ali é um
 * "não" explícito); quem não tem nenhuma cai no modelo do perfil.
 */
export async function resolveUserPermissions(
  userId: number | undefined,
  role: string | undefined,
): Promise<Set<string>> {
  if (role === "admin") return new Set(ALL_PERMISSIONS.map((p) => p.key));
  const normalized = normalizeRole(role);
  if (typeof userId === "number") {
    const own = await db
      .select()
      .from(userPermissionsTable)
      .where(eq(userPermissionsTable.userId, userId));
    if (own.length > 0) {
      return new Set(own.filter((p) => p.enabled).map((p) => p.permissionKey));
    }
  }
  return roleDefaultKeys(normalized);
}

/** Grava o conjunto do usuário (todas as chaves do catálogo, ligadas ou não). */
export async function saveUserPermissions(
  userId: number,
  enabledKeys: Iterable<string>,
): Promise<void> {
  const enabled = new Set(enabledKeys);
  const now = new Date();
  const values = ALL_PERMISSIONS.map((p) => ({
    userId,
    permissionKey: p.key,
    enabled: enabled.has(p.key),
    updatedAt: now,
  }));
  await db
    .insert(userPermissionsTable)
    .values(values)
    .onConflictDoUpdate({
      target: [userPermissionsTable.userId, userPermissionsTable.permissionKey],
      set: {
        enabled: sql`excluded.enabled`,
        updatedAt: now,
      },
    });
}

/** Copia o modelo do perfil para o usuário (usado ao criar/trocar de perfil). */
export async function seedUserPermissionsFromRole(userId: number, role: string): Promise<void> {
  await saveUserPermissions(userId, await roleDefaultKeys(normalizeRole(role)));
}

export async function deleteUserPermissions(userId: number): Promise<void> {
  await db.delete(userPermissionsTable).where(eq(userPermissionsTable.userId, userId));
}

/** GET /api/admin/permissions?role=editor|columnist — MODELO do perfil (admin) */
router.get("/", authMiddleware, requireAdmin, async (req, res) => {
  try {
    await ensurePermissionsSeeded();
    const role = normalizeRole(String(req.query["role"] ?? "editor"));
    const dbPerms = await db
      .select()
      .from(rolePermissionsTable)
      .where(eq(rolePermissionsTable.role, role));
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

/** GET /api/admin/permissions/me — chaves liberadas para o usuário logado */
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const keys = await resolveUserPermissions(req.userId, req.userRole);
    res.json({ permissions: [...keys], role: req.userRole ?? "" });
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
