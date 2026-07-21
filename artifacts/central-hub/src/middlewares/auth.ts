/**
 * Autenticação do painel central — mesmo esquema do blog (token próprio
 * HMAC-SHA256 com TTL de 8h + senhas scrypt), SEM o ramo de webhook key:
 * a única credencial máquina-a-máquina do sistema vive nos BLOGS (ingest).
 */
import { createHmac, scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { db, centralUsersTable } from "@workspace/central-db";
import { eq } from "drizzle-orm";

const isProd = process.env["NODE_ENV"] === "production";

if (isProd && !process.env["SESSION_SECRET"]) {
  throw new Error(
    "[FATAL] SESSION_SECRET não definida para o central-hub. " +
      "Defina um segredo próprio (diferente do blog) antes de subir em produção.",
  );
}

const SECRET = process.env["SESSION_SECRET"] ?? "dev-secret-central-2026";

if (!isProd && !process.env["SESSION_SECRET"]) {
  console.warn("[WARN] SESSION_SECRET não definida — usando fallback de dev do central-hub.");
}

// ─── Senhas (scrypt, mesmo formato do blog) ───────────────────────────────────

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

// ─── Token (HMAC-SHA256, 8h) ──────────────────────────────────────────────────
// Payload `${userId}:${role}:${ts}` — userId é uuid (sem ":"), então o parse
// por split continua seguro.

const TOKEN_TTL_MS = 28_800_000; // 8h

export function generateToken(userId: string, role: string): string {
  const ts = Date.now().toString();
  const payload = `${userId}:${role}:${ts}`;
  const sig = createHmac("sha256", SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export interface TokenPayload {
  userId: string;
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
    if (!Number.isFinite(Number(ts)) || age > TOKEN_TTL_MS) return null;
    const userId = parts[0] as string;
    const role = parts[1] as string;
    if (!userId) return null;
    return { userId, role };
  } catch {
    return null;
  }
}

// ─── Extensão do Request ──────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      centralUserId?: string;
      centralUserRole?: string;
    }
  }
}

// ─── Cache de status do usuário (TTL 60s) ─────────────────────────────────────

interface UserCache { isActive: boolean; role: string; cachedAt: number }
const _userCache = new Map<string, UserCache>();
const USER_CACHE_TTL = 60_000;

export function invalidateUserCache(id: string): void {
  _userCache.delete(id);
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Não autorizado. Token ausente." });
    return;
  }
  const token = authHeader.slice(7);

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Token inválido ou expirado." });
    return;
  }

  let cached = _userCache.get(payload.userId);
  if (!cached || Date.now() - cached.cachedAt > USER_CACHE_TTL) {
    const rows = await db
      .select({ isActive: centralUsersTable.isActive, role: centralUsersTable.role })
      .from(centralUsersTable)
      .where(eq(centralUsersTable.id, payload.userId))
      .limit(1);
    if (rows.length === 0) {
      res.status(401).json({ error: "Usuário não encontrado." });
      return;
    }
    cached = { isActive: rows[0]!.isActive, role: rows[0]!.role, cachedAt: Date.now() };
    _userCache.set(payload.userId, cached);
  }

  if (!cached.isActive) {
    res.status(403).json({ error: "Usuário inativo." });
    return;
  }

  req.centralUserId = payload.userId;
  req.centralUserRole = cached.role;
  next();
}

// ─── Autorização por papel (RBAC — PRD-02) ────────────────────────────────────
// `requireCentralRole` vive em `./rbac.ts` (módulo PURO, sem import de banco,
// para ser testável sem DB). Re-exportado aqui para as rotas importarem tudo de
// auth (`import { authMiddleware, requireCentralRole } from "../middlewares/auth.js"`).
export { requireCentralRole } from "./rbac.js";

// ─── Rate limit simples de login (em memória, 10/min por IP) ──────────────────

const _loginAttempts = new Map<string, { count: number; resetAt: number }>();

export function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = _loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    _loginAttempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  entry.count++;
  return entry.count <= 10;
}
