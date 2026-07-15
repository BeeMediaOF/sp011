/**
 * Publicação de vídeo no TikTok via Buffer (GraphQL — única API do Buffer que
 * aceita vídeo). Port de hub-portais `video-schedule/index.ts`. Sempre
 * mode "shareNow": o agendamento é do NOSSO worker (videoPublisher), não do
 * Buffer — 1 fonte de verdade de status, sem precisar de status-sync.
 */
import {
  extractRetryAfter,
  isRateLimitResponse,
  effectiveRetryAfterSeconds,
  formatWaitTime,
} from "./bufferParse.js";

const BUFFER_GQL_URL = "https://api.buffer.com/graphql";

export class BufferRateLimitError extends Error {
  readonly isRateLimit = true;
  constructor(readonly retryAfterSeconds: number, hasApiRetryAfter: boolean) {
    super(
      hasApiRetryAfter
        ? `Buffer limitou o envio. Aguarde ${formatWaitTime(retryAfterSeconds)} (retryAfter=${retryAfterSeconds}s)`
        : `Buffer limitou o envio. Aguarde ~${formatWaitTime(retryAfterSeconds)} (sem retryAfter na resposta)`,
    );
  }
}

const CREATE_POST_MUTATION = `
  mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      ... on PostActionSuccess { post { id dueAt status } }
      ... on MutationError { message }
    }
  }
`;

export interface BufferPostInput {
  apiKey: string;
  channelId: string;
  caption: string;
  /** URL pública do mp4 (o Buffer baixa o arquivo). */
  videoUrl: string;
}

export interface BufferPostResult {
  postId: string | null;
  status: string | null;
}

/** Cria o post de vídeo no canal TikTok do Buffer (shareNow). */
export async function postVideoToBuffer(input: BufferPostInput): Promise<BufferPostResult> {
  const { apiKey, channelId, caption, videoUrl } = input;

  const gqlInput = {
    channelId,
    text: caption,
    schedulingType: "automatic",
    mode: "shareNow",
    assets: { videos: [{ url: videoUrl }] },
    metadata: { tiktok: { title: (caption.split("\n")[0] || "").slice(0, 100) } },
  };

  const res = await fetch(BUFFER_GQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: CREATE_POST_MUTATION, variables: { input: gqlInput } }),
    signal: AbortSignal.timeout(60_000),
  });

  // Corpo pode não ser JSON (ex.: 429 com HTML)
  const body = (await res.json().catch(() => ({}))) as Record<string, any>;

  const retryAfter = extractRetryAfter(res.headers.get("retry-after"), body);
  if (isRateLimitResponse(res.status, retryAfter, body)) {
    throw new BufferRateLimitError(effectiveRetryAfterSeconds(retryAfter), retryAfter > 0);
  }

  if (body["errors"]) {
    throw new Error(`Buffer erro: ${String(body["errors"]?.[0]?.message ?? "desconhecido").slice(0, 300)}`);
  }
  const result = body["data"]?.["createPost"];
  if (result?.message) throw new Error(`Buffer recusou: ${String(result.message).slice(0, 300)}`);
  const post = result?.post ?? result ?? {};
  return { postId: post.id ?? null, status: post.status ?? null };
}
