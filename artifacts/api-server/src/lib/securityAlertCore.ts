/**
 * Núcleo PURO do sink de alerta (PRD-13) — sem logger nem I/O, para ser
 * testável com `node --test`. `dispatchAlert` (com logger + fetch) vive em
 * `securityAlert.ts`.
 */

const SEV_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };

/** Eventos sempre alertáveis, independentemente do minSeverity configurado. */
const HIGH_SIGNAL = new Set(["account_locked", "rate_limit_exceeded", "ingest_signature_invalid"]);

export const ALERT_DEBOUNCE_MS = 300_000; // 5 min — 1 alerta por (evento, IP) na janela

export function shouldAlert(
  evt: { eventType: string; severity: string },
  minSeverity: "low" | "medium" | "high" | "critical",
): boolean {
  if (HIGH_SIGNAL.has(evt.eventType)) return true;
  return (SEV_ORDER[evt.severity] ?? -1) >= (SEV_ORDER[minSeverity] ?? 99);
}

export function alertDedupeKey(evt: { eventType: string; ipAddress?: string }): string {
  return `${evt.eventType}:${evt.ipAddress ?? "-"}`;
}

export interface AlertEvent {
  eventType: string;
  severity: string;
  description?: string;
  route?: string;
  ipAddress?: string;
}

export type DispatchReason = "not_high_signal" | "debounced" | "no_webhook" | "ok";

/**
 * Decisão PURA de disparo (sem I/O): aplica severidade/allowlist, dedupe por
 * janela e presença do webhook. Retorna se deve disparar e por quê.
 */
export function resolveDispatch(
  evt: AlertEvent,
  env: { SECURITY_ALERT_WEBHOOK_URL?: string; SECURITY_ALERT_MIN_SEVERITY?: string },
  lastAlertAt: number | undefined,
  now: number,
  debounceMs: number = ALERT_DEBOUNCE_MS,
): { dispatch: boolean; reason: DispatchReason; url?: string } {
  const minSeverity = (env.SECURITY_ALERT_MIN_SEVERITY as
    | "low" | "medium" | "high" | "critical" | undefined) || "high";
  if (!shouldAlert(evt, minSeverity)) return { dispatch: false, reason: "not_high_signal" };
  if (lastAlertAt !== undefined && now - lastAlertAt < debounceMs) return { dispatch: false, reason: "debounced" };
  if (!env.SECURITY_ALERT_WEBHOOK_URL) return { dispatch: false, reason: "no_webhook" };
  return { dispatch: true, reason: "ok", url: env.SECURITY_ALERT_WEBHOOK_URL };
}
