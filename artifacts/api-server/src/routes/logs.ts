import { Router } from "express";
import { desc, and, gte, lte, eq, like, or, sql } from "drizzle-orm";
import { db, auditLogsTable, securityLogsTable } from "@workspace/db";
import { authMiddleware, requireAdmin } from "../middlewares/auth.js";

const router = Router();
router.use(authMiddleware);
router.use(requireAdmin);

function buildDateFilter(table: typeof auditLogsTable | typeof securityLogsTable, from?: string, to?: string) {
  const filters = [];
  if (from) filters.push(gte(table.createdAt, new Date(from)));
  if (to) filters.push(lte(table.createdAt, new Date(`${to}T23:59:59`)));
  return filters;
}

/** GET /api/admin/logs/audit */
router.get("/audit", async (req, res) => {
  try {
    const { from, to, user, action, module: mod, search, limit = "100", offset: off = "0" } = req.query as Record<string, string>;
    const filters = buildDateFilter(auditLogsTable, from, to);
    if (action) filters.push(like(auditLogsTable.action, `%${action}%`));
    if (mod) filters.push(like(auditLogsTable.module, `%${mod}%`));
    if (user) filters.push(like(auditLogsTable.userEmail, `%${user}%`));
    if (search) {
      filters.push(or(
        like(auditLogsTable.description, `%${search}%`),
        like(auditLogsTable.userEmail, `%${search}%`),
        like(auditLogsTable.action, `%${search}%`),
        like(auditLogsTable.ipAddress, `%${search}%`),
      )!);
    }
    const logs = await db.select().from(auditLogsTable)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(parseInt(limit, 10))
      .offset(parseInt(off, 10));
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(auditLogsTable)
      .where(filters.length > 0 ? and(...filters) : undefined);
    res.json({ logs, total: count });
  } catch (err) {
    req.log.error({ err }, "Error fetching audit logs");
    res.status(500).json({ error: "Erro ao buscar logs de auditoria" });
  }
});

/** GET /api/admin/logs/security */
router.get("/security", async (req, res) => {
  try {
    const { from, to, severity, eventType, search, limit = "100", offset: off = "0" } = req.query as Record<string, string>;
    const filters = buildDateFilter(securityLogsTable, from, to);
    if (severity) filters.push(eq(securityLogsTable.severity, severity as "low" | "medium" | "high" | "critical"));
    if (eventType) filters.push(like(securityLogsTable.eventType, `%${eventType}%`));
    if (search) {
      filters.push(or(
        like(securityLogsTable.description, `%${search}%`),
        like(securityLogsTable.userEmail, `%${search}%`),
        like(securityLogsTable.ipAddress, `%${search}%`),
        like(securityLogsTable.route, `%${search}%`),
      )!);
    }
    const logs = await db.select().from(securityLogsTable)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(securityLogsTable.createdAt))
      .limit(parseInt(limit, 10))
      .offset(parseInt(off, 10));
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(securityLogsTable)
      .where(filters.length > 0 ? and(...filters) : undefined);
    res.json({ logs, total: count });
  } catch (err) {
    req.log.error({ err }, "Error fetching security logs");
    res.status(500).json({ error: "Erro ao buscar logs de segurança" });
  }
});

/** GET /api/admin/logs/stats */
router.get("/stats", async (req, res) => {
  try {
    const since24h = new Date(Date.now() - 86_400_000);
    const [{ failedLogins }] = await db.select({ failedLogins: sql<number>`count(*)::int` })
      .from(securityLogsTable)
      .where(and(eq(securityLogsTable.eventType, "failed_login"), gte(securityLogsTable.createdAt, since24h)));
    const [{ blocked }] = await db.select({ blocked: sql<number>`count(*)::int` })
      .from(securityLogsTable)
      .where(and(eq(securityLogsTable.eventType, "account_locked"), gte(securityLogsTable.createdAt, since24h)));
    const [{ criticalEvents }] = await db.select({ criticalEvents: sql<number>`count(*)::int` })
      .from(securityLogsTable)
      .where(and(eq(securityLogsTable.severity, "critical"), gte(securityLogsTable.createdAt, since24h)));
    const [lastAdminAudit] = await db.select().from(auditLogsTable)
      .where(eq(auditLogsTable.action, "login"))
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(1);
    res.json({
      failedLoginsLast24h: failedLogins,
      blockedAccessLast24h: blocked,
      criticalEventsLast24h: criticalEvents,
      lastAdminLogin: lastAdminAudit?.createdAt ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching log stats");
    res.status(500).json({ error: "Erro ao buscar estatísticas" });
  }
});

export default router;
