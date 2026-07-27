/**
 * sanityMonitorCore — núcleo PURO do monitor de sanidade (PRD 11 RF3/RF4).
 *
 * Sem logger, sem banco, sem audit.ts (que puxaria Drizzle) — para ser alvo de
 * `node --test`. A parte de I/O (coleta, logSecurity, setInterval) vive em
 * sanityMonitor.ts e injeta as dependências aqui. Mesmo split de
 * securityAlertCore.ts / securityAlert.ts.
 */
import {
  buildRuleStatus, type SanityViolation,
} from "./analyticsSanity.ts";

export interface SanityReport {
  evaluatedAt: string | null;                // null = ciclo ainda não rodou (boot < 2min ou desligado)
  window: { key: string; days: number } | null;
  violations: SanityViolation[];
  skipped: { rule: string; reason: string }[];
  ruleStatus: Record<string, "ok" | "violated" | "skipped">;
}

export const EMPTY_REPORT: SanityReport = {
  evaluatedAt: null, window: null, violations: [], skipped: [], ruleStatus: {},
};

export interface EmitSink {
  /** Emissão DURÁVEL da crítica (→ logSecurity/security_logs). */
  logCritical: (v: SanityViolation) => void;
  /** Log estruturado (→ logger.warn). */
  warn: (v: SanityViolation) => void;
}

/**
 * Resolve o intervalo do monitor a partir do env. `<=0` (devolvido como está) é o
 * sinal de DESLIGADO — o chamador decide. Vazio/inválido → default (900000 = 15min).
 */
export function resolveIntervalMs(raw: string | undefined, def = 900_000): number {
  if (raw === undefined || raw.trim() === "") return def;
  const n = Number(raw);
  return Number.isFinite(n) ? n : def;
}

/** Default do throttle de emissão (6h). Mesma resolução tolerante do intervalo. */
export function resolveThrottleMs(raw: string | undefined, def = 21_600_000): number {
  if (raw === undefined || raw.trim() === "") return def;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : def;
}

/**
 * Monta o relatório em memória a partir de um ciclo (coleta + avaliação). O
 * ruleStatus cobre SEMPRE as 7 regras (ok/violated/skipped), nunca ausente.
 */
export function buildReport(
  evaluatedAtIso: string,
  window: { key: string; days: number } | null,
  violations: readonly SanityViolation[],
  skipped: readonly { rule: string; reason: string }[],
): SanityReport {
  return {
    evaluatedAt: evaluatedAtIso,
    window,
    violations: [...violations],
    skipped: [...skipped],
    ruleStatus: buildRuleStatus(violations, skipped),
  };
}

/**
 * Emite as violações aplicando o throttle por `(rule|scope)` (muta o throttleMap).
 * DENTRO da janela a mesma chave é suprimida; escopo/regra diferente passa; passada
 * a janela, reemite. `critical` → logCritical (durável) + warn; `warning` → só warn
 * (NUNCA logCritical). Detecta e sinaliza — jamais corrige (RF4).
 */
export function emitViolations(
  violations: readonly SanityViolation[],
  throttleMap: Map<string, number>,
  now: number,
  throttleMs: number,
  sink: EmitSink,
): void {
  for (const v of violations) {
    const key = `${v.rule}|${v.scope}`;
    const last = throttleMap.get(key);
    if (last !== undefined && now - last < throttleMs) continue; // throttled
    throttleMap.set(key, now);
    if (v.severity === "critical") {
      sink.logCritical(v);
      sink.warn(v);
    } else {
      sink.warn(v);
    }
  }
}

/**
 * Guarda de execução única (single-flight): impede ciclos sobrepostos. Um ciclo
 * que lança NÃO trava o agendador — o `finally` sempre libera. Padrão do scheduler
 * existente (scheduler.ts).
 */
export class SingleFlight {
  private running = false;
  async run(fn: () => Promise<void>): Promise<"ran" | "skipped"> {
    if (this.running) return "skipped";
    this.running = true;
    try {
      await fn();
      return "ran";
    } finally {
      this.running = false;
    }
  }
}
