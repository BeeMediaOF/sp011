/**
 * Upload routes — backed by Replit Object Storage (GCS).
 *
 * Files are received via multipart (multer memoryStorage) and uploaded
 * directly to GCS via the Replit sidecar's presigned-URL endpoint.
 * The sidecar is available at http://127.0.0.1:1106 on any Replit deployment.
 *
 * Serving: GET /api/uploads/:filename
 *   → generates a short-lived signed GET URL from the sidecar
 *   → fetches the file from GCS and streams it to the client
 *   → client receives Cache-Control: immutable (browser caches for 1 year)
 *   → falls back to local disk for files uploaded before GCS migration
 */

import { Router } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { extname, join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync } from "fs";
import { authMiddleware } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Legacy local dir — only used as fallback for pre-migration files
const LOCAL_UPLOADS_DIR = join(__dirname, "../../data/uploads");
if (!existsSync(LOCAL_UPLOADS_DIR)) mkdirSync(LOCAL_UPLOADS_DIR, { recursive: true });

// ── GCS via Replit sidecar ─────────────────────────────────────────────────────
const SIDECAR = "http://127.0.0.1:1106";
const BUCKET = process.env["DEFAULT_OBJECT_STORAGE_BUCKET_ID"] ?? "";
const GCS_PREFIX = "uploads"; // all uploads go to gs://<bucket>/uploads/<filename>

const gcsConfigured = !!BUCKET;

async function gcsSignedUrl(objectName: string, method: "PUT" | "GET", ttlSec = 900): Promise<string> {
  const res = await fetch(`${SIDECAR}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: BUCKET,
      object_name: objectName,
      method,
      expires_at: new Date(Date.now() + ttlSec * 1_000).toISOString(),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Sidecar signed URL failed: ${res.status}`);
  const body = await res.json() as { signed_url: string };
  return body.signed_url;
}

async function gcsUpload(filename: string, buffer: Buffer, contentType: string): Promise<void> {
  const objectName = `${GCS_PREFIX}/${filename}`;
  const signedUrl = await gcsSignedUrl(objectName, "PUT", 900);
  const res = await fetch(signedUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: buffer,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`GCS upload failed: ${res.status} ${await res.text()}`);
}

async function gcsDownload(filename: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const objectName = `${GCS_PREFIX}/${filename}`;
    const signedUrl = await gcsSignedUrl(objectName, "GET", 3_600);
    const res = await fetch(signedUrl, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    const buffer = Buffer.from(await res.arrayBuffer());
    return { buffer, contentType };
  } catch {
    return null;
  }
}

// ── File type / size constraints ──────────────────────────────────────────────
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-msvideo", "video/x-matroska"]);

const IMAGE_MAX = 8 * 1024 * 1024;   // 8 MB
const VIDEO_MAX = 100 * 1024 * 1024; // 100 MB

// Use memory storage — files are uploaded to GCS immediately after multer parses them
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
router.post("/image", authMiddleware, upload.single("image"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Nenhum arquivo enviado. Campo esperado: 'image'." });
    return;
  }
  if (req.file.size > IMAGE_MAX) {
    res.status(413).json({ error: `Imagem muito grande. Máximo: ${IMAGE_MAX / 1024 / 1024} MB.` });
    return;
  }

  const filename = buildFilename(req.file.originalname, req.body["title"]);

  try {
    if (gcsConfigured) {
      await gcsUpload(filename, req.file.buffer, req.file.mimetype);
      logger.info({ filename, size: req.file.size, storage: "gcs" }, "Image uploaded to GCS");
    } else {
      // GCS not configured — fall back to local disk (dev only)
      const { writeFileSync } = await import("fs");
      writeFileSync(join(LOCAL_UPLOADS_DIR, filename), req.file.buffer);
      logger.warn({ filename }, "GCS not configured — image saved to local disk");
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
router.post("/media", authMiddleware, upload.single("media"), async (req, res) => {
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

  const filename = buildFilename(req.file.originalname, req.body["title"]);

  try {
    if (gcsConfigured) {
      await gcsUpload(filename, req.file.buffer, req.file.mimetype);
      logger.info({ filename, size: req.file.size, mediaType, storage: "gcs" }, "Media uploaded to GCS");
    } else {
      const { writeFileSync } = await import("fs");
      writeFileSync(join(LOCAL_UPLOADS_DIR, filename), req.file.buffer);
      logger.warn({ filename, mediaType }, "GCS not configured — media saved to local disk");
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
 * Serves files from GCS (primary) or local disk (legacy fallback).
 * Browser cache: 1 year immutable (file URL never changes once uploaded).
 */
router.get("/:filename", async (req, res) => {
  const filename = String(req.params["filename"] ?? "").replace(/[^a-zA-Z0-9._-]/g, "");
  if (!filename) { res.status(400).json({ error: "Filename inválido" }); return; }

  // 1. Try GCS first
  if (gcsConfigured) {
    const result = await gcsDownload(filename);
    if (result) {
      res.setHeader("Content-Type", result.contentType);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("Content-Length", String(result.buffer.length));
      res.send(result.buffer);
      return;
    }
  }

  // 2. Fallback to local disk (pre-migration files)
  const localPath = join(LOCAL_UPLOADS_DIR, filename);
  if (existsSync(localPath)) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.sendFile(localPath);
    return;
  }

  res.status(404).json({ error: "Arquivo não encontrado" });
});

export default router;
