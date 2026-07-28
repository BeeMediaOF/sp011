/**
 * analyticsHealth — contadores de saúde da coleta, em memória desde o boot.
 *
 * Nada aqui é persistido (reiniciar o container zera — documentado): o objetivo
 * é diagnosticar a coleta AGORA (o que está sendo aceito, filtrado e gravado),
 * não guardar histórico. Exposto em GET /api/analytics/health (admin).
 */
import type { InternalReason } from "./analyticsShared.js";

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

// ─── Contadores POR ENDPOINT (PRD 03 RF1 — fecha o "0 bots filtrados" enganoso) ─
export type IngestEndpointId = "event" | "behavior" | "adImpression" | "adClick";

/** Subconjunto de contadores que faz sentido por endpoint (flushedOk/flushFailed
 *  são do buffer do /event, não de endpoint — ficam só no agregado legado). */
export interface EndpointCounters {
  received: number;
  droppedBot: number;
  droppedRate: number;
  droppedInvalid: number;
  droppedDuplicate: number;
  flaggedInternal: number;
}

const ENDPOINTS: IngestEndpointId[] = ["event", "behavior", "adImpression", "adClick"];
function zeroEndpoint(): EndpointCounters {
  return { received: 0, droppedBot: 0, droppedRate: 0, droppedInvalid: 0, droppedDuplicate: 0, flaggedInternal: 0 };
}
const byEndpoint: Record<IngestEndpointId, EndpointCounters> = {
  event: zeroEndpoint(), behavior: zeroEndpoint(), adImpression: zeroEndpoint(), adClick: zeroEndpoint(),
};

/** Razão da marcação interna (PRD 03 RF4 — precisão do item 25), agregado global. */
const internalByReason: Record<InternalReason, number> = {
  flag: 0, configuredIp: 0, privateIp: 0, hosting: 0,
};

const bootAt = Date.now();
let lastEventAt: number | null = null;
let lastFlushAt: number | null = null;

/** Chaves do agregado legado que também existem por endpoint (para o espelho). */
const ENDPOINT_KEYS: ReadonlySet<string> = new Set<keyof EndpointCounters>([
  "received", "droppedBot", "droppedRate", "droppedInvalid", "droppedDuplicate", "flaggedInternal",
]);

/** Contador legado do /event. Espelha automaticamente em byEndpoint.event quando a
 *  chave existe lá — os call-sites do /event não mudam (PRD 03 RF1). */
export function bumpHealth(key: keyof HealthCounters): void {
  counters[key]++;
  if (ENDPOINT_KEYS.has(key)) byEndpoint.event[key as keyof EndpointCounters]++;
}

/** Incrementa um contador de um endpoint específico (behavior/ads — PRD 03 RF1). */
export function bumpEndpoint(ep: IngestEndpointId, key: keyof EndpointCounters): void {
  byEndpoint[ep][key]++;
}

/** Atribui a razão da marcação interna (PRD 03 RF4). */
export function bumpInternalReason(reason: InternalReason): void {
  internalByReason[reason]++;
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
    // Aditivos (PRD 03) — exibição no card Saúde é PRD 08.
    byEndpoint: Object.fromEntries(ENDPOINTS.map((ep) => [ep, { ...byEndpoint[ep] }])) as Record<IngestEndpointId, EndpointCounters>,
    internalByReason: { ...internalByReason },
  };
}
