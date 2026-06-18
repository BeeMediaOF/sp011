import { Router } from "express";
import { db, contactMessagesTable } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { authMiddleware, requireAdmin } from "../middlewares/auth.js";
import { getClientIp } from "../lib/audit.js";

const router = Router();

/** POST /api/messages — send contact message (public) */
router.post("/", async (req, res) => {
  const { name, email, subject, message } = req.body as {
    name?: string; email?: string; subject?: string; message?: string;
  };
  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    res.status(400).json({ ok: false, error: "name, email e message são obrigatórios" });
    return;
  }
  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ ok: false, error: "E-mail inválido" });
    return;
  }
  try {
    await db.insert(contactMessagesTable).values({
      name:      name.trim().slice(0, 200),
      email:     email.trim().toLowerCase().slice(0, 200),
      subject:   subject?.trim().slice(0, 500) ?? null,
      message:   message.trim().slice(0, 10_000),
      ipAddress: getClientIp(req as Parameters<typeof getClientIp>[0]),
      userAgent: (typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : "").slice(0, 512),
    });
    req.log.info({ name, email, subject }, "Contact message saved");
    res.json({ ok: true, message: "Mensagem enviada com sucesso! Em breve entraremos em contato." });
  } catch (err) {
    req.log.error({ err }, "Failed to save contact message");
    res.status(500).json({ ok: false, error: "Erro ao enviar mensagem. Tente novamente." });
  }
});

/** GET /api/admin/messages — list contact messages (admin only) */
router.get("/admin", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const limit  = Math.min(parseInt((req.query["limit"]  as string) ?? "50", 10), 200);
    const offset = parseInt((req.query["offset"] as string) ?? "0", 10);
    const unreadOnly = req.query["unread"] === "true";

    const where = unreadOnly ? eq(contactMessagesTable.read, false) : undefined;
    const msgs = await db.select().from(contactMessagesTable)
      .where(where)
      .orderBy(desc(contactMessagesTable.createdAt))
      .limit(limit).offset(offset);
    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` })
      .from(contactMessagesTable).where(where);
    res.json({ messages: msgs, total });
  } catch (err) {
    req.log.error({ err }, "Error fetching contact messages");
    res.status(500).json({ error: "Erro ao buscar mensagens" });
  }
});

/** PUT /api/admin/messages/:id/read — mark as read (admin only) */
router.put("/admin/:id/read", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(String(req.params["id"] ?? 0), 10);
    await db.update(contactMessagesTable).set({ read: true }).where(eq(contactMessagesTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error marking message as read");
    res.status(500).json({ error: "Erro ao atualizar mensagem" });
  }
});

export default router;
