import { Router } from "express";
import { db, centralUsersTable } from "@workspace/central-db";
import { eq } from "drizzle-orm";
import {
  authMiddleware,
  checkLoginRateLimit,
  generateToken,
  hashPassword,
  invalidateUserCache,
  verifyPassword,
} from "../middlewares/auth.js";
import { logEvent } from "../lib/eventLog.js";

const router = Router();

router.post("/login", async (req, res) => {
  const ip = req.ip ?? "unknown";
  if (!checkLoginRateLimit(ip)) {
    res.status(429).json({ error: "Muitas tentativas. Aguarde um minuto." });
    return;
  }

  const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: "E-mail e senha são obrigatórios." });
    return;
  }

  const rows = await db
    .select()
    .from(centralUsersTable)
    .where(eq(centralUsersTable.email, email.toLowerCase().trim()))
    .limit(1);
  const user = rows[0];

  if (!user || !user.isActive || !verifyPassword(password, user.passwordHash)) {
    logEvent({ module: "auth", level: "warn", message: `Login falhou para ${email}`, meta: { ip } });
    res.status(401).json({ error: "Credenciais inválidas." });
    return;
  }

  await db
    .update(centralUsersTable)
    .set({ lastLoginAt: new Date(), updatedAt: new Date() })
    .where(eq(centralUsersTable.id, user.id));

  logEvent({ module: "auth", message: `Login de ${user.email}`, meta: { ip } });
  res.json({
    token: generateToken(user.id, user.role),
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

router.get("/me", authMiddleware, async (req, res) => {
  const rows = await db
    .select({
      id: centralUsersTable.id,
      name: centralUsersTable.name,
      email: centralUsersTable.email,
      role: centralUsersTable.role,
      lastLoginAt: centralUsersTable.lastLoginAt,
    })
    .from(centralUsersTable)
    .where(eq(centralUsersTable.id, req.centralUserId!))
    .limit(1);
  if (rows.length === 0) {
    res.status(404).json({ error: "Usuário não encontrado." });
    return;
  }
  res.json(rows[0]);
});

router.put("/me/password", authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = (req.body ?? {}) as {
    currentPassword?: string;
    newPassword?: string;
  };
  if (!currentPassword || !newPassword || newPassword.length < 8) {
    res.status(400).json({ error: "Senha atual e nova senha (mín. 8 caracteres) são obrigatórias." });
    return;
  }
  const rows = await db
    .select()
    .from(centralUsersTable)
    .where(eq(centralUsersTable.id, req.centralUserId!))
    .limit(1);
  const user = rows[0];
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
    res.status(401).json({ error: "Senha atual incorreta." });
    return;
  }
  await db
    .update(centralUsersTable)
    .set({ passwordHash: hashPassword(newPassword), updatedAt: new Date() })
    .where(eq(centralUsersTable.id, user.id));
  invalidateUserCache(user.id);
  logEvent({ module: "auth", message: `Senha alterada por ${user.email}` });
  res.json({ ok: true });
});

router.post("/logout", authMiddleware, (_req, res) => {
  // Token é stateless (TTL 8h); logout é responsabilidade do cliente.
  res.json({ ok: true });
});

export default router;
