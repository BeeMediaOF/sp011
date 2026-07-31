import { pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Inscritos da newsletter, ISOLADOS por blog (uma tabela no banco de cada blog —
 * PRD-NEWSLETTER-01, decisão Fase 0). Antes da newsletter, o e-mail capturado só
 * caía efêmero em behavior_events.value (métrica); aqui ele é persistido com
 * prova de consentimento LGPD (IP/UA/origem/timestamp) e double opt-in.
 *
 * A DDL real é criada por ensureSchema.ts no boot (CREATE TABLE IF NOT EXISTS) —
 * este schema Drizzle serve ao query builder tipado. Manter os dois em sincronia.
 */
export const newsletterSubscribersTable = pgTable("newsletter_subscribers", {
  id:               serial("id").primaryKey(),
  // Sempre normalizado (lowercase/trim) ANTES de gravar — UNIQUE no valor normalizado.
  email:            text("email").notNull().unique(),
  // 'pending' | 'confirmed' | 'unsubscribed' | 'bounced' | 'complained'.
  // Só 'confirmed' recebe campanha; unsubscribed/bounced/complained = supressão.
  status:           text("status").notNull().default("pending"),
  // Token de single-use do double opt-in (limpo ao confirmar).
  confirmToken:     text("confirm_token"),
  confirmSentAt:    timestamp("confirm_sent_at", { withTimezone: true }),
  confirmedAt:      timestamp("confirmed_at", { withTimezone: true }),   // prova do opt-in
  // Token perene do link de descadastro (todo e-mail carrega o do próprio inscrito).
  unsubscribeToken: text("unsubscribe_token"),
  unsubscribedAt:   timestamp("unsubscribed_at", { withTimezone: true }),
  consentIp:        text("consent_ip"),          // prova LGPD
  consentUserAgent: text("consent_user_agent"),
  source:           text("source"),              // 'footer' | 'home_block'
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("newsletter_sub_status_idx").on(t.status),
  index("newsletter_sub_confirm_token_idx").on(t.confirmToken),
  index("newsletter_sub_unsub_token_idx").on(t.unsubscribeToken),
]);

export type NewsletterSubscriberRow    = typeof newsletterSubscribersTable.$inferSelect;
export type NewsletterSubscriberInsert = typeof newsletterSubscribersTable.$inferInsert;
