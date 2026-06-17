import { db, auditLogsTable, securityLogsTable } from "@workspace/db";
import { logger } from "./logger.js";

export interface AuditParams {
  userId?: number;
  userEmail?: string;
  action: string;
  module: string;
  description: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export async function logAudit(params: AuditParams): Promise<void> {
  try {
    await db.insert(auditLogsTable).values({
      userId: params.userId ?? null,
      userEmail: params.userEmail ?? null,
      action: params.action,
      module: params.module,
      description: params.description,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent?.slice(0, 512) ?? null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to write audit log");
  }
}

export interface SecurityParams {
  userId?: number;
  userEmail?: string;
  eventType: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  ipAddress?: string;
  userAgent?: string;
  route?: string;
  payloadSummary?: string;
}

export async function logSecurity(params: SecurityParams): Promise<void> {
  try {
    await db.insert(securityLogsTable).values({
      userId: params.userId ?? null,
      userEmail: params.userEmail ?? null,
      eventType: params.eventType,
      severity: params.severity,
      description: params.description,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent?.slice(0, 512) ?? null,
      route: params.route ?? null,
      payloadSummary: params.payloadSummary ?? null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to write security log");
  }
}

export function getClientIp(req: { ip?: string; headers: Record<string, string | string[] | undefined> }): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
    return first?.trim() ?? req.ip ?? "unknown";
  }
  return req.ip ?? "unknown";
}
