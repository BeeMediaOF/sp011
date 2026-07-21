import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectFairBatch } from "../src/lib/fairBatch.ts";

const at = (iso: string) => new Date(iso);
const d = (id: string, blogId: string, iso: string) => ({ id, blogId, createdAt: at(iso) });

describe("selectFairBatch", () => {
  it("não deixa um blog com backlog monopolizar o lote", () => {
    // KSports tem 4 vencidas antigas; outros 3 blogs têm 1 cada.
    const cands = [
      d("k1", "ksports", "2026-07-21T10:00:00Z"),
      d("k2", "ksports", "2026-07-21T10:01:00Z"),
      d("k3", "ksports", "2026-07-21T10:02:00Z"),
      d("k4", "ksports", "2026-07-21T10:03:00Z"),
      d("s1", "sp011", "2026-07-21T10:04:00Z"),
      d("r1", "resenha", "2026-07-21T10:05:00Z"),
      d("o1", "oley", "2026-07-21T10:06:00Z"),
    ];
    const batch = selectFairBatch(cands, 5);
    const blogs = batch.map((x) => x.blogId);
    assert.equal(batch.length, 5);
    assert.equal(new Set(blogs).size, 4, "todos os 4 blogs entram no lote");
    assert.ok(blogs.filter((b) => b === "ksports").length <= 2, "ksports não monopoliza");
  });

  it("prioriza o blog que espera há mais tempo", () => {
    const cands = [
      d("a1", "a", "2026-07-21T09:00:00Z"),
      d("b1", "b", "2026-07-21T09:30:00Z"),
    ];
    const batch = selectFairBatch(cands, 1);
    assert.equal(batch.length, 1);
    assert.equal(batch[0]!.blogId, "a");
  });

  it("um único blog com fila usa toda a capacidade (degrada p/ FIFO daquele blog)", () => {
    const cands = [
      d("k1", "ksports", "2026-07-21T10:00:00Z"),
      d("k2", "ksports", "2026-07-21T10:01:00Z"),
      d("k3", "ksports", "2026-07-21T10:02:00Z"),
    ];
    const batch = selectFairBatch(cands, 5);
    assert.deepEqual(batch.map((x) => x.id), ["k1", "k2", "k3"]);
  });

  it("distribui 1 de cada entre blogs saturados na mesma passada", () => {
    const mk = (b: string) => [0, 1, 2, 3].map((i) => d(`${b}${i}`, b, `2026-07-21T10:0${i}:00Z`));
    const pool = [...mk("x"), ...mk("y")].sort(
      (p, q) => p.createdAt.getTime() - q.createdAt.getTime(),
    );
    const round1 = selectFairBatch(pool, 2);
    assert.deepEqual(round1.map((x) => x.blogId).sort(), ["x", "y"]);
  });

  it("lote vazio ou batchSize zero", () => {
    assert.deepEqual(selectFairBatch([], 5), []);
    assert.deepEqual(
      selectFairBatch([{ id: "a", blogId: "a", createdAt: at("2026-07-21T10:00:00Z") }], 0),
      [],
    );
  });
});
