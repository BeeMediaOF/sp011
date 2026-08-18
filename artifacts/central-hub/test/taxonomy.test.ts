/**
 * Trava do bug de 2026-08-14: a remoção de acentos estava com barra DUPLA
 * (`/[\u0300-\u036f]/`), o que apagava `u`, `f` e os dígitos de todo slug
 * salvo pelo painel. `otros` virou categoria legítima na central e 117 artigos
 * do credito.vc foram parar numa rota que não existe.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { slugifyCategory, normalizeCategories } from "../src/lib/taxonomy.ts";

describe("slugifyCategory", () => {
  it("PRESERVA u, f e digitos (a regressao de 2026-08-14)", () => {
    // Cada um destes saía corrompido com a barra dupla.
    assert.equal(slugifyCategory("outros"), "outros");                       // era otros
    assert.equal(slugifyCategory("organizar-financas"), "organizar-financas"); // era organizar-inancas
    assert.equal(slugifyCategory("planejar-o-futuro"), "planejar-o-futuro"); // era planejar-o-tro
    assert.equal(slugifyCategory("football"), "football");                   // era ootball
    assert.equal(slugifyCategory("formula-1"), "formula-1");                 // era orma
    assert.equal(slugifyCategory("futebol-americano"), "futebol-americano"); // era tebol-americano
    assert.equal(slugifyCategory("f1"), "f1");                               // era vazio
    assert.equal(slugifyCategory("turismo"), "turismo");                     // era trismo
  });

  it("remove acento de verdade (o que a regex DEVIA fazer)", () => {
    assert.equal(slugifyCategory("Econômia"), "economia");
    assert.equal(slugifyCategory("Saúde"), "saude");
    assert.equal(slugifyCategory("Aviação"), "aviacao");
    assert.equal(slugifyCategory("Fiscal & Tributário"), "fiscal-tributario");
  });

  it("kebab-case: espacos viram hifen, sem hifen duplo nem nas pontas", () => {
    assert.equal(slugifyCategory("  Copa do   Mundo  "), "copa-do-mundo");
    assert.equal(slugifyCategory("--e-sports--"), "e-sports");
    assert.equal(slugifyCategory("!!!"), "");
  });

  it("entrada inaproveitavel devolve vazio", () => {
    assert.equal(slugifyCategory(undefined), "");
    assert.equal(slugifyCategory(null), "");
    assert.equal(slugifyCategory(""), "");
  });
});

describe("normalizeCategories", () => {
  it("taxonomia do credito.vc atravessa INTACTA", () => {
    const entrada = [
      "sair-das-dividas", "credito", "score", "organizar-financas",
      "renda-extra", "planejar-o-futuro", "investimentos", "outros",
    ].map((slug) => ({ slug }));
    assert.deepEqual(
      normalizeCategories(entrada)?.map((c) => c.slug),
      ["sair-das-dividas", "credito", "score", "organizar-financas",
       "renda-extra", "planejar-o-futuro", "investimentos", "outros"],
    );
  });

  it("taxonomia EN do ksports atravessa INTACTA", () => {
    const entrada = ["world-cup", "football", "volleyball", "tennis",
                     "formula-1", "nfl", "esports", "others"].map((slug) => ({ slug }));
    assert.deepEqual(
      normalizeCategories(entrada)?.map((c) => c.slug),
      ["world-cup", "football", "volleyball", "tennis", "formula-1", "nfl", "esports", "others"],
    );
  });

  it("descarta duplicata e vazio; preserva o hint", () => {
    const r = normalizeCategories([
      { slug: "credito", hint: "empréstimos e cartão" },
      { slug: "Credito" },   // mesma coisa depois do slugify
      { slug: "!!!" },
      "nao-e-objeto",
    ]);
    assert.deepEqual(r, [{ slug: "credito", hint: "empréstimos e cartão" }]);
  });

  it("nao-array vira null (blog sem classificacao)", () => {
    assert.equal(normalizeCategories(null), null);
    assert.equal(normalizeCategories([]), null);
    assert.equal(normalizeCategories("x"), null);
  });
});
