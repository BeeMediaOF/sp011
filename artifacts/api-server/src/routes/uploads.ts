/**
 * Upload routes — backed by Supabase Storage (S3-compatible object store).
 *
 * Files are received via multipart (multer memoryStorage) and uploaded
 * directly to a Supabase Storage bucket via its REST API using the
 * service-role key (server-side only, bypasses RLS).
 *
 * Serving: GET /api/uploads/:filename
 *   → fetches the object from Supabase Storage and streams it to the client
 *   → client receives Cache-Control: immutable (browser caches for 1 year)
 *   → falls back to local disk when Supabase Storage is not configured (dev)
 *
 * Required env:
 *   SUPABASE_URL                — e.g. https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY   — service_role key (Settings → API)
 *   SUPABASE_STORAGE_BUCKET     — bucket name (default: "uploads")
 */

import { Router } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { extname, join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync } from "fs";
import { Readable } from "stream";
import { readFileSync } from "fs";
import { authMiddleware } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permissions.js";
import { logger } from "../lib/logger.js";
import {
  cacheKey,
  memGet,
  resolveImage,
  DEFAULT_Q,
  MAX_WIDTH,
  MAX_Q,
  type ImageFormat,
} from "../lib/imageTransform.js";

const isProd = process.env["NODE_ENV"] === "production";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Local dir — used as fallback when Supabase Storage is not configured (dev only).
const LOCAL_UPLOADS_DIR = join(__dirname, "../../data/uploads");
if (!existsSync(LOCAL_UPLOADS_DIR)) mkdirSync(LOCAL_UPLOADS_DIR, { recursive: true });

// ── Supabase Storage (REST API) ────────────────────────────────────────────────
const SUPABASE_URL = (process.env["SUPABASE_URL"] ?? "").replace(/\/+$/, "");
const SERVICE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
const BUCKET = process.env["SUPABASE_STORAGE_BUCKET"] ?? "uploads";
const STORAGE_PREFIX = "uploads"; // objects stored at <bucket>/uploads/<filename>

const storageConfigured = !!(SUPABASE_URL && SERVICE_KEY);

// In production we require object storage — silently writing to local disk would
// scatter files across ephemeral instances and lose them on redeploy.
if (isProd && !storageConfigured) {
  logger.error(
    "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configuradas — uploads ficarão indisponíveis em produção. " +
      "Configure o Supabase Storage para habilitar o envio de imagens/vídeos.",
  );
}

function objectUrl(filename: string): string {
  return `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${STORAGE_PREFIX}/${encodeURIComponent(filename)}`;
}

async function storageUpload(filename: string, buffer: Buffer, contentType: string): Promise<void> {
  const res = await fetch(objectUrl(filename), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": contentType,
      "x-upsert": "true",
      "cache-control": "31536000",
    },
    body: buffer,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Supabase Storage upload failed: ${res.status} ${await res.text()}`);
}

async function storageDownload(
  filename: string,
): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string; contentLength: string | null } | null> {
  try {
    const res = await fetch(objectUrl(filename), {
      headers: { Authorization: `Bearer ${SERVICE_KEY}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok || !res.body) return null;
    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    const contentLength = res.headers.get("content-length");
    return { stream: res.body, contentType, contentLength };
  } catch {
    return null;
  }
}

/**
 * Carrega o arquivo inteiro em memória (Supabase Storage → fallback disco local).
 * Usado pelo caminho de transformação (sharp precisa do buffer completo).
 */
