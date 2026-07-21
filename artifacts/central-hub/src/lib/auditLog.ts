/**
 * Trilha de auditoria de ações privilegiadas do central (PRD-02): fire-and-forget
 * (nunca derruba o fluxo que audita), espelhando `eventLog.ts`. Registra QUEM fez
 * cada ação sensível — fecha o repúdio (STRIDE-R) do AP-5.
 *
 * A montagem pura da linha vive em `auditRow.ts` (testável sem DB). Aqui fica o
 * insert (que importa o runtime de central-db).
 */
import type { Request } from "express";
import { db, centralAuditLogTable } from "@workspace/central-db";
import { logger } from "./logger.js";
import { buildAuditRow, type AuditInput } from "./auditRow.js";

export * from "./auditRow.js";

/** Grava uma ação privilegiada na trilha (autor = req.centralUserId). */
export function logAudit(req: Request, input: AuditInput): void {
  const row = buildAuditRow({ userId: req.centralUserId }, input);
  db.insert(centralAuditLogTable)
    .values(row)
    .catch((err) => {
      logger.warn({ err, action: input.action }, "Falha ao gravar audit log (não-fatal)");
    });
}
