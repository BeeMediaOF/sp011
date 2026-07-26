import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateHealthAlerts, AD_SANITY_MARGIN, HEALTH_ALERT_THRESHOLDS,
  type HealthAlertInput,
} from "../src/lib/healthAlerts.ts";

// PRD 08 — motor puro de alertas de saúde da coleta. Fronteiras EXATAS travadas
// por teste: mudar um limiar exige mudar o teste junto (CA4).

// Input "saudável" completo: nenhum segmento null, nenhuma regra dispara. Cada
// teste sobrescreve só o que precisa.
function healthy(): HealthAlertInput {
  return {
    counters: { received: 100, flushedOk: 100, flushFailed: 0, buffered: 0 },
    bufferIdentityTolerance: 1000,
    internalByReason: { flag: 0, configuredIp: 0, privateIp: 0 },
    internalShare: { recentTotal: 100, recentInternal: 10, priorTotal: 100, priorInternal: 10 },
    adDays: [],
    adMargin: AD_SANITY_MARGIN,
    paid: { activeCampaigns: 1, paidLinesSinceRule: 5 },
    reservedBehaviorCount: 0,
  };
}
const ids = (r: { alerts: { id: string }[] }): string[] => r.alerts.map((a) => a.id);
const has = (r: { alerts: { id: string }[] }, id: string): boolean => ids(r).includes(id);
const skipReason = (r: { skipped: { id: string; reason: string }[] }, id: string): string | undefined =>
  r.skipped.find((s) => s.id === id)?.reason;

test("baseline saudável: zero alertas, zero skips", () => {
  const r = evaluateHealthAlerts(healthy());
  assert.deepEqual(r.alerts, []);
  assert.deepEqual(r.skipped, []);
});

test("flush_failed: 0 (não) vs 1 (sim, critical)", () => {
  const a = healthy(); a.counters.flushFailed = 0;
  assert.ok(!has(evaluateHealthAlerts(a), "flush_failed"));
  const b = healthy(); b.counters = { received: 100, flushedOk: 99, flushFailed: 1, buffered: 0 };
  const r = evaluateHealthAlerts(b);
  assert.ok(has(r, "flush_failed"));
  assert.equal(r.alerts.find((x) => x.id === "flush_failed")?.severity, "critical");
});

test("buffer_identity: drift 1000 (não) vs 1001 (sim)", () => {
  // received - (flushedOk+flushFailed+buffered) = drift
  const a = healthy(); a.counters = { received: 1000, flushedOk: 0, flushFailed: 0, buffered: 0 };
  assert.ok(!has(evaluateHealthAlerts(a), "buffer_identity")); // drift 1000, tolerância 1000 → não (> estrito)
  const b = healthy(); b.counters = { received: 1001, flushedOk: 0, flushFailed: 0, buffered: 0 };
  assert.ok(has(evaluateHealthAlerts(b), "buffer_identity"));  // drift 1001 > 1000
});

test("internal_privateip_dominant: received=29 100% (não, amostra) vs received=30 27/30 (sim)", () => {
  const a = healthy();
  a.counters = { received: 29, flushedOk: 29, flushFailed: 0, buffered: 0 };
  a.internalByReason = { flag: 0, configuredIp: 0, privateIp: 29 };
  assert.ok(!has(evaluateHealthAlerts(a), "internal_privateip_dominant")); // < 30 → amostra insuficiente

  const b = healthy();
  b.counters = { received: 30, flushedOk: 30, flushFailed: 0, buffered: 0 };
  b.internalByReason = { flag: 3, configuredIp: 0, privateIp: 27 }; // 27 >= 0.9*30 = 27
  const r = evaluateHealthAlerts(b);
  assert.ok(has(r, "internal_privateip_dominant"));
  assert.equal(r.alerts.find((x) => x.id === "internal_privateip_dominant")?.severity, "critical");

  const c = healthy();
  c.counters = { received: 30, flushedOk: 30, flushFailed: 0, buffered: 0 };
  c.internalByReason = { flag: 4, configuredIp: 0, privateIp: 26 }; // 26 < 27 → não
  assert.ok(!has(evaluateHealthAlerts(c), "internal_privateip_dominant"));
});

