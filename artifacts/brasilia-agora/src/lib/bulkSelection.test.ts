/**
 * Testes da seleção múltipla. O que está sendo protegido aqui são os três jeitos
 * de uma seleção mentir: id fantasma que sobrevive à exclusão, "marcar todos"
 * que devolve true numa lista vazia, e Set mutado no lugar (o React não
 * redesenharia). Rodar com: pnpm run test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toggleId, setMany, allSelected, someSelected,
  pruneSelection, selectedFrom, chunk, BULK_DELETE_MAX,
} from "./bulkSelection";

test("toggleId marca e desmarca sem mutar o Set original", () => {
  const original = new Set(["a"]);
  const comB = toggleId(original, "b");
  assert.deepEqual([...comB].sort(), ["a", "b"]);
  assert.deepEqual([...original], ["a"], "o Set de entrada nao pode ser mutado");
  assert.notEqual(comB, original, "precisa ser referencia NOVA (senao o React nao redesenha)");
  assert.deepEqual([...toggleId(comB, "a")], ["b"]);
});

test("setMany liga e desliga em lote", () => {
  const marcados = setMany(new Set<string>(), ["a", "b", "c"], true);
  assert.equal(marcados.size, 3);
  const menos = setMany(marcados, ["a", "c"], false);
  assert.deepEqual([...menos], ["b"]);
});

test("allSelected e false em lista vazia", () => {
  // Sem essa guarda a caixinha do cabecalho nasceria marcada numa tabela vazia.
  assert.equal(allSelected(new Set<string>(), []), false);
  assert.equal(allSelected(new Set(["a"]), []), false);
});

test("allSelected/someSelected descrevem os tres estados da caixinha", () => {
  const pagina = ["a", "b", "c"];
  assert.equal(allSelected(new Set(pagina), pagina), true);
  assert.equal(someSelected(new Set(pagina), pagina), false, "tudo marcado nao e indeterminado");
  assert.equal(allSelected(new Set(["a"]), pagina), false);
  assert.equal(someSelected(new Set(["a"]), pagina), true);
  assert.equal(someSelected(new Set<string>(), pagina), false, "nada marcado nao e indeterminado");
});

test("allSelected ignora marcados que estao fora da lista", () => {
  // Caso real: seleciona na pagina 1, pagina 2 tem outros ids. A pagina 2 nao
  // pode aparecer inteira marcada so porque a selecao tem 12 itens.
  assert.equal(allSelected(new Set(["x", "y"]), ["a", "b"]), false);
});

test("pruneSelection descarta id que sumiu da lista", () => {
  const sel = new Set(["a", "b", "c"]);
  // 'b' foi apagado no lote anterior; 'z' nunca existiu.
  assert.deepEqual([...pruneSelection(sel, ["a", "c", "z"])].sort(), ["a", "c"]);
  assert.deepEqual([...pruneSelection(sel, [])], [], "lista vazia zera a selecao");
});

test("selectedFrom devolve so o que esta marcado E visivel, na ordem da lista", () => {
  const sel = new Set(["c", "a", "zz"]);
  assert.deepEqual(selectedFrom(sel, ["a", "b", "c"]), ["a", "c"]);
});

test("chunk parte a lista no teto do servidor", () => {
  const ids = Array.from({ length: 1201 }, (_, i) => String(i));
  const levas = chunk(ids, BULK_DELETE_MAX);
  assert.equal(levas.length, 3);
  assert.deepEqual(levas.map((l) => l.length), [500, 500, 201]);
  assert.equal(levas.flat().length, ids.length, "nenhum id pode se perder na divisao");
  assert.deepEqual(chunk([], 500), [], "lista vazia nao gera leva vazia");
});
