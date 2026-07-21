/**
 * Upload routes — disco local (volume persistente) como armazenamento primário.
 *
 * Files are received via multipart (multer memoryStorage) and gravados em
 * UPLOADS_DIR (produção: /data/uploads — volume api_data do compose, presente
 * também no template de blog replicado).
 *
 * Serving: GET /api/uploads/:filename
 *   → serve do disco local (Cache-Control: immutable, 1 ano)
 *   → se não existir localmente e o Supabase Storage estiver configurado,
 *     cai para o bucket (SOMENTE LEITURA — arquivos legados da migração)
 *
 * Por que local e não Supabase Storage: os poucos arquivos (logos/artes de
 * template) eram baixados do Supabase a cada pageview e estouraram a cota de
 * egress do plano free — o Storage passou a responder 402 e o upload quebrava
 * com 500 (jul/2026). Servindo do disco da VPS o egress de arquivos é zero.
 *
 * Env opcional:
 *   UPLOADS_DIR                 — diretório dos uploads (padrão em produção: /data/uploads)
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_STORAGE_BUCKET
 *                               — usados apenas como fallback de leitura (legado)
 */

import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { extname, join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { Readable } from "stream";
import { authMiddleware } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permissions.js";
import { endpointRateLimit } from "../middlewares/endpointRateLimit.js";
import { logger } from "../lib/logger.js";
import {
  cacheKey,
  memGet,
  resolveImage,
  DEFAULT_Q,
  MAX_WIDTH,
  MAX_Q,
  MAX_INPUT_PIXELS,
  type ImageFormat,
} from "../lib/imageTransform.js";

/** Rate limit de upload (PRD-11): 60/min por IP nas rotas de POST. */
const uploadRateLimit = endpointRateLimit("/api/uploads", { limit: 60, windowMs: 60_000 });

/**
 * Rejeita bomba de decompressão (PRD-11): decodifica só o cabeçalho e verifica
 * as dimensões ANTES de gravar. Retorna true se pode prosseguir; se não, já
 * respondeu o erro. Vídeos NÃO passam por aqui.
 */
async function imageDimensionsOk(buffer: Buffer, res: import("express").Response): Promise<boolean> {
  try {
    const meta = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    if ((meta.width ?? 0) * (meta.height ?? 0) > MAX_INPUT_PIXELS) {
      res.status(413).json({ error: "Imagem excede o limite de dimensões permitido." });
      return false;
    }
    return true;
  } catch {
    res.status(422).json({ error: "Imagem inválida ou corrompida." });
    return false;
  }
}

const isProd = process.env["NODE_ENV"] === "production";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Armazenamento primário. Produção: /data/uploads (volume api_data — sobrevive
// a rebuilds do container). Dev: pasta local do pacote. UPLOADS_DIR sobrepõe.
const LOCAL_UPLOADS_DIR =
  process.env["UPLOADS_DIR"] ?? (isProd ? "/data/uploads" : join(__dirname, "../../data/uploads"));
if (!existsSync(LOCAL_UPLOADS_DIR)) mkdirSync(LOCAL_UPLOADS_DIR, { recursive: true });

// ── Supabase Storage (REST API) — apenas leitura de arquivos legados ──────────
const STORAGE_PREFIX = "uploads"; // objects stored at <bucket>/uploads/<filename>

// Lido sob demanda (não no import): quando a conexão vem do arquivo do
// assistente de instalação, o boot injeta SUPABASE_URL/SERVICE_ROLE_KEY em
// process.env DEPOIS deste módulo carregar. A env explícita continua mandando.
function storageEnv(): { url: string; key: string; bucket: string; configured: boolean } {
  const url = (process.env["SUPABASE_URL"] ?? "").replace(/\/+$/, "");
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  const bucket = process.env["SUPABASE_STORAGE_BUCKET"] ?? "uploads";
  return { url, key, bucket, configured: !!(url && key) };
}

/** Log de boot: onde os uploads são gravados — chamado após resolver a conexão. */
export function logUploadsStorage(): void {
  logger.info(
    { dir: LOCAL_UPLOADS_DIR, legacyFallback: storageEnv().configured },
    "Uploads em disco local (Supabase Storage apenas como fallback de leitura de legados)",
  );
}

function objectUrl(filename: string): string {
  const { url, bucket } = storageEnv();
  return `${url}/storage/v1/object/${bucket}/${STORAGE_PREFIX}/${encodeURIComponent(filename)}`;
}

async function storageDownload(
  filename: string,
): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string; contentLength: string | null } | null> {
  try {
    const res = await fetch(objectUrl(filename), {
      headers: { Authorization: `Bearer ${storageEnv().key}` },
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
 * Carrega o arquivo inteiro em memória (disco local → fallback Supabase Storage).
 * Usado pelo caminho de transformação (sharp precisa do buffer completo).
 */
async function loadRawBuffer(
  filename: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
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
router.post("/image", uploadRateLimit, authMiddleware, requirePermission("upload.images"), upload.single("image"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Nenhum arquivo enviado. Campo esperado: 'image'." });
    return;
  }
  if (req.file.size > IMAGE_MAX) {
    res.status(413).json({ error: `Imagem muito grande. Máximo: ${IMAGE_MAX / 1024 / 1024} MB.` });
    return;
  }
  if (!(await imageDimensionsOk(req.file.buffer, res))) return;

  const filename = buildFilename(req.file.originalname, req.body["title"]);

  try {
    writeFileSync(join(LOCAL_UPLOADS_DIR, filename), req.file.buffer);
    logger.info({ filename, size: req.file.size }, "Image uploaded (disco local)");
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
router.post("/media", uploadRateLimit, authMiddleware, requirePermission("upload.images"), upload.single("media"), async (req, res) => {
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
  if (mediaType === "image" && !(await imageDimensionsOk(req.file.buffer, res))) return;

  const filename = buildFilename(req.file.originalname, req.body["title"]);

  try {
    writeFileSync(join(LOCAL_UPLOADS_DIR, filename), req.file.buffer);
    logger.info({ filename, size: req.file.size, mediaType }, "Media uploaded (disco local)");
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
 * Serves files from local disk (primary) or Supabase Storage (legacy fallback).
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

  // 1. Disco local — armazenamento primário.
  const localPath = join(LOCAL_UPLOADS_DIR, filename);
  if (existsSync(localPath)) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.sendFile(localPath);
    return;
  }

  // 2. Fallback: Supabase Storage (arquivos legados de antes da migração).
  if (storageEnv().configured) {
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

  res.status(404).json({ error: "Arquivo não encontrado" });
});

export default router;
