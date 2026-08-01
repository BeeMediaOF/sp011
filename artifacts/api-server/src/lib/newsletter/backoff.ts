/**
 * Política de retry da fila de newsletter (módulo puro, testável sem banco).
 * Espelha `central-hub/src/lib/backoff.ts` — mesma curva das entregas central→blog.
 */

export const MAX_SEND_ATTEMPTS = 5;

/** Backoff exponencial por tentativa (1-indexado): 1m → 5m → 15m → 1h → 6h. */
export const BACKOFF_MINUTES = [1, 5, 15, 60, 360] as const;

export function backoffMsForAttempt(attempt: number): number {
  const idx = Math.min(Math.max(attempt, 1), BACKOFF_MINUTES.length) - 1;
  return BACKOFF_MINUTES[idx]! * 60_000;
}
