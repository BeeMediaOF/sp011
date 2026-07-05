/**
 * Cliente HTTP central→blog: assina o corpo com HMAC (news-engine/signing) e
 * fala com o endpoint /api/ingest de cada blog. Timeout 30s.
 */
import { decryptSecret, signIngestRequest } from "@workspace/news-engine";
import { db, blogsTable, type BlogRow } from "@workspace/central-db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

export const INGEST_API_VERSION = 1;

export interface BlogCallResult {
  ok: boolean;
  httpStatus: number;
  /** Corpo JSON da resposta (quando parseável). */
  body?: Record<string, unknown>;
  error?: string;
  durationMs: number;
}

function ingestUrl(blog: BlogRow, path: string): string {
  const base = blog.apiUrl.replace(/\/+$/, "");
  return `${base}/ingest${path}`;
}

/** POST assinado para o blog. Nunca lança — devolve o resultado estruturado. */
export async function sendSigned(
  blog: BlogRow,
  path: string,
  payload: unknown,
  timeoutMs = 30_000,
): Promise<BlogCallResult> {
  const started = Date.now();
  if (!blog.ingestSecretEnc) {
    return { ok: false, httpStatus: 0, error: "Blog sem segredo de integração configurado", durationMs: 0 };
  }
  const secret = decryptSecret(blog.ingestSecretEnc);

  const rawBody = JSON.stringify(payload);
  const { timestamp, signature } = signIngestRequest(secret, rawBody);

  try {
    const res = await fetch(ingestUrl(blog, path), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Central-Api-Version": String(INGEST_API_VERSION),
        "X-Central-Timestamp": timestamp,
        "X-Central-Signature": signature,
      },
      body: rawBody,
      signal: AbortSignal.timeout(timeoutMs),
    });
    let body: Record<string, unknown> | undefined;
    try {
      body = await res.json() as Record<string, unknown>;
    } catch { /* corpo não-JSON */ }
    return {
      ok: res.ok,
      httpStatus: res.status,
      body,
      error: res.ok ? undefined : `HTTP ${res.status} ${(body?.["error"] as string | undefined) ?? res.statusText}`,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    const msg = String(err);
    return {
      ok: false,
      httpStatus: 0,
      error: msg.includes("TimeoutError") || msg.includes("timeout") ? "timeout" : msg,
      durationMs: Date.now() - started,
    };
  }
}

/** Testa a conexão com um blog e atualiza status/lastSeenAt/lastError. */
export async function testBlogConnection(blog: BlogRow): Promise<BlogCallResult> {
  const result = await sendSigned(blog, "/test", { v: INGEST_API_VERSION, ping: Date.now() }, 15_000);

  const status = result.ok ? "online" : "error";
  try {
    await db
      .update(blogsTable)
      .set({
        status,
        lastSeenAt: result.ok ? new Date() : blog.lastSeenAt,
        lastError: result.ok ? null : result.error ?? "erro desconhecido",
        updatedAt: new Date(),
      })
      .where(eq(blogsTable.id, blog.id));
  } catch (err) {
    logger.warn({ err, blogId: blog.id }, "Falha ao atualizar status do blog após teste");
  }

  return result;
}
