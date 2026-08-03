import { pgTable, serial, text, jsonb, timestamp } from "drizzle-orm/pg-core";

/**
 * Molduras (templates) de e-mail da newsletter, ISOLADAS por blog
 * (PRD-NEWSLETTER-01 — evolução pós-MVP). Uma moldura = a estrutura VISUAL que
 * envolve o corpo de cada campanha (cabeçalho de marca + rodapé), definida por
 * campos estruturados (cores/logo/textos) e/ou HTML próprio de cabeçalho/rodapé.
 * O CORPO da campanha NÃO fica aqui — continua no editor da campanha.
 *
 * A moldura "Padrão" é a de `site_settings.newsletterTemplate` (editada em
 * Configurações); esta tabela guarda as molduras EXTRAS, nomeadas. Cada campanha
 * escolhe uma via `newsletter_campaigns.template_id` (NULL = Padrão).
 *
 * `config` espelha a interface `NewsletterTemplate` do api-server (aqui tipado
 * como objeto livre para o lib/db não depender do app). A DDL real vem de
 * ensureSchema.ts (CREATE TABLE IF NOT EXISTS) — manter os dois em sincronia.
 */
export const newsletterTemplatesTable = pgTable("newsletter_templates", {
  id:        serial("id").primaryKey(),
  name:      text("name").notNull(),
  // Config da moldura (JSON = NewsletterTemplate: cores/logo/textos + headerHtml/footerHtml).
  config:    jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type NewsletterTemplateRow    = typeof newsletterTemplatesTable.$inferSelect;
export type NewsletterTemplateInsert = typeof newsletterTemplatesTable.$inferInsert;
