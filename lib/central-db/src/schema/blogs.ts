import { pgTable, text, boolean, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

/** Categoria da taxonomia de um blog (slug do menu + dica para a IA). */
export interface BlogCategory {
  slug: string;
  /** Dica opcional para a classificação por IA (ex.: "american football"). */
  hint?: string;
}

/**
 * Blogs conectados ao painel central (modelo: `social_connections` do blog).
 *
 * O central guarda SOMENTE dados de integração: URL da API + segredo de
 * ingestão criptografado (AES-256-GCM via news-engine/crypto). Credenciais de
 * banco de dados dos blogs NUNCA entram aqui — princípio de isolamento.
 */
export const blogsTable = pgTable("blogs", {
  id:              text("id").primaryKey(),
  name:            text("name").notNull(),
  domain:          text("domain"),
  /** Base da API do blog, ex.: https://blog.com.br/api */
  apiUrl:          text("api_url").notNull(),
  /** Segredo de ingestão (HMAC) criptografado at-rest. */
  ingestSecretEnc: text("ingest_secret_enc"),
  isActive:        boolean("is_active").notNull().default(true),
  /** true → entregas ficam em `awaiting_approval` até revisão no central. */
  requireApproval: boolean("require_approval").notNull().default(false),
  /** Como o blog recebe: publica direto ou entra como rascunho local. */
  deliveryMode:    text("delivery_mode").notNull().default("publish"), // 'publish' | 'draft'
  maxPostsPerDay:  integer("max_posts_per_day"),
  minMinutesBetweenPosts: integer("min_minutes_between_posts"),
  /** Idioma do público do blog ("pt-BR" | "en"): difere do idioma da notícia → tradução. */
  language:        text("language").notNull().default("pt-BR"),
  /** Taxonomia do blog p/ classificação por IA (null = sem classificação). */
  categories:      jsonb("categories").$type<BlogCategory[]>(),
  status:          text("status").notNull().default("offline"), // 'online' | 'offline' | 'error'
  lastSeenAt:      timestamp("last_seen_at", { withTimezone: true }),
  lastError:       text("last_error"),
  notes:           text("notes"),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BlogRow    = typeof blogsTable.$inferSelect;
export type BlogInsert = typeof blogsTable.$inferInsert;
