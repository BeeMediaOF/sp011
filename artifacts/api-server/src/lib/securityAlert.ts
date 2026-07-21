/**
 * Sink de alerta de segurança (PRD-13/A09) — consome eventos de `logSecurity`
 * de alto sinal e notifica um webhook opt-in. FAIL-OPEN: nunca lança nem
 * bloqueia o request (o insert em security_logs é a fonte da verdade). As
 * decisões puras (`shouldAlert`/`resolveDispatch`) vivem em `securityAlertCore.ts`.
 */
import { logger } from "./logger.js";
import {
  type AlertEvent, alertDedupeKey, resolveDispatch, ALERT_DEBOUNCE_MS,
} from "./securityAlertCore.js";

export type { AlertEvent } from "./securityAlertCore.js";
export { shouldAlert, alertDedupeKey, resolveDispatch } from "./securityAlertCore.js";

const _lastAlert = new Map<string, number>();

/** Dispara o alerta (fire-and-forget). NUNCA lança — fail-open. */
export async function dispatchAlert(evt: AlertEvent): Promise<void> {
  try {
    const key = alertDedupeKey(evt);
    const decision = resolveDispatch(
      evt,
      {
        SECURITY_ALERT_WEBHOOK_URL: process.env["SECURITY_ALERT_WEBHOOK_URL"],
        SECURITY_ALERT_MIN_SEVERITY: process.env["SECURITY_ALERT_MIN_SEVERITY"],
      },
      _lastAlert.get(key),
      Date.now(),
      ALERT_DEBOUNCE_MS,
    );
    if (!decision.dispatch) {
      if (decision.reason === "no_webhook") {
        logger.warn(
          { evt: evt.eventType, sev: evt.severity, route: evt.route, ip: evt.ipAddress },
          "security alert (sem SECURITY_ALERT_WEBHOOK_URL — no-op)",
        );
      }
      return;
    }
    _lastAlert.set(key, Date.now());
    // Resumo SEM PII sensível (nunca senha/token/payload cru).
    await fetch(decision.url!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: evt.eventType,
        severity: evt.severity,
        route: evt.route,
        ipAddress: evt.ipAddress,
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err) {
    logger.warn({ err }, "dispatchAlert falhou (não-fatal)");
  }
}
