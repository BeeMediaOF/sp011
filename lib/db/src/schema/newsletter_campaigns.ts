import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Campanhas de newsletter, ISOLADAS por blog (PRD-NEWSLETTER-01, Fase 3). Uma
 * campanha = 1 assunto + 1 corpo HTML (editor de texto rico, já sanitizado). Ao
 * disparar, o produtor faz fan-out para `newsletter_send_queue` (uma linha por
 * inscrito `confirmed`); o worker envia e atualiza os contadores aqui.
 *
 * A DDL real é criada por ensureSchema.ts no boot (CREATE TABLE IF NOT EXISTS) —
 * este schema Drizzle serve ao query builder tipado. Manter os dois em sincronia.
 */
export const newsletterCampaignsTable = pgTable("newsletter_campaigns", {
  id:          serial("id").primaryKey(),
  subject:     text("subject").notNull(),
  // Corpo da campanha (HTML do editor, SANITIZADO antes de gravar). O e-mail
  // final = shell de marca do blog + este corpo + rodapé de descadastro.
  bodyHtml:    text("body_html").notNull().default(""),
  // 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'canceled'.
  status:      text("status").notNull().default("draft"),
  // Quando disparar (NULL = rascunho). Futuro = agendada; venceu = o worker
  // promove a 'sending' e o produtor faz o fan-out.
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  sentAt:      timestamp("sent_at", { withTimezone: true }),
  // Estatísticas: total enfileirado + efetivados + falhas terminais.
  recipients:  integer("recipients").notNull().default(0),
  sentCount:   integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("newsletter_campaign_status_idx").on(t.status),
]);

export type NewsletterCampaignRow    = typeof newsletterCampaignsTable.$inferSelect;
export type NewsletterCampaignInsert = typeof newsletterCampaignsTable.$inferInsert;
