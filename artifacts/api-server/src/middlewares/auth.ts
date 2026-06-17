import { createHmac } from "crypto";
import type { Request, Response, NextFunction } from "express";

const SECRET = process.env["SESSION_SECRET"] ?? "dev-secret-brasilia";
export const ADMIN_USER = process.env["ADMIN_USER"] ?? "admin";
export const ADMIN_PASS = process.env["ADMIN_PASSWORD"] ?? "brasilia@2024";

// Static API key for webhook integrations (never expires)
export const WEBHOOK_API_KEY = process.env["WEBHOOK_API_KEY"] ?? "";

export function generateToken(username: string): string {
  const ts = Date.now().toString();
  const payload = `${username}:${ts}`;
  const sig = createHmac("sha256", SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export function verifyToken(token: string): boolean {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const lastColon = decoded.lastIndexOf(":");
    const payload = decoded.slice(0, lastColon);
    const sig = decoded.slice(lastColon + 1);
    const expected = createHmac("sha256", SECRET).update(payload).digest("hex");
    const tsStr = payload.split(":")[1];
    if (!tsStr) return false;
    const age = Date.now() - Number(tsStr);
    if (age > 604_800_000) return false; // 7 days
    return sig === expected;
  } catch {
    return false;
  }
}

export function validateCredentials(username: string, password: string): boolean {
  return username === ADMIN_USER && password === ADMIN_PASS;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header. Expected: Bearer <token>" });
    return;
  }
  const token = authHeader.slice(7);
  // Accept static webhook API key (never expires) OR short-lived JWT
  if (WEBHOOK_API_KEY && token === WEBHOOK_API_KEY) {
    next();
    return;
  }
  if (!verifyToken(token)) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  next();
}
