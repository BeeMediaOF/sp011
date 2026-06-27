/**
 * imageTransform — pipeline de redimensionamento/conversão WebP|AVIF via sharp,
 * com cache em duas camadas (LRU em memória + disco) e coalescing de requisições.
 *
 * Compartilhado entre:
 *   - routes/image.ts    — proxy de imagens de domínios externos (allowlist)
 *   - routes/uploads.ts  — imagens enviadas pelo portal (Supabase Storage / disco)
 *
 * A camada de cache guarda sempre o buffer JÁ processado (resized + encodado),
 * indexado por uma chave que cobre origem + largura + qualidade + formato.
 */

import sharp from "sharp";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

export type ImageFormat = "webp" | "avif";

// ── Config ───────────────────────────────────────────────────────────────────
export const MAX_WIDTH = 1600;
export const DEFAULT_W = 800;
export const DEFAULT_Q = 82;
export const MAX_Q = 100;

const CACHE_DIR = path.join(os.tmpdir(), "img-proxy-cache");
const MEM_MAX = 500; // entradas no LRU em memória

// ── LRU em memória simples ────────────────────────────────────────────────────
const memCache = new Map<string, Buffer>();

export function memGet(key: string): Buffer | undefined {
  const val = memCache.get(key);
  if (val !== undefined) {
    memCache.delete(key);
    memCache.set(key, val);
  }
  return val;
}

export function memSet(key: string, buf: Buffer): void {
  if (memCache.size >= MEM_MAX) {
    const oldest = memCache.keys().next().value;
    if (oldest !== undefined) memCache.delete(oldest);
  }
  memCache.set(key, buf);
}

// ── Cache em disco ────────────────────────────────────────────────────────────
export function cacheKey(source: string, w: number, q: number, fmt: string): string {
  return createHash("sha256").update(`${source}|${w}|${q}|${fmt}`).digest("hex");
}

function cachePath(key: string): string {
  return path.join(CACHE_DIR, key.slice(0, 2), `${key}.img`);
}

async function diskRead(key: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(cachePath(key));
  } catch {
    return null;
  }
}

async function diskWrite(key: string, buf: Buffer): Promise<void> {
  const p = cachePath(key);
  try {
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, buf);
  } catch {
    // falha silenciosa — cache não é crítico
  }
}

// ── Pipeline sharp ────────────────────────────────────────────────────────────
/**
 * Redimensiona e codifica o buffer de origem.
 * effort: 1 (vs padrão 4) → ~3-4× mais rápido na codificação WebP/AVIF, com
 * diferença de tamanho < 5%. Ideal para um proxy onde latência > compressão.
 */
export async function transformImage(
  raw: Buffer,
  w: number,
  q: number,
  fmt: ImageFormat,
): Promise<Buffer> {
  const pipeline = sharp(raw).resize({ width: w, withoutEnlargement: true });
  if (fmt === "avif") {
    return pipeline.avif({ quality: q, effort: 1 }).toBuffer();
  }
  return pipeline.webp({ quality: q, effort: 1 }).toBuffer();
}

// ── Resolução com cache + coalescing ──────────────────────────────────────────
const inFlight = new Map<string, Promise<Buffer>>();

/**
 * Resolve um buffer processado para `key`, consultando mem → disco e, em caso de
 * miss, executando `produceRaw()` (que entrega os bytes de origem), aplicando o
 * pipeline sharp e gravando nas duas camadas de cache. Requisições simultâneas
 * para a mesma `key` compartilham um único `produceRaw` + transform.
 */
export async function resolveImage(
  key: string,
  produceRaw: () => Promise<Buffer>,
  w: number,
  q: number,
  fmt: ImageFormat,
): Promise<Buffer> {
  // 1. Mem
  const memHit = memGet(key);
  if (memHit) return memHit;

  // 2. Disco
  await fs.mkdir(CACHE_DIR, { recursive: true }).catch(() => undefined);
  const diskHit = await diskRead(key);
  if (diskHit) {
    memSet(key, diskHit);
    return diskHit;
  }

  // 3. Coalescing: reutiliza um fetch/transform já em andamento para esta chave
  let pending = inFlight.get(key);
  if (!pending) {
    pending = (async () => {
      const raw = await produceRaw();
      return transformImage(raw, w, q, fmt);
    })()
      .then((buf) => {
        memSet(key, buf);
        void diskWrite(key, buf);
        return buf;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }

  return pending;
}
