/**
 * Expurgo/anonimização de retenção LGPD (PRD-12) — DRY-RUN por padrão.
 *
 * Só altera dados com a DUPLA TRAVA: `RETENTION_APPLY=1` no ambiente E `--apply`
 * no argumento. Sem os dois, apenas reporta contagens (SELECT count), sem tocar
 * em nada. NUNCA é chamado automaticamente (não entra em scheduler/boot) — é
 * ação MANUAL na VPS, sob revisão humana, com backup recente (PRD-09).
 *
 * Uso (VPS):
 *   docker compose exec -T api node dist/scripts/retentionSweep.mjs            # dry-run
 *   RETENTION_APPLY=1 ... api node dist/scripts/retentionSweep.mjs --apply     # expurgo real (revisado)
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { planRetention, type RetentionAction } from "../lib/dataRetention.js";

async function countAffected(a: RetentionAction): Promise<number> {
  const res = await db.execute(
    sql`SELECT count(*)::int AS n FROM ${sql.identifier(a.table)} WHERE ${sql.identifier(a.ageColumn)} < ${a.cutoff}`,
  );
  const rows = (res as unknown as { rows?: Array<{ n: number }> }).rows ?? [];
  return rows[0]?.n ?? 0;
}

async function applyAction(a: RetentionAction): Promise<void> {
  if (a.mode === "anonymize" && a.columns?.length) {
    const sets = a.columns.map((c) => sql`${sql.identifier(c)} = NULL`);
    await db.execute(
      sql`UPDATE ${sql.identifier(a.table)} SET ${sql.join(sets, sql`, `)} WHERE ${sql.identifier(a.ageColumn)} < ${a.cutoff}`,
    );
  } else if (a.mode === "delete") {
    await db.execute(
      sql`DELETE FROM ${sql.identifier(a.table)} WHERE ${sql.identifier(a.ageColumn)} < ${a.cutoff}`,
    );
  }
}

async function main(): Promise<void> {
  // DUPLA TRAVA: só altera dados com env RETENTION_APPLY=1 E argumento --apply.
  const apply = process.env["RETENTION_APPLY"] === "1" && process.argv.includes("--apply");
  const actions = planRetention(new Date());

  logger.info(
    { mode: apply ? "APPLY" : "DRY-RUN" },
    apply
      ? "retentionSweep: APPLY (dupla trava ativa) — vai ALTERAR dados"
      : "retentionSweep: DRY-RUN — nenhuma alteração (use RETENTION_APPLY=1 + --apply p/ expurgar)",
  );
  process.stdout.write("table | mode | columns | cutoff | rowsThatWouldChange\n");

  for (const a of actions) {
    const n = await countAffected(a);
    process.stdout.write(`${a.table} | ${a.mode} | ${a.columns?.join(",") ?? "-"} | ${a.cutoff.toISOString()} | ${n}\n`);
    if (!apply) continue;
    await applyAction(a);
    logger.warn({ table: a.table, mode: a.mode, rows: n }, "retentionSweep: APPLY executado");
  }

  process.exit(0);
}

void main().catch((err) => {
  logger.error({ err }, "retentionSweep falhou");
  process.exit(1);
});
