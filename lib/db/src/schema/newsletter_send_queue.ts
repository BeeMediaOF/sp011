import { pgTable, serial, text, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Fila de disparo da newsletter (PRD-NEWSLETTER-01, Fase 3) — ESPELHA
 * `deliveries` da central: tabela-fila Postgres + worker in-process, sem fila
 * externa. Uma linha = um e-mail a enviar a um inscrito.
 *
 * Dois tipos (`kind`):
 *  - 'campaign'     → e-mail de campanha (campaignId aponta a campanha; corpo = shell + bodyHtml).
 *  - 'confirmation' → e-mail de double opt-in (campaignId NULL; corpo = shell + link de confirmação).
 *
 * O worker reclama linhas `pending` vencidas (scheduledAt/nextRetryAt <= now) com
 * claim condicional, envia via SMTP do blog e aplica backoff (1m→5m→15m→1h→6h,
 * 5 tentativas → dead). UNIQUE(campaignId, subscriberId) dá idempotência ao
 * fan-out de campanha; as linhas de confirmação têm campaignId NULL (Postgres
 * trata NULLs como distintos — a idempotência delas é feita no código).
 *
 * A DDL real é criada por ensureSchema.ts no boot. Manter os dois em sincronia.
 */
export const newsletterSendQueueTable = pgTable("newsletter_send_queue", {
  id:           serial("id").primaryKey(),
  // 'campaign' | 'confirmation'.
  kind:         text("kind").notNull().default("campaign"),
  // NULL para 'confirmation'; id da campanha para 'campaign'.
  campaignId:   integer("campaign_id"),
  subscriberId: integer("subscriber_id").notNull(),
  // E-mail no momento do enfileiramento (destino do envio).
  email:        text("email").notNull(),
  // 'pending' | 'sending' | 'sent' | 'failed' | 'dead'.
  status:       text("status").notNull().default("pending"),
  attempts:     integer("attempts").notNull().default(0),
  nextRetryAt:  timestamp("next_retry_at", { withTimezone: true }),
  scheduledAt:  timestamp("scheduled_at", { withTimezone: true }),
  sentAt:       timestamp("sent_at", { withTimezone: true }),
  lastError:    text("last_error"),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("newsletter_queue_campaign_sub_uniq").on(t.campaignId, t.subscriberId),
  index("newsletter_queue_status_retry_idx").on(t.status, t.nextRetryAt),
  index("newsletter_queue_campaign_idx").on(t.campaignId),
]);

export type NewsletterSendQueueRow    = typeof newsletterSendQueueTable.$inferSelect;
export type NewsletterSendQueueInsert = typeof newsletterSendQueueTable.$inferInsert;
