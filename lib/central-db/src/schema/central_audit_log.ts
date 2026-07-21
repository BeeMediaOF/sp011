import { pgTable, serial, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";

/**
 * Trilha de auditoria de ações privilegiadas do painel central (PRD-02).
 * Registra QUEM executou cada ação sensível — fecha o repúdio (STRIDE-R) do
 * AP-5 ("sem auditoria de quem fez"). É ADICIONAL ao `central_event_logs`
 * (eventos de pipeline). INVARIANTE: a coluna `meta` guarda SOMENTE fatos
 * não-sensíveis (nomes de chaves, hint de 4 chars, ids) — NUNCA valores de
 * segredo (ingest secret, chaves de IA, tokens Meta/Buffer, hashes).
 */
export const centralAuditLogTable = pgTable("central_audit_log", {
  id:         serial("id").primaryKey(),
  ts:         timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  userId:     text("user_id"),
  userEmail:  text("user_email"),
  action:     text("action").notNull(), // 'blog.rotate_secret' | 'settings.update' | 'ai_key.add' ...
  targetType: text("target_type"),       // 'blog' | 'settings' | 'ai_key' | 'news' | 'social_connection'
  targetId:   text("target_id"),
  meta:       jsonb("meta").$type<Record<string, unknown>>(),
}, (t) => [
  index("central_audit_log_ts_idx").on(t.ts),
  index("central_audit_log_user_ts_idx").on(t.userId, t.ts),
]);

export type CentralAuditLogRow    = typeof centralAuditLogTable.$inferSelect;
export type CentralAuditLogInsert = typeof centralAuditLogTable.$inferInsert;
