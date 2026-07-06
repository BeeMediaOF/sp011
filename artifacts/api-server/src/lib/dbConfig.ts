/**
 * Conexão de banco sem env: arquivo criptografado em disco (volume persistente
 * do container). Resolução no boot, nesta ordem:
 *
 *   1. env SUPABASE_DATABASE_URL/DATABASE_URL — deploy atual, intocado;
 *   2. arquivo DB_CONFIG_PATH (default /data/db-config.enc), AES-256-GCM com o
 *      envelope enc:v1: do crypto.ts, gravado pelo assistente de instalação;
 *   3. nada → modo instalação (só /api/setup responde; resto 503 setupRequired).
 *
 * Credenciais NUNCA em texto puro no disco, nunca em logs nem em respostas da
 * API — o status público expõe só provider/host mascarado/nome do banco.
 */
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import {
  decryptSecret,
  encryptSecret,
  encryptionAvailable,
  isEncrypted,
} from "./crypto.js";

export interface StoredDbConfig {
  v: 1;
  connectionString: string;
  /** Storage de mídia (opcional) — injetado em process.env no boot quando a env não define. */
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
  supabaseStorageBucket?: string;
}

export function dbConfigPath(): string {
  return process.env["DB_CONFIG_PATH"] ?? "/data/db-config.enc";
}

export type DbBootResolution =
  | { source: "env"; connectionString: string }
  | { source: "file"; connectionString: string; config: StoredDbConfig }
  | { source: "none" }
  | { source: "file-error"; error: string };

/** Lê e valida o arquivo de conexão. Lança erro legível (modo recuperação). */
export function readDbConfigFile(): StoredDbConfig {
  const raw = readFileSync(dbConfigPath(), "utf8").trim();
  if (!isEncrypted(raw)) {
    throw new Error(
      "Arquivo de conexão fora do formato criptografado esperado (enc:v1:) — arquivo corrompido ou adulterado.",
    );
  }
  const plain = decryptSecret(raw);
  if (isEncrypted(plain)) {
    // decryptSecret devolve o valor bruto quando não consegue abrir
    throw new Error(
      "Não foi possível descriptografar o arquivo de conexão — a SETTINGS_ENCRYPTION_KEY/SESSION_SECRET mudou? A chave é imutável por instância.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(plain);
  } catch {
    throw new Error("Arquivo de conexão descriptografado mas com JSON inválido.");
  }
  const cfg = parsed as StoredDbConfig;
  if (cfg?.v !== 1 || typeof cfg.connectionString !== "string" || !cfg.connectionString) {
    throw new Error("Arquivo de conexão sem connectionString válida (versão esperada: 1).");
  }
  return cfg;
}

/** Decide de onde vem a conexão neste boot. Nunca lança. */
export function resolveDbBoot(): DbBootResolution {
  const envUrl = process.env["SUPABASE_DATABASE_URL"] ?? process.env["DATABASE_URL"];
  if (envUrl) return { source: "env", connectionString: envUrl };
  if (!existsSync(dbConfigPath())) return { source: "none" };
  try {
    const config = readDbConfigFile();
    return { source: "file", connectionString: config.connectionString, config };
  } catch (err) {
    return { source: "file-error", error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Grava o arquivo de conexão: criptografado sempre (recusa sem chave), escrita
 * atômica (tmp + rename) e backup .bak do arquivo anterior — o rollback da
 * troca de banco é restaurar o .bak.
 */
export function writeDbConfigFile(config: StoredDbConfig): void {
  if (!encryptionAvailable()) {
    throw new Error(
      "SETTINGS_ENCRYPTION_KEY (ou SESSION_SECRET) não definida — recusando gravar credenciais; o arquivo de conexão nunca é salvo em texto puro.",
    );
  }
  const payload = encryptSecret(JSON.stringify(config));
  if (!isEncrypted(payload)) {
    throw new Error("Falha ao criptografar o arquivo de conexão — gravação abortada.");
  }
  const path = dbConfigPath();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, payload, { mode: 0o600 });
  if (existsSync(path)) copyFileSync(path, `${path}.bak`);
  renameSync(tmp, path);
  try {
    chmodSync(path, 0o600);
  } catch {
    // Windows/dev: chmod é no-op — permissões via ACL do diretório.
  }
}

/** Erros de conexão Postgres traduzidos p/ o operador — sem vazar credenciais. */
export function describeDbError(err: unknown): string {
  const e = err as { code?: string; message?: string } | undefined;
  const code = e?.code ?? "";
  const msg = e?.message ?? String(err);
  switch (code) {
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "Host do banco não encontrado (DNS) — confira o endereço.";
    case "ECONNREFUSED":
      return "Conexão recusada — host/porta errados ou banco fora do ar.";
    case "ETIMEDOUT":
      return "Tempo esgotado ao conectar — firewall, rede ou host errado.";
    case "28P01":
      return "Usuário ou senha inválidos.";
    case "28000":
      return "Autenticação rejeitada pelo servidor (pg_hba/SSL) — tente habilitar SSL.";
    case "3D000":
      return "O banco de dados informado não existe.";
    default:
      if (/self[- ]signed|certificate/i.test(msg)) {
        return "Certificado SSL não confiável — use a opção \"SSL sem verificação de certificado\" (Supabase/pooler).";
      }
      if (/SSL|sslmode/i.test(msg)) {
        return `Problema de SSL na conexão: ${msg}`;
      }
      if (/timeout/i.test(msg)) {
        return "Tempo esgotado ao conectar — firewall, rede ou host errado.";
      }
      return msg;
  }
}
