import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseArgs, buildEventPayload, buildCleanupSql, buildAdCheckSql,
  runScopeFilter, likeToRegExp, synthIds,
} from "./analytics-synth.mjs";

// PRD 12 §12 item 2 / CA3 / CA14 — testes puros do parser e do filtro de limpeza.
// Importar o script NÃO dispara tráfego (guarda import.meta.url no .mjs).

// ─── parseArgs: recusas obrigatórias (CA3) ──────────────────────────────────
test("parseArgs recusa sem --run-id", () => {
  assert.throws(() => parseArgs(["--base", "https://x.midia.run"]), /--run-id/);
});

test("parseArgs recusa sem --base (fora do cleanup-only)", () => {
  assert.throws(() => parseArgs(["--run-id", "123"]), /--base/);
});

test("parseArgs recusa --run-id com espaço", () => {
  assert.throws(() => parseArgs(["--base", "https://x.midia.run", "--run-id", "a b"]), /espa/);
});

test("parseArgs: --assert exige --admin-token", () => {
  assert.throws(() => parseArgs(["--base", "https://x.midia.run", "--run-id", "1", "--assert"]), /admin-token/);
});

test("parseArgs: --behavior public exige --i-know-this-is casando o host", () => {
  const base = ["--base", "https://resenhavip.midia.run", "--run-id", "1", "--behavior", "public"];
  assert.throws(() => parseArgs(base), /i-know-this-is/);
  assert.throws(() => parseArgs([...base, "--i-know-this-is", "oleysports"]), /não casa/);
  const ok = parseArgs([...base, "--i-know-this-is", "resenhavip"]);
  assert.equal(ok.behavior, "public");
});

test("parseArgs: --cleanup-only só precisa de --run-id (não toca a rede)", () => {
  const o = parseArgs(["--cleanup-only", "--run-id", "42", "--ad-id", "ad9"]);
  assert.equal(o.cleanupOnly, true);
  assert.equal(o.runId, "42");
  assert.equal(o.adId, "ad9");
});

test("parseArgs: caminho feliz completo", () => {
  const o = parseArgs(["--base", "https://x.midia.run/", "--run-id", "77", "--ad-id", "adX", "--assert", "--admin-token", "tok"]);
  assert.equal(o.base, "https://x.midia.run"); // barra final removida
  assert.equal(o.runId, "77");
  assert.equal(o.assert, true);
  assert.equal(o.adminToken, "tok");
});

test("parseArgs rejeita argumento desconhecido", () => {
  assert.throws(() => parseArgs(["--base", "https://x.midia.run", "--run-id", "1", "--nope"]), /desconhecido/);
});

// ─── Marcação: todo id gerado casa o filtro de limpeza do MESMO run (CA14 b) ──
test("todo sessionId/visitorId gerado casa o filtro run-scoped", () => {
  const runId = "1770000000";
  const filter = likeToRegExp(runScopeFilter(runId));
  for (const kind of ["pageview", "read", "category", "scroll", "share", "search", "link_click", "newsletter"]) {
    for (let seq = 1; seq <= 5; seq++) {
      const { body } = buildEventPayload(runId, seq, kind);
      assert.match(body.sessionId, filter, `${kind} seq ${seq}: sessionId fora do filtro`);
      const ids = synthIds(runId, seq);
      assert.match(ids.visitorId, filter, `visitorId seq ${seq} fora do filtro`);
    }
  }
});

// ─── O filtro por run NÃO casa outro run nem sessão sem prefixo (CA14 c) ──────
test("filtro run-scoped não casa outro run nem sessão sem prefixo", () => {
  const filter = likeToRegExp(runScopeFilter("1770000000"));
  assert.doesNotMatch("synthtest-9999999999-3", filter);   // outro run
  assert.doesNotMatch("s-real-do-visitante", filter);      // sessão real
  assert.doesNotMatch("synthtest-1770000000", filter);     // prefixo sem o hífen final do seq
  assert.match("synthtest-1770000000-3", filter);          // este run: casa
});

// ─── SQL de limpeza (CA14 d) ─────────────────────────────────────────────────
test("buildCleanupSql usa run-scope no session_id e ad_id EXATO (nunca LIKE)", () => {
  const sql = buildCleanupSql({ runId: "42", adId: "adZ" });
  assert.match(sql, /analytics_events WHERE session_id LIKE 'synthtest-42-%'/);
  assert.match(sql, /behavior_events WHERE session_id LIKE 'synthtest-42-%'/);
  assert.match(sql, /ad_daily_stats WHERE ad_id = 'adZ'/);
  // Guarda anti-apagão: ads só apaga com title de teste.
  assert.match(sql, /DELETE FROM ads WHERE id = 'adZ' AND title LIKE 'synthtest-%'/);
  // ad_id NUNCA é filtrado por LIKE (evita apagar linhas de outros anúncios).
  assert.doesNotMatch(sql, /ad_id LIKE/);
});

test("buildCleanupSql sem adId omite as linhas de anúncio", () => {
  const sql = buildCleanupSql({ runId: "42" });
  assert.doesNotMatch(sql, /ad_daily_stats/);
  assert.doesNotMatch(sql, /FROM ads/);
});

test("buildAdCheckSql é um SELECT por id exato", () => {
  assert.equal(buildAdCheckSql("adZ"), "SELECT id, title FROM ads WHERE id = 'adZ';");
});

// ─── Newsletter usa TLD reservado (LGPD — sem destinatário real) ─────────────
test("newsletter usa example.invalid (RFC 2606)", () => {
  const { endpoint, body } = buildEventPayload("42", 1, "newsletter");
  assert.equal(endpoint, "behavior");
  assert.match(body.value, /^synthtest\+42@example\.invalid$/);
});

// ─── likeToRegExp: % e _ e escape de metacaracteres ──────────────────────────
test("likeToRegExp trata %, _ e escapa metacaracteres", () => {
  assert.match("abc-xyz", likeToRegExp("abc-%"));
  assert.match("a.b", likeToRegExp("a_b"));       // _ = um char qualquer
  assert.doesNotMatch("axxb", likeToRegExp("a_b")); // _ não casa dois chars
  assert.match("a.b", likeToRegExp("a.b"));       // ponto literal
  assert.doesNotMatch("axb", likeToRegExp("a.b")); // ponto NÃO é curinga
});
