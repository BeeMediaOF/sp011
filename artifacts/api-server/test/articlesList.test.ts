import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseArticleListParams, selectArticles, ARTICLES_DEFAULT_LIMIT, ARTICLES_MAX_LIMIT,
  type ListableArticle,
} from "../src/lib/articlesList.ts";

// PRD-PERF-01 — a lista pública passou a ser paginada/filtrada no servidor.
// Estes testes fixam as regras que o cliente aplicava antes (igualdade exata de
// slug, fallback por tag, "mais lidas" do site inteiro) para que o corte não
// mude o QUE aparece, só QUANTO trafega.

const a = (
  id: string, publishedAt: string,
  over: Partial<ListableArticle> = {},
): ListableArticle => ({ id, title: `Título ${id}`, category: "geral", tag: "Geral", publishedAt, ...over });

const noViews = () => 0;

// ─── parseArticleListParams ───────────────────────────────────────────────────
test("params: vazio → default 200/offset 0/recent", () => {
  assert.deepEqual(parseArticleListParams({}), {
    limit: ARTICLES_DEFAULT_LIMIT, offset: 0, category: "", q: "", sort: "recent",
  });
});

test("params: limit inválido, zero ou negativo cai no default", () => {
  for (const v of ["abc", "0", "-5", "", undefined]) {
    assert.equal(parseArticleListParams({ limit: v }).limit, ARTICLES_DEFAULT_LIMIT, `limit=${String(v)}`);
  }
});

test("params: limit acima do teto é clampado; all vira infinito", () => {
  assert.equal(parseArticleListParams({ limit: "99999" }).limit, ARTICLES_MAX_LIMIT);
  assert.equal(parseArticleListParams({ limit: "all" }).limit, Number.POSITIVE_INFINITY);
  assert.equal(parseArticleListParams({ limit: "ALL" }).limit, Number.POSITIVE_INFINITY);
});

test("params: offset negativo vira 0; sort desconhecido vira recent", () => {
  assert.equal(parseArticleListParams({ offset: "-3" }).offset, 0);
  assert.equal(parseArticleListParams({ sort: "aleatorio" }).sort, "recent");
  assert.equal(parseArticleListParams({ sort: "views" }).sort, "views");
});

test("params: query duplicada (?limit=5&limit=9) não vira NaN nem array", () => {
  // Express entrega array quando o param repete — sem o guarda, Number([..]) = NaN.
  assert.equal(parseArticleListParams({ limit: ["5", "9"] }).limit, 5);
  assert.equal(parseArticleListParams({ category: ["Politica", "x"] }).category, "politica");
});

// ─── Ordenação e corte ────────────────────────────────────────────────────────
test("ordena por publishedAt desc ANTES de cortar", () => {
  const all = [
    a("velho", "2024-01-01T00:00:00Z"),
    a("novo", "2026-07-01T00:00:00Z"),
    a("meio", "2025-05-01T00:00:00Z"),
  ];
  const { page, total } = selectArticles(all, parseArticleListParams({ limit: "2" }), noViews);
  assert.deepEqual(page.map((x) => x.id), ["novo", "meio"]);
  assert.equal(total, 3);
});

test("offset pagina sem repetir nem pular item", () => {
  const all = Array.from({ length: 10 }, (_, i) =>
    a(`a${i}`, `2026-07-${String(20 - i).padStart(2, "0")}T00:00:00Z`));
  const p1 = selectArticles(all, parseArticleListParams({ limit: "4", offset: "0" }), noViews);
  const p2 = selectArticles(all, parseArticleListParams({ limit: "4", offset: "4" }), noViews);
  assert.deepEqual(p1.page.map((x) => x.id), ["a0", "a1", "a2", "a3"]);
  assert.deepEqual(p2.page.map((x) => x.id), ["a4", "a5", "a6", "a7"]);
  assert.equal(p2.total, 10);
});

test("limit=all devolve tudo (válvula de escape)", () => {
  const all = Array.from({ length: 300 }, (_, i) => a(`a${i}`, "2026-07-01T00:00:00Z"));
  const { page } = selectArticles(all, parseArticleListParams({ limit: "all" }), noViews);
  assert.equal(page.length, 300);
});

