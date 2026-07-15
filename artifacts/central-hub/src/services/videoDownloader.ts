/**
 * Worker de download da Automação Social — 1 vídeo por vez (padrão da origem:
 * claim atômico + recovery de travados). Fluxo por item:
 * Apify (post específico) → mp4 em streaming p/ /data/social-videos →
 * legenda por IA (Gemini) quando o usuário não escreveu → ready|scheduled.
 * Linhas "irmãs" (mesma source_url p/ outros blogs) reaproveitam tudo.
 * Download NÃO tem retry automático (igual à origem) — botão na UI reenfileira.
 */
import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  db,
  socialVideosTable,
  aiUsageEventsTable,
  type SocialVideoRow,
} from "@workspace/central-db";
import { and, asc, eq, inArray, lt, ne } from "drizzle-orm";
import { getSettings } from "../lib/store.js";
import { getGeminiPool } from "../lib/aiPool.js";
import { logger } from "../lib/logger.js";
import { logEvent } from "../lib/eventLog.js";
import {
  buildDownloadInput,
  normalizeActorId,
  pickVideoUrl,
  runApifyWithFallback,
  type VideoPlatform,
} from "../lib/social/apify.js";
import { buildCaptionPrompt, parseCaptionOutput } from "../lib/social/caption.js";
import {
  ensureVideoDir,
  newVideoFileName,
  statusAfterDownload,
  videoFilePath,
} from "../lib/social/videoFiles.js";

const POLL_MS = 10_000;
/** downloading há mais que isso = processo morreu no meio → volta p/ queued. */
const STUCK_DOWNLOAD_MS = 10 * 60_000;
const DEFAULT_MAX_VIDEO_MB = 300;
const DEFAULT_CAPTION_MODEL = "gemini-2.5-flash";

let _timer: NodeJS.Timeout | null = null;
let _running = false;

/** Baixa a URL em streaming direto para o disco, com teto de tamanho. */
async function downloadToFile(
  url: string,
  filePath: string,
  maxBytes: number,
): Promise<{ size: number; mime: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(300_000) });
  if (!res.ok || !res.body) throw new Error(`Download do vídeo falhou (HTTP ${res.status})`);
  const mime = (res.headers.get("content-type") || "video/mp4").split(";")[0]!.trim();
  const contentLength = Number(res.headers.get("content-length") || 0);
  if (contentLength > maxBytes) {
    throw new Error(`Vídeo muito grande (${Math.round(contentLength / 1048576)}MB > teto)`);
  }
  let size = 0;
  const capper = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      size += chunk.length;
      if (size > maxBytes) cb(new Error(`Vídeo excede o teto de ${Math.round(maxBytes / 1048576)}MB`));
      else cb(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), capper, createWriteStream(filePath));
  } catch (err) {
    await unlink(filePath).catch(() => undefined);
    throw err;
  }
  return { size, mime };
}

/** Gera a legenda com o pool Gemini; falha nunca bloqueia (cai na original). */
async function generateCaption(
  videoId: string,
  originalCaption: string,
  creator: string,
): Promise<{ title: string; caption: string; source: "ai" | "original" }> {
  const s = getSettings();
  const fallback = {
    title: (originalCaption || "").slice(0, 80),
    caption: originalCaption || "",
    source: "original" as const,
  };
  try {
    const prompt = buildCaptionPrompt(originalCaption, creator, s.socialCaptionPromptTemplate);
    const model = s.captionModel?.trim() || DEFAULT_CAPTION_MODEL;
    const out = await getGeminiPool().call(model, prompt);
    const parsed = parseCaptionOutput(out.text);
    if (!parsed.title && !parsed.caption) return fallback;
    await db.insert(aiUsageEventsTable).values({
      provider: out.usage.provider,
      model: out.usage.model ?? null,
      keyHint: out.usage.keyHint ?? null,
      inputTokens: out.usage.inputTokens ?? null,
      outputTokens: out.usage.outputTokens ?? null,
      totalTokens: out.usage.totalTokens ?? null,
      purpose: "caption",
    });
    return {
      title: parsed.title || fallback.title,
      caption: parsed.caption || parsed.title,
      source: "ai",
    };
  } catch (err) {
    logger.warn({ err, videoId }, "Legenda por IA falhou — mantendo a original");
    return fallback;
  }
}

