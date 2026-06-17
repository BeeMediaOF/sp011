import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { authMiddleware, requireAdmin, hashPassword } from "../middlewares/auth.js";
import { logAudit, getClientIp } from "../lib/audit.js";
import type { UserPublic } from "@workspace/db";

const router = Router();
router.use(authMiddleware);
router.use(requireAdmin);

function sanitize(u: typeof usersTable.$inferSelect): UserPublic {
  const { passwordHash: _ph, ...rest } = u;
  void _ph;
  return rest;
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
    const { name, email, password, role, status } = req.body as {
      name?: string; email?: string; password?: string;
      role?: "admin" | "editor"; status?: "active" | "inactive";
    };
    if (!name || !email || !password) {
      res.status(400).json({ error: "name, email e password são obrigatórios" }); return;
    }
    const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
    if (existing.length > 0) {
      res.status(409).json({ error: "E-mail já cadastrado" }); return;
    }
    const passwordHash = hashPassword(password);
    const [user] = await db.insert(usersTable).values({
      name,
      email: email.toLowerCase(),
      passwordHash,
      role: role ?? "editor",
      status: status ?? "active",
      mustChangePassword: 1,
    }).returning();
    if (!user) { res.status(500).json({ error: "Erro ao criar usuário" }); return; }
    await logAudit({
      userId: req.userId,
      action: "create_user",
      module: "users",
      description: `Usuário criado: ${email}`,
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"],
      metadata: { targetEmail: email, role },
    });
    res.status(201).json({ user: sanitize(user) });
  } catch (err) {
    req.log.error({ err }, "Error creating user");
    res.status(500).json({ error: "Erro ao criar usuário" });
  }
});

/** PUT /api/admin/users/:id */
router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id ?? "0", 10);
    const { name, email, role, status } = req.body as {
      name?: string; email?: string; role?: "admin" | "editor"; status?: "active" | "inactive" | "blocked";
    };
    const updates: Partial<typeof usersTable.$inferInsert> = { updatedAt: new Date() };
    if (name) updates.name = name;
    if (email) updates.email = email.toLowerCase();
    if (role) updates.role = role;
    if (status) updates.status = status;
    const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
    if (!user) { res.status(404).json({ error: "Usuário não encontrado" }); return; }
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

/** PUT /api/admin/users/:id/password */
router.put("/:id/password", async (req, res) => {
  try {
    const id = parseInt(req.params.id ?? "0", 10);
    const { password } = req.body as { password?: string };
    if (!password || password.length < 6) {
      res.status(400).json({ error: "Senha deve ter no mínimo 6 caracteres" }); return;
    }
    const passwordHash = hashPassword(password);
    const [user] = await db.update(usersTable).set({
      passwordHash,
      passwordChangedAt: new Date(),
      mustChangePassword: 0,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, id)).returning();
    if (!user) { res.status(404).json({ error: "Usuário não encontrado" }); return; }
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
    const [user] = await db.delete(usersTable).where(eq(usersTable.id, id)).returning();
    if (!user) { res.status(404).json({ error: "Usuário não encontrado" }); return; }
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
