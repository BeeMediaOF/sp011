/**
 * Parsing defensivo das respostas do Buffer (API GraphQL não oficial) —
 * port do hub-portais `video-schedule/index.ts`. Funções puras.
 */

/** Default quando o Buffer limita sem informar retryAfter (15 min). */
export const DEFAULT_RETRY_AFTER_SECONDS = 900;
/** Teto de espera aceito da API (6h) — valores maiores são clampados. */
export const MAX_RETRY_AFTER_SECONDS = 6 * 3600;

/**
 * Extrai o retry-after (segundos) do header e dos caminhos conhecidos do
 * corpo. Retorna 0 quando ausente/inválido.
 */
export function extractRetryAfter(retryAfterHeader: string | null | undefined, body: unknown): number {
  const fromHeader = parseInt(retryAfterHeader || "0", 10) || 0;
  if (fromHeader > 0) return fromHeader;

  const b = (body ?? {}) as Record<string, any>;
  for (const v of [
    b.retry_after,
    b.retryAfter,
    b.errors?.[0]?.retryAfter,
    b.errors?.[0]?.extensions?.retryAfter,
    b.extensions?.retryAfter,
  ]) {
    if (v != null) {
      const n = Number(v);
      if (!isNaN(n) && n > 0) return n;
    }
  }
  return 0;
}

/** HTTP 429, retryAfter presente ou mensagem de limite → rate limit. */
export function isRateLimitResponse(httpStatus: number, retryAfter: number, body: unknown): boolean {
  if (httpStatus === 429 || retryAfter > 0) return true;
  const msg = String(((body ?? {}) as Record<string, any>).errors?.[0]?.message ?? "").toLowerCase();
  return msg.includes("rate limit") || msg.includes("too many");
}

/** Segundos efetivos de espera: default 900 quando ausente, teto 6h. */
export function effectiveRetryAfterSeconds(retryAfter: number): number {
  const secs = retryAfter > 0 ? retryAfter : DEFAULT_RETRY_AFTER_SECONDS;
  return Math.min(secs, MAX_RETRY_AFTER_SECONDS);
}

/** "12min" / "1h30min" para mensagens de erro amigáveis. */
export function formatWaitTime(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h${m}min` : `${h}h`;
}
