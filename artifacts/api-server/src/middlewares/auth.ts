import { createHmac, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { db, usersTable, loginAttemptsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { store } from "../lib/store.js";
import {
  SECRET, verifyToken, isTokenRevoked, type TokenPayload,
} from "./token.js";

// As funções PURAS de token/senha vivem em ./token.ts (testáveis sem DB — ver
// o cabeçalho de token.ts). Re-exportadas aqui para os consumidores existentes
// (`import { generateToken, ... } from "../middlewares/auth.js"`).
export {
  hashPassword, verifyPassword, generateToken, verifyToken,
  isTokenRevoked, generateTempToken, verifyTempToken,
} from "./token.js";
export type { TokenPayload } from "./token.js";

/**
 * Returns the active webhook API key.
 */
function getWebhookApiKey(): string {
  const storeKey = store.getSettings().webhookApiKey;
  if (storeKey) return storeKey;
  return process.env["WEBHOOK_API_KEY"] ?? "";
}

// ─── Extended Request ─────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: number;
      userRole?: string;
      userEmail?: string;
      /** Perfil de colunista ligado ao login (só role "columnist"). */
      userColumnistId?: string | null;
      isWebhookKey?: boolean;
    }
  }
}

// ─── User status cache ────────────────────────────────────────────────────────

interface UserCache {
  status: string;
  role: string;
  columnistId: string | null;
  passwordChangedAt: Date | null;
  tokensValidFrom: Date | null;
  cachedAt: number;
}
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

  // Webhook key REMOVIDA do authMiddleware (PRD-03/AP-4): a key não é mais
  // reconhecida como sessão admin aqui — ela só vale nas rotas de publish via
  // `publishAuth`. Qualquer token que não seja JWT-HMAC de usuário → 401.

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
    if (isTokenRevoked(payload.issuedAt, cached)) {
      res.status(401).json({ error: "Sessão revogada. Faça login novamente." });
      return;
    }
    req.userId   = payload.userId;
    req.userRole = cached.role;
    req.userColumnistId = cached.columnistId;
    next();
    return;
  }

  try {
    const [user] = await db
      .select({
        status: usersTable.status, role: usersTable.role, email: usersTable.email,
        columnistId: usersTable.columnistId,
        passwordChangedAt: usersTable.passwordChangedAt, tokensValidFrom: usersTable.tokensValidFrom,
      })
      .from(usersTable)
      .where(eq(usersTable.id, payload.userId));

    if (!user || user.status !== "active") {
      res.status(401).json({ error: "Conta inativa ou bloqueada." });
      return;
    }

    _userCache.set(payload.userId, {
      status: user.status, role: user.role, columnistId: user.columnistId ?? null,
      passwordChangedAt: user.passwordChangedAt, tokensValidFrom: user.tokensValidFrom,
      cachedAt: Date.now(),
    });
    if (isTokenRevoked(payload.issuedAt, user)) {
      res.status(401).json({ error: "Sessão revogada. Faça login novamente." });
      return;
    }
    req.userId    = payload.userId;
    req.userRole  = user.role;
    req.userEmail = user.email;
    req.userColumnistId = user.columnistId ?? null;
    // Update lastSeenAt in the background (non-blocking)
    db.update(usersTable).set({ lastSeenAt: new Date() }).where(eq(usersTable.id, payload.userId)).catch(() => {});
    next();
  } catch {
    // PRD-03 (fail-closed): NUNCA confiar no papel embutido no token. Se houver
    // cache fresco do usuário, usá-lo; senão negar com 503 (não é bypass de auth).
    const stale = _userCache.get(payload.userId);
    if (stale && Date.now() - stale.cachedAt <= USER_CACHE_TTL) {
      if (stale.status !== "active") {
        res.status(401).json({ error: "Conta inativa ou bloqueada." });
        return;
      }
      if (isTokenRevoked(payload.issuedAt, stale)) {
        res.status(401).json({ error: "Sessão revogada. Faça login novamente." });
        return;
      }
      req.userId   = payload.userId;
      req.userRole = stale.role;
      req.userColumnistId = stale.columnistId;
      next();
      return;
    }
    res.status(503).json({ error: "Serviço de autenticação indisponível. Tente novamente." });
  }
}

/**
 * Autorização das rotas de PUBLICAÇÃO (PRD-03/AP-4): aceita a webhook key
 * (só seta `req.isWebhookKey`, NUNCA papel de administrador) OU delega ao token
 * de usuário logado. É o ÚNICO ponto que reconhece a webhook key.
 */
export async function publishAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const activeWebhookKey = getWebhookApiKey();
  if (token && activeWebhookKey) {
    const expectedHmac = createHmac("sha256", SECRET).update(activeWebhookKey).digest();
    const tokenHmac    = createHmac("sha256", SECRET).update(token).digest();
    if (expectedHmac.length === tokenHmac.length && timingSafeEqual(expectedHmac, tokenHmac)) {
      req.userId       = undefined;
      req.isWebhookKey = true;
      next();
      return;
    }
  }
  // Não é a webhook key → fluxo normal de token de usuário (editor/admin logado).
  return authMiddleware(req, res, next);
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

// Fallback de rate limit em MEMÓRIA (PRD-03, fail-closed): quando o rate limit
// persistente (DB) falha, o login continua limitado process-local em vez de
// abrir brute force (o antigo `return true` era fail-open).
const _rateLimitFallback = new Map<string, { count: number; resetAt: number }>();
function fallbackRateLimit(ip: string): boolean {
  const now = Date.now();
  const e = _rateLimitFallback.get(ip);
  if (!e || now > e.resetAt) {
    _rateLimitFallback.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  e.count++;
  return e.count <= RATE_LIMIT_MAX;
}

// ─── Rate limiting (DB-backed, persistent across restarts) ────────────────────
// 10 attempts per minute per IP. Uses PostgreSQL so it survives restarts and
// works correctly across multiple server instances.

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
    // PRD-03 (fail-closed): DB indisponível → limita em memória (não fail-open).
    return fallbackRateLimit(ip);
  }
}

export async function resetRateLimit(ip: string): Promise<void> {
  try {
    await db.delete(loginAttemptsTable).where(eq(loginAttemptsTable.ip, ip));
  } catch {
    // Non-critical — ignore
  }
}
