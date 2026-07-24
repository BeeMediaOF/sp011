import { pgTable, serial, text, integer, timestamp, pgEnum, index, boolean } from "drizzle-orm/pg-core";

export const analyticsEventTypeEnum = pgEnum("analytics_event_type", [
  "pageview", "read", "category", "scroll", "share",
]);
export const analyticsDeviceEnum = pgEnum("analytics_device", [
  "mobile", "desktop", "tablet",
]);

export const analyticsEventsTable = pgTable("analytics_events", {
  id:          serial("id").primaryKey(),
  type:        analyticsEventTypeEnum("type").notNull(),
  path:        text("path").notNull(),
  title:       text("title"),
  category:    text("category"),
  articleId:   text("article_id"),
  sessionId:   text("session_id").notNull(),
  duration:    integer("duration"),
  device:      analyticsDeviceEnum("device").notNull(),
  ts:          timestamp("ts", { withTimezone: true }).notNull(),
  ua:          text("ua"),
  referrer:    text("referrer"),
  scrollDepth: integer("scroll_depth"),
  platform:    text("platform"),
  city:        text("city"),
  region:      text("region"),
  // Visitante anônimo persistente (localStorage, pós-consentimento LGPD).
  visitorId:   text("visitor_id"),
  // Sinais crus de origem — o canal classificado continua em `referrer`.
  utmSource:   text("utm_source"),
  utmMedium:   text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  refHost:     text("ref_host"),
  // Presença de click-id na URL de entrada (só o booleano; o valor do id nunca
  // sai do navegador). NULL = anterior à regra (PRD 05) OU linha não-first-touch.
  gclid:       boolean("gclid"),
  fbclid:      boolean("fbclid"),
  // Tráfego interno (admin/dev/IP configurado): gravado para auditoria,
  // excluído de todas as agregações públicas.
  isInternal:  boolean("is_internal").notNull().default(false),
  // Derivados do user-agent no ingest (parse próprio, sem dependência).
  browser:     text("browser"),
  os:          text("os"),
}, (t) => [
  index("analytics_ts_idx").on(t.ts),
  index("analytics_type_ts_idx").on(t.type, t.ts),
  index("analytics_session_idx").on(t.sessionId),
  index("analytics_article_idx").on(t.articleId),
  index("analytics_visitor_ts_idx").on(t.visitorId, t.ts),
]);

export type AnalyticsEventRow    = typeof analyticsEventsTable.$inferSelect;
export type AnalyticsEventInsert = typeof analyticsEventsTable.$inferInsert;
