/**
 * Acesso aos arquivos de upload: onde eles ficam e como carregá-los.
 *
 * Saiu de `routes/uploads.ts` quando um segundo consumidor apareceu
 * (`blockImageMeta.ts`, que lê as dimensões nativas das imagens de bloco):
 * `lib/` importando de `routes/` inverte a camada e é convite a import cíclico.
 * A rota continua dona do upload, da validação e do cache de transformação —
 * aqui fica só o armazenamento.
 *
 * Armazenamento primário é o disco local (produção: /data/uploads, volume
 * api_data do compose, presente também no template de blog replicado). O
 * Supabase Storage ficou como fallback SOMENTE LEITURA de arquivos legados: os
 * poucos arquivos eram baixados a cada pageview e estouraram a cota de egress
 * do plano free (jul/2026).
 */
import { existsSync, mkdirSync, readFileSync } from "fs";
import { extname, join, dirname } from "path";
import { fileURLToPath } from "url";

const isProd = process.env["NODE_ENV"] === "production";
const __dirname = dirname(fileURLToPath(import.meta.url));

/** Diretório dos uploads. UPLOADS_DIR sobrepõe. */
export const LOCAL_UPLOADS_DIR =
  process.env["UPLOADS_DIR"] ?? (isProd ? "/data/uploads" : join(__dirname, "../../data/uploads"));
if (!existsSync(LOCAL_UPLOADS_DIR)) mkdirSync(LOCAL_UPLOADS_DIR, { recursive: true });

const STORAGE_PREFIX = "uploads"; // objects stored at <bucket>/uploads/<filename>

/**
 * Lido sob demanda (não no import): quando a conexão vem do arquivo do
 * assistente de instalação, o boot injeta SUPABASE_URL/SERVICE_ROLE_KEY em
 * process.env DEPOIS deste módulo carregar. A env explícita continua mandando.
 */
export function storageEnv(): { url: string; key: string; bucket: string; configured: boolean } {
  const url = (process.env["SUPABASE_URL"] ?? "").replace(/\/+$/, "");
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  const bucket = process.env["SUPABASE_STORAGE_BUCKET"] ?? "uploads";
  return { url, key, bucket, configured: !!(url && key) };
}

export function objectUrl(filename: string): string {
  const { url, bucket } = storageEnv();
  return `${url}/storage/v1/object/${bucket}/${STORAGE_PREFIX}/${encodeURIComponent(filename)}`;
}

function contentTypeOf(filename: string): string {
  const ext = extname(filename).toLowerCase();
  return ext === ".png" ? "image/png" :
    ext === ".webp" ? "image/webp" :
    ext === ".avif" ? "image/avif" :
    ext === ".gif" ? "image/gif" :
    (ext === ".jpg" || ext === ".jpeg") ? "image/jpeg" :
    "application/octet-stream";
}

/**
 * Carrega o arquivo inteiro em memória (disco local → fallback Supabase Storage).
 * Usado pelo caminho de transformação (sharp precisa do buffer completo).
 */
export async function loadRawBuffer(
  filename: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const localPath = join(LOCAL_UPLOADS_DIR, filename);
  if (existsSync(localPath)) {
    return { buffer: readFileSync(localPath), contentType: contentTypeOf(filename) };
  }
  if (storageEnv().configured) {
    try {
      const res = await fetch(objectUrl(filename), {
        headers: { Authorization: `Bearer ${storageEnv().key}` },
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        const contentType = res.headers.get("content-type") ?? "application/octet-stream";
        return { buffer: Buffer.from(await res.arrayBuffer()), contentType };
      }
    } catch {
      // legado indisponível — segue para o 404
    }
  }
  return null;
}
