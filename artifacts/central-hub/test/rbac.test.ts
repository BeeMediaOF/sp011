import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { requireCentralRole } from "../src/middlewares/rbac.ts";
import { buildAuditRow } from "../src/lib/auditRow.ts";

/**
 * PRD-02 — RBAC do central + trilha de auditoria. Testa o guard como função
 * pura (req/res/next falsos, sem I/O) e a garantia de que a trilha nunca
 * carrega valor de segredo.
 */
function run(role: string | undefined, ...allowed: string[]): { statusCode: number; nexted: boolean } {
  const mw = requireCentralRole(...allowed);
  let statusCode = 0;
  const res = {
    status(c: number) { statusCode = c; return res; },
    json(_b: unknown) { return res; },
  };
  let nexted = false;
  mw({ centralUserRole: role } as unknown as Request, res as unknown as Response, () => { nexted = true; });
  return { statusCode, nexted };
}

test("requireCentralRole('admin'): operator -> 403, next NAO chamado", () => {
  const r = run("operator", "admin");
  assert.equal(r.statusCode, 403);
  assert.equal(r.nexted, false);
});

test("requireCentralRole('admin'): admin -> next, sem status", () => {
  const r = run("admin", "admin");
  assert.equal(r.nexted, true);
  assert.equal(r.statusCode, 0);
});

test("requireCentralRole('admin'): role undefined/legado -> 403", () => {
  assert.equal(run(undefined, "admin").statusCode, 403);
  assert.equal(run("papel-legado", "admin").statusCode, 403);
});

test("requireCentralRole('admin','operator'): operator -> next", () => {
  assert.equal(run("operator", "admin", "operator").nexted, true);
});

test("buildAuditRow: registra fato/autor e NUNCA valor de segredo", () => {
  const row = buildAuditRow(
    { userId: "u1" },
    { action: "ai_key.add", targetType: "ai_key", meta: { provider: "Gemini", hint: "...1234" } },
  );
  assert.equal(row.userId, "u1");
  assert.equal(row.action, "ai_key.add");
  assert.equal(row.targetType, "ai_key");
  assert.deepEqual(row.meta, { provider: "Gemini", hint: "...1234" });
  assert.ok(!JSON.stringify(row).includes("AIzaSy"), "não deve haver chave crua");
});
