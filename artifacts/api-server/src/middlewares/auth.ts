import { createHmac, scryptSync, randomBytes, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const SECRET = process.env["SESSION_SECRET"] ?? "dev-secret-brasilia";

export const WEBHOOK_API_KEY = process.env["WEBHOOK_API_KEY"] ?? "";

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
// Payload format: `userId:role:timestamp`

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
    // Timing-safe comparison to prevent timing attacks on HMAC
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

// ─── User status cache (avoids DB lookup on every request) ────────────────────
// TTL: 60s — a blocked user will lose access within 1 minute of being blocked.

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

  // Webhook API key — timing-safe comparison via HMAC (avoids timing attacks)
  if (WEBHOOK_API_KEY) {
    const expectedHmac = createHmac("sha256", SECRET).update(WEBHOOK_API_KEY).digest();
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

  // Check cache first — avoids DB round-trip on every request
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

  // Not in cache — fetch from DB to verify user is still active
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
    // DB failure — fall back to token claims so valid users aren't locked out
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

// ─── Rate limiting (in-memory, per IP) ────────────────────────────────────────
// 10 attempts per minute per IP — resets on server restart (acceptable for MVP)

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || record.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (record.count >= 10) return false;
  record.count++;
  return true;
}

export function resetRateLimit(ip: string): void {
  loginAttempts.delete(ip);
}
