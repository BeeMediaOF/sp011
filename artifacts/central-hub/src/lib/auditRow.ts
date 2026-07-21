/**
 * Montagem PURA da linha de auditoria (PRD-02) — sem I/O nem runtime de banco
 * (só `import type` de central-db, erasado em runtime), para ser testável sem
 * DB. O `logAudit` (com o insert de fato) vive em `auditLog.ts`.
 *
 * INVARIANTE DE SEGURANÇA: `meta` guarda SOMENTE fatos não-sensíveis (nomes de
 * chaves, hint de 4 chars, ids, nomes de blog) — NUNCA valores de segredo.
 */
import type { CentralAuditLogInsert } from "@workspace/central-db";

export interface AuditInput {
  action: string;
  targetType?: string;
  targetId?: string;
  meta?: Record<string, unknown>;
}

/** Monta a linha de insert da trilha (função PURA, sem I/O — testável). */
export function buildAuditRow(
  actor: { userId?: string; userEmail?: string },
  input: AuditInput,
): CentralAuditLogInsert {
  return {
    userId: actor.userId ?? null,
    userEmail: actor.userEmail ?? null,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    meta: input.meta ?? null,
  };
}
