import { Router } from "express";
import { and, eq, ne } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { authMiddleware, requireAdmin, hashPassword, invalidateUserCache } from "../middlewares/auth.js";
import { logAudit, getClientIp } from "../lib/audit.js";
import { sendWelcomeEmail } from "../lib/mailer.js";
import { store, type ColumnistSpecialty } from "../lib/store.js";
import {
  ALL_PERMISSIONS, resolveUserPermissions, saveUserPermissions,
  seedUserPermissionsFromRole, deleteUserPermissions,
} from "./permissions.js";
import type { UserPublic } from "@workspace/db";

const router = Router();
router.use(authMiddleware);
router.use(requireAdmin);

type UserRole = "admin" | "editor" | "columnist";

function sanitize(u: typeof usersTable.$inferSelect): UserPublic {
  const { passwordHash: _ph, ...rest } = u;
  void _ph;
  return rest;
}

function normalizeUserRole(role: unknown): UserRole | undefined {
  return role === "admin" || role === "editor" || role === "columnist" ? role : undefined;
}

/** Campos do perfil público do colunista, enviados junto do usuário. */
interface ColumnistFields {
  bio?: string;
  specialty?: ColumnistSpecialty;
  avatarBase64?: string;
}

/**
 * Mantém o perfil de colunista (settings.columnists) em sintonia com o login.
 * É ele que dá foto/nome/bio à assinatura do artigo — por isso um usuário
 * "Colunista" sempre nasce com um perfil, criado aqui se ainda não existir.
 * Devolve o id do perfil (ou null quando o usuário deixou de ser colunista).
 */
function syncColumnistProfile(
  user: typeof usersTable.$inferSelect,
  role: UserRole,
  fields: ColumnistFields,
  active: boolean,
): string | null {
  if (role !== "columnist") return user.columnistId ?? null;
  const existing = user.columnistId ? store.getColumnist(user.columnistId) : null;
  if (existing) {
    const patch: Partial<Omit<typeof existing, "id" | "createdAt">> = { name: user.name, active };
    if (fields.bio !== undefined) patch.bio = fields.bio;
    if (fields.specialty !== undefined) patch.specialty = fields.specialty;
    if (fields.avatarBase64 !== undefined) patch.avatarBase64 = fields.avatarBase64;
    store.updateColumnist(existing.id, patch);
    return existing.id;
  }
  const created = store.createColumnist({
    name: user.name,
    bio: fields.bio ?? "",
    specialty: fields.specialty ?? "Outro",
    avatarBase64: fields.avatarBase64 ?? "",
    active,
  });
  return created.id;
}

/** Existe algum OUTRO admin ativo além de `excludeId`? Protege contra travar a
 *  instância rebaixando/desativando/excluindo o último administrador. */
async function otherActiveAdminsExist(excludeId: number): Promise<boolean> {
  const rows = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(
      eq(usersTable.role, "admin"),
      eq(usersTable.status, "active"),
      ne(usersTable.id, excludeId),
    ))
    .limit(1);
  return rows.length > 0;
}

/** GET /api/admin/users */
router.get("/", async (req, res) => {
  try {
    const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
    res.json({ users: users.map(sanitize) });
  } catch (err) {
    req.log.error({ err }, "Error fetching users");
    res.status(500).json({ error: "Erro ao buscar usuários" });
  }
});

/** GET /api/admin/users/:id */
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id ?? "0", 10);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!user) { res.status(404).json({ error: "Usuário não encontrado" }); return; }
    res.json({ user: sanitize(user) });
  } catch (err) {
    req.log.error({ err }, "Error fetching user");
    res.status(500).json({ error: "Erro ao buscar usuário" });
  }
});

