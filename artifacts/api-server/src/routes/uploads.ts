import { Router } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { extname, join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync, renameSync } from "fs";
import { authMiddleware } from "../middlewares/auth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, "../../data/uploads");

if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-msvideo", "video/x-matroska"]);
const ALLOWED_TYPES = new Set([...IMAGE_TYPES, ...VIDEO_TYPES]);

const IMAGE_MAX = 8 * 1024 * 1024;   // 8 MB
const VIDEO_MAX = 100 * 1024 * 1024; // 100 MB

/**
 * Convert a free-form title into a URL/filename-safe slug.
 * "Novo Estádio em Brasília!" → "novo-estadio-em-brasilia"
 */
function slugifyFilename(title: string, ext: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // strip accent combining marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")       // non-alphanumeric → hyphen
    .replace(/^-+|-+$/g, "")           // trim leading/trailing hyphens
    .slice(0, 80);                      // keep filenames reasonable
  const suffix = randomUUID().slice(0, 8); // short suffix avoids collisions
  return slug ? `${slug}-${suffix}${ext}` : `${randomUUID()}${ext}`;
}

/** If the request body carries a `title` field, rename the uploaded file and return the new name. */
function applySlugFilename(originalFilename: string, title: unknown): string {
  if (typeof title !== "string" || !title.trim()) return originalFilename;
  const ext = extname(originalFilename).toLowerCase() || ".bin";
  const newFilename = slugifyFilename(title.trim(), ext);
  try {
    renameSync(join(UPLOADS_DIR, originalFilename), join(UPLOADS_DIR, newFilename));
    return newFilename;
  } catch {
    return originalFilename; // rename failed → keep UUID name
  }
}

// Always use UUID for the initial disk write (safe, no conflicts)
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase() || ".bin";
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: VIDEO_MAX },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_TYPES.has(file.mimetype)) cb(null, true);
    else if (VIDEO_TYPES.has(file.mimetype)) cb(null, true);
    else cb(new Error(`Tipo não permitido: ${file.mimetype}. Use JPEG, PNG, WebP, GIF, MP4, WebM ou MOV.`));
  },
});

void ALLOWED_TYPES; // suppress unused-var warning

const router = Router();

/**
 * POST /api/uploads/image
 * Multipart upload — field name: "image"
 * Optional field: "title" (string) — used to generate a SEO-friendly filename
 * Returns: { url: "/api/uploads/<filename>" }
 */
router.post("/image", authMiddleware, upload.single("image"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Nenhum arquivo enviado. Campo esperado: 'image'." });
    return;
  }
  const filename = applySlugFilename(req.file.filename, req.body["title"]);
  const url = `/api/uploads/${filename}`;
  req.log.info({ filename, size: req.file.size }, "Image uploaded");
  res.status(201).json({ ok: true, url, filename, size: req.file.size });
});

/**
 * POST /api/uploads/media
 * Multipart upload — field name: "media"
 * Optional field: "title" (string) — used to generate a SEO-friendly filename
 * Accepts images (JPEG, PNG, WebP, GIF, AVIF) and videos (MP4, WebM, MOV, AVI, MKV).
 * Returns: { url, filename, size, mediaType: "image" | "video" }
 */
router.post("/media", authMiddleware, upload.single("media"), (req, res) => {
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
  const filename = applySlugFilename(req.file.filename, req.body["title"]);
  const url = `/api/uploads/${filename}`;
  req.log.info({ filename, size: req.file.size, mediaType }, "Media uploaded");
  res.status(201).json({ ok: true, url, filename, size: req.file.size, mediaType });
});

/**
 * GET /api/uploads/:filename
 * Serve uploaded files publicly (images and videos).
 */
router.get("/:filename", (req, res) => {
  const filename = String(req.params["filename"] ?? "").replace(/[^a-zA-Z0-9._-]/g, "");
  if (!filename) { res.status(400).json({ error: "Filename inválido" }); return; }
  const filepath = join(UPLOADS_DIR, filename);
  if (!existsSync(filepath)) { res.status(404).json({ error: "Arquivo não encontrado" }); return; }
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.sendFile(filepath);
});

export default router;
