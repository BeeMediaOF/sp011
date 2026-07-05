import { randomUUID } from "node:crypto";
import { Router } from "express";
import { db, distributionRulesTable, type DistributionRuleRow } from "@workspace/central-db";
import { desc, eq } from "drizzle-orm";
import { authMiddleware } from "../middlewares/auth.js";

const router = Router();
router.use(authMiddleware);

function cleanArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out = v.map((s) => String(s).trim()).filter(Boolean);
  return out.length ? out : null;
}

router.get("/", async (req, res) => {
  const blogId = typeof req.query.blogId === "string" ? req.query.blogId : undefined;
  const rows = await db
    .select()
    .from(distributionRulesTable)
    .where(blogId ? eq(distributionRulesTable.blogId, blogId) : undefined)
    .orderBy(desc(distributionRulesTable.priority), desc(distributionRulesTable.createdAt));
  res.json(rows);
});

router.post("/", async (req, res) => {
  const body = (req.body ?? {}) as Partial<DistributionRuleRow>;
  if (!body.blogId || !body.name?.trim()) {
    res.status(400).json({ error: "blogId e name são obrigatórios." });
    return;
  }
  const [row] = await db
    .insert(distributionRulesTable)
    .values({
      id: randomUUID(),
      blogId: body.blogId,
      name: body.name.trim(),
      isActive: body.isActive ?? true,
      priority: body.priority ?? 0,
      categoriesInclude: cleanArray(body.categoriesInclude),
      categoriesExclude: cleanArray(body.categoriesExclude),
      sourcesInclude: cleanArray(body.sourcesInclude),
      sourcesExclude: cleanArray(body.sourcesExclude),
      keywordsInclude: cleanArray(body.keywordsInclude),
      keywordsExclude: cleanArray(body.keywordsExclude),
      targetCategory: body.targetCategory?.trim() || null,
      targetTag: body.targetTag?.trim() || null,
    })
    .returning();
  res.status(201).json(row);
});

router.patch("/:id", async (req, res) => {
  const body = (req.body ?? {}) as Partial<DistributionRuleRow>;
  delete (body as Record<string, unknown>)["id"];
  const set: Partial<DistributionRuleRow> = { ...body, updatedAt: new Date() };
  for (const key of [
    "categoriesInclude", "categoriesExclude", "sourcesInclude",
    "sourcesExclude", "keywordsInclude", "keywordsExclude",
  ] as const) {
    if (key in body) set[key] = cleanArray(body[key]);
  }
  const [row] = await db
    .update(distributionRulesTable)
    .set(set)
    .where(eq(distributionRulesTable.id, req.params.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Regra não encontrada." });
    return;
  }
  res.json(row);
});

router.delete("/:id", async (req, res) => {
  const [row] = await db
    .delete(distributionRulesTable)
    .where(eq(distributionRulesTable.id, req.params.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Regra não encontrada." });
    return;
  }
  res.json({ ok: true });
});

export default router;
