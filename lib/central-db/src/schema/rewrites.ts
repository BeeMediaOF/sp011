import { pgTable, text, integer, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Reescrita de uma notícia.
 * `blogId = null` → reescrita COMPARTILHADA (única do MVP).
 * `blogId` preenchido → variação por blog (fase posterior, mesma tabela).
 */
export const rewritesTable = pgTable("rewrites", {
  id:             text("id").primaryKey(),
  newsItemId:     text("news_item_id").notNull(),
  blogId:         text("blog_id"),
  title:          text("title"),
  subtitle:       text("subtitle"),
  socialTitle:    text("social_title"),
  socialSummary:  text("social_summary"),
  socialHashtags: text("social_hashtags"),
  contentHtml:    text("content_html"),
  slug:           text("slug"),
  keywords:       text("keywords"),
  provider:       text("provider"),
  model:          text("model"),
  /** Idioma do texto desta reescrita ("pt-BR" | "en"; null = legado pt-BR). */
  language:       text("language"),
  attempts:       integer("attempts").notNull().default(0),
  status:         text("status").notNull().default("ok"), // 'ok' | 'failed'
  errorMessage:   text("error_message"),
  // ── Qualidade IA (PRDs 01–05, 2026-07) — tudo nullable/aditivo ────────────
  /** Versão do prompt de reescrita usado (PROMPT_VERSION do news-engine). */
  promptVersion:  text("prompt_version"),
  /** Nota 0–100 calculada em código (qualityScore — fidelidade dominante). */
  qualityScore:   integer("quality_score"),
  /** % dos termos distintivos do feed cobertos pela reescrita (0–100). */
  fidelityCoverage: integer("fidelity_coverage"),
  /** Números da reescrita ausentes do material da fonte (string[]). */
  inventedNumbers: jsonb("invented_numbers"),
  /** Issues da validação estrutural (ValidationIssue[] do news-engine). */
  validationIssues: jsonb("validation_issues"),
  /** null (sem auditoria) | 'pending' (aguardando IA Auditora — distributor
   *  segura) | 'passed' | 'flagged' (→ revisão humana) | 'rejected'. */
  auditStatus:    text("audit_status"),
  auditNotes:     text("audit_notes"),
  /** Duração da chamada de IA que gerou esta reescrita (ms). */
  durationMs:     integer("duration_ms"),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // No máximo UMA reescrita compartilhada por notícia
  uniqueIndex("rewrites_shared_uniq").on(t.newsItemId).where(sql`blog_id is null`),
  // No máximo UMA variação por (notícia, blog) — guarda de concorrência do localizer
  uniqueIndex("rewrites_variant_uniq").on(t.newsItemId, t.blogId).where(sql`blog_id is not null`),
]);

export type RewriteRow    = typeof rewritesTable.$inferSelect;
export type RewriteInsert = typeof rewritesTable.$inferInsert;
