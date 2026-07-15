/**
 * Integração Apify da Automação Social (port do hub-portais
 * `video-download/index.ts`): resolução de actor, input de download por
 * plataforma e extração do videoUrl da resposta (cascata de fallbacks —
 * o shape varia entre versões dos actors).
 */

export type VideoPlatform = "tiktok" | "instagram";

export const DEFAULT_TIKTOK_ACTOR = "clockworks/tiktok-scraper";
export const DEFAULT_INSTAGRAM_ACTOR = "apify/instagram-scraper";

export function getDefaultActor(platform: VideoPlatform): string {
  return platform === "tiktok" ? DEFAULT_TIKTOK_ACTOR : DEFAULT_INSTAGRAM_ACTOR;
}

export function detectPlatform(url: string): VideoPlatform | null {
  if (/tiktok\.com/i.test(url)) return "tiktok";
  if (/instagram\.com/i.test(url)) return "instagram";
  return null;
}

/** Aceita "owner/actor", "owner~actor", URL do console/API — normaliza para "owner/actor". */
export function normalizeActorId(rawValue: string | null | undefined, platform: VideoPlatform): string {
  const fallback = getDefaultActor(platform);
  const value = rawValue?.trim();
  if (!value) return fallback;

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const actsMatch = url.pathname.match(/\/acts\/([^/]+)/i);
      if (actsMatch?.[1]) {
        return decodeURIComponent(actsMatch[1]).replace(/~/g, "/");
      }
      const path = url.pathname.replace(/^\/+|\/+$/g, "");
      const segments = path.split("/");
      if (url.hostname.includes("apify.com") && segments.length >= 2) {
        return `${segments[0]}/${segments[1]}`;
      }
      return fallback;
    } catch {
      return fallback;
    }
  }

  return value
    .replace(/^acts\//i, "")
    .replace(/\/run-sync-get-dataset-items.*$/i, "")
    .replace(/~/g, "/");
}

/** Input do actor para baixar UM post específico. */
export function buildDownloadInput(platform: VideoPlatform, url: string): Record<string, unknown> {
  return platform === "tiktok"
    ? { postURLs: [url], resultsPerPage: 1, shouldDownloadVideos: true, shouldDownloadCovers: false, shouldDownloadSubtitles: false }
    : { directUrls: [url], resultsLimit: 1, addParentData: false, resultsType: "details" };
}

export interface PickedVideo {
  videoUrl?: string;
  caption?: string;
  creator?: string;
  thumb?: string;
}

/** Extrai o link do mp4 + metadados do primeiro item retornado pelo actor. */
export function pickVideoUrl(items: unknown[], platform: VideoPlatform): PickedVideo {
  if (!Array.isArray(items) || items.length === 0) return {};
  const it = items[0] as Record<string, any>;
  if (platform === "tiktok") {
    const videoUrl =
      it.videoUrl ||
      it.mediaUrls?.[0] ||
      it.video?.downloadAddr ||
      it.video?.playAddr ||
      it.downloadAddr ||
      it.playAddr ||
      it.videoMeta?.downloadAddr ||
      it.videoMeta?.playAddr ||
      it.videoMeta?.originalDownloadAddr ||
      it.videoApiUrlNoWaterMark ||
      it.videoApiUrl;
    return {
      videoUrl,
      caption: it.text || it.desc,
      creator: it.authorMeta?.name || it.author?.uniqueId,
      thumb: it.videoMeta?.coverUrl || it.video?.cover,
    };
  }
  const videoUrl =
    it.videoUrl ||
    it.video_url ||
    it.videoUrlBackup ||
    it.video?.url ||
    it.videoVariants?.[0]?.url ||
    it.media?.[0]?.videoUrl ||
    it.childPosts?.[0]?.videoUrl;
  return {
    videoUrl,
    caption: it.caption || it.text,
    creator: it.ownerUsername || it.owner?.username,
    thumb: it.displayUrl || it.thumbnailUrl,
  };
}

/** Erros de quota/limite/auth do Apify → vale tentar o token de reserva. */
export function isTokenLimitError(msg: string): boolean {
  return /402|429|monthly-usage-hard-limit-exceeded|usage-hard-limit|quota|insufficient|payment|user-or-token-not-found|token-not-found|invalid-token|unauthorized|forbidden/i.test(msg);
}

/** Actor custom inexistente → refazer com o actor default. */
export function isActorNotFoundError(msg: string): boolean {
  return /record-not-found/i.test(msg);
}

const APIFY_TIMEOUT_MS = 180_000;

export async function runApifyActor(actorId: string, token: string, input: unknown): Promise<unknown[]> {
  const id = encodeURIComponent(actorId.replace("/", "~"));
  const res = await fetch(
    `https://api.apify.com/v2/acts/${id}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(APIFY_TIMEOUT_MS),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Apify ${actorId} ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as unknown[];
}

/**
 * Roda o actor com fallback de token (quota/auth) e de actor (custom
 * inexistente → default da plataforma).
 */
export async function runApifyWithFallback(
  actorId: string,
  platform: VideoPlatform,
  tokens: string[],
  input: unknown,
): Promise<unknown[]> {
  const usable = tokens.filter(Boolean);
  if (usable.length === 0) throw new Error("Token do Apify não configurado (Configurações → Automação Social)");

  async function runTokens(actor: string): Promise<unknown[]> {
    let lastErr: unknown;
    for (let i = 0; i < usable.length; i++) {
      try {
        return await runApifyActor(actor, usable[i], input);
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        if (i < usable.length - 1 && isTokenLimitError(msg)) continue;
        throw err;
      }
    }
    throw lastErr;
  }

  const fallbackActor = getDefaultActor(platform);
  try {
    return await runTokens(actorId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (actorId !== fallbackActor && isActorNotFoundError(msg)) {
      return runTokens(fallbackActor);
    }
    throw err;
  }
}
