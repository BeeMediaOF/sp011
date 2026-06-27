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
 *
 * O pipeline sharp + cache em disco/memória + coalescing vive em lib/imageTransform.ts
 * (compartilhado com routes/uploads.ts).
 */

import { Router } from "express";
import sharp from "sharp";
import {
  cacheKey,
  memGet,
  resolveImage,
  DEFAULT_W,
  DEFAULT_Q,
  MAX_WIDTH,
  MAX_Q,
  type ImageFormat,
} from "../lib/imageTransform.js";

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

// ── Domain-specific fetch headers ────────────────────────────────────────────
// Some origins block generic bot user-agents. Override per hostname as needed.
const DOMAIN_HEADERS: Record<string, Record<string, string>> = {
  // EBC (Agência Brasil / imagens.ebc.com.br) blocks non-browser UAs → use Googlebot
  "agenciabrasil.ebc.com.br": {
    "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Referer":    "https://agenciabrasil.ebc.com.br/",
    "Accept":     "image/*,*/*;q=0.8",
  },
  "imagens.ebc.com.br": {
    "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Referer":    "https://agenciabrasil.ebc.com.br/",
    "Accept":     "image/*,*/*;q=0.8",
  },
};

const DEFAULT_FETCH_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (compatible; SBCAgora/2.0; +https://sbcagora.com.br)",
  "Accept":     "image/*,*/*;q=0.8",
};

// ── Fallback placeholder ──────────────────────────────────────────────────────
// Returned (as WebP) when the upstream image cannot be fetched, so the browser
// never gets a broken-image box or a 502 error.
const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
  <rect width="800" height="450" fill="#f3f4f6"/>
  <text x="400" y="210" font-family="system-ui,sans-serif" font-size="28" fill="#9ca3af" text-anchor="middle">SBC Agora</text>
  <text x="400" y="250" font-family="system-ui,sans-serif" font-size="16" fill="#d1d5db" text-anchor="middle">Imagem indisponível</text>
</svg>`;

let _placeholderWebP: Buffer | null = null;
async function getPlaceholder(): Promise<Buffer> {
  if (_placeholderWebP) return _placeholderWebP;
  _placeholderWebP = await sharp(Buffer.from(PLACEHOLDER_SVG)).webp({ quality: 60, effort: 1 }).toBuffer();
  return _placeholderWebP;
}

// ── Busca a imagem de origem (com headers por domínio e validação) ────────────
async function fetchOriginRaw(url: string): Promise<Buffer> {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("invalid_url"); }

  const domainHeaders = DOMAIN_HEADERS[parsed.hostname] ?? DEFAULT_FETCH_HEADERS;

  const resp = await fetch(url, {
    headers: domainHeaders,
    signal: AbortSignal.timeout(6_000),
    redirect: "follow",
  });

  if (!resp.ok) throw new Error(`origin_error:${resp.status}`);

  const ct = resp.headers.get("content-type") ?? "";
  if (!ct.startsWith("image/")) throw new Error("not_an_image");

  return Buffer.from(await resp.arrayBuffer());
}

// ── Warm cache (chamado no startup para pré-aquecer artigos recentes) ─────────
/**
 * Pré-aquece o cache de imagens para as URLs fornecidas.
 * Processa em lotes de 4 para não saturar a rede na inicialização.
 */
export async function warmImageCache(
  imageUrls: string[],
  widths: number[] = [480, 768],
  q = DEFAULT_Q,
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
          const key = cacheKey(url, w, q, "webp");
          await resolveImage(key, () => fetchOriginRaw(url), w, q, "webp");
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
    MAX_WIDTH,
  );
  const q = Math.min(
    Math.max(parseInt(typeof rawQ === "string" ? rawQ : `${DEFAULT_Q}`, 10) || DEFAULT_Q, 1),
    MAX_Q,
  );
  const fmt: ImageFormat = (typeof rawF === "string" && rawF === "avif") ? "avif" : "webp";
  const mime = fmt === "avif" ? "image/avif" : "image/webp";

  const key  = cacheKey(rawUrl, w, q, fmt);
  const etag = `"${key.slice(0, 16)}"`;

  if (req.headers["if-none-match"] === etag) {
    res.status(304).end();
    return;
  }

  const memHit = memGet(key);
  const cacheHit = memHit ? "MEM" : "MISS";

  let processed: Buffer;
  try {
    processed = memHit ?? (await resolveImage(key, () => fetchOriginRaw(rawUrl), w, q, fmt));
  } catch (err) {
    req.log.warn({ err, url: rawUrl }, "image-proxy: fetch/process failed — serving placeholder");
    // Return a neutral placeholder instead of a 502, so the browser never
    // shows a broken-image box. Short cache so the real image is retried soon.
    try {
      const placeholder = await getPlaceholder();
      res
        .set("Content-Type", "image/webp")
        .set("Cache-Control", "public, max-age=300")
        .set("X-Image-Cache", "PLACEHOLDER")
        .end(placeholder);
    } catch {
      res.status(502).json({ error: "Imagem indisponível." });
    }
    return;
  }

  res
    .set("Content-Type", mime)
    .set("Cache-Control", "public, max-age=31536000, immutable")
    .set("ETag", etag)
    .set("X-Image-Cache", cacheHit)
    .end(processed);
});

export default router;
