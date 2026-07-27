/**
 * sanityMonitor — wiring de I/O do monitor de sanidade cross-metric (PRD 11 RF3/RF4).
 *
 * Roda DENTRO de cada api-server, contra o banco DO PRÓPRIO blog (por blog por
 * construção — nada condicionado a BLOG_ID). 100% LEITURA das tabelas de métrica; a
 * ÚNICA escrita é logSecurity (INSERT em security_logs, tabela de log, não de
 * métrica). Toda a lógica testável está em sanityMonitorCore.ts.
 */
import { logger } from "./logger.js";
import { logSecurity } from "./audit.js";
import { collectSanityInput } from "./sanityCollect.js";
import { evaluateSanity } from "./analyticsSanity.js";
import {
  resolveIntervalMs, resolveThrottleMs, emitViolations, buildReport, SingleFlight,
  EMPTY_REPORT, type SanityReport, type EmitSink,
} from "./sanityMonitorCore.js";

let _report: SanityReport = EMPTY_REPORT;
const _throttle = new Map<string, number>();
const _flight = new SingleFlight();
const THROTTLE_MS = resolveThrottleMs(process.env.SANITY_ALERT_THROTTLE_MS);

/** Relatório em memória do último ciclo (zera no restart — durabilidade vem do
 *  security_logs das críticas). Lido pelo /health (RF5). */
export function getSanityReport(): SanityReport {
  return _report;
}

const sink: EmitSink = {
  // Emissão durável: o INSERT em security_logs é a fonte da verdade; o webhook do
  // dispatchAlert (dentro do logSecurity) é bônus opt-in. Sem PII (não há usuário
  // nem IP numa violação de sanidade — RNF §5).
  logCritical: (v) => {
    void logSecurity({
      eventType: "analytics_sanity_violation",
      severity: "critical",
      description: `${v.rule} ${v.scope || "-"} observed=${v.observed} limit=${v.limit}`,
      route: "/api/analytics/sanity",
    });
  },
  warn: (v) => {
    logger.warn(
      { rule: v.rule, scope: v.scope, observed: v.observed, limit: v.limit, severity: v.severity },
      "analytics sanity violation",
    );
  },
};

async function cycleBody(): Promise<void> {
  try {
    const { input, skipped, window } = await collectSanityInput();
    const violations = evaluateSanity(input);
    const now = Date.now();
    _report = buildReport(new Date(now).toISOString(), window, violations, skipped);
    emitViolations(violations, _throttle, now, THROTTLE_MS, sink);
  } catch (err) {
    // Um ciclo que falha não mata o setInterval nem o processo.
    logger.warn({ err }, "sanity monitor: ciclo falhou");
  }
}

/**
 * Sobe o monitor no boot (chamado em src/index.ts, ao lado de startScheduler, DEPOIS
 * do banco inicializar). Primeira execução ~2min após o boot; depois a cada
 * SANITY_MONITOR_MS (default 15min). `SANITY_MONITOR_MS<=0` desliga sem rebuild.
 */
export function startSanityMonitor(): void {
  const intervalMs = resolveIntervalMs(process.env.SANITY_MONITOR_MS);
  if (intervalMs <= 0) {
    logger.info("sanity monitor desligado (SANITY_MONITOR_MS<=0)");
    return;
  }
  setTimeout(() => {
    void _flight.run(cycleBody);
    setInterval(() => { void _flight.run(cycleBody); }, intervalMs);
  }, 2 * 60_000);
  logger.info({ intervalMs, throttleMs: THROTTLE_MS }, "sanity monitor iniciado");
}
