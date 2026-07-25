import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareTopCategories, dowOccurrences, pickPeakDow, brtDayStartMs, DAY,
  type TopCategoryRow,
} from "../src/lib/analyticsShared.ts";

// PRD 06 — helpers puros de rollup (Top categorias, pico por dia da semana).

const cat = (name: string, views: number, clicks: number, articles: number): TopCategoryRow =>
  ({ name, views, clicks, articles });

test("compareTopCategories: acessos DESC, desempate por artigos DESC, depois nome ASC (CA-1)", () => {
  const catA = cat("catA", 0, 0, 30); // 0 acesso, 30 artigos
  const catB = cat("catB", 2, 0, 1);  // 2 acessos, 1 artigo
  // acessos vencem nº de artigos: catB (2 acessos) lidera catA (0 acessos, 30 artigos)
  assert.ok(compareTopCategories(catA, catB) > 0);

  const sorted = [catA, catB, cat("catC", 2, 0, 5), cat("catD", 0, 0, 5)].sort(compareTopCategories);
  //  catC/catB: 2 acessos (catC tem +artigos) → catC, catB ; catA/catD: 0 acesso (catA +artigos) → catA, catD
  assert.deepEqual(sorted.map((r) => r.name), ["catC", "catB", "catA", "catD"]);

  // propriedade: acessos(x) > acessos(y) ⇒ x antes de y, qualquer que seja o nº de artigos
  assert.ok(compareTopCategories(cat("x", 5, 0, 0), cat("y", 0, 0, 99)) < 0);
  // clicks contam como acesso (clicks+views)
  assert.ok(compareTopCategories(cat("z", 0, 3, 0), cat("w", 1, 0, 0)) < 0); // 3 > 1
  // empate total → nome ASC
  assert.ok(compareTopCategories(cat("alpha", 1, 0, 2), cat("beta", 1, 0, 2)) < 0);
});

test("dowOccurrences: 30 dias → soma 30, dois dias com 5 e cinco com 4 (CA-4)", () => {
  // 24/06 a 23/07/2026 inclusive = 30 dias BRT
  const occ = dowOccurrences({ fromMs: brtDayStartMs("2026-06-24"), toMs: brtDayStartMs("2026-07-23") + DAY });
  assert.equal(occ.length, 7);
  assert.equal(occ.reduce((a, b) => a + b, 0), 30);
  assert.equal(occ.filter((n) => n === 5).length, 2);
  assert.equal(occ.filter((n) => n === 4).length, 5);
});

test("dowOccurrences: 7 dias → todos 1 (sem viés); 10 dias → três com 2 e quatro com 1", () => {
  const f = brtDayStartMs("2026-07-01");
  assert.deepEqual(dowOccurrences({ fromMs: f, toMs: f + 7 * DAY }), [1, 1, 1, 1, 1, 1, 1]);
  const occ10 = dowOccurrences({ fromMs: f, toMs: f + 10 * DAY });
  assert.equal(occ10.reduce((a, b) => a + b, 0), 10);
  assert.equal(occ10.filter((n) => n === 2).length, 3);
  assert.equal(occ10.filter((n) => n === 1).length, 4);
});

test("pickPeakDow: elege maior MÉDIA (não maior soma); empates determinísticos; null se tudo zero (CA-4)", () => {
  // índice 1: 8/5 = 1.6 ; índice 2: 7/4 = 1.75 → índice 2 vence, apesar de menor soma
  assert.equal(pickPeakDow([0, 8, 7, 0, 0, 0, 0], [4, 5, 4, 4, 4, 4, 5]), 2);
  // tudo zero → null (preserva peakDay:null)
  assert.equal(pickPeakDow([0, 0, 0, 0, 0, 0, 0], [4, 5, 4, 4, 4, 4, 5]), null);
  // empate de média (2.0 == 2.0) → maior soma bruta (4 > 2) → índice 0
  assert.equal(pickPeakDow([4, 2, 0, 0, 0, 0, 0], [2, 1, 1, 1, 1, 1, 1]), 0);
  // empate de média E de soma → menor índice
  assert.equal(pickPeakDow([2, 2, 0, 0, 0, 0, 0], [1, 1, 1, 1, 1, 1, 1]), 0);
  // dia com ocorrência mas 0 views não concorre; dia com views vence
  assert.equal(pickPeakDow([0, 0, 3, 0, 0, 0, 0], [1, 1, 1, 1, 1, 1, 1]), 2);
  // dia com views mas 0 ocorrência (janela curta) não concorre
  assert.equal(pickPeakDow([9, 1, 0, 0, 0, 0, 0], [0, 1, 1, 1, 1, 1, 1]), 1);
});
