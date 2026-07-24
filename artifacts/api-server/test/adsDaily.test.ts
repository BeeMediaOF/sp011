import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateRealCount, repairPair } from "../src/lib/adsDaily.ts";
import { checkAdSanity, checkClicksVsImpressions, cleanStr } from "../src/lib/analyticsShared.ts";

// PRD 04 — provas do reparo (RF2), da sanidade (RF6) e do dedup (RF4). Tudo puro,
// sem banco: a validação com dados reais é na VPS (§8.2/§8.3 do PRD).

/**
 * Simulador do ESCRITOR LEGADO (o bug): para cada evento, INSERT de uma linha nova +
 * UPDATE de +1 no campo em TODAS as linhas do par (não havia UNIQUE em (ad_id,date),
 * então o onConflictDoNothing nunca conflitava). Reproduz a inflação ~quadrática.
 */
function legacyWrite(events: ReadonlyArray<"imp" | "clk">): { impressions: number; clicks: number }[] {
  const rows: { impressions: number; clicks: number }[] = [];
  for (const ev of events) {
    rows.push(ev === "imp" ? { impressions: 1, clicks: 0 } : { impressions: 0, clicks: 1 });
    for (const r of rows) {
      if (ev === "imp") r.impressions += 1;
      else r.clicks += 1;
    }
  }
  return rows;
}

const sumImp = (rows: { impressions: number }[]): number => rows.reduce((s, r) => s + r.impressions, 0);

test("simulador legado reproduz a soma (N^2+3N)/2 da auditoria (N=1,2,4,7,12)", () => {
  for (const n of [1, 2, 4, 7, 12]) {
    const rows = legacyWrite(Array(n).fill("imp"));
    assert.equal(sumImp(rows), (n * n + 3 * n) / 2, `soma inflada para N=${n}`);
    assert.equal(Math.max(...rows.map((r) => r.impressions)), n + 1, `MAX = N+1 para N=${n}`);
  }
  // Casos citados no PRD: 2->5, 4->14, 7->35, 12->90.
  assert.equal(sumImp(legacyWrite(["imp", "imp"])), 5);
  assert.equal(sumImp(legacyWrite(Array(12).fill("imp"))), 90);
});

test("estimateRealCount = MAX-1 com piso 0", () => {
  assert.equal(estimateRealCount(0), 0);
  assert.equal(estimateRealCount(1), 0); // par vazio de um campo nunca dá 1
  assert.equal(estimateRealCount(2), 1); // 1 evento real (INSERT 1 + UPDATE +1)
  assert.equal(estimateRealCount(18), 17); // header-banner do sp011 07-17 (§9.1)
  assert.equal(estimateRealCount(-5), 0);
});

test("repairPair recupera N exato para pares puros de impressão", () => {
  for (const n of [1, 2, 4, 7, 12]) {
    const fixed = repairPair(legacyWrite(Array(n).fill("imp")));
    assert.equal(fixed.impressions, n, `impressões reais para N=${n}`);
    assert.equal(fixed.clicks, 0);
  }
});

test("repairPair em par MISTO recupera cada campo pelo próprio MAX (caso esporteagora 07-17)", () => {
  // [1 impressão, depois 1 clique] -> linhas 2/1 e 0/2 (§9.6); reparo -> 1/1.
  const rows = legacyWrite(["imp", "clk"]);
  assert.deepEqual(rows, [{ impressions: 2, clicks: 1 }, { impressions: 0, clicks: 2 }]);
  assert.deepEqual(repairPair(rows), { impressions: 1, clicks: 1 });
});

test("repairPair — ordens mistas variadas recuperam a contagem por tipo", () => {
  for (const evs of [
    ["imp", "clk", "imp"],
    ["clk", "imp", "imp"],
    ["imp", "imp", "clk", "clk"],
  ] as ReadonlyArray<"imp" | "clk">[]) {
    const expImp = evs.filter((e) => e === "imp").length;
    const expClk = evs.filter((e) => e === "clk").length;
    const fixed = repairPair(legacyWrite(evs));
    assert.equal(fixed.impressions, expImp, `imp de ${evs.join(",")}`);
    assert.equal(fixed.clicks, expClk, `clk de ${evs.join(",")}`);
    // Invariante: nº de linhas do par = imp_reais + clk_reais (1 linha por evento).
    assert.equal(legacyWrite(evs).length, fixed.impressions + fixed.clicks);
  }
});

test("repairPair de par vazio = 0/0", () => {
  assert.deepEqual(repairPair([]), { impressions: 0, clicks: 0 });
});

// ─── RF6: helpers de sanidade ────────────────────────────────────────────────
test("checkAdSanity: dentro do limite, estouro, e piso max(pv,1)", () => {
  // 10 pageviews, 1 slot, margem 3 -> limite 30
  assert.equal(checkAdSanity(30, 10, 1, 3).ok, true);
  assert.equal(checkAdSanity(31, 10, 1, 3).ok, false);
  // pv=0 usa piso 1: limite = 1*1*3 = 3 (dia sem pageview ainda admite impressão)
  const zero = checkAdSanity(3, 0, 1, 3);
  assert.equal(zero.ok, true);
  assert.equal(zero.limit, 3);
  assert.equal(checkAdSanity(4, 0, 1, 3).ok, false);
  // margem apertada pós-PRD 02
  assert.equal(checkAdSanity(15, 10, 1, 1.5).ok, true);
  assert.equal(checkAdSanity(16, 10, 1, 1.5).ok, false);
});

test("checkClicksVsImpressions: folga +1 do clique rápido", () => {
  assert.equal(checkClicksVsImpressions(0, 0).ok, true);
  assert.equal(checkClicksVsImpressions(1, 0).ok, true);  // clique antes do dwell
  assert.equal(checkClicksVsImpressions(2, 0).ok, false);
  assert.equal(checkClicksVsImpressions(11, 10).ok, true);
  assert.equal(checkClicksVsImpressions(12, 10).ok, false);
});

// (o dedup server-side migrou para trafficGuard.createDedupWindow — PRD 03 RF5;
//  testes em trafficGuard.dedupWindow.test.ts)

// ─── §7.1: validação/clamp do payload das rotas ──────────────────────────────
test("cleanStr: clamps de sessionId (<=100) e path (<=500); ausente/vazio = undefined", () => {
  assert.equal(cleanStr("s".repeat(120), 100)?.length, 100);
  assert.equal(cleanStr("/a/b", 500), "/a/b");
  assert.equal(cleanStr("", 100), undefined);
  assert.equal(cleanStr(undefined, 100), undefined);
  assert.equal(cleanStr(42, 100), undefined); // body malformado não lança
});
