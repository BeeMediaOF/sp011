/**
 * Assinatura HMAC do canal central→blog (`POST /api/ingest`).
 *
 * Esquema: assinatura = hex( HMAC-SHA256(secret, `${timestamp}.${rawBody}`) ),
 * onde `timestamp` é unix em segundos (header X-Central-Timestamp) e `rawBody`
 * são os bytes crus do corpo da requisição (por isso o blog precisa capturar
 * `req.rawBody` no express.json). Anti-replay: rejeita |now − timestamp| > 300s.
 *
 * Este módulo é importado tanto pelo central-hub (assinar) quanto pelo
 * api-server do blog (verificar).
 */
import crypto from "node:crypto";

export const DEFAULT_MAX_SKEW_SEC = 300;

export function computeIngestSignature(
  secret: string,
  timestamp: string | number,
  rawBody: string | Buffer,
): string {
  const h = crypto.createHmac("sha256", secret);
  h.update(`${timestamp}.`);
  h.update(typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody);
  return h.digest("hex");
}

/** Gera os headers de autenticação para uma requisição assinada. */
export function signIngestRequest(
  secret: string,
  rawBody: string | Buffer,
  nowMs = Date.now(),
): { timestamp: string; signature: string } {
  const timestamp = String(Math.floor(nowMs / 1000));
  return { timestamp, signature: computeIngestSignature(secret, timestamp, rawBody) };
}

export type VerifyIngestResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "timestamp_skew" | "bad_signature" };

/** Verifica assinatura + janela de timestamp com comparação em tempo constante. */
export function verifyIngestSignature(
  secret: string,
  timestamp: string | undefined,
  rawBody: string | Buffer,
  signature: string | undefined,
  opts?: { maxSkewSec?: number; nowMs?: number },
): VerifyIngestResult {
  if (!secret || !timestamp || !signature) return { ok: false, reason: "missing" };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "timestamp_skew" };
  const nowSec = Math.floor((opts?.nowMs ?? Date.now()) / 1000);
  const maxSkew = opts?.maxSkewSec ?? DEFAULT_MAX_SKEW_SEC;
  if (Math.abs(nowSec - ts) > maxSkew) return { ok: false, reason: "timestamp_skew" };

  const expected = Buffer.from(computeIngestSignature(secret, timestamp, rawBody), "hex");
  let received: Buffer;
  try {
    received = Buffer.from(signature, "hex");
  } catch {
    return { ok: false, reason: "bad_signature" };
  }
  if (received.length === 0 || received.length !== expected.length) {
    return { ok: false, reason: "bad_signature" };
  }
  return crypto.timingSafeEqual(expected, received)
    ? { ok: true }
    : { ok: false, reason: "bad_signature" };
}
