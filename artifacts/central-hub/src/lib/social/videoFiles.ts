/**
 * Arquivos de vídeo da Automação Social: nomes não-adivinháveis (a rota
 * pública /api/social/video-file/:name não tem auth — Meta e Buffer baixam
 * por URL) e validação estrita anti-traversal.
 */
import { randomUUID, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

/** `<uuid>-<hex8>.mp4` — o sufixo aleatório impede adivinhar pelo id da linha. */
export function newVideoFileName(): string {
  return `${randomUUID()}-${randomBytes(4).toString("hex")}.mp4`;
}

const FILE_NAME_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}-[a-f0-9]{8}\.mp4$/;

export function isValidVideoFileName(name: string): boolean {
  return FILE_NAME_RE.test(name);
}

/** Diretório dos mp4 (volume central_data). Override p/ dev: SOCIAL_VIDEO_DIR. */
export function videoDir(): string {
  return process.env["SOCIAL_VIDEO_DIR"] || "/data/social-videos";
}

export function videoFilePath(fileName: string): string {
  if (!isValidVideoFileName(fileName)) throw new Error(`Nome de arquivo inválido: ${fileName}`);
  return path.join(videoDir(), fileName);
}

export function ensureVideoDir(): string {
  const dir = videoDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Status pós-download: com horário marcado vai direto para a fila de publicação. */
export function statusAfterDownload(scheduledAt: Date | null | undefined): "ready" | "scheduled" {
  return scheduledAt ? "scheduled" : "ready";
}
