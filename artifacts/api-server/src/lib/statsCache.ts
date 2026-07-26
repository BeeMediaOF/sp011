/**
 * statsCache — cache de curta duração para a resposta de GET /api/analytics/stats
 * (PRD 09 RF2). Lógica pura, zero import de DB/Express: alvo direto de node --test
 * (o relógio é injetado como parâmetro `nowMs`, sem setTimeout real).
 *
 * Design: UM único slot (não um Map por chave). A chave é
 * `${period.key}:${period.fromDay}:${period.toDay}:${topArticlesLimit}`. Se duas
 * janelas diferentes forem pedidas dentro do TTL, o slot alterna e ambas voltam a
 * recomputar — mesmo comportamento de hoje, nunca serve o payload de outra janela.
 * Instância é módulo-level = por processo Node = por container = por blog: nunca
 * cruza blogs (isolamento do CLAUDE.md §13). Zera no restart (efêmero por design,
 * como os contadores de analyticsHealth).
 */

export interface StatsCacheEntry<T> { key: string; value: T; computedAtMs: number }

export class StatsResponseCache<T> {
  private entry: StatsCacheEntry<T> | null = null;
  // Campo declarado à parte (não parameter property): o type-stripping do Node em
  // `node --test` não suporta `constructor(private ttlMs)` (ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX).
  private readonly ttlMs: number;
  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  get(key: string, nowMs: number): T | null {
    if (!this.entry || this.entry.key !== key) return null;
    if (nowMs - this.entry.computedAtMs >= this.ttlMs) return null; // limite = expirado
    return this.entry.value;
  }

  set(key: string, value: T, nowMs: number): void {
    this.entry = { key, value, computedAtMs: nowMs };
  }
}

/** TTL curto: < 30s do auto-refresh do front (Analytics.tsx) — um HIT no meio de
 *  cada ciclo de poll absorve o recômputo sem esconder mudança por muito tempo. */
export const STATS_CACHE_TTL_MS = 20_000;
