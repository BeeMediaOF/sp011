import { Router } from "express";
import { db, centralEventLogsTable } from "@workspace/central-db";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { authMiddleware } from "../middlewares/auth.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  const module_ = typeof req.query.module === "string" ? req.query.module : undefined;
  const level = typeof req.query.level === "string" ? req.query.level : undefined;
  const limit = Math.min(Number(req.query.limit) || 200, 1000);

  const conditions: SQL[] = [];
  if (module_) conditions.push(eq(centralEventLogsTable.module, module_));
  if (level) conditions.push(eq(centralEventLogsTable.level, level));

  const rows = await db
    .select()
    .from(centralEventLogsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(centralEventLogsTable.ts))
    .limit(limit);

  res.json(rows);
});

export default router;
