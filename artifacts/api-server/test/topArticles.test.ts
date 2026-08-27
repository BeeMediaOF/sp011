import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseTopNewsParams, rankTopArticles,
  TOP_NEWS_DEFAULT_LIMIT, TOP_NEWS_MAX_LIMIT,
  TOP_NEWS_DEFAULT_DAYS, TOP_NEWS_MAX_DAYS,
  type TopRankable,
} from "../src/lib/topArticles.ts";

// Aba "Top News" (todos os blogs de esporte). O que estes testes fixam é a
// CASCATA de critérios: janela → acumulado → data. Cada degrau existe para um
// estado real da rede — blog com tráfego, blog de tráfego ralo e blog recém
// publicado — e trocar a ordem deles quebra silenciosamente um dos três.

const a = (id: string, publishedAt: string): TopRankable => ({ id, publishedAt });

const zero = () => 0;
const from = (m: Record<string, number>) => (id: string) => m[id] ?? 0;

// ─── parseTopNewsParams ───────────────────────────────────────────────────────
test("params: vazio → 24 artigos, janela de 7 dias", () => {
  assert.deepEqual(parseTopNewsParams({}), {
    limit: TOP_NEWS_DEFAULT_LIMIT, days: TOP_NEWS_DEFAULT_DAYS,
  });
});

test("params: limit inválido, zero ou negativo cai no default", () => {
  for (const v of ["abc", "0", "-5", "", undefined]) {
    assert.equal(parseTopNewsParams({ limit: v }).limit, TOP_NEWS_DEFAULT_LIMIT, `limit=${String(v)}`);
  }
});

test("params: limit acima do teto é clampado", () => {
  assert.equal(parseTopNewsParams({ limit: "999" }).limit, TOP_NEWS_MAX_LIMIT);
});

test("params: days=0 é 'todos os tempos', não ausência", () => {
  // O filtro "Sempre" da aba manda days=0. Se caísse no default, o botão não
  // faria nada e a página mentiria sobre qual janela está exibindo.
  assert.equal(parseTopNewsParams({ days: "0" }).days, 0);
  assert.equal(parseTopNewsParams({ days: "-3" }).days, 0);
});

test("params: days ausente ou vazio usa a janela padrão", () => {
  assert.equal(parseTopNewsParams({}).days, TOP_NEWS_DEFAULT_DAYS);
  assert.equal(parseTopNewsParams({ days: "" }).days, TOP_NEWS_DEFAULT_DAYS);
  assert.equal(parseTopNewsParams({ days: "abc" }).days, 0); // lixo vira 0 → "sempre"
});

test("params: days acima do teto é clampado", () => {
  assert.equal(parseTopNewsParams({ days: "9999" }).days, TOP_NEWS_MAX_DAYS);
});

// ─── rankTopArticles ──────────────────────────────────────────────────────────
test("ranking: leituras da janela mandam", () => {
  const list = [a("x", "2026-01-01"), a("y", "2026-01-02"), a("z", "2026-01-03")];
  const out = rankTopArticles(list, from({ x: 50, y: 10, z: 30 }), zero, 10);
  assert.deepEqual(out.map((r) => r.id), ["x", "z", "y"]);
});

test("ranking: empate na janela desempata pelo acumulado", () => {
  // Blog de tráfego ralo: metade do catálogo tem ZERO leitura na semana. Sem
  // este degrau, essa metade sairia em ordem arbitrária.
  const list = [a("x", "2026-01-01"), a("y", "2026-01-02"), a("z", "2026-01-03")];
  const out = rankTopArticles(list, zero, from({ x: 5, y: 900, z: 100 }), 10);
  assert.deepEqual(out.map((r) => r.id), ["y", "z", "x"]);
});

test("ranking: sem leitura nenhuma, cai na ordem cronológica inversa", () => {
  // Estado inicial de todo blog novo da rede: a aba precisa servir uma página
  // cheia e coerente, nunca uma lista vazia ou embaralhada.
  const list = [a("velho", "2026-01-01"), a("novo", "2026-03-01"), a("meio", "2026-02-01")];
  const out = rankTopArticles(list, zero, zero, 10);
  assert.deepEqual(out.map((r) => r.id), ["novo", "meio", "velho"]);
});

test("ranking: a janela vence o acumulado (é o que faz a aba não congelar)", () => {
  // O artigo campeão histórico não pode ocupar o #1 para sempre — é o defeito
  // que a janela existe para evitar.
  const list = [a("historico", "2025-01-01"), a("subindo", "2026-03-01")];
  const out = rankTopArticles(list, from({ subindo: 20 }), from({ historico: 9999 }), 10);
  assert.deepEqual(out.map((r) => r.id), ["subindo", "historico"]);
});

test("ranking: corta em limit", () => {
  const list = [a("a", "2026-01-03"), a("b", "2026-01-02"), a("c", "2026-01-01")];
  assert.deepEqual(rankTopArticles(list, zero, zero, 2).map((r) => r.id), ["a", "b"]);
  assert.deepEqual(rankTopArticles(list, zero, zero, 0), []);
});

test("ranking: não muta a lista de entrada", () => {
  // A rota reusa a mesma lista de publicados noutras respostas.
  const list = [a("a", "2026-01-01"), a("b", "2026-03-01")];
  const antes = list.map((x) => x.id);
  rankTopArticles(list, from({ b: 10 }), zero, 10);
  assert.deepEqual(list.map((x) => x.id), antes);
});

test("ranking: data inválida não derruba a ordenação", () => {
  const list = [a("ok", "2026-01-01"), a("quebrado", "sei-la")];
  const out = rankTopArticles(list, zero, zero, 10);
  assert.deepEqual(out.map((r) => r.id), ["ok", "quebrado"]);
});
