import { test } from "node:test";
import assert from "node:assert/strict";
import { isDailyQuotaFilled, DEFAULT_MAX_POSTS_PER_DAY } from "../src/lib/dailyQuotaCore.ts";

/** PRD-11/F13 — o portão de economia deve poder FECHAR mesmo sem teto por blog. */
const blog = (id: string, max: number | null) => ({ id, name: id, maxPostsPerDay: max });
const FILLED = "fila diária cheia em todos os blogs (entregues hoje + em espera ≥ teto)";

test("F13: blog sem teto usa o default e o portão FECHA quando cheio", () => {
  assert.equal(isDailyQuotaFilled([blog("a", null)], new Map([["a", 500]]), 500), FILLED);
});

test("blog sem teto com ocupação < default → ainda há vaga (null)", () => {
  assert.equal(isDailyQuotaFilled([blog("a", null)], new Map([["a", 499]]), 500), null);
});

test("um blog capless com vaga entre saturados → null (não satura)", () => {
  const cands = [blog("a", 10), blog("b", null)];
  assert.equal(isDailyQuotaFilled(cands, new Map([["a", 10], ["b", 5]]), 500), null);
});

test("default alto (500) + ocupação baixa → não estrangula (null)", () => {
  assert.ok(DEFAULT_MAX_POSTS_PER_DAY >= 500);
  assert.equal(isDailyQuotaFilled([blog("a", null)], new Map([["a", 3]]), DEFAULT_MAX_POSTS_PER_DAY), null);
});

test("todos saturados (teto próprio + default) → FECHA", () => {
  const cands = [blog("a", 10), blog("b", null)];
  assert.equal(isDailyQuotaFilled(cands, new Map([["a", 10], ["b", 500]]), 500), FILLED);
});