/** POST /api/admin/users */
router.post("/", async (req, res) => {
  try {
    const { name, email, password, status, permissions, bio, specialty, avatarBase64 } = req.body as {
      name?: string; email?: string; password?: string;
      status?: "active" | "inactive";
      permissions?: string[];
    } & ColumnistFields;
    const role = normalizeUserRole((req.body as { role?: unknown }).role) ?? "editor";
    if (!name || !email || !password) {
      res.status(400).json({ error: "name, email e password são obrigatórios" }); return;
    }
    const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
    if (existing.length > 0) {
      res.status(409).json({ error: "E-mail já cadastrado" }); return;
    }
    const passwordHash = hashPassword(password);
    const [created] = await db.insert(usersTable).values({
      name,
      email: email.toLowerCase(),
      passwordHash,
      role,
      status: status ?? "active",
      mustChangePassword: 1,
      ...(avatarBase64 ? { avatarBase64 } : {}),
    }).returning();
    if (!created) { res.status(500).json({ error: "Erro ao criar usuário" }); return; }

    // Perfil de colunista + permissões próprias já saem prontos da criação: é o
    // que o modal envia numa única gravação (sub-abas Dados/Colunista/Permissões).
    const columnistId = syncColumnistProfile(
      created, role, { bio, specialty, avatarBase64 }, (status ?? "active") === "active",
    );
    let user = created;
    if (columnistId && columnistId !== created.columnistId) {
      const [linked] = await db.update(usersTable).set({ columnistId })
        .where(eq(usersTable.id, created.id)).returning();
      if (linked) user = linked;
    }
    if (role === "admin") {
      await deleteUserPermissions(user.id);
    } else if (Array.isArray(permissions)) {
      await saveUserPermissions(user.id, permissions);
    } else {
      await seedUserPermissionsFromRole(user.id, role);
    }

    await logAudit({
      userId: req.userId,
      action: "create_user",
      module: "users",
      description: `Usuário criado: ${email}`,
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"],
      metadata: { targetEmail: email, role },
    });

    const emailResult = await sendWelcomeEmail(email.toLowerCase(), name, password);
    const response: { user: UserPublic; emailSent: boolean; emailError?: string } = {
      user: sanitize(user),
      emailSent: emailResult.sent,
    };
    if (!emailResult.sent) {
      req.log.warn({ emailError: emailResult.error }, "Welcome email not sent");
      response.emailError = emailResult.error;
    }
    res.status(201).json(response);
  } catch (err) {
    req.log.error({ err }, "Error creating user");
    res.status(500).json({ error: "Erro ao criar usuário" });
  }
});

/** PUT /api/admin/users/:id */
router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id ?? "0", 10);
    const { name, email, status, permissions, bio, specialty, avatarBase64 } = req.body as {
      name?: string; email?: string; status?: "active" | "inactive" | "blocked";
      permissions?: string[];
    } & ColumnistFields;
    const role = normalizeUserRole((req.body as { role?: unknown }).role);
    const [current] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!current) { res.status(404).json({ error: "Usuário não encontrado" }); return; }
    // Guarda de lockout: não deixa rebaixar (admin→editor) nem desativar/bloquear
    // o ÚLTIMO admin ativo.
    const losesAdmin =
      current.role === "admin" &&
      ((role && role !== "admin") || (status && status !== "active"));
    if (losesAdmin && !(await otherActiveAdminsExist(id))) {
      res.status(400).json({ error: "Não é possível rebaixar ou desativar o último administrador ativo." });
      return;
    }
    const updates: Partial<typeof usersTable.$inferInsert> = { updatedAt: new Date() };
    if (name) updates.name = name;
    if (email) updates.email = email.toLowerCase();
    if (role) updates.role = role;
    if (status) updates.status = status;
    if (avatarBase64 !== undefined) updates.avatarBase64 = avatarBase64;
    const [saved] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
    if (!saved) { res.status(404).json({ error: "Usuário não encontrado" }); return; }

    const effectiveRole = role ?? (normalizeUserRole(saved.role) ?? "editor");
    const columnistId = syncColumnistProfile(
      saved, effectiveRole, { bio, specialty, avatarBase64 },
      (status ?? saved.status) === "active",
    );
    let user = saved;
    if (columnistId !== (saved.columnistId ?? null)) {
      const [linked] = await db.update(usersTable).set({ columnistId })
        .where(eq(usersTable.id, id)).returning();
      if (linked) user = linked;
    }
    // Papel/permissões mudaram → o cache de 60s do authMiddleware precisa cair,
    // senão o usuário continua com o papel antigo por até um minuto.
    if (role || status) invalidateUserCache(id);
    if (effectiveRole === "admin") {
      await deleteUserPermissions(id);
    } else if (Array.isArray(permissions)) {
      await saveUserPermissions(id, permissions);
    } else if (role && role !== current.role) {
      // Trocou de perfil sem mandar permissões → recomeça do modelo do novo perfil.
      await seedUserPermissionsFromRole(id, effectiveRole);
    }

    await logAudit({
      userId: req.userId,
      action: "update_user",
      module: "users",
      description: `Usuário atualizado: ${user.email}`,
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"],
      metadata: { targetId: id, changes: { name, email, role, status } },
    });
    res.json({ user: sanitize(user) });
  } catch (err) {
    req.log.error({ err }, "Error updating user");
    res.status(500).json({ error: "Erro ao atualizar usuário" });
  }
});

