/**
 * Publicação de Reels no Instagram via Meta Graph API (adaptação do fluxo de
 * IMAGEM do blog em api-server/src/lib/social/queueProcessor.ts): vídeo exige
 * container REELS + polling de status_code antes do media_publish.
 */

export const META_GRAPH = "https://graph.facebook.com/v20.0";

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 5 * 60_000;

export class MetaTokenError extends Error {
  /** Token expirado/invalidado (code 190 / subcode 460|463): retry não resolve. */
  readonly isTokenError = true;
}

interface MetaError {
  message?: string;
  code?: number;
  error_subcode?: number;
}

function throwMetaError(prefix: string, error: MetaError): never {
  const msg = `${prefix}: ${error.message || "erro desconhecido"} (code ${error.code ?? "?"})`;
  if (error.code === 190 || error.error_subcode === 460 || error.error_subcode === 463) {
    throw new MetaTokenError(msg);
  }
  throw new Error(msg);
}

async function postForm(url: string, params: Record<string, string>): Promise<Record<string, any>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(60_000),
  });
  return (await res.json().catch(() => ({}))) as Record<string, any>;
}

async function getJson(url: string): Promise<Record<string, any>> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  return (await res.json().catch(() => ({}))) as Record<string, any>;
}

export interface PublishReelInput {
  igUserId: string;
  accessToken: string;
  /** URL pública do mp4 (a Meta baixa o arquivo). */
  videoUrl: string;
  caption: string;
}

export interface PublishReelResult {
  containerId: string;
  mediaId: string;
}

/**
 * Fluxo completo do Reel: container REELS → poll status_code (IN_PROGRESS →
 * FINISHED) → media_publish. Lança MetaTokenError p/ token morto (sem retry).
 */
export async function publishReel(input: PublishReelInput): Promise<PublishReelResult> {
  const { igUserId, accessToken, videoUrl, caption } = input;

  const container = await postForm(`${META_GRAPH}/${igUserId}/media`, {
    media_type: "REELS",
    video_url: videoUrl,
    caption,
    share_to_feed: "true",
    access_token: accessToken,
  });
  if (container["error"]) throwMetaError("IG container", container["error"] as MetaError);
  const containerId = container["id"] as string | undefined;
  if (!containerId) throw new Error("IG container: resposta sem id");

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const status = await getJson(
      `${META_GRAPH}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}`,
    );
    if (status["error"]) throwMetaError("IG status", status["error"] as MetaError);
    const code = status["status_code"] as string | undefined;
    if (code === "FINISHED") break;
    if (code === "ERROR" || code === "EXPIRED") {
      throw new Error(`IG processamento falhou (${code}): ${String(status["status"] ?? "")}`.slice(0, 300));
    }
    if (Date.now() > deadline) {
      throw new Error(`IG processamento excedeu ${POLL_TIMEOUT_MS / 60000}min (status ${code ?? "?"})`);
    }
  }

  const pub = await postForm(`${META_GRAPH}/${igUserId}/media_publish`, {
    creation_id: containerId,
    access_token: accessToken,
  });
  if (pub["error"]) throwMetaError("IG publish", pub["error"] as MetaError);
  const mediaId = pub["id"] as string | undefined;
  if (!mediaId) throw new Error("IG publish: resposta sem id");

  return { containerId, mediaId };
}
