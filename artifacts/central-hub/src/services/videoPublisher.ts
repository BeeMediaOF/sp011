/**
 * Worker de publicação da Automação Social: pega `social_videos` em
 * `scheduled` vencidos e publica por destino — Instagram = Meta Graph direto
 * (Reels), TikTok = Buffer (shareNow). O agendamento é NOSSO (scheduled_at),
 * nunca do Buffer. Retry parcial: destinos já ok em `publish_results` são
 * pulados. Rate-limit do Buffer NÃO consome tentativa. Token Meta morto (190)
 * não tem retry — pede reconexão na UI.
 * Sub-tick horário: limpeza dos mp4 publicados (retenção) e órfãos.
 */
import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import {
  db,
  blogsTable,
  blogSocialAccountsTable,
  socialVideosTable,
  type SocialVideoRow,
  type SocialPublishResults,
} from "@workspace/central-db";
import { and, asc, eq, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { decryptSecret } from "@workspace/news-engine";
import { getSettings } from "../lib/store.js";
import { logger } from "../lib/logger.js";
import { logEvent } from "../lib/eventLog.js";
import { backoffMsForAttempt, MAX_DELIVERY_ATTEMPTS } from "../lib/backoff.js";
import { publishReel, MetaTokenError } from "../lib/social/metaGraph.js";
import { postVideoToBuffer, BufferRateLimitError } from "../lib/social/buffer.js";
import { publicVideoUrl } from "../lib/social/publicUrl.js";
import { isValidVideoFileName, videoDir } from "../lib/social/videoFiles.js";

const POLL_MS = 15_000;
const BATCH = 3;
/** publishing há mais que isso = processo morreu no meio → volta p/ scheduled. */
const STUCK_PUBLISH_MS = 15 * 60_000;
const CLEANUP_EVERY_TICKS = 240; // ~1h com poll de 15s
const DEFAULT_RETENTION_DAYS = 7;
const ERROR_RETENTION_DAYS = 30;

let _timer: NodeJS.Timeout | null = null;
let _running = false;
let _tickCount = 0;

/** Meia-noite de HOJE em Brasília, em UTC (mesma regra do dailyQuota). */
function brMidnightUtc(): Date {
  const nowBr = new Date(Date.now() - 3 * 3600_000);
  return new Date(Date.UTC(nowBr.getUTCFullYear(), nowBr.getUTCMonth(), nowBr.getUTCDate(), 3, 0, 0));
}

async function sentTodayCount(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(socialVideosTable)
    .where(and(eq(socialVideosTable.status, "sent"), sql`${socialVideosTable.sentAt} >= ${brMidnightUtc()}`));
  return Number(row?.n ?? 0);
}

interface TargetOutcome {
  rateLimitSeconds: number;
  permanentFailure: boolean;
  retryableFailure: boolean;
  attempted: boolean;
}

async function processVideo(video: SocialVideoRow): Promise<void> {
  // Claim condicional
  const claimed = await db
    .update(socialVideosTable)
    .set({ status: "publishing", publishStartedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(socialVideosTable.id, video.id), eq(socialVideosTable.status, "scheduled")))
    .returning();
  if (claimed.length === 0) return;
  const row = claimed[0]!;

  const failFinal = async (msg: string, results: SocialPublishResults) => {
    await db
      .update(socialVideosTable)
      .set({
        status: "error",
        publishResults: results,
        errorMessage: msg.slice(0, 500),
        publishStartedAt: null,
        nextRetryAt: null,
        updatedAt: new Date(),
      })
      .where(eq(socialVideosTable.id, video.id));
    logEvent({
      module: "social", level: "error", refType: "social_video", refId: video.id,
      message: `Publicação falhou: ${msg.slice(0, 200)}`,
    });
  };

  const results: SocialPublishResults = { ...(row.publishResults ?? {}) };
  results.warnings = [];

  if (!row.fileName) {
    return void failFinal("Vídeo sem arquivo baixado — use Tentar de novo para reenfileirar o download", results);
  }
  const videoUrl = publicVideoUrl(row.fileName);
  if (!videoUrl) {
    return void failFinal("CENTRAL_PUBLIC_URL não configurada no .env.central — necessária p/ Meta/Buffer baixarem o vídeo", results);
  }

  const [blog] = await db.select().from(blogsTable).where(eq(blogsTable.id, row.blogId)).limit(1);
  const [account] = await db
    .select()
    .from(blogSocialAccountsTable)
    .where(eq(blogSocialAccountsTable.blogId, row.blogId))
    .limit(1);
  const blogName = blog?.name ?? row.blogId;
  if (!account) {
    return void failFinal(`Blog ${blogName} sem conexões de redes sociais na central`, results);
  }

  const s = getSettings();
  const targets = (row.targets ?? []).map((t) => t.toLowerCase());
  const caption = row.caption ?? "";
  const outcome: TargetOutcome = { rateLimitSeconds: 0, permanentFailure: false, retryableFailure: false, attempted: false };
  let firstError = "";

  // ── Instagram (Meta Graph direto — Reels) ──
  if (targets.some((t) => t.includes("instagram")) && !results.instagram?.ok) {
    if (!account.igUserId || !account.metaAccessTokenEnc) {
      results.warnings.push(`Instagram não conectado no blog ${blogName} — destino ignorado`);
    } else {
      outcome.attempted = true;
      try {
        const res = await publishReel({
          igUserId: account.igUserId,
          accessToken: decryptSecret(account.metaAccessTokenEnc),
          videoUrl,
          caption,
        });
        results.instagram = { ok: true, mediaId: res.mediaId };
        await db
          .update(socialVideosTable)
          .set({ igContainerId: res.containerId, igMediaId: res.mediaId, updatedAt: new Date() })
          .where(eq(socialVideosTable.id, video.id));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.instagram = { ok: false, error: msg.slice(0, 300) };
        firstError = firstError || `instagram: ${msg}`;
        if (err instanceof MetaTokenError) {
          outcome.permanentFailure = true;
          await db
            .update(blogSocialAccountsTable)
            .set({ metaLastError: msg.slice(0, 300), updatedAt: new Date() })
            .where(eq(blogSocialAccountsTable.blogId, row.blogId));
          logEvent({
            module: "social", level: "error", refType: "blog", refId: row.blogId,
            message: `Token Meta inválido no blog ${blogName} — reconecte a conta na aba Redes Sociais`,
          });
        } else {
          outcome.retryableFailure = true;
        }
      }
    }
  }

  // ── TikTok (Buffer — shareNow) ──
  if (targets.some((t) => t.includes("tiktok")) && !results.tiktok?.ok) {
    const apiKey = account.bufferApiKeyEnc ? decryptSecret(account.bufferApiKeyEnc) : (s.bufferApiKey ?? "");
    if (!account.bufferChannelId) {
      results.warnings.push(`TikTok (Buffer) não conectado no blog ${blogName} — destino ignorado`);
    } else if (!apiKey) {
      results.warnings.push(`Buffer sem API key (global ou do blog ${blogName}) — destino ignorado`);
    } else {
      outcome.attempted = true;
      try {
        const res = await postVideoToBuffer({
          apiKey,
          channelId: account.bufferChannelId,
          caption,
          videoUrl,
        });
        results.tiktok = { ok: true, bufferPostId: res.postId ?? undefined };
        await db
          .update(socialVideosTable)
          .set({ bufferPostId: res.postId, updatedAt: new Date() })
          .where(eq(socialVideosTable.id, video.id));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.tiktok = { ok: false, error: msg.slice(0, 300) };
        firstError = firstError || `tiktok: ${msg}`;
        if (err instanceof BufferRateLimitError) {
          outcome.rateLimitSeconds = Math.max(outcome.rateLimitSeconds, err.retryAfterSeconds);
        } else {
          outcome.retryableFailure = true;
        }
      }
    }
  }

  // ── Resultado final ──
  if (!outcome.attempted && outcome.rateLimitSeconds === 0) {
    // Nenhum destino tinha conexão (ou destino já estava ok de tentativa anterior)
    const someOk = results.instagram?.ok || results.tiktok?.ok;
    if (someOk) {
      await db
        .update(socialVideosTable)
        .set({
          status: "sent",
          sentAt: row.sentAt ?? new Date(),
          publishResults: results,
          errorMessage: null,
          publishStartedAt: null,
          nextRetryAt: null,
          updatedAt: new Date(),
        })
        .where(eq(socialVideosTable.id, video.id));
      return;
    }
    return void failFinal(
      results.warnings[0] ?? `Nenhum destino conectado no blog ${blogName} para: ${targets.join(", ") || "nenhum"}`,
      results,
    );
  }

  // Rate-limit do Buffer: reagenda SEM consumir tentativa
  if (outcome.rateLimitSeconds > 0 && !outcome.retryableFailure && !outcome.permanentFailure) {
    await db
      .update(socialVideosTable)
      .set({
        status: "scheduled",
        publishResults: results,
        nextRetryAt: new Date(Date.now() + outcome.rateLimitSeconds * 1000),
        errorMessage: (firstError || "Buffer rate-limit").slice(0, 500),
        publishStartedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(socialVideosTable.id, video.id));
    logEvent({
      module: "social", level: "warn", refType: "social_video", refId: video.id,
      message: `Buffer limitou o envio (${blogName}) — reagendado em ${Math.round(outcome.rateLimitSeconds / 60)}min`,
    });
    return;
  }

  const igNeeded = targets.some((t) => t.includes("instagram")) && !!account.igUserId && !!account.metaAccessTokenEnc;
  const ttNeeded = targets.some((t) => t.includes("tiktok")) && !!account.bufferChannelId;
  const allOk = (!igNeeded || !!results.instagram?.ok) && (!ttNeeded || !!results.tiktok?.ok);

  if (allOk) {
    await db
      .update(socialVideosTable)
      .set({
        status: "sent",
        sentAt: new Date(),
        publishResults: results,
        errorMessage: null,
        publishStartedAt: null,
        nextRetryAt: null,
        updatedAt: new Date(),
      })
      .where(eq(socialVideosTable.id, video.id));
    const okTargets = [results.instagram?.ok ? "Instagram" : null, results.tiktok?.ok ? "TikTok" : null]
      .filter(Boolean).join(" + ");
    logEvent({
      module: "social", refType: "social_video", refId: video.id,
      message: `Publicado (${okTargets}) p/ ${blogName}: ${row.title || row.sourceUrl}${results.warnings.length ? ` — avisos: ${results.warnings.join("; ")}` : ""}`,
    });
    return;
  }

  if (outcome.permanentFailure) {
    return void failFinal(`Falha sem retry — ${firstError}`, results);
  }

  // Falha com retry (backoff padrão); sucessos parciais ficam preservados
  const attemptNo = row.attempts + 1;
  if (attemptNo >= MAX_DELIVERY_ATTEMPTS) {
    await db
      .update(socialVideosTable)
      .set({ attempts: attemptNo, updatedAt: new Date() })
      .where(eq(socialVideosTable.id, video.id));
    return void failFinal(`Esgotou ${MAX_DELIVERY_ATTEMPTS} tentativas — ${firstError}`, results);
  }
  await db
    .update(socialVideosTable)
    .set({
      status: "scheduled",
      attempts: attemptNo,
      publishResults: results,
      nextRetryAt: new Date(Date.now() + backoffMsForAttempt(attemptNo)),
      errorMessage: `Falha parcial (tentativa ${attemptNo}/${MAX_DELIVERY_ATTEMPTS}): ${firstError}`.slice(0, 500),
      publishStartedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(socialVideosTable.id, video.id));
  logEvent({
    module: "social", level: "warn", refType: "social_video", refId: video.id,
    message: `Publicação falhou (tentativa ${attemptNo}/${MAX_DELIVERY_ATTEMPTS}) p/ ${blogName}: ${firstError.slice(0, 200)}`,
  });
}

/** Apaga mp4 de vídeos publicados fora da retenção (e erros antigos) + órfãos. */
async function cleanupFiles(): Promise<void> {
  const s = getSettings();
  const retentionDays = s.socialVideoRetentionDays ?? DEFAULT_RETENTION_DAYS;
  const sentCutoff = new Date(Date.now() - retentionDays * 86_400_000);
  const errorCutoff = new Date(Date.now() - ERROR_RETENTION_DAYS * 86_400_000);

  const candidates = await db
    .select()
    .from(socialVideosTable)
    .where(and(
      sql`${socialVideosTable.fileName} IS NOT NULL`,
      or(
        and(eq(socialVideosTable.status, "sent"), lt(socialVideosTable.sentAt, sentCutoff)),
        and(eq(socialVideosTable.status, "error"), lt(socialVideosTable.updatedAt, errorCutoff)),
      ),
    ))
    .limit(200);

  const referenced = new Set<string>();
  for (const c of candidates) {
    const fileName = c.fileName!;
    if (referenced.has(fileName)) continue;
    // Alguma OUTRA linha ainda precisa do arquivo? (irmãs na fila/agendadas ou dentro da retenção)
    const [active] = await db
      .select({ id: socialVideosTable.id })
      .from(socialVideosTable)
      .where(and(
        eq(socialVideosTable.fileName, fileName),
        ne(socialVideosTable.id, c.id),
        or(
          inArray(socialVideosTable.status, ["queued", "downloading", "ready", "scheduled", "publishing"]),
          and(eq(socialVideosTable.status, "sent"), sql`${socialVideosTable.sentAt} >= ${sentCutoff}`),
          and(eq(socialVideosTable.status, "error"), sql`${socialVideosTable.updatedAt} >= ${errorCutoff}`),
        ),
      ))
      .limit(1);
    if (active) {
      referenced.add(fileName);
      continue;
    }
    await unlink(path.join(videoDir(), fileName)).catch(() => undefined);
    await db
      .update(socialVideosTable)
      .set({ fileName: null, updatedAt: new Date() })
      .where(eq(socialVideosTable.fileName, fileName));
    logger.info({ fileName }, "Automação Social: mp4 removido (retenção)");
  }

  // Órfãos no diretório (arquivo sem linha no banco), com folga de 1h
  try {
    const files = await readdir(videoDir());
    for (const f of files) {
      if (!isValidVideoFileName(f)) continue;
      const [ref] = await db
        .select({ id: socialVideosTable.id })
        .from(socialVideosTable)
        .where(eq(socialVideosTable.fileName, f))
        .limit(1);
      if (ref) continue;
      const full = path.join(videoDir(), f);
      const st = await stat(full).catch(() => null);
      if (st && Date.now() - st.mtimeMs > 3_600_000) {
        await unlink(full).catch(() => undefined);
        logger.info({ fileName: f }, "Automação Social: mp4 órfão removido");
      }
    }
  } catch {
    // diretório pode não existir ainda — nada a limpar
  }
}

async function tick(): Promise<void> {
  if (_running) return;
  _running = true;
  try {
    const s = getSettings();
    if (!s.socialEnabled) return;

    // Recovery: publicações travadas voltam para a fila
    await db
      .update(socialVideosTable)
      .set({ status: "scheduled", publishStartedAt: null, updatedAt: new Date() })
      .where(and(
        eq(socialVideosTable.status, "publishing"),
        lt(socialVideosTable.publishStartedAt, new Date(Date.now() - STUCK_PUBLISH_MS)),
      ));

    const now = new Date();
    const due = await db
      .select()
      .from(socialVideosTable)
      .where(and(
        eq(socialVideosTable.status, "scheduled"),
        lte(socialVideosTable.scheduledAt, now),
        or(isNull(socialVideosTable.nextRetryAt), lte(socialVideosTable.nextRetryAt, now)),
      ))
      .orderBy(asc(socialVideosTable.scheduledAt))
      .limit(BATCH);

    if (due.length > 0) {
      // Teto diário de publicações (0/ausente = sem teto)
      const limit = s.socialDailyPostLimit ?? 0;
      if (limit > 0 && (await sentTodayCount()) >= limit) {
        for (const v of due) {
          await db
            .update(socialVideosTable)
            .set({ nextRetryAt: new Date(Date.now() + 3_600_000), updatedAt: new Date() })
            .where(eq(socialVideosTable.id, v.id));
        }
        logEvent({
          module: "social", level: "warn",
          message: `Teto diário de publicações (${limit}) atingido — fila adiada em 1h`,
        });
      } else {
        for (const v of due) {
          await processVideo(v);
        }
      }
    }

    _tickCount++;
    if (_tickCount % CLEANUP_EVERY_TICKS === 1) {
      await cleanupFiles();
    }
  } catch (err) {
    logger.error({ err }, "Erro no tick do publicador de vídeos");
  } finally {
    _running = false;
  }
}

export function startVideoPublisher(): void {
  if (_timer) return;
  _timer = setInterval(() => { void tick(); }, POLL_MS);
  _timer.unref();
  logger.info("Publicador de vídeos sociais iniciado (poll 15s)");
}
