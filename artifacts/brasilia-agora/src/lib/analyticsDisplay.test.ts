import { test } from "node:test";
import assert from "node:assert/strict";
import { maxMetric, pctOfMax } from "./analyticsDisplay";

// PRD 10 §12 — funções puras de normalização dos cards do dashboard admin.
// tsx --test (script do pacote), zero DOM, imports sem extensão (padrão de analyticsClient.test.ts).

test("maxMetric ignora a ordem — percorre a lista inteira, não só o [0]", () => {
  const items = [{ v: 0 }, { v: 5 }, { v: 2 }];
  assert.equal(maxMetric(items, (x) => x.v), 5); // não 0 (que seria o item 0)
});

test("maxMetric: líder-por-fallback em 0 e outra linha com atividade — reproduz o bug real", () => {
  // Cenário do item 3/14: sort do backend caiu p/ nº de artigos e pôs categoria SEM
  // acesso na posição 0, enquanto outra, mais abaixo, tem acessos reais.
  const cats = [
    { views: 0, clicks: 0, articles: 30 },
    { views: 3, clicks: 0, articles: 1 },
  ];
  assert.equal(maxMetric(cats, (c) => c.views + c.clicks), 3); // nunca 0
});

test("maxMetric: lista vazia / todo valor <=0 / valor não-finito → base 0", () => {
  assert.equal(maxMetric([] as { v: number }[], (x) => x.v), 0);
  assert.equal(maxMetric([{ v: 0 }, { v: -5 }], (x) => x.v), 0);
  assert.equal(maxMetric([{ v: 2 }, { v: NaN }, { v: Infinity }, { v: 4 }], (x) => x.v), 4); // não-finito ignorado
});

test("pctOfMax nunca excede 100 (value <= max e value > max clampado)", () => {
  assert.equal(pctOfMax(3, 10), 30);
  assert.equal(pctOfMax(10, 10), 100);
  assert.equal(pctOfMax(15, 10), 100); // defesa: value > max ainda clampa em 100
});

test("pctOfMax com max <= 0 → 0 para qualquer value (nunca divide por zero)", () => {
  assert.equal(pctOfMax(3, 0), 0);
  assert.equal(pctOfMax(3, -1), 0);
  assert.equal(pctOfMax(0, 0), 0);
});

test("pctOfMax com value não-finito/negativo → 0", () => {
  assert.equal(pctOfMax(NaN, 10), 0);
  assert.equal(pctOfMax(Infinity, 10), 0);
  assert.equal(pctOfMax(-5, 10), 0);
});

test("pctOfMax(x, x) = 100 exato (líder consigo mesmo, sem erro de ponto flutuante)", () => {
  assert.equal(pctOfMax(7, 7), 100);
  assert.equal(pctOfMax(299, 299), 100);
});

test("reprodução end-to-end: líder real fora da posição 0 dá o mesmo resultado", () => {
  // Array já recebido do endpoint, ordenado pelo critério bugado do item 3 (maior
  // atividade na posição 2, não 0).
  const cats = [
    { name: "a", views: 0, clicks: 0 },
    { name: "b", views: 1, clicks: 0 },
    { name: "c", views: 10, clicks: 5 }, // líder real, posição 2
    { name: "d", views: 2, clicks: 0 },
  ];
  const base = maxMetric(cats, (c) => c.views + c.clicks); // 15
  assert.equal(base, 15);
  // Todos os chips ficam em [0,100] e o líder real marca 100.
  for (const c of cats) {
    const pct = pctOfMax(c.views + c.clicks, base);
    assert.ok(pct >= 0 && pct <= 100);
  }
  assert.equal(pctOfMax(10 + 5, base), 100); // c = líder
  assert.equal(pctOfMax(0, base), 0); // a = 0% honesto, nunca 300%
});
