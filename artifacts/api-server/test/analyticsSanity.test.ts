import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateSanity, buildRuleStatus, RULE_IDS,
  AD_SANITY_MARGIN, CATEGORY_TOLERANCE, PERCENT_CEILING, CLICK_TOLERANCE,
  type SanityInput,
} from "../src/lib/analyticsSanity.ts";

// PRD 11 — catálogo puro de sanidade cross-metric. Fronteiras EXATAS travadas por
// teste: cada regra tem um caso que dispara e um que não (incl. os limites).
// Princípio: volume baixo NÃO é bug — blog novo = nenhuma violação.

// Input "saudável" completo: nenhuma regra dispara. Cada teste sobrescreve só o que precisa.
function healthy(): SanityInput {
  return {
    adDays: [{ adId: "a1", date: "2026-07-22", impressions: 3, clicks: 1, pageviews: 1, slots: 1 }],
    adMargin: AD_SANITY_MARGIN, // 3
    paid: { activeCampaigns: 1, paidLinesSinceRule: 5 },
    channelCounts: { direto: 50, busca: 30, social: 20 }, // soma 100%
    categoryViews: [{ slug: "futebol", views: 4 }, { slug: "geral", views: 2 }],
    windowPageviewsNonInternal: 10,
    windowSessions: 8,
    windowUniqueVisitors: 6,
    displayedPercents: [{ scope: "cat:futebol", pct: 100 }, { scope: "cat:geral", pct: 40 }],
  };
}

test("input saudável não dispara nenhuma regra", () => {
  assert.deepEqual(evaluateSanity(healthy()), []);
});

// ── R1 clicks_gt_impressions ──────────────────────────────────────────────────
test("clicks_gt_impressions: +tolerance ok, +tolerance+1 viola, 0/0 ok", () => {
  const base = healthy();
  // clicks = impressions + CLICK_TOLERANCE → ok (folga do dwell de 1s)
  base.adDays = [{ adId: "a1", date: "2026-07-22", impressions: 3, clicks: 3 + CLICK_TOLERANCE, pageviews: 3, slots: 1 }];
  assert.equal(evaluateSanity(base).filter((v) => v.rule === "clicks_gt_impressions").length, 0);
  // + tolerance + 1 → viola (critical)
  base.adDays = [{ adId: "a1", date: "2026-07-22", impressions: 3, clicks: 3 + CLICK_TOLERANCE + 1, pageviews: 3, slots: 1 }];
  const v = evaluateSanity(base).filter((x) => x.rule === "clicks_gt_impressions");
  assert.equal(v.length, 1);
  assert.equal(v[0]!.severity, "critical");
  assert.equal(v[0]!.scope, "ad:a1");
  // 0 impressões e 0 cliques → ok
  base.adDays = [{ adId: "a1", date: "2026-07-22", impressions: 0, clicks: 0, pageviews: 0, slots: 1 }];
  assert.equal(evaluateSanity(base).filter((x) => x.rule === "clicks_gt_impressions").length, 0);
});

test("clicks_gt_impressions: a virada é de CONSTANTE, não de lógica (CLICK_TOLERANCE=1 hoje)", () => {
  // Garante que o helper do PRD 04 respeita a tolerância injetada: com o valor atual
  // (1), clicks = impressions+1 é ok; se um dia CLICK_TOLERANCE virar 0, o MESMO input
  // passa a violar sem mudar evaluateSanity. Aqui só ancoramos o valor corrente.
  assert.equal(CLICK_TOLERANCE, 1);
  const base = healthy();
  base.adDays = [{ adId: "a1", date: "d", impressions: 2, clicks: 3, pageviews: 2, slots: 1 }]; // 3 = 2+1
  assert.equal(evaluateSanity(base).filter((v) => v.rule === "clicks_gt_impressions").length, 0);
});

