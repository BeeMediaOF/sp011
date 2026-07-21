/**
 * Núcleo PURO do portão de economia por teto diário (PRD-11) — sem I/O nem
 * import de `@workspace/central-db`, para ser testável com `node --test`
 * (importar `dailyQuota.ts` puxa central-db, cujo barrel de schema quebra a
 * resolução ESM do node e exige CENTRAL_DATABASE_URL).
 */

/**
 * Teto diário DEFAULT (F13): substitui o "ilimitado" para blogs ativos sem
 * `maxPostsPerDay` — assim o portão SEMPRE pode fechar. Valor ALTO de propósito
 * (canário): o objetivo é o portão poder fechar, não apertar a operação.
 * Override por env `CENTRAL_DEFAULT_MAX_POSTS_PER_DAY`.
 */
export const DEFAULT_MAX_POSTS_PER_DAY = 500;

export function resolveDefaultCap(): number {
  const env = Number(process.env["CENTRAL_DEFAULT_MAX_POSTS_PER_DAY"]);
  return Number.isFinite(env) && env > 0 ? env : DEFAULT_MAX_POSTS_PER_DAY;
}

/**
 * Decisão PURA de saturação: recebe os candidatos, a ocupação por blog (em
 * espera + entregues hoje) e o teto default. Blog sem teto próprio usa o
 * `defaultCap` — nunca mais "ilimitado". Retorna a string de motivo quando
 * TODOS saturaram, ou null se algum ainda tem vaga.
 */
export function isDailyQuotaFilled(
  candidates: Array<{ id: string; name: string; maxPostsPerDay: number | null }>,
  occupiedByBlog: Map<string, number>,
  defaultCap: number,
): string | null {
  for (const b of candidates) {
    const cap = b.maxPostsPerDay && b.maxPostsPerDay > 0 ? b.maxPostsPerDay : defaultCap;
    const occupied = occupiedByBlog.get(b.id) ?? 0;
    if (occupied < cap) return null; // este blog ainda tem vaga hoje
  }
  return "fila diária cheia em todos os blogs (entregues hoje + em espera ≥ teto)";
}
