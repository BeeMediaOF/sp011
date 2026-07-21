/**
 * Nonce anti-replay do ingest (PRD-14): a assinatura de uma requisição de
 * ingest só vale UMA vez. Vive aqui (no api-server do blog receptor) e NÃO em
 * `signing.ts` (módulo PURO compartilhado com o central-hub, sem banco).
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger.js";
import type { NonceStore } from "./ingestNonceCore.js";

export type { NonceStore } from "./ingestNonceCore.js";

/** Store em banco: INSERT ... ON CONFLICT DO NOTHING → atômico, sem TOCTOU. */
export const dbNonceStore: NonceStore = {
  async consume(signature: string): Promise<boolean> {
    const r = await db.execute(
      sql`INSERT INTO ingest_nonces (signature) VALUES (${signature}) ON CONFLICT (signature) DO NOTHING`,
    );
    const rowCount = (r as unknown as { rowCount?: number | null }).rowCount ?? 0;
    return rowCount === 1;
  },
};

/** Limpeza best-effort dos nonces antigos (TTL 600s ≥ 2× a janela de 300s). */
export function cleanupNonces(): void {
  void db
    .execute(sql`DELETE FROM ingest_nonces WHERE seen_at < now() - interval '600 seconds'`)
    .catch((err) => logger.warn({ err }, "cleanupNonces falhou (não-fatal)"));
}