// ── R6 impressions_gt_pageviews ───────────────────────────────────────────────
test("impressions_gt_pageviews: no limite ok, +1 viola; piso max(pv,1); margem 1.5 = critical", () => {
  const base = healthy();
  // limite = max(pv,1) * slots * margem = 3 * 1 * 3 = 9
  base.adDays = [{ adId: "a1", date: "d", impressions: 9, clicks: 0, pageviews: 3, slots: 1 }];
  assert.equal(evaluateSanity(base).filter((v) => v.rule === "impressions_gt_pageviews").length, 0);
  base.adDays = [{ adId: "a1", date: "d", impressions: 10, clicks: 0, pageviews: 3, slots: 1 }];
  const v = evaluateSanity(base).filter((x) => x.rule === "impressions_gt_pageviews");
  assert.equal(v.length, 1);
  assert.equal(v[0]!.severity, "warning"); // margem 3
  // piso max(pv,1): pageviews=0 com impressions ≤ 1*1*3=3 → ok
  base.adDays = [{ adId: "a1", date: "d", impressions: 3, clicks: 0, pageviews: 0, slots: 1 }];
  assert.equal(evaluateSanity(base).filter((x) => x.rule === "impressions_gt_pageviews").length, 0);
  // margem 1.5 (pós-PRD 02) → severidade critical; limite = 3*1*1.5 = 4.5
  base.adMargin = 1.5;
  base.adDays = [{ adId: "a1", date: "d", impressions: 5, clicks: 0, pageviews: 3, slots: 1 }];
  const v2 = evaluateSanity(base).filter((x) => x.rule === "impressions_gt_pageviews");
  assert.equal(v2.length, 1);
  assert.equal(v2[0]!.severity, "critical");
});

// ── R2 paid_without_campaign ──────────────────────────────────────────────────
test("paid_without_campaign: 0 campanhas & pago>0 viola; ≥1 ou pago=0 ok; null não avaliada", () => {
  const base = healthy();
  base.paid = { activeCampaigns: 0, paidLinesSinceRule: 7 };
  const v = evaluateSanity(base).filter((x) => x.rule === "paid_without_campaign");
  assert.equal(v.length, 1);
  assert.equal(v[0]!.severity, "critical");
  base.paid = { activeCampaigns: 1, paidLinesSinceRule: 7 };
  assert.equal(evaluateSanity(base).filter((x) => x.rule === "paid_without_campaign").length, 0);
  base.paid = { activeCampaigns: 0, paidLinesSinceRule: 0 };
  assert.equal(evaluateSanity(base).filter((x) => x.rule === "paid_without_campaign").length, 0);
  base.paid = null;
  assert.equal(evaluateSanity(base).filter((x) => x.rule === "paid_without_campaign").length, 0);
});

// ── R3 sources_not_100 ────────────────────────────────────────────────────────
test("sources_not_100: soma 100 ok; buraco de agregação viola; total 0 não avaliada", () => {
  const base = healthy();
  base.channelCounts = { direto: 60, busca: 40 }; // 100
  assert.equal(evaluateSanity(base).filter((x) => x.rule === "sources_not_100").length, 0);
  // reconstrução dá 97 (cada canal 32 de 99 → round(32.3)=32, ×3 = 96/97) — desvio real
  base.channelCounts = { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1, h: 1, i: 1, j: 1, k: 1, l: 1, m: 1 }; // 13×round(100/13=7.69→8)=104
  assert.equal(evaluateSanity(base).filter((x) => x.rule === "sources_not_100").length, 1);
  base.channelCounts = {}; // total 0 → não avaliada
  assert.equal(evaluateSanity(base).filter((x) => x.rule === "sources_not_100").length, 0);
});

// ── R4 category_gt_pageviews ──────────────────────────────────────────────────
test("category_gt_pageviews: =pv ok; =pv+tolerance ok; =pv+tolerance+1 viola", () => {
  const base = healthy();
  base.windowPageviewsNonInternal = 10;
  base.categoryViews = [{ slug: "x", views: 10 }]; // = pv → ok
  assert.equal(evaluateSanity(base).filter((v) => v.rule === "category_gt_pageviews").length, 0);
  base.categoryViews = [{ slug: "x", views: 10 + CATEGORY_TOLERANCE }]; // dentro da folga → ok
  assert.equal(evaluateSanity(base).filter((v) => v.rule === "category_gt_pageviews").length, 0);
  base.categoryViews = [{ slug: "x", views: 10 + CATEGORY_TOLERANCE + 1 }]; // estoura → viola
  const v = evaluateSanity(base).filter((x) => x.rule === "category_gt_pageviews");
  assert.equal(v.length, 1);
  assert.equal(v[0]!.severity, "warning");
});

