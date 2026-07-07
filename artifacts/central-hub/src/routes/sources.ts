import { randomUUID } from "node:crypto";
import { Router } from "express";
import { db, centralSourcesTable, type CentralSourceRow } from "@workspace/central-db";
import { desc, eq } from "drizzle-orm";
import { authMiddleware } from "../middlewares/auth.js";
import { collectSourceById, runCollectorCycle } from "../services/collector.js";
import { logEvent } from "../lib/eventLog.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (_req, res) => {
  const rows = await db.select().from(centralSourcesTable).orderBy(desc(centralSourcesTable.createdAt));
  res.json(rows);
});

router.post("/", async (req, res) => {
  const body = (req.body ?? {}) as Partial<CentralSourceRow>;
  if (!body.name?.trim() || !body.url?.trim()) {
    res.status(400).json({ error: "name e url são obrigatórios." });
    return;
  }
  const [row] = await db
    .insert(centralSourcesTable)
    .values({
      id: randomUUID(),
      name: body.name.trim(),
      url: body.url.trim(),
      category: body.category?.trim() || "geral",
      active: body.active ?? true,
      scheduleHours: body.scheduleHours ?? 0,
      fetchLimit: body.fetchLimit ?? null,
      giveCredit: body.giveCredit ?? false,
      customPrompt: body.customPrompt ?? null,
      language: body.language === "en" ? "en" : "pt-BR",
    })
    .returning();
  logEvent({ module: "api", refType: "source", refId: row!.id, message: `Fonte cadastrada: ${row!.name}` });
  res.status(201).json(row);
});

router.patch("/:id", async (req, res) => {
  const body = (req.body ?? {}) as Partial<CentralSourceRow>;
  delete (body as Record<string, unknown>)["id"];
  if (body.language !== undefined) body.language = body.language === "en" ? "en" : "pt-BR";
  const [row] = await db
    .update(centralSourcesTable)
    .set(body)
    .where(eq(centralSourcesTable.id, req.params.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Fonte não encontrada." });
    return;
  }
  res.json(row);
});

router.delete("/:id", async (req, res) => {
  const [row] = await db
    .delete(centralSourcesTable)
    .where(eq(centralSourcesTable.id, req.params.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Fonte não encontrada." });
    return;
  }
  res.json({ ok: true });
});

/** Coleta imediata de uma fonte (ignora scheduleHours/janela). */
router.post("/:id/run", async (req, res) => {
  try {
    const collected = await collectSourceById(req.params.id);
    res.json({ ok: true, collected });
  } catch (err) {
    res.status(404).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

/** Dispara um ciclo completo agora (ignora intervalo/janela, respeita orçamento). */
router.post("/run-cycle", async (_req, res) => {
  const result = await runCollectorCycle(true);
  res.json({ ok: true, ...result });
});

export default router;
