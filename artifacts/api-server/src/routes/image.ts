/**
 * GET /api/image — Proxy de imagens com resize e conversão WebP/AVIF via sharp.
 *
 * Parâmetros query:
 *   url  — URL da imagem de origem (obrigatório, deve ser de domínio permitido)
 *   w    — largura alvo em px (padrão 800, máx 1600)
 *   q    — qualidade 1-100 (padrão 82)
 *   f    — formato: "webp" (padrão) | "avif"
 *
 * Cache:
 *   1. In-memory LRU (500 entradas) — sub-ms
 *   2. Disco em /tmp/img-proxy-cache/ — persistente pelo processo
 *   3. Browser: Cache-Control immutable + ETag — 1 ano
 *
 * Performance:
 *   - Request coalescing: fetches simultâneos para a mesma chave compartilham um único upstream fetch
 *   - effort: 1 (sharp default=4) — 3-4× mais rápido, qualidade visualmente idêntica para proxy
 *   - Timeout upstream: 6 s (falha rápida, o browser pode tentar de novo)
 *
 * Segurança:
 *   - Allowlist estrita de domínios de origem
 *   - Validação de largura e qualidade com limites máximos
 *   - Content-Type verificado antes de processar
 */

import { Router } from "express";
import sharp from "sharp";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

const router = Router();

// ── Allowlist de domínios permitidos ────────────────────────────────────────
const ALLOWED_HOSTS = new Set([
  // metroimg CDN principal
  "images.metroimg.com",
  "i.metroimg.com",
  "static.metroimg.com",
  // EBC / Agência Brasil (serviço público)
  "imagens.ebc.com.br",
  "agenciabrasil.ebc.com.br",
  // fontes RSS em uso no portal (verificado via análise de artigos)
  "media.investnews.com.br",
  "www.cartacapital.com.br",
  "www.brasildefato.com.br",
  "medias.revistaoeste.com",
  "uploads.finsidersbrasil.com.br",
  "finsidersbrasil.com.br",
  "cdn.jornaldebrasilia.com.br",
  "media-manager.noticiasaominuto.com.br",
  // UOL / Band (portais de grande circulação)
  "img.uol.com.br",
  "conteudo.imguol.com.br",
  "imagem.band.uol.com.br",
  // Wikimedia (enciclopédia / fontes abertas)
  "upload.wikimedia.org",
]);

export { ALLOWED_HOSTS };

// ── Config ───────────────────────────────────────────────────────────────────
const MAX_WIDTH    = 1600;
const DEFAULT_W    = 800;
const DEFAULT_Q    = 82;
const MAX_Q        = 100;
const CACHE_DIR    = path.join(os.tmpdir(), "img-proxy-cache");
const MEM_MAX      = 500; // entradas no LRU em memória

// ── LRU em memória simples ────────────────────────────────────────────────────
const memCache = new Map<string, Buffer>();

function memGet(key: string): Buffer | undefined {
  const val = memCache.get(key);
  if (val !== undefined) {
    memCache.delete(key);
    memCache.set(key, val);
  }
  return val;
}

function memSet(key: string, buf: Buffer): void {
  if (memCache.size >= MEM_MAX) {
    const oldest = memCache.keys().next().value;
    if (oldest !== undefined) memCache.delete(oldest);
  }
  memCache.set(key, buf);
}

// ── Cache em disco ────────────────────────────────────────────────────────────
function cacheKey(url: string, w: number, q: number, fmt: string): string {
  return createHash("sha256")
    .update(`${url}|${w}|${q}|${fmt}`)
    .digest("hex");
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

// ── Request coalescing ────────────────────────────────────────────────────────
// Evita que múltiplas requisições simultâneas para a mesma imagem disparem
// N fetches upstream paralelos. O primeiro registra uma Promise; os demais
// aguardam a mesma Promise.
const inFlight = new Map<string, Promise<Buffer>>();

async function fetchAndProcess(
  url: string,
  w: number,
  q: number,
  fmt: "webp" | "avif"
): Promise<Buffer> {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "SBCAgora-ImageProxy/1.0",
      Accept: "image/*,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(6_000), // falha rápida (era 10 s)
  });

  if (!resp.ok) throw new Error(`origin_error:${resp.status}`);

  const ct = resp.headers.get("content-type") ?? "";
  if (!ct.startsWith("image/")) throw new Error("not_an_image");

  const raw = Buffer.from(await resp.arrayBuffer());

  /*
   * effort: 1 (vs padrão 4)
   * Reduz o tempo de codificação WebP de ~200 ms para ~50 ms por imagem, com
   * diferença de tamanho < 5%. Ideal para um proxy onde latência > compressão.
   */
  const pipeline = sharp(raw).resize({ width: w, withoutEnlargement: true });
  if (fmt === "avif") {
    return pipeline.avif({ quality: q, effort: 1 }).toBuffer();
  }
  return pipeline.webp({ quality: q, effort: 1 }).toBuffer();
}