test("publishedAt inválido não quebra a ordenação", () => {
  const all = [a("ok", "2026-07-01T00:00:00Z"), a("ruim", "não é data")];
  const { page } = selectArticles(all, parseArticleListParams({}), noViews);
  assert.deepEqual(page.map((x) => x.id), ["ok", "ruim"]);
});

// ─── Filtro por categoria ─────────────────────────────────────────────────────
test("category: igualdade EXATA — futebol não traz futebol-americano", () => {
  const all = [
    a("f1", "2026-07-02T00:00:00Z", { category: "futebol" }),
    a("fa", "2026-07-03T00:00:00Z", { category: "futebol-americano" }),
  ];
  const { page, total } = selectArticles(all, parseArticleListParams({ category: "futebol" }), noViews);
  assert.deepEqual(page.map((x) => x.id), ["f1"]);
  assert.equal(total, 1);
});

test("category: case-insensitive e com espaços sobrando", () => {
  const all = [a("p", "2026-07-02T00:00:00Z", { category: " Politica " })];
  assert.equal(selectArticles(all, parseArticleListParams({ category: "POLITICA" }), noViews).page.length, 1);
});

test("category: fallback por tag slugificada só quando category está vazia", () => {
  const all = [
    a("legado", "2026-07-02T00:00:00Z", { category: "", tag: "Futebol Americano" }),
    a("outro", "2026-07-03T00:00:00Z", { category: "geral", tag: "Futebol Americano" }),
  ];
  const { page } = selectArticles(all, parseArticleListParams({ category: "futebol-americano" }), noViews);
  assert.deepEqual(page.map((x) => x.id), ["legado"]);
});

// ─── Busca ────────────────────────────────────────────────────────────────────
test("q: casa título OU categoria, case-insensitive", () => {
  const all = [
    a("t", "2026-07-02T00:00:00Z", { title: "Chuva forte em SP" }),
    a("c", "2026-07-03T00:00:00Z", { title: "Outra coisa", category: "economia" }),
    a("n", "2026-07-04T00:00:00Z", { title: "Nada a ver" }),
  ];
  assert.deepEqual(
    selectArticles(all, parseArticleListParams({ q: "CHUVA" }), noViews).page.map((x) => x.id), ["t"]);
  assert.deepEqual(
    selectArticles(all, parseArticleListParams({ q: "econom" }), noViews).page.map((x) => x.id), ["c"]);
});

test("total é contado depois dos filtros e antes do corte", () => {
  const all = Array.from({ length: 12 }, (_, i) =>
    a(`a${i}`, "2026-07-01T00:00:00Z", { category: i < 7 ? "politica" : "geral" }));
  const { page, total } = selectArticles(
    all, parseArticleListParams({ category: "politica", limit: "3" }), noViews);
  assert.equal(page.length, 3);
  assert.equal(total, 7);
});

// ─── sort=views ───────────────────────────────────────────────────────────────
test("sort=views ranqueia pelo acervo inteiro, com desempate por data", () => {
  const all = [
    a("pouco", "2026-07-10T00:00:00Z"),
    a("muito", "2024-01-01T00:00:00Z"),
    a("empate-novo", "2026-07-11T00:00:00Z"),
    a("empate-velho", "2023-01-01T00:00:00Z"),
  ];
  const views: Record<string, number> = { pouco: 5, muito: 900, "empate-novo": 5, "empate-velho": 5 };
  const { page } = selectArticles(
    all, parseArticleListParams({ sort: "views", limit: "4" }), (id) => views[id] ?? 0);
  assert.deepEqual(page.map((x) => x.id), ["muito", "empate-novo", "pouco", "empate-velho"]);
});

test("selectArticles não muta a lista recebida", () => {
  const all = [a("b", "2024-01-01T00:00:00Z"), a("a", "2026-07-01T00:00:00Z")];
  const before = all.map((x) => x.id);
  selectArticles(all, parseArticleListParams({ sort: "views" }), noViews);
  assert.deepEqual(all.map((x) => x.id), before);
});
