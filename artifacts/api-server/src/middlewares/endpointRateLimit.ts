/**
 * Endpoint-specific rate limiter backed by PostgreSQL.
 * Protects endpoints like /api/publish from bot floods.
 */
import type { Request, Response, NextFunction } from "express";
import { db, endpointRateLimitsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { logSecurity, getClientIp } from "../lib/audit.js";

const LIMIT         = 10;
const WINDOW_MS     = 60_000;        // 1 minute
const BLOCK_MS      = 60 * 60_000;  // 1 hour

/**
 * Returns middleware that rate-limits an endpoint.
 * After LIMIT failures per minute per IP, blocks for 1 hour.
 */
export function endpointRateLimit(endpointName: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ip = getClientIp(req);
    const ua = req.headers["user-agent"] ?? "";
    const now = new Date();

    try {
      // Upsert: increment counter or reset if window expired
      await db
        .insert(endpointRateLimitsTable)
        .values({
          ip,
          endpoint:  endpointName,
          count:     1,
          resetAt:   new Date(Date.now() + WINDOW_MS),
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [endpointRateLimitsTable.ip, endpointRateLimitsTable.endpoint],
          set: {
            count:     sql`CASE WHEN ${endpointRateLimitsTable.resetAt} < NOW() THEN 1 ELSE ${endpointRateLimitsTable.count} + 1 END`,
            resetAt:   sql`CASE WHEN ${endpointRateLimitsTable.resetAt} < NOW() THEN NOW() + INTERVAL '1 minute' ELSE ${endpointRateLimitsTable.resetAt} END`,
            updatedAt: now,
          },
        });

      const [row] = await db
        .select({
          count:        endpointRateLimitsTable.count,
          blockedUntil: endpointRateLimitsTable.blockedUntil,
        })
        .from(endpointRateLimitsTable)
        .where(
          and(
            eq(endpointRateLimitsTable.ip, ip),
            eq(endpointRateLimitsTable.endpoint, endpointName),
          )
        )
        .limit(1);

      if (!row) { next(); return; }

      // Check if currently blocked
      if (row.blockedUntil && row.blockedUntil > now) {
        res.status(429).json({
          ok: false,
          error: "IP bloqueado temporariamente por excesso de requisições. Tente novamente mais tarde.",
        });
        return;
      }

      // Block if over limit
      if (row.count > LIMIT) {
        const blockedUntil = new Date(Date.now() + BLOCK_MS);
        await db
          .update(endpointRateLimitsTable)
          .set({ blockedUntil, updatedAt: now })
          .where(
            and(
              eq(endpointRateLimitsTable.ip, ip),
              eq(endpointRateLimitsTable.endpoint, endpointName),
            )
          );

        await logSecurity({
          eventType: "rate_limit_exceeded",
          severity:  "high",
          description: `IP ${ip} bloqueado por 1h em ${endpointName} após ${row.count} tentativas`,
          ipAddress: ip,
          userAgent:  String(ua),
          route:      endpointName,
        });

        res.status(429).json({
          ok: false,
          error: "Muitas tentativas. IP bloqueado por 1 hora.",
        });
        return;
      }
    } catch {
      // Fail open — don't block legitimate users on DB error
    }

    next();
  };
}