// ── R5 sessions_lt_visitors ───────────────────────────────────────────────────
test("sessions_lt_visitors: visitantes=sessões ok; visitantes=sessões+1 viola (critical)", () => {
  const base = healthy();
  base.windowSessions = 5; base.windowUniqueVisitors = 5;
  assert.equal(evaluateSanity(base).filter((v) => v.rule === "sessions_lt_visitors").length, 0);
  base.windowUniqueVisitors = 6;
  const v = evaluateSanity(base).filter((x) => x.rule === "sessions_lt_visitors");
  assert.equal(v.length, 1);
  assert.equal(v[0]!.severity, "critical");
});

// ── R7 percent_over_100 ───────────────────────────────────────────────────────
test("percent_over_100: 100.0 ok; 100.6 viola; 300 (item 14 real) viola com scope", () => {
  const base = healthy();
  base.displayedPercents = [{ scope: "cat:a", pct: PERCENT_CEILING }]; // 100 → ok
  assert.equal(evaluateSanity(base).filter((v) => v.rule === "percent_over_100").length, 0);
  base.displayedPercents = [{ scope: "cat:a", pct: 100.6 }];
  assert.equal(evaluateSanity(base).filter((v) => v.rule === "percent_over_100").length, 1);
  base.displayedPercents = [{ scope: "cat:b", pct: 300 }];
  const v = evaluateSanity(base).filter((x) => x.rule === "percent_over_100");
  assert.equal(v.length, 1);
  assert.equal(v[0]!.scope, "cat:b");
});

// ── Blog novo (CA11) ──────────────────────────────────────────────────────────
test("blog novo: todos os insumos em 0/vazio → violations: []", () => {
  const empty: SanityInput = {
    adDays: [], adMargin: AD_SANITY_MARGIN, paid: { activeCampaigns: 0, paidLinesSinceRule: 0 },
    channelCounts: {}, categoryViews: [], windowPageviewsNonInternal: 0,
    windowSessions: 0, windowUniqueVisitors: 0, displayedPercents: [],
  };
  assert.deepEqual(evaluateSanity(empty), []);
});

// ── Ordenação e ruleStatus ────────────────────────────────────────────────────
test("ordenação: critical antes de warning, depois por rule e scope", () => {
  const base = healthy();
  base.windowUniqueVisitors = base.windowSessions + 1;        // R5 critical
  base.displayedPercents = [{ scope: "cat:z", pct: 150 }];    // R7 warning
  base.categoryViews = [{ slug: "x", views: base.windowPageviewsNonInternal + 5 }]; // R4 warning
  const v = evaluateSanity(base);
  assert.equal(v[0]!.severity, "critical"); // sessions_lt_visitors primeiro
  assert.equal(v[0]!.rule, "sessions_lt_visitors");
  // os warnings vêm depois, em ordem de rule (category_gt_pageviews < percent_over_100)
  assert.deepEqual(v.slice(1).map((x) => x.rule), ["category_gt_pageviews", "percent_over_100"]);
});

test("buildRuleStatus cobre as 7 chaves com ok/violated/skipped", () => {
  const violations = [{ rule: "sessions_lt_visitors" }];
  const skipped = [{ rule: "paid_without_campaign" }, { rule: "clicks_gt_impressions" }];
  const st = buildRuleStatus(violations, skipped);
  assert.deepEqual(Object.keys(st).sort(), [...RULE_IDS].sort());
  assert.equal(st.sessions_lt_visitors, "violated");
  assert.equal(st.paid_without_campaign, "skipped");
  assert.equal(st.clicks_gt_impressions, "skipped");
  assert.equal(st.sources_not_100, "ok");
});

test("AD_SANITY_MARGIN é a fonte única e vale 3 hoje", () => {
  assert.equal(AD_SANITY_MARGIN, 3);
});