/** Propaga download/legenda para as irmãs ainda não processadas (mesma URL). */
async function propagateToSiblings(video: SocialVideoRow, fields: {
  fileName: string;
  fileSizeBytes: number | null;
  mimeType: string | null;
  title: string | null;
  caption: string | null;
  captionSource: string | null;
  creator: string | null;
  metadata: SocialVideoRow["metadata"];
}): Promise<void> {
  const siblings = await db
    .select()
    .from(socialVideosTable)
    .where(and(
      eq(socialVideosTable.sourceUrl, video.sourceUrl),
      ne(socialVideosTable.id, video.id),
      inArray(socialVideosTable.status, ["queued", "downloading"]),
    ));
  for (const sib of siblings) {
    const keepUserCaption = sib.captionSource === "user";
    await db
      .update(socialVideosTable)
      .set({
        status: statusAfterDownload(sib.scheduledAt),
        fileName: fields.fileName,
        fileSizeBytes: fields.fileSizeBytes,
        mimeType: fields.mimeType,
        title: fields.title,
        caption: keepUserCaption ? sib.caption : fields.caption,
        captionSource: keepUserCaption ? "user" : fields.captionSource,
        creator: fields.creator,
        metadata: sib.metadata ?? fields.metadata,
        downloadStartedAt: null,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(socialVideosTable.id, sib.id));
  }
}

async function processVideo(video: SocialVideoRow): Promise<void> {
  const platform = video.platform as VideoPlatform;
  const s = getSettings();

  // Reuso de irmã já processada (mesma URL, arquivo já no disco)
  const [sibling] = await db
    .select()
    .from(socialVideosTable)
    .where(and(
      eq(socialVideosTable.sourceUrl, video.sourceUrl),
      ne(socialVideosTable.id, video.id),
      inArray(socialVideosTable.status, ["ready", "scheduled", "publishing", "sent"]),
    ))
    .limit(1);
  if (sibling?.fileName) {
    const keepUserCaption = video.captionSource === "user";
    await db
      .update(socialVideosTable)
      .set({
        status: statusAfterDownload(video.scheduledAt),
        fileName: sibling.fileName,
        fileSizeBytes: sibling.fileSizeBytes,
        mimeType: sibling.mimeType,
        title: sibling.title,
        caption: keepUserCaption ? video.caption : sibling.caption,
        captionSource: keepUserCaption ? "user" : sibling.captionSource,
        creator: sibling.creator,
        metadata: video.metadata ?? sibling.metadata,
        downloadStartedAt: null,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(socialVideosTable.id, video.id));
    logEvent({
      module: "social", refType: "social_video", refId: video.id,
      message: `Download reaproveitado da irmã ${sibling.id}: ${video.sourceUrl}`,
    });
    return;
  }

  // Apify: metadados + link do mp4 do post específico
  const actorSetting = platform === "tiktok" ? s.apifyTiktokActor : s.apifyInstagramActor;
  const actorId = normalizeActorId(actorSetting, platform);
  const tokens = [s.apifyToken ?? "", s.apifyTokenBackup ?? ""].filter(Boolean);
  const items = await runApifyWithFallback(actorId, platform, tokens, buildDownloadInput(platform, video.sourceUrl));
  const meta = pickVideoUrl(items, platform);
  if (!meta.videoUrl) {
    const sample = JSON.stringify(items?.[0] ?? {}).slice(0, 400);
    throw new Error(`Apify não retornou videoUrl. Resposta: ${sample}`);
  }

  ensureVideoDir();
  const fileName = newVideoFileName();
  const maxBytes = (s.socialMaxVideoMB ?? DEFAULT_MAX_VIDEO_MB) * 1048576;
  const { size, mime } = await downloadToFile(meta.videoUrl, videoFilePath(fileName), maxBytes);

  // Legenda: usuário escreveu → mantém; senão IA (falha → legenda original)
  let caption = video.caption;
  let captionSource = video.captionSource;
  let title = (meta.caption || "").slice(0, 120) || video.title;
  if (captionSource !== "user") {
    const gen = await generateCaption(video.id, meta.caption || "", meta.creator || "");
    caption = gen.caption;
    captionSource = gen.source;
    title = gen.title || title;
  }

  const metadata = {
    ...(video.metadata ?? {}),
    originalCaption: meta.caption,
    thumbnail: meta.thumb,
  };

  await db
    .update(socialVideosTable)
    .set({
      status: statusAfterDownload(video.scheduledAt),
      fileName,
      fileSizeBytes: size,
      mimeType: mime,
      title,
      caption,
      captionSource,
      creator: meta.creator ?? null,
      metadata,
      downloadStartedAt: null,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(socialVideosTable.id, video.id));

  await propagateToSiblings(video, {
    fileName,
    fileSizeBytes: size,
    mimeType: mime,
    title: title ?? null,
    caption: caption ?? null,
    captionSource: captionSource ?? null,
    creator: meta.creator ?? null,
    metadata,
  });

  logEvent({
    module: "social", refType: "social_video", refId: video.id,
    message: `Vídeo baixado (${Math.round(size / 1048576)}MB, ${platform}): ${title || video.sourceUrl}`,
  });
}

async function tick(): Promise<void> {
  if (_running) return;
  _running = true;
  try {
    if (!getSettings().socialEnabled) return;

    // Recovery: downloads travados voltam para a fila
    await db
      .update(socialVideosTable)
      .set({ status: "queued", downloadStartedAt: null, updatedAt: new Date() })
      .where(and(
        eq(socialVideosTable.status, "downloading"),
        lt(socialVideosTable.downloadStartedAt, new Date(Date.now() - STUCK_DOWNLOAD_MS)),
      ));

    // 1 download por vez (guard contra restart no meio do claim)
    const busy = await db
      .select({ id: socialVideosTable.id })
      .from(socialVideosTable)
      .where(eq(socialVideosTable.status, "downloading"))
      .limit(1);
    if (busy.length > 0) return;

    const [next] = await db
      .select()
      .from(socialVideosTable)
      .where(eq(socialVideosTable.status, "queued"))
      .orderBy(asc(socialVideosTable.queuedAt))
      .limit(1);
    if (!next) return;

    // Claim atômico
    const claimed = await db
      .update(socialVideosTable)
      .set({ status: "downloading", downloadStartedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(socialVideosTable.id, next.id), eq(socialVideosTable.status, "queued")))
      .returning();
    if (claimed.length === 0) return;

    try {
      await processVideo(claimed[0]!);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await db
        .update(socialVideosTable)
        .set({ status: "error", errorMessage: msg.slice(0, 500), downloadStartedAt: null, updatedAt: new Date() })
        .where(eq(socialVideosTable.id, next.id));
      logEvent({
        module: "social", level: "error", refType: "social_video", refId: next.id,
        message: `Download falhou: ${msg.slice(0, 200)}`,
      });
    }
  } catch (err) {
    logger.error({ err }, "Erro no tick do downloader de vídeos");
  } finally {
    _running = false;
  }
}

/** Dispara um tick imediato (fire-and-forget) — usado pelo enqueue da rota. */
export function kickVideoQueue(): void {
  setTimeout(() => { void tick(); }, 50);
}

export function startVideoDownloader(): void {
  if (_timer) return;
  _timer = setInterval(() => { void tick(); }, POLL_MS);
  _timer.unref();
  logger.info("Downloader de vídeos sociais iniciado (poll 10s)");
}