test("internal_share_shift: 39,9 pts (não) vs 40 pts (sim); amostra 49 (não)", () => {
  // prior 10% vs recent 49,9% = 39,9 pontos → não
  const a = healthy();
  a.internalShare = { recentTotal: 1000, recentInternal: 499, priorTotal: 1000, priorInternal: 100 };
  assert.ok(!has(evaluateHealthAlerts(a), "internal_share_shift"));
  // prior 10% vs recent 50% = 40 pontos exatos → sim
  const b = healthy();
  b.internalShare = { recentTotal: 100, recentInternal: 50, priorTotal: 100, priorInternal: 10 };
  assert.ok(has(evaluateHealthAlerts(b), "internal_share_shift"));
  // shift enorme mas janela recente < 50 → silêncio legítimo (volume baixo não é bug)
  const c = healthy();
  c.internalShare = { recentTotal: 49, recentInternal: 49, priorTotal: 100, priorInternal: 0 };
  assert.ok(!has(evaluateHealthAlerts(c), "internal_share_shift"));
});

test("ad_sanity: impressions = limite (não) vs limite+1 (sim), pageviews=0 → max(...,1)", () => {
  // pageviews 0 → limite = max(0,1)*1*3 = 3
  const a = healthy();
  a.adDays = [{ adId: "x", date: "2026-07-26", impressions: 3, clicks: 0, pageviews: 0 }];
  assert.ok(!has(evaluateHealthAlerts(a), "ad_sanity")); // 3 > 3 é falso
  const b = healthy();
  b.adDays = [{ adId: "x", date: "2026-07-26", impressions: 4, clicks: 0, pageviews: 0 }];
  const r = evaluateHealthAlerts(b);
  assert.ok(has(r, "ad_sanity"));
  assert.equal(r.alerts.find((x) => x.id === "ad_sanity")?.params.limit, 3);
});

test("ad_clicks_gt_impressions: clicks = impressions+1 (não) vs +2 (sim, critical)", () => {
  const a = healthy();
  a.adDays = [{ adId: "x", date: "2026-07-26", impressions: 10, clicks: 11, pageviews: 100 }];
  assert.ok(!has(evaluateHealthAlerts(a), "ad_clicks_gt_impressions")); // 11 > 11 falso
  const b = healthy();
  b.adDays = [{ adId: "x", date: "2026-07-26", impressions: 10, clicks: 12, pageviews: 100 }];
  const r = evaluateHealthAlerts(b);
  assert.ok(has(r, "ad_clicks_gt_impressions"));
  assert.equal(r.alerts.find((x) => x.id === "ad_clicks_gt_impressions")?.severity, "critical");
});

test("paid_without_campaign: {0,0} não; {0,1} sim; {1,1} não", () => {
  const a = healthy(); a.paid = { activeCampaigns: 0, paidLinesSinceRule: 0 };
  assert.ok(!has(evaluateHealthAlerts(a), "paid_without_campaign"));
  const b = healthy(); b.paid = { activeCampaigns: 0, paidLinesSinceRule: 1 };
  const r = evaluateHealthAlerts(b);
  assert.ok(has(r, "paid_without_campaign"));
  assert.equal(r.alerts.find((x) => x.id === "paid_without_campaign")?.severity, "critical");
  const c = healthy(); c.paid = { activeCampaigns: 1, paidLinesSinceRule: 1 };
  assert.ok(!has(evaluateHealthAlerts(c), "paid_without_campaign"));
});

test("reserved_behavior_type: 0 (não) vs 1 (sim, warning)", () => {
  const a = healthy(); a.reservedBehaviorCount = 0;
  assert.ok(!has(evaluateHealthAlerts(a), "reserved_behavior_type"));
  const b = healthy(); b.reservedBehaviorCount = 1;
  const r = evaluateHealthAlerts(b);
  assert.ok(has(r, "reserved_behavior_type"));
  assert.equal(r.alerts.find((x) => x.id === "reserved_behavior_type")?.severity, "warning");
});

test("CA10 — caso-régua item 25: 104/106 internos, estável nas 2 janelas → ZERO alertas", () => {
  const a = healthy();
  // proporção ALTA (98%) mas ESTÁVEL entre as janelas → nunca alerta
  a.internalShare = { recentTotal: 106, recentInternal: 104, priorTotal: 106, priorInternal: 104 };
  // internos por flag (não privateIp) → dominância de privateIp não dispara
  a.counters = { received: 106, flushedOk: 106, flushFailed: 0, buffered: 0 };
  a.internalByReason = { flag: 104, configuredIp: 0, privateIp: 0 };
  const r = evaluateHealthAlerts(a);
  assert.deepEqual(r.alerts, []);
  assert.deepEqual(r.skipped, []);
});