async function loadRawBuffer(
  filename: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (storageConfigured) {
    try {
      const res = await fetch(objectUrl(filename), {
        headers: { Authorization: `Bearer ${SERVICE_KEY}` },
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        const contentType = res.headers.get("content-type") ?? "application/octet-stream";
        return { buffer: Buffer.from(await res.arrayBuffer()), contentType };
      }
    } catch {
      // cai para o disco local
    }
  }
  const localPath = join(LOCAL_UPLOADS_DIR, filename);
  if (existsSync(localPath)) {
    const ext = extname(filename).toLowerCase();
    const contentType =
      ext === ".png" ? "image/png" :
      ext === ".webp" ? "image/webp" :
      ext === ".avif" ? "image/avif" :
      ext === ".gif" ? "image/gif" :
      (ext === ".jpg" || ext === ".jpeg") ? "image/jpeg" :
      "application/octet-stream";
    return { buffer: readFileSync(localPath), contentType };
  }
  return null;
}

// Formatos estáticos que valem a pena reprocessar para WebP/AVIF.
// GIF (possivelmente animado) e vídeos são servidos crus.
const TRANSFORMABLE = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

// ── File type / size constraints ──────────────────────────────────────────────
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-msvideo", "video/x-matroska"]);

const IMAGE_MAX = 8 * 1024 * 1024;   // 8 MB
const VIDEO_MAX = 100 * 1024 * 1024; // 100 MB

// Use memory storage — files are uploaded to Storage immediately after multer parses them
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: VIDEO_MAX },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_TYPES.has(file.mimetype) || VIDEO_TYPES.has(file.mimetype)) cb(null, true);
    else cb(new Error(`Tipo não permitido: ${file.mimetype}. Use JPEG, PNG, WebP, GIF, MP4, WebM ou MOV.`));
  },
});

// ── Filename helpers ───────────────────────────────────────────────────────────
function slugifyFilename(title: string, ext: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const suffix = randomUUID().slice(0, 8);
  return slug ? `${slug}-${suffix}${ext}` : `${randomUUID()}${ext}`;
}

function buildFilename(originalName: string, title: unknown): string {
  const ext = extname(originalName).toLowerCase() || ".bin";
  if (typeof title === "string" && title.trim()) return slugifyFilename(title.trim(), ext);
  return `${randomUUID()}${ext}`;
}

// ── Router ────────────────────────────────────────────────────────────────────
const router = Router();

/**
 * POST /api/uploads/image
 * Multipart upload — field name: "image"
 * Optional field: "title" — generates a SEO-friendly filename
 */
router.post("/image", authMiddleware, requirePermission("upload.images"), upload.single("image"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Nenhum arquivo enviado. Campo esperado: 'image'." });
    return;
  }
  if (req.file.size > IMAGE_MAX) {
    res.status(413).json({ error: `Imagem muito grande. Máximo: ${IMAGE_MAX / 1024 / 1024} MB.` });
    return;
  }

  if (isProd && !storageConfigured) {
    res.status(503).json({ error: "Armazenamento de arquivos indisponível. Configure o Supabase Storage." });
    return;
  }

  const filename = buildFilename(req.file.originalname, req.body["title"]);

  try {
    if (storageConfigured) {
      await storageUpload(filename, req.file.buffer, req.file.mimetype);
      logger.info({ filename, size: req.file.size, storage: "supabase" }, "Image uploaded to Supabase Storage");
    } else {
      // Storage not configured — fall back to local disk (dev only)
      const { writeFileSync } = await import("fs");
      writeFileSync(join(LOCAL_UPLOADS_DIR, filename), req.file.buffer);
      logger.warn({ filename }, "Supabase Storage not configured — image saved to local disk");
    }
  } catch (err) {
    logger.error({ err, filename }, "Image upload failed");
    res.status(500).json({ error: "Falha ao salvar a imagem. Tente novamente." });
    return;
  }

  const url = `/api/uploads/${filename}`;
  res.status(201).json({ ok: true, url, filename, size: req.file.size });
});

/**
 * POST /api/uploads/media
 * Multipart upload — field name: "media"
 * Accepts images and videos. Optional field: "title".
 */
router.post("/media", authMiddleware, requirePermission("upload.images"), upload.single("media"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Nenhum arquivo enviado. Campo esperado: 'media'." });
    return;
  }
  const mime = req.file.mimetype;
  const mediaType: "image" | "video" = VIDEO_TYPES.has(mime) ? "video" : "image";
  if (mediaType === "image" && req.file.size > IMAGE_MAX) {
    res.status(413).json({ error: `Imagem muito grande. Máximo: ${IMAGE_MAX / 1024 / 1024} MB.` });
    return;
  }

  if (isProd && !storageConfigured) {
    res.status(503).json({ error: "Armazenamento de arquivos indisponível. Configure o Supabase Storage." });
    return;
  }

  const filename = buildFilename(req.file.originalname, req.body["title"]);

  try {
    if (storageConfigured) {
      await storageUpload(filename, req.file.buffer, req.file.mimetype);
      logger.info({ filename, size: req.file.size, mediaType, storage: "supabase" }, "Media uploaded to Supabase Storage");
    } else {
      const { writeFileSync } = await import("fs");
      writeFileSync(join(LOCAL_UPLOADS_DIR, filename), req.file.buffer);
      logger.warn({ filename, mediaType }, "Supabase Storage not configured — media saved to local disk");
    }
  } catch (err) {
    logger.error({ err, filename }, "Media upload failed");
    res.status(500).json({ error: "Falha ao salvar o arquivo. Tente novamente." });
    return;
  }

  const url = `/api/uploads/${filename}`;
  res.status(201).json({ ok: true, url, filename, size: req.file.size, mediaType });
});

