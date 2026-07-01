/**
 * ensureSchema — migrações idempotentes de coluna aplicadas no boot.
 *
 * O projeto aplica o schema via `drizzle-kit push` manualmente. Para colunas
 * novas e opcionais (que o app sabe degradar com segurança quando ausentes),
 * rodamos um `ADD COLUMN IF NOT EXISTS` no startup — assim um simples rebuild
 * do container já cria a coluna, sem passo manual de migração.
 *
 * IMPORTANTE: precisa rodar ANTES de qualquer `db.select().from(articlesTable)`,
 * porque o Drizzle gera `SELECT ..., social_title` (a coluna está no schema) e
 * isso falharia se a coluna ainda não existisse no banco.
 *
 * É seguro rodar a cada boot: `IF NOT EXISTS` é no-op quando a coluna já existe.
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

export async function ensureSchema(): Promise<void> {
  const statements = [
    // Título compacto para as artes sociais (não afeta o blog).
    sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS social_title text`,
    // Conexões de publicação (WordPress, Site Externo, Blogger). Meta fica em social_accounts.
    sql`CREATE TABLE IF NOT EXISTS social_connections (
      id           text PRIMARY KEY,
      platform     text NOT NULL,
      name         text NOT NULL,
      site_url     text,
      username     text,
      secret_enc   text,
      config       text,
      auto_publish boolean NOT NULL DEFAULT false,
      status       text NOT NULL DEFAULT 'offline',
      last_test_at timestamptz,
      last_error   text,
      is_active    boolean NOT NULL DEFAULT true,
      created_at   timestamptz NOT NULL DEFAULT now(),
      updated_at   timestamptz NOT NULL DEFAULT now()
    )`,
  ];
  for (const stmt of statements) {
    try {
      await db.execute(stmt);
    } catch (err) {
      logger.warn({ err }, "ensureSchema: falha ao aplicar ALTER TABLE (não-fatal)");
    }
  }
  logger.info("ensureSchema: colunas verificadas/criadas");
}
