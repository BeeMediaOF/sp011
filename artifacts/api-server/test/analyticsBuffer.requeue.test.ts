import { test } from "node:test";
import assert from "node:assert/strict";
import { planRequeue, capExcess } from "../src/lib/analyticsShared.ts";

// PRD 03 RF6 — reconciliação do buffer no flush degradado + teto duro.

test("planRequeue: sem espaço tudo descarta; espaço parcial divide; cabe tudo", () => {
  assert.deepEqual(planRequeue(30, 500, 500), { requeue: 0, discard: 30 });  // buffer cheio
  assert.deepEqual(planRequeue(30, 490, 500), { requeue: 10, discard: 20 }); // room 10
  assert.deepEqual(planRequeue(10, 100, 500), { requeue: 10, discard: 0 });  // cabe tudo
});

test("planRequeue: identidade requeue + discard === failedLen (fecha a reconciliação CA8)", () => {
  const cases: ReadonlyArray<readonly [number, number, number]> = [
    [30, 500, 500], [30, 490, 500], [10, 100, 500], [0, 0, 500], [999, 0, 500],
  ];
  for (const [f, b, m] of cases) {
    const r = planRequeue(f, b, m);
    assert.equal(r.requeue + r.discard, f, `identidade falhou para ${f},${b},${m}`);
    assert.ok(r.requeue >= 0 && r.discard >= 0);
  }
});

test("capExcess: descarta len-cap quando excede; 0 quando não", () => {
  assert.equal(capExcess(1001, 1000), 1);
  assert.equal(capExcess(1000, 1000), 0);
  assert.equal(capExcess(500, 1000), 0);
});