/**
 * GET /api/uploads/:filename
 * Serves files from Supabase Storage (primary) or local disk (fallback).
 * Browser cache: 1 year immutable (file URL never changes once uploaded).
 *
 * Query opcional de otimização (apenas para imagens estáticas):
 *   w  — largura alvo em px (resize, máx 1600) — ATIVA a transformação
 *   q  — qualidade 1-100 (padrão 82)
 *   f  — formato: "webp" (padrão) | "avif"
 * Sem `w`, o objeto é transmitido cru (comportamento original, retrocompatível).
 * GIFs (possivelmente animados) e vídeos são sempre servidos crus.
 */
router.get("/:filename", async (req, res) => {
  const filename = String(req.params["filename"] ?? "").replace(/[^a-zA-Z0-9._-]/g, "");
  if (!filename) { res.status(400).json({ error: "Filename inválido" }); return; }

  // ── Caminho de transformação: redimensiona + converte para WebP/AVIF ──────────
  const rawW = req.query["w"];
  if (typeof rawW === "string" && rawW.trim() !== "") {
    const w = Math.min(Math.max(parseInt(rawW, 10) || 0, 1), MAX_WIDTH);
    const q = Math.min(
      Math.max(parseInt(typeof req.query["q"] === "string" ? (req.query["q"] as string) : `${DEFAULT_Q}`, 10) || DEFAULT_Q, 1),
      MAX_Q,
    );
    const fmt: ImageFormat = req.query["f"] === "avif" ? "avif" : "webp";
    const mime = fmt === "avif" ? "image/avif" : "image/webp";

    const key  = cacheKey(`upload:${filename}`, w, q, fmt);
    const etag = `"${key.slice(0, 16)}"`;
    if (req.headers["if-none-match"] === etag) { res.status(304).end(); return; }

    const memHit = memGet(key);
    if (memHit) {
      res.set("Content-Type", mime)
        .set("Cache-Control", "public, max-age=31536000, immutable")
        .set("ETag", etag).set("X-Image-Cache", "MEM").end(memHit);
      return;
    }

    try {
      const processed = await resolveImage(
        key,
        async () => {
          const raw = await loadRawBuffer(filename);
          if (!raw) throw new Error("not_found");
          if (!TRANSFORMABLE.has(raw.contentType)) throw new Error(`skip:${raw.contentType}`);
          return raw.buffer;
        },
        w, q, fmt,
      );
      res.set("Content-Type", mime)
        .set("Cache-Control", "public, max-age=31536000, immutable")
        .set("ETag", etag).set("X-Image-Cache", "MISS").end(processed);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "not_found") { res.status(404).json({ error: "Arquivo não encontrado" }); return; }
      // GIF animado / vídeo / falha no sharp → cai para o streaming cru abaixo.
      req.log?.warn?.({ err, filename }, "uploads: transform pulado — servindo original");
    }
  }

  // 1. Try Supabase Storage first — stream the object straight through.
  if (storageConfigured) {
    const result = await storageDownload(filename);
    if (result) {
      res.setHeader("Content-Type", result.contentType);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      if (result.contentLength) res.setHeader("Content-Length", result.contentLength);
      const nodeStream = Readable.fromWeb(result.stream as Parameters<typeof Readable.fromWeb>[0]);
      nodeStream.on("error", () => { if (!res.headersSent) res.status(502).end(); else res.destroy(); });
      nodeStream.pipe(res);
      return;
    }
  }

  // 2. Fallback to local disk
  const localPath = join(LOCAL_UPLOADS_DIR, filename);
  if (existsSync(localPath)) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.sendFile(localPath);
    return;
  }

  res.status(404).json({ error: "Arquivo não encontrado" });
});

export default router;
