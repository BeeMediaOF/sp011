import { Router } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { extname, join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync } from "fs";
import { authMiddleware } from "../middlewares/auth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, "../../data/uploads");

if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const MAX_SIZE = 8 * 1024 * 1024; // 8 MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.has(file.mimetype)) cb(null, true);
    else cb(new Error(`Tipo de arquivo não permitido: ${file.mimetype}. Use JPEG, PNG, WebP ou GIF.`));
  },
});

const router = Router();

/**
 * POST /api/uploads/image
 * Multipart upload — field name: "image"
 * Returns: { url: "/api/uploads/<filename>" }
 */
router.post("/image", authMiddleware, upload.single("image"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Nenhum arquivo enviado. Campo esperado: 'image'." });
    return;
  }
  const url = `/api/uploads/${req.file.filename}`;
  req.log.info({ filename: req.file.filename, size: req.file.size }, "Image uploaded");
  res.status(201).json({ ok: true, url, filename: req.file.filename, size: req.file.size });
});

/**
 * GET /api/uploads/:filename
 * Serve uploaded images publicly.
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
