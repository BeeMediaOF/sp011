/**
 * Migração idempotente (PRD-01b/F16): cifra os `twoFactorSecret` que ainda
 * estão em TEXTO PURO no banco. Roda no boot de cada blog; só escreve enquanto
 * houver valor em claro (não re-cifra o que já tem o prefixo `enc:v1:`).
 */
import { db, usersTable } from "@workspace/db";
import { isNotNull, eq } from "drizzle-orm";
import { encryptSecret, isEncrypted } from "./crypto.js";
import { logger } from "./logger.js";

export async function migrateTwoFactorSecrets(): Promise<void> {
  const rows = await db
    .select({ id: usersTable.id, secret: usersTable.twoFactorSecret })
    .from(usersTable)
    .where(isNotNull(usersTable.twoFactorSecret));

  let migrated = 0;
  for (const r of rows) {
    if (!r.secret || isEncrypted(r.secret)) continue;
    await db.update(usersTable).set({ twoFactorSecret: encryptSecret(r.secret) }).where(eq(usersTable.id, r.id));
    migrated++;
  }
  if (migrated > 0) logger.info({ migrated }, "migrateTwoFactorSecrets: segredos TOTP cifrados at-rest");
}
