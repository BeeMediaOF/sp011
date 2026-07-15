/**
 * Imagens de capa enviadas na "Nova notícia" (upload manual): nome
 * não-adivinhável (a rota pública /api/news/image/:name não tem auth — os
 * blogs e os leitores baixam por URL) e validação estrita anti-traversal.
 * SEM retenção/limpeza: a URL fica gravada nos artigos publicados dos blogs
 * (hotlink) — apagar o arquivo quebraria capa de matéria no ar.
 */
import { randomUUID, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

/** Content-Type aceito no upload → extensão do arquivo em disco. */
export const IMAGE_EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

/** `<uuid>-<hex8>.<ext>` — o sufixo aleatório impede adivinhar pelo id. */
export function newImageFileName(mime: string): string | null {
  const ext = IMAGE_EXT_BY_MIME[mime];
  if (!ext) return null;
  return `${randomUUID()}-${randomBytes(4).toString("hex")}${ext}`;
}

const FILE_NAME_RE =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}-[a-f0-9]{8}\.(jpg|png|webp|gif)$/;

export function isValidImageFileName(name: string): boolean {
  return FILE_NAME_RE.test(name);
}

/** Diretório das imagens (volume central_data). Override p/ dev: NEWS_IMAGE_DIR. */
export function imageDir(): string {
  return process.env["NEWS_IMAGE_DIR"] || "/data/news-images";
}

export function ensureImageDir(): string {
  const dir = imageDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function imageFilePath(fileName: string): string {
  if (!isValidImageFileName(fileName)) throw new Error(`Nome de arquivo inválido: ${fileName}`);
  return path.join(imageDir(), fileName);
}
