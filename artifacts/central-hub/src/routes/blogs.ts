import { randomBytes, randomUUID } from "node:crypto";
import { Router } from "express";
import { db, blogsTable, type BlogRow } from "@workspace/central-db";
import { encryptSecret } from "@workspace/news-engine";
import { desc, eq } from "drizzle-orm";
import { authMiddleware } from "../middlewares/auth.js";
import { testBlogConnection } from "../services/blogClient.js";
import { logEvent } from "../lib/eventLog.js";

const router = Router();
router.use(authMiddleware);

/** Nunca expõe o segredo (nem criptografado) nas respostas. */
function sanitize(blog: BlogRow) {
  const { ingestSecretEnc, ...rest } = blog;
  return { ...rest, hasSecret: !!ingestSecretEnc };
}

function newSecret(): string {
  return randomBytes(32).toString("hex");
}

router.get("/", async (_req, res) => {
  const rows = await db.select().from(blogsTable).orderBy(desc(blogsTable.createdAt));
  res.json(rows.map(sanitize));
});

router.post("/", async (req, res) => {
  const body = (req.body ?? {}) as Partial<BlogRow> & { name?: string; apiUrl?: string };
  if (!body.name?.trim() || !body.apiUrl?.trim()) {
    res.status(400).json({ error: "name e apiUrl são obrigatórios." });
    return;
  }
  if (!/^https?:\/\//i.test(body.apiUrl)) {
    res.status(400).json({ error: "apiUrl deve começar com http(s)://" });
    return;
  }

  const secret = newSecret();
  const id = randomUUID();
  const [row] = await db
    .insert(blogsTable)
    .values({
      id,
      name: body.name.trim(),
      domain: body.domain?.trim() || null,
      apiUrl: body.apiUrl.trim().replace(/\/+$/, ""),
      ingestSecretEnc: encryptSecret(secret),
      isActive: body.isActive ?? true,
      requireApproval: body.requireApproval ?? false,
      deliveryMode: body.deliveryMode === "draft" ? "draft" : "publish",
      maxPostsPerDay: body.maxPostsPerDay ?? null,
      minMinutesBetweenPosts: body.minMinutesBetweenPosts ?? null,
      notes: body.notes ?? null,
    })
    .returning();

  logEvent({ module: "api", refType: "blog", refId: id, message: `Blog cadastrado: ${body.name}` });
  // O segredo é exibido UMA única vez — o painel deve avisar o operador.
  res.status(201).json({ blog: sanitize(row!), ingestSecret: secret });
});

router.patch("/:id", async (req, res) => {
  const body = (req.body ?? {}) as Partial<BlogRow>;
  // Segredo só muda por rotate-secret; nunca por PATCH direto.
  delete (body as Record<string, unknown>)["ingestSecretEnc"];
  delete (body as Record<string, unknown>)["id"];
  if (body.apiUrl && !/^https?:\/\//i.test(body.apiUrl)) {
    res.status(400).json({ error: "apiUrl deve começar com http(s)://" });
    return;
  }
  if (body.apiUrl) body.apiUrl = body.apiUrl.trim().replace(/\/+$/, "");

  const [row] = await db
    .update(blogsTable)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(blogsTable.id, req.params.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Blog não encontrado." });
    return;
  }
  res.json(sanitize(row));
});

router.delete("/:id", async (req, res) => {
  const [row] = await db.delete(blogsTable).where(eq(blogsTable.id, req.params.id)).returning();
  if (!row) {
    res.status(404).json({ error: "Blog não encontrado." });
    return;
  }
  logEvent({ module: "api", refType: "blog", refId: row.id, message: `Blog removido: ${row.name}` });
  res.json({ ok: true });
});

router.post("/:id/rotate-secret", async (req, res) => {
  const secret = newSecret();
  const [row] = await db
    .update(blogsTable)
    .set({ ingestSecretEnc: encryptSecret(secret), updatedAt: new Date() })
    .where(eq(blogsTable.id, req.params.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Blog não encontrado." });
    return;
  }
  logEvent({ module: "auth", refType: "blog", refId: row.id, message: `Segredo rotacionado: ${row.name}` });
  res.json({ blog: sanitize(row), ingestSecret: secret });
});

router.post("/:id/test", async (req, res) => {
  const rows = await db.select().from(blogsTable).where(eq(blogsTable.id, req.params.id)).limit(1);
  const blog = rows[0];
  if (!blog) {
    res.status(404).json({ error: "Blog não encontrado." });
    return;
  }
  const result = await testBlogConnection(blog);
  logEvent({
    module: "api", refType: "blog", refId: blog.id,
    level: result.ok ? "info" : "warn",
    message: `Teste de conexão ${result.ok ? "OK" : "FALHOU"}: ${blog.name}`,
    meta: { httpStatus: result.httpStatus, error: result.error },
  });
  res.json(result);
});

export default router;