async function resolveImage(
  url: string,
  w: number,
  q: number,
  fmt: "webp" | "avif"
): Promise<Buffer> {
  const key = cacheKey(url, w, q, fmt);

  // 1. Mem
  const memHit = memGet(key);
  if (memHit) return memHit;

  // 2. Disk
  await fs.mkdir(CACHE_DIR, { recursive: true }).catch(() => undefined);
  const diskHit = await diskRead(key);
  if (diskHit) {
    memSet(key, diskHit);
    return diskHit;
  }

  // 3. Coalescing: se já há um fetch em andamento para esta chave, reutiliza
  let pending = inFlight.get(key);
  if (!pending) {
    pending = fetchAndProcess(url, w, q, fmt)
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

// ── Warm cache (chamado no startup para pré-aquecer artigos recentes) ─────────
/**
 * Pré-aquece o cache de imagens para as URLs fornecidas.
 * Processa em lotes de 4 para não saturar a rede na inicialização.
 */
export async function warmImageCache(
  imageUrls: string[],
  widths: number[] = [480, 768],
  q = DEFAULT_Q
): Promise<number> {
  const urls = imageUrls.filter((u) => {
    if (!u) return false;
    try { return ALLOWED_HOSTS.has(new URL(u).hostname); } catch { return false; }
  });

  let warmed = 0;
  const tasks: Array<() => Promise<void>> = [];

  for (const url of urls) {
    for (const w of widths) {
      tasks.push(async () => {
        try {
          await resolveImage(url, w, q, "webp");
          warmed++;
        } catch {
          // ignora falhas individuais no warm
        }
      });
    }
  }

  // lotes de 4 em paralelo
  for (let i = 0; i < tasks.length; i += 4) {
    await Promise.all(tasks.slice(i, i + 4).map((t) => t()));
  }

  return warmed;
}

// ── Rota ──────────────────────────────────────────────────────────────────────
router.get("/image", async (req, res) => {
  const rawUrl = req.query["url"];
  const rawW   = req.query["w"];
  const rawQ   = req.query["q"];
  const rawF   = req.query["f"];

  if (!rawUrl || typeof rawUrl !== "string") {
    res.status(400).json({ error: "Parâmetro 'url' é obrigatório." });
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    res.status(400).json({ error: "URL inválida." });
    return;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    res.status(400).json({ error: "Apenas URLs http/https são permitidas." });
    return;
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    res.status(403).json({ error: `Domínio não permitido: ${parsed.hostname}` });
    return;
  }

  const w = Math.min(
    Math.max(parseInt(typeof rawW === "string" ? rawW : `${DEFAULT_W}`, 10) || DEFAULT_W, 1),
    MAX_WIDTH
  );
  const q = Math.min(
    Math.max(parseInt(typeof rawQ === "string" ? rawQ : `${DEFAULT_Q}`, 10) || DEFAULT_Q, 1),
    MAX_Q
  );
  const fmt = (typeof rawF === "string" && rawF === "avif") ? "avif" as const : "webp" as const;
  const mime = fmt === "avif" ? "image/avif" : "image/webp";

  const key  = cacheKey(rawUrl, w, q, fmt);
  const etag = `"${key.slice(0, 16)}"`;

  if (req.headers["if-none-match"] === etag) {
    res.status(304).end();
    return;
  }

  let processed: Buffer;
  let cacheHit = "MISS";

  // Fast path: memória
  const memHit = memGet(key);
  if (memHit) {
    processed = memHit;
    cacheHit = "MEM";
  } else {
    // Disk ou fetch
    await fs.mkdir(CACHE_DIR, { recursive: true }).catch(() => undefined);
    const diskHit = await diskRead(key);
    if (diskHit) {
      memSet(key, diskHit);
      processed = diskHit;
      cacheHit = "DISK";
    } else {
      // Fetch com coalescing
      let pending = inFlight.get(key);
      if (!pending) {
        pending = fetchAndProcess(rawUrl, w, q, fmt)
          .then((buf) => {
            memSet(key, buf);
            void diskWrite(key, buf);
            return buf;
          })
          .finally(() => inFlight.delete(key));
        inFlight.set(key, pending);
      }

      try {
        processed = await pending;
      } catch (err) {
        req.log.warn({ err, url: rawUrl }, "image-proxy: fetch/process failed");
        res.status(502).json({ error: "Não foi possível buscar ou processar a imagem de origem." });
        return;
      }
    }
  }

  res
    .set("Content-Type", mime)
    .set("Cache-Control", "public, max-age=31536000, immutable")
    .set("ETag", etag)
    .set("X-Image-Cache", cacheHit)
    .end(processed);
});

export default router;
