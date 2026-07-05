/**
 * Criptografia at-rest de segredos — cópia de `api-server/src/lib/crypto.ts`
 * com o logger trocado por console (a lib não conhece o pino do app).
 *
 * Mantém o MESMO envelope (`enc:v1:`) e o MESMO salt do blog, de modo que um
 * valor criptografado com a mesma chave é legível pelos dois lados.
 *
 * A chave é derivada (scrypt) de SETTINGS_ENCRYPTION_KEY, com fallback para
 * SESSION_SECRET. Sem nenhuma das duas (somente dev), os valores passam sem
 * criptografia com um aviso único.
 */
import crypto from "node:crypto";

const PREFIX = "enc:v1:";
const SCRYPT_SALT = "sbc-settings-enc-v1"; // salt fixo: derivação precisa ser determinística

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
    console.warn(
      "Nenhuma SETTINGS_ENCRYPTION_KEY/SESSION_SECRET definida — segredos NÃO serão criptografados.",
    );
    _key = null;
    return null;
  }
  _key = crypto.scryptSync(secret, SCRYPT_SALT, 32);
  return _key;
}

/** True se a criptografia está configurada (uma chave pôde ser derivada). */
export function encryptionAvailable(): boolean {
  return getKey() !== null;
}

/** True se a string já está no formato de envelope criptografado. */
export function isEncrypted(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/** Criptografa um segredo. No-op para valores vazios/já criptografados ou sem chave. */
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

/** Descriptografa um segredo. Valores em texto puro/legados passam inalterados. */
export function decryptSecret(value: string): string {
  if (!isEncrypted(value)) return value;
  const key = getKey();
  if (!key) {
    if (!_warned) {
      console.error("Valor criptografado encontrado mas nenhuma chave de criptografia disponível.");
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
    console.error("Falha ao descriptografar segredo (chave trocada?) — retornando valor bruto.", err);
    return value;
  }
}