/** GET /api/admin/users/:id/permissions — catálogo + estado efetivo do usuário */
router.get("/:id/permissions", async (req, res) => {
  try {
    const id = parseInt(req.params.id ?? "0", 10);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!user) { res.status(404).json({ error: "Usuário não encontrado" }); return; }
    const keys = await resolveUserPermissions(user.id, user.role);
    res.json({
      role: user.role,
      permissions: ALL_PERMISSIONS.map((p) => ({ ...p, enabled: keys.has(p.key) })),
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching user permissions");
    res.status(500).json({ error: "Erro ao buscar permissões do usuário" });
  }
});

/** PUT /api/admin/users/:id/permissions — grava o conjunto do usuário */
router.put("/:id/permissions", async (req, res) => {
  try {
    const id = parseInt(req.params.id ?? "0", 10);
    const { permissions } = req.body as { permissions?: string[] };
    if (!Array.isArray(permissions)) {
      res.status(400).json({ error: "Campo 'permissions' é obrigatório (lista de chaves)" }); return;
    }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!user) { res.status(404).json({ error: "Usuário não encontrado" }); return; }
    if (user.role === "admin") {
      res.status(400).json({ error: "Administrador tem acesso total por definição — não há o que restringir." });
      return;
    }
    const valid = new Set(ALL_PERMISSIONS.map((p) => p.key));
    const keys = permissions.filter((k) => valid.has(k));
    await saveUserPermissions(id, keys);
    await logAudit({
      userId: req.userId,
      action: "update_user_permissions",
      module: "permissions",
      description: `Permissões de ${user.email}: ${keys.length}/${valid.size} liberadas`,
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"],
      metadata: { targetId: id, keys },
    });
    res.json({ permissions: keys });
  } catch (err) {
    req.log.error({ err }, "Error saving user permissions");
    res.status(500).json({ error: "Erro ao salvar permissões do usuário" });
  }
});

/** PUT /api/admin/users/:id/password */
router.put("/:id/password", async (req, res) => {
  try {
    const id = parseInt(req.params.id ?? "0", 10);
    const { password } = req.body as { password?: string };
    if (!password || password.length < 8) {
      res.status(400).json({ error: "Senha deve ter no mínimo 8 caracteres" }); return;
    }
    const passwordHash = hashPassword(password);
    const [user] = await db.update(usersTable).set({
      passwordHash,
      passwordChangedAt: new Date(),
      mustChangePassword: 0,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, id)).returning();
    if (!user) { res.status(404).json({ error: "Usuário não encontrado" }); return; }
    // PRD-03/F14: invalida o cache (TTL 60s) p/ a revogação por troca de senha
    // (passwordChangedAt) valer imediatamente, não após o cache expirar.
    invalidateUserCache(id);
    await logAudit({
      userId: req.userId,
      action: "change_password",
      module: "users",
      description: `Senha alterada para usuário: ${user.email}`,
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"],
    });
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error changing password");
    res.status(500).json({ error: "Erro ao alterar senha" });
  }
});

/** DELETE /api/admin/users/:id */
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id ?? "0", 10);
    if (id === req.userId) {
      res.status(400).json({ error: "Você não pode excluir sua própria conta" }); return;
    }
    const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (target?.role === "admin" && !(await otherActiveAdminsExist(id))) {
      res.status(400).json({ error: "Não é possível excluir o último administrador ativo." }); return;
    }
    const [user] = await db.delete(usersTable).where(eq(usersTable.id, id)).returning();
    if (!user) { res.status(404).json({ error: "Usuário não encontrado" }); return; }
    await deleteUserPermissions(id);
    // O PERFIL de colunista sobrevive de propósito: artigos já publicados
    // assinam por ele (foto/nome/bio). Some só o login.
    if (user.columnistId) store.updateColumnist(user.columnistId, { active: false });
    await logAudit({
      userId: req.userId,
      action: "delete_user",
      module: "users",
      description: `Usuário excluído: ${user.email}`,
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"],
      metadata: { deletedEmail: user.email },
    });
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting user");
    res.status(500).json({ error: "Erro ao excluir usuário" });
  }
});

export default router;
