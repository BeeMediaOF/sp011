/**
 * Encryption-at-rest for sensitive settings stored in the database.
 *
 * Secrets (API keys, access tokens) are encrypted with AES-256-GCM before being
 * written to the `settings` table and decrypted when loaded into memory. The
 * in-memory cache always holds plaintext, so the rest of the app is unchanged.
 *
 * The encryption key is derived (scrypt) from SETTINGS_ENCRYPTION_KEY, falling
 * back to SESSION_SECRET so existing deployments are protected with no new config.
 * If neither is set (dev only), values are stored as-is with a one-time warning.
 */
import crypto from "node:crypto";
import { logger } from "./logger.js";

const PREFIX = "enc:v1:";
const SCRYPT_SALT = "sbc-settings-enc-v1"; // fixed salt: key derivation must be deterministic

let _key: Buffer | null = null;
let _resolved = false;
let _warned = false;

function getKey(): Buffer | null {
  if (_resolved) return _key;
  _resolved = true;
  const secret =
    process.env["SETTINGS_ENCRYPTION_KEY"] ||
    process.env["SESSION_SECRET"] ||
    "";
  if (!secret) {
    logger.warn(
      "Nenhuma SETTINGS_ENCRYPTION_KEY/SESSION_SECRET definida — segredos do banco NÃO serão criptografados.",
    );
    _key = null;
    return null;
  }
  _key = crypto.scryptSync(secret, SCRYPT_SALT, 32);
  return _key;
}

/** True if encryption is configured (a key could be derived). */
export function encryptionAvailable(): boolean {
  return getKey() !== null;
}

/** True if a string is already in the encrypted envelope format. */
export function isEncrypted(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/** Encrypt a secret string. No-op for empty/already-encrypted values or when no key is set. */
export function encryptSecret(plaintext: string): string {
  if (!plaintext || isEncrypted(plaintext)) return plaintext;
  const key = getKey();
  if (!key) return plaintext;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString("base64");
}

/** Decrypt a secret string. Returns plaintext/legacy values unchanged. */
export function decryptSecret(value: string): string {
  if (!isEncrypted(value)) return value;
  const key = getKey();
  if (!key) {
    if (!_warned) {
      logger.error("Valor criptografado encontrado mas nenhuma chave de criptografia disponível.");
      _warned = true;
    }
    return value;
  }
  try {
    const raw = Buffer.from(value.slice(PREFIX.length), "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ct = raw.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch (err) {
    logger.error({ err }, "Falha ao descriptografar segredo (chave trocada?) — retornando valor bruto.");
    return value;
  }
}