test("CA6 — degradação: cada segmento null vira skip com a razão certa; nenhum alerta falso", () => {
  const a = healthy(); a.internalByReason = null;
  assert.equal(skipReason(evaluateHealthAlerts(a), "internal_privateip_dominant"), "prd03_pendente");
  const b = healthy(); b.internalShare = null;
  assert.equal(skipReason(evaluateHealthAlerts(b), "internal_share_shift"), "db_error");
  const c = healthy(); c.adDays = null;
  const rc = evaluateHealthAlerts(c);
  assert.equal(skipReason(rc, "ad_sanity"), "prd04_reparo_pendente");
  assert.equal(skipReason(rc, "ad_clicks_gt_impressions"), "prd04_reparo_pendente");
  const d = healthy(); d.paid = null;
  assert.equal(skipReason(evaluateHealthAlerts(d), "paid_without_campaign"), "prd05_pendente");
  const e = healthy(); e.reservedBehaviorCount = null;
  assert.equal(skipReason(evaluateHealthAlerts(e), "reserved_behavior_type"), "db_error");
});

test("CA6 — todos os segmentos null: alerts vazio e 6 entradas em skipped (2 regras de contador sempre avaliam)", () => {
  const r = evaluateHealthAlerts({
    counters: { received: 0, flushedOk: 0, flushFailed: 0, buffered: 0 },
    bufferIdentityTolerance: 1000,
    internalByReason: null,
    internalShare: null,
    adDays: null,
    adMargin: AD_SANITY_MARGIN,
    paid: null,
    reservedBehaviorCount: null,
  });
  assert.deepEqual(r.alerts, []);
  assert.equal(r.skipped.length, 6);
  assert.deepEqual(
    r.skipped.map((s) => s.id).sort(),
    [
      "ad_clicks_gt_impressions", "ad_sanity", "internal_privateip_dominant",
      "internal_share_shift", "paid_without_campaign", "reserved_behavior_type",
    ],
  );
});

test("CA2 — ordenação (critical antes de warning, depois id) e shape (params sempre presentes)", () => {
  const a = healthy();
  a.counters = { received: 100, flushedOk: 50, flushFailed: 1, buffered: 0 }; // flush_failed (crit) + buffer drift 49<1000
  a.reservedBehaviorCount = 3;                                                // reserved (warn)
  a.adDays = [{ adId: "z", date: "2026-07-26", impressions: 9, clicks: 30, pageviews: 0 }]; // ad_sanity (warn) + clicks>impr (crit)
  const r = evaluateHealthAlerts(a);
  const sevs = r.alerts.map((x) => x.severity);
  const firstWarn = sevs.indexOf("warning");
  const lastCrit = sevs.lastIndexOf("critical");
  assert.ok(lastCrit < firstWarn, "todos os critical vêm antes dos warning");
  for (const al of r.alerts) assert.ok(al.params && typeof al.params === "object");
  // criticais em ordem de id
  const crit = r.alerts.filter((x) => x.severity === "critical").map((x) => x.id);
  assert.deepEqual(crit, [...crit].sort());
});

test("CA2 — snapshot dos 8 ids do catálogo (trava renomeações que quebrariam o i18n)", () => {
  // Força TODOS os alertas a disparar de uma vez e confere o conjunto de ids.
  const r = evaluateHealthAlerts({
    counters: { received: 30, flushedOk: 0, flushFailed: 5, buffered: 0 }, // flush_failed + buffer_identity(drift 25<1000? não)
    bufferIdentityTolerance: 10, // drift = |30-5| = 25 > 10 → buffer_identity dispara
    internalByReason: { flag: 0, configuredIp: 0, privateIp: 30 },         // privateip dominant
    internalShare: { recentTotal: 100, recentInternal: 100, priorTotal: 100, priorInternal: 0 }, // shift 100
    adDays: [{ adId: "a", date: "2026-07-26", impressions: 99, clicks: 200, pageviews: 0 }],       // ad_sanity + clicks>impr
    adMargin: AD_SANITY_MARGIN,
    paid: { activeCampaigns: 0, paidLinesSinceRule: 7 },                    // paid_without_campaign
    reservedBehaviorCount: 2,                                              // reserved
  });
  assert.deepEqual(
    ids(r).sort(),
    [
      "ad_clicks_gt_impressions", "ad_sanity", "buffer_identity", "flush_failed",
      "internal_privateip_dominant", "internal_share_shift", "paid_without_campaign",
      "reserved_behavior_type",
    ],
  );
});

test("constantes travadas: AD_SANITY_MARGIN e HEALTH_ALERT_THRESHOLDS exatos (RF3)", () => {
  assert.equal(AD_SANITY_MARGIN, 3);
  assert.deepEqual(HEALTH_ALERT_THRESHOLDS, {
    privateIpDominanceMinReceived: 30,
    privateIpDominanceShare: 0.9,
    internalShiftMinSample: 50,
    internalShiftPoints: 40,
  });
});
