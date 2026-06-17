import { pgTable, serial, text, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";

export const severityEnum = pgEnum("log_severity", ["low", "medium", "high", "critical"]);

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  userEmail: text("user_email"),
  action: text("action").notNull(),
  module: text("module").notNull(),
  description: text("description").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const securityLogsTable = pgTable("security_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  userEmail: text("user_email"),
  eventType: text("event_type").notNull(),
  severity: severityEnum("severity").notNull().default("low"),
  description: text("description").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  route: text("route"),
  payloadSummary: text("payload_summary"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AuditLog = typeof auditLogsTable.$inferSelect;
export type SecurityLog = typeof securityLogsTable.$inferSelect;
