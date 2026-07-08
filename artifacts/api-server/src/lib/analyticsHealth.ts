/**
 * analyticsHealth — contadores de saúde da coleta, em memória desde o boot.
 *
 * Nada aqui é persistido (reiniciar o container zera — documentado): o objetivo
 * é diagnosticar a coleta AGORA (o que está sendo aceito, filtrado e gravado),
 * não guardar histórico. Exposto em GET /api/analytics/health (admin).
 */

export interface HealthCounters {
  received: number;         // eventos aceitos e enfileirados
  droppedBot: number;       // user-agent de bot/CLI ou vazio
  droppedRate: number;      // acima do rate limit por IP
  droppedInvalid: number;   // payload inválido ou caminho /admin
  droppedDuplicate: number; // pageview repetido (mesma sessão+path em <15s)
  flaggedInternal: number;  // aceitos mas marcados como tráfego interno
  flushedOk: number;        // linhas efetivamente gravadas no banco
  flushFailed: number;      // linhas descartadas/perdidas em flush com erro
}

const counters: HealthCounters = {
  received: 0, droppedBot: 0, droppedRate: 0, droppedInvalid: 0,
  droppedDuplicate: 0, flaggedInternal: 0, flushedOk: 0, flushFailed: 0,
};

const bootAt = Date.now();
let lastEventAt: number | null = null;
let lastFlushAt: number | null = null;

export function bumpHealth(key: keyof HealthCounters): void {
  counters[key]++;
}

export function noteEvent(): void {
  lastEventAt = Date.now();
}

export function noteFlush(ok: boolean, rowCount: number): void {
  if (ok) counters.flushedOk += rowCount;
  else counters.flushFailed += rowCount;
  lastFlushAt = Date.now();
}

export function healthSnapshot(extra: { buffered: number }) {
  return {
    ...counters,
    buffered: extra.buffered,
    lastEventAt: lastEventAt ? new Date(lastEventAt).toISOString() : null,
    lastFlushAt: lastFlushAt ? new Date(lastFlushAt).toISOString() : null,
    bootAt: new Date(bootAt).toISOString(),
    uptimeSeconds: Math.round((Date.now() - bootAt) / 1000),
  };
}
