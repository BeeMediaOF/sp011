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
 *   1. In-memory LRU (100 entradas) — sub-ms
 *   2. Disco em /tmp/img-proxy-cache/ — persistente pelo processo
 *   3. Browser: Cache-Control immutable + ETag — 1 ano
 *
 * Segurança:
 *   - Allowlist estrita de domínios de origem
 *   - Validação de largura e qualidade com limites máximos
 *   - Content-Type verificado antes de processar
 *   - Timeout de fetch de 10 s
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

// ── Config ───────────────────────────────────────────────────────────────────
const MAX_WIDTH    = 1600;
const DEFAULT_W    = 800;
const DEFAULT_Q    = 82;
const MAX_Q        = 100;
const CACHE_DIR    = path.join(os.tmpdir(), "img-proxy-cache");
const MEM_MAX      = 100; // entradas no LRU em memória

// ── LRU em memória simples ────────────────────────────────────────────────────
// Map preserva ordem de inserção; deletamos o mais antigo quando cheio.
const memCache = new Map<string, Buffer>();

function memGet(key: string): Buffer | undefined {
  const val = memCache.get(key);
  if (val !== undefined) {
    memCache.delete(key);
    memCache.set(key, val); // move to end = most recently used
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
  // subdirectório de 2 chars para não lotar uma pasta só
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

// ── Rota ──────────────────────────────────────────────────────────────────────
router.get("/image", async (req, res) => {
  const rawUrl = req.query["url"];
  const rawW   = req.query["w"];
  const rawQ   = req.query["q"];
  const rawF   = req.query["f"];

  // ── Validar url ────────────────────────────────────────────────────────────
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

  // ── Validar parâmetros numéricos ───────────────────────────────────────────
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

  // ── Cache key + ETag ───────────────────────────────────────────────────────
  const key  = cacheKey(rawUrl, w, q, fmt);
  const etag = `"${key.slice(0, 16)}"`;

  // ETag negociação — retorna 304 se browser já tem a versão em cache
  if (req.headers["if-none-match"] === etag) {
    res.status(304).end();
    return;
  }

  // ── Verificar LRU em memória ───────────────────────────────────────────────
  const memHit = memGet(key);
  if (memHit) {
    res
      .set("Content-Type", mime)
      .set("Cache-Control", "public, max-age=31536000, immutable")
      .set("ETag", etag)
      .set("X-Image-Cache", "MEM")
      .end(memHit);
    return;
  }

  // ── Verificar cache em disco ───────────────────────────────────────────────
  await fs.mkdir(CACHE_DIR, { recursive: true }).catch(() => undefined);
  const diskHit = await diskRead(key);
  if (diskHit) {
    memSet(key, diskHit);
    res
      .set("Content-Type", mime)
      .set("Cache-Control", "public, max-age=31536000, immutable")
      .set("ETag", etag)
      .set("X-Image-Cache", "DISK")
      .end(diskHit);
    return;
  }

  // ── Buscar imagem na origem ────────────────────────────────────────────────
  let originResp: globalThis.Response;
  try {
    originResp = await fetch(rawUrl, {
      headers: {
        "User-Agent": "SBCAgora-ImageProxy/1.0",
        Accept: "image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    req.log.error({ err, url: rawUrl }, "image-proxy: fetch failed");
    res.status(502).json({ error: "Não foi possível buscar a imagem de origem." });
    return;
  }

  if (!originResp.ok) {
    req.log.warn({ status: originResp.status, url: rawUrl }, "image-proxy: origin error");
    res.status(502).json({ error: `Origem retornou ${originResp.status}.` });
    return;
  }

  const ct = originResp.headers.get("content-type") ?? "";
  if (!ct.startsWith("image/")) {
    res.status(400).json({ error: "URL de origem não é uma imagem." });
    return;
  }

  // ── Processar com sharp ────────────────────────────────────────────────────
  let processed: Buffer;
  try {
    const raw = Buffer.from(await originResp.arrayBuffer());
    const pipeline = sharp(raw).resize({ width: w, withoutEnlargement: true });

    if (fmt === "avif") {
      processed = await pipeline.avif({ quality: q, effort: 4 }).toBuffer();
    } else {
      processed = await pipeline.webp({ quality: q, effort: 4 }).toBuffer();
    }
  } catch (err) {
    req.log.error({ err, url: rawUrl, w, q, fmt }, "image-proxy: sharp failed");
    res.status(500).json({ error: "Erro ao processar imagem." });
    return;
  }

  // ── Armazenar em cache (não-bloqueante) ────────────────────────────────────
  memSet(key, processed);
  void diskWrite(key, processed);

  res
    .set("Content-Type", mime)
    .set("Cache-Control", "public, max-age=31536000, immutable")
    .set("ETag", etag)
    .set("X-Image-Cache", "MISS")
    .end(processed);
});

export default router;
