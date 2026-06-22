import { createHmac, scryptSync, randomBytes, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { db, usersTable, loginAttemptsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { store } from "../lib/store.js";

// ─── SESSION_SECRET ───────────────────────────────────────────────────────────
// In production, the secret MUST be set explicitly — a predictable default
// would allow any attacker who knows this source code to forge tokens.
const isProd = process.env["NODE_ENV"] === "production";

if (isProd && !process.env["SESSION_SECRET"]) {
  // Crash immediately — a misconfigured production server is dangerous.
  throw new Error(
    "[FATAL] SESSION_SECRET environment variable is not set. " +
    "Set a random 64-byte hex string before starting the server in production."
  );
}

const SECRET = process.env["SESSION_SECRET"] ?? "dev-secret-brasilia-2024";

if (!isProd && !process.env["SESSION_SECRET"]) {
  // Non-fatal warning in development — loud but doesn't crash the dev workflow.
  console.warn(
    "[WARN] SESSION_SECRET not set — using insecure dev fallback. " +
    "Tokens generated here MUST NOT be used in production."
  );
}

/**
 * Returns the active webhook API key.
 */
function getWebhookApiKey(): string {
  const storeKey = store.getSettings().webhookApiKey;
  if (storeKey) return storeKey;
  return process.env["WEBHOOK_API_KEY"] ?? "";
}

// ─── Password hashing (scrypt) ────────────────────────────────────────────────

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, storedHash] = stored.split(":");
    if (!salt || !storedHash) return false;
    const hash = scryptSync(password, salt, 64);
    const storedBuf = Buffer.from(storedHash, "hex");
    return timingSafeEqual(hash, storedBuf);
  } catch {
    return false;
  }
}

// ─── Token generation / verification ─────────────────────────────────────────

export function generateToken(userId: number, role: string): string {
  const ts = Date.now().toString();
  const payload = `${userId}:${role}:${ts}`;
  const sig = createHmac("sha256", SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export interface TokenPayload {
  userId: number;
  role: string;
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const parts = decoded.split(":");
    if (parts.length < 4) return null;
    const sig = parts[parts.length - 1] as string;
    const payload = parts.slice(0, -1).join(":");
    const expected = createHmac("sha256", SECRET).update(payload).digest("hex");
    if (sig.length !== expected.length) return null;
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const ts = parts[parts.length - 2];
    const age = Date.now() - Number(ts);
    if (age > 604_800_000) return null; // 7 days
    const userId = parseInt(parts[0] as string, 10);
    const role = parts[1] as string;
    if (isNaN(userId)) return null;
    return { userId, role };
  } catch {
    return null;
  }
}

// ─── Extended Request ─────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: number;
      userRole?: string;
      userEmail?: string;
    }
  }
}

// ─── User status cache ────────────────────────────────────────────────────────

interface UserCache { status: string; role: string; cachedAt: number }
const _userCache = new Map<number, UserCache>();
const USER_CACHE_TTL = 60_000;

function getCachedUser(id: number): UserCache | null {
  const entry = _userCache.get(id);
  if (!entry || Date.now() - entry.cachedAt > USER_CACHE_TTL) return null;
  return entry;
}

export function invalidateUserCache(id: number): void {
  _userCache.delete(id);
}

// ─── Auth middleware ──────────────────────────────────────────────────────────

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Não autorizado. Token ausente." });
    return;
  }
  const token = authHeader.slice(7);

  const activeWebhookKey = getWebhookApiKey();
  if (activeWebhookKey) {
    const expectedHmac = createHmac("sha256", SECRET).update(activeWebhookKey).digest();
    const tokenHmac    = createHmac("sha256", SECRET).update(token).digest();
    if (timingSafeEqual(expectedHmac, tokenHmac)) {
      req.userId   = 0;
      req.userRole = "admin";
      next();
      return;
    }
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Token inválido ou expirado." });
    return;
  }

  const cached = getCachedUser(payload.userId);
  if (cached) {
    if (cached.status !== "active") {
      res.status(401).json({ error: "Conta inativa ou bloqueada." });
      return;
    }
    req.userId   = payload.userId;
    req.userRole = cached.role;
    next();
    return;
  }

  try {
    const [user] = await db
      .select({ status: usersTable.status, role: usersTable.role, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, payload.userId));

    if (!user || user.status !== "active") {
      res.status(401).json({ error: "Conta inativa ou bloqueada." });
      return;
    }

    _userCache.set(payload.userId, { status: user.status, role: user.role, cachedAt: Date.now() });
    req.userId    = payload.userId;
    req.userRole  = user.role;
    req.userEmail = user.email;
    next();
  } catch {
    req.userId   = payload.userId;
    req.userRole = payload.role;
    next();
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.userRole !== "admin") {
    res.status(403).json({ error: "Acesso restrito. Você não tem permissão para executar esta ação." });
    return;
  }
  next();
}

// ─── Rate limiting (DB-backed, persistent across restarts) ────────────────────
// 10 attempts per minute per IP. Uses PostgreSQL so it survives restarts and
// works correctly across multiple server instances.

const RATE_LIMIT_MAX     = 10;
const RATE_LIMIT_WINDOW  = 60_000; // 1 minute

export async function checkRateLimit(ip: string): Promise<boolean> {
  const now = new Date();
  try {
    // Upsert: insert new record or increment counter if window still active
    await db
      .insert(loginAttemptsTable)
      .values({ ip, count: 1, resetAt: new Date(Date.now() + RATE_LIMIT_WINDOW), updatedAt: now })
      .onConflictDoUpdate({
        target: loginAttemptsTable.ip,
        set: {
          // If window has expired, reset the counter; otherwise increment
          count: sql`CASE WHEN ${loginAttemptsTable.resetAt} < NOW() THEN 1 ELSE ${loginAttemptsTable.count} + 1 END`,
          resetAt: sql`CASE WHEN ${loginAttemptsTable.resetAt} < NOW() THEN NOW() + INTERVAL '1 minute' ELSE ${loginAttemptsTable.resetAt} END`,
          updatedAt: now,
        },
      });

    const [row] = await db
      .select({ count: loginAttemptsTable.count })
      .from(loginAttemptsTable)
      .where(eq(loginAttemptsTable.ip, ip))
      .limit(1);

    return (row?.count ?? 0) <= RATE_LIMIT_MAX;
  } catch {
    // On DB failure, allow the request (fail open) to avoid locking out users
    return true;
  }
}

export async function resetRateLimit(ip: string): Promise<void> {
  try {
    await db.delete(loginAttemptsTable).where(eq(loginAttemptsTable.ip, ip));
  } catch {
    // Non-critical — ignore
  }
}
