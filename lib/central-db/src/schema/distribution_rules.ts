import { pgTable, text, boolean, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";

/**
 * Regras de distribuição por blog.
 * Semântica: a notícia casa com o blog se ALGUMA regra ativa a incluir
 * E NENHUM critério de exclusão bater (avaliado em `distributor.ts`).
 */
export const distributionRulesTable = pgTable("distribution_rules", {
  id:                text("id").primaryKey(),
  blogId:            text("blog_id").notNull(),
  name:              text("name").notNull(),
  isActive:          boolean("is_active").notNull().default(true),
  priority:          integer("priority").notNull().default(0),
  categoriesInclude: jsonb("categories_include").$type<string[]>(),
  categoriesExclude: jsonb("categories_exclude").$type<string[]>(),
  sourcesInclude:    jsonb("sources_include").$type<string[]>(),
  sourcesExclude:    jsonb("sources_exclude").$type<string[]>(),
  keywordsInclude:   jsonb("keywords_include").$type<string[]>(),
  keywordsExclude:   jsonb("keywords_exclude").$type<string[]>(),
  /** Overrides locais do blog ao entregar (categoria/tag do blog de destino). */
  targetCategory:    text("target_category"),
  targetTag:         text("target_tag"),
  createdAt:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:         timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("distribution_rules_blog_idx").on(t.blogId),
]);

export type DistributionRuleRow    = typeof distributionRulesTable.$inferSelect;
export type DistributionRuleInsert = typeof distributionRulesTable.$inferInsert;
