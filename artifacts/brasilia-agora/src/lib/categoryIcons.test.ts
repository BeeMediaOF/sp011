import { test } from "node:test";
import assert from "node:assert/strict";
import { categoryIcon, hasCategoryIcon } from "./categoryIcons";

test("categoryIcon: slug conhecido devolve o emoji do mapa", () => {
  assert.equal(categoryIcon("aviacao"), "\u{2708}\u{FE0F}");
  assert.equal(categoryIcon("economia"), "\u{1F4C8}");
  assert.equal(categoryIcon("ECONOMIA"), "\u{1F4C8}");   // caixa não importa
  assert.equal(categoryIcon(" turismo "), "\u{1F9F3}");  // espaços não importam
});

test("categoryIcon: slug desconhecido vira iniciais do rótulo", () => {
  assert.equal(categoryIcon("nicho-novo", "Nicho Novo"), "NN");
  assert.equal(categoryIcon("agro", "Agro"), "AG");
  assert.equal(categoryIcon("x"), "X");
});

test("hasCategoryIcon: distingue ícone padrão de fallback", () => {
  assert.equal(hasCategoryIcon("negocios"), true);
  assert.equal(hasCategoryIcon("nicho-novo"), false);
});
