import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveIntervalMs, resolveThrottleMs, emitViolations, buildReport, SingleFlight,
  type EmitSink,
} from "../src/lib/sanityMonitorCore.ts";
import type { SanityViolation } from "../src/lib/analyticsSanity.ts";

// PRD 11 §12 itens 4/5 — núcleo do monitor: agendamento (intervalo/guarda) e emissão
// (throttle, sink fake). Sem banco, sem audit.ts, sem relógio real.

function crit(rule: string, scope = ""): SanityViolation {
  return { rule, severity: "critical", scope, observed: 5, limit: 3, detail: "x" };
}
function warn(rule: string, scope = ""): SanityViolation {
  return { rule, severity: "warning", scope, observed: 5, limit: 3, detail: "x" };
}
function fakeSink(): EmitSink & { crit: SanityViolation[]; warns: SanityViolation[] } {
  const crit: SanityViolation[] = [];
  const warns: SanityViolation[] = [];
  return { crit, warns, logCritical: (v) => crit.push(v), warn: (v) => warns.push(v) };
}

// ── resolveIntervalMs / resolveThrottleMs ─────────────────────────────────────
test("resolveIntervalMs: default 900000; vazio/inválido → default; 0 e negativo passam (desligar)", () => {
  assert.equal(resolveIntervalMs(undefined), 900_000);
  assert.equal(resolveIntervalMs(""), 900_000);
  assert.equal(resolveIntervalMs("abc"), 900_000);
  assert.equal(resolveIntervalMs("0"), 0);       // caller trata <=0 como desligado
  assert.equal(resolveIntervalMs("-5"), -5);
  assert.equal(resolveIntervalMs("300000"), 300_000);
});

test("resolveThrottleMs: default 6h; só aceita > 0", () => {
  assert.equal(resolveThrottleMs(undefined), 21_600_000);
  assert.equal(resolveThrottleMs("0"), 21_600_000);   // <=0 volta ao default (throttle sempre ativo)
  assert.equal(resolveThrottleMs("-1"), 21_600_000);
  assert.equal(resolveThrottleMs("60000"), 60_000);
});

// ── emitViolations (RF4 / CA10) ───────────────────────────────────────────────
test("critical chama logCritical 1× e warn 1×; warning NUNCA chama logCritical", () => {
  const s = fakeSink();
  const map = new Map<string, number>();
  emitViolations([crit("sessions_lt_visitors"), warn("sources_not_100")], map, 1000, 6 * 3600_000, s);
  assert.equal(s.crit.length, 1);
  assert.equal(s.crit[0]!.rule, "sessions_lt_visitors");
  assert.equal(s.warns.length, 2); // critical também gera warn + o warning
});

test("2ª ocorrência da mesma (rule,scope) na janela NÃO reemite; passada a janela reemite", () => {
  const s = fakeSink();
  const map = new Map<string, number>();
  const T = 6 * 3600_000;
  emitViolations([crit("clicks_gt_impressions", "ad:a1")], map, 1000, T, s);
  emitViolations([crit("clicks_gt_impressions", "ad:a1")], map, 1000 + T - 1, T, s); // dentro da janela
  assert.equal(s.crit.length, 1); // suprimido
  emitViolations([crit("clicks_gt_impressions", "ad:a1")], map, 1000 + T, T, s); // fim da janela
  assert.equal(s.crit.length, 2); // reemite
});

test("(rule,scope) diferente chama mesmo dentro da janela", () => {
  const s = fakeSink();
  const map = new Map<string, number>();
  const T = 6 * 3600_000;
  emitViolations([crit("clicks_gt_impressions", "ad:a1")], map, 1000, T, s);
  emitViolations([crit("clicks_gt_impressions", "ad:a2")], map, 1000, T, s); // escopo diferente
  emitViolations([crit("sessions_lt_visitors", "")], map, 1000, T, s);       // regra diferente
  assert.equal(s.crit.length, 3);
});

// ── buildReport ───────────────────────────────────────────────────────────────
test("buildReport: evaluatedAt/window/violations/skipped + ruleStatus com as 7 chaves", () => {
  const r = buildReport("2026-07-27T00:00:00.000Z", { key: "30d", days: 30 },
    [crit("sessions_lt_visitors")], [{ rule: "paid_without_campaign", reason: "prd05_pendente" }]);
  assert.equal(r.evaluatedAt, "2026-07-27T00:00:00.000Z");
  assert.deepEqual(r.window, { key: "30d", days: 30 });
  assert.equal(r.violations.length, 1);
  assert.equal(r.skipped.length, 1);
  assert.equal(Object.keys(r.ruleStatus).length, 7);
  assert.equal(r.ruleStatus.sessions_lt_visitors, "violated");
  assert.equal(r.ruleStatus.paid_without_campaign, "skipped");
  assert.equal(r.ruleStatus.sources_not_100, "ok");
});

// ── SingleFlight (guarda de execução única) ───────────────────────────────────
test("SingleFlight: ciclo sobreposto é pulado; um ciclo que lança libera a guarda", async () => {
  const sf = new SingleFlight();
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const first = sf.run(async () => { await gate; }); // segura a guarda
  const skipped = await sf.run(async () => { /* não deveria rodar */ });
  assert.equal(skipped, "skipped");
  release();
  assert.equal(await first, "ran");

  // Um ciclo que lança: a guarda é liberada no finally → o próximo roda.
  await assert.rejects(sf.run(async () => { throw new Error("boom"); }));
  assert.equal(await sf.run(async () => { /* ok */ }), "ran");
});
