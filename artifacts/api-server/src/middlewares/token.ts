/**
 * Funções PURAS de token/senha (PRD-03) — só `crypto` + `SESSION_SECRET`, SEM
 * import de `@workspace/db`. Vivem aqui (e não em `auth.ts`) para serem
 * testáveis com `node --test`: importar `auth.ts` puxa `@workspace/db`, cujo
 * barrel de schema (`./schema`, import de diretório) quebra a resolução ESM do
 * node. `auth.ts` re-exporta tudo daqui, então os consumidores não mudam.
 */
import { createHmac, scryptSync, randomBytes, timingSafeEqual } from "crypto";

// ─── SESSION_SECRET ───────────────────────────────────────────────────────────
// Em produção o segredo DEVE estar setado — um default previsível deixaria
// qualquer um que conhece o código forjar tokens.
const isProd = process.env["NODE_ENV"] === "production";

if (isProd && !process.env["SESSION_SECRET"]) {
  throw new Error(
    "[FATAL] SESSION_SECRET environment variable is not set. " +
    "Set a random 64-byte hex string before starting the server in production."
  );
}

export const SECRET = process.env["SESSION_SECRET"] ?? "dev-secret-brasilia-2024";

if (!isProd && !process.env["SESSION_SECRET"]) {
  console.warn(
    "[WARN] SESSION_SECRET not set — using insecure dev fallback. " +
    "Tokens generated here MUST NOT be used in production."
  );
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
  /** Timestamp de emissão (ms) — usado no teste de revogação (PRD-03). */
  issuedAt: number;
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
    if (age > 28_800_000) return null; // 8 hours
    const userId = parseInt(parts[0] as string, 10);
    const role = parts[1] as string;
    if (isNaN(userId)) return null;
    return { userId, role, issuedAt: Number(ts) };
  } catch {
    return null;
  }
}

/**
 * Revogação de token (PRD-03/F14): um token emitido ANTES da última troca de
 * senha (`passwordChangedAt`) OU do último logout (`tokensValidFrom`) é
 * inválido. Função pura — testável sem DB.
 */
export function isTokenRevoked(
  issuedAt: number,
  u: { passwordChangedAt?: Date | null; tokensValidFrom?: Date | null },
): boolean {
  const pwd = u.passwordChangedAt ? u.passwordChangedAt.getTime() : 0;
  const tvf = u.tokensValidFrom ? u.tokensValidFrom.getTime() : 0;
  return issuedAt < Math.max(pwd, tvf);
}

// ─── 2FA Temp Token (10-minute, single-use for TOTP verification) ─────────────

const TEMP_TOKEN_EXPIRY_MS = 10 * 60 * 1000;

export function generateTempToken(userId: number): string {
  const ts = Date.now().toString();
  const payload = `${userId}:2fa-pending:${ts}`;
  const sig = createHmac("sha256", SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export function verifyTempToken(token: string): number | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const lastColon = decoded.lastIndexOf(":");
    if (lastColon === -1) return null;
    const sig     = decoded.slice(lastColon + 1);
    const payload = decoded.slice(0, lastColon);
    const expected = createHmac("sha256", SECRET).update(payload).digest("hex");
    if (sig.length !== expected.length) return null;
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const parts = payload.split(":");
    if (parts.length !== 3 || parts[1] !== "2fa-pending") return null;
    const age = Date.now() - Number(parts[2]);
    if (age > TEMP_TOKEN_EXPIRY_MS) return null;
    const userId = parseInt(parts[0]!, 10);
    if (isNaN(userId)) return null;
    return userId;
  } catch {
    return null;
  }
}
