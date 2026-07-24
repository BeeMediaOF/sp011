import { test } from "node:test";
import assert from "node:assert/strict";
import {
  VALID_TYPES, BEHAVIOR_TYPES, SCROLL_MILESTONES, MAX_READ_SECONDS, CHANNELS,
} from "../src/lib/analyticsShared.ts";

// PRD 01 — trava o dicionário canônico contra rename/adição acidental de valores
// PERSISTIDOS (enum do Postgres, strings de event_type, chaves de canal em `referrer`).
// Tudo função pura/constante — sem banco, sem Express.

/** Igualdade de conjunto (não subconjunto): pega adição E remoção acidental. */
function assertSetEquals(actual: ReadonlySet<string>, expected: string[], label: string): void {
  assert.equal(actual.size, expected.length, `${label}: tamanho inesperado`);
  for (const v of expected) assert.ok(actual.has(v), `${label}: falta "${v}"`);
}

test("Família A (analytics_events) fechada: pageview,read,category,scroll,share", () => {
  assertSetEquals(VALID_TYPES, ["pageview", "read", "category", "scroll", "share"], "VALID_TYPES");
});

test("Família B (behavior_events) fechada: search,link_click,newsletter,video_play,download", () => {
  assertSetEquals(
    BEHAVIOR_TYPES,
    ["search", "link_click", "newsletter", "video_play", "download"],
    "BEHAVIOR_TYPES",
  );
});

test("Famílias A e B são disjuntas (nenhum tipo com destino de tabela ambíguo)", () => {
  for (const t of VALID_TYPES) {
    assert.ok(!BEHAVIOR_TYPES.has(t), `tipo "${t}" existe nas duas famílias`);
  }
});

test("Marcos de scroll = {25,50,75,100} e teto de leitura = 1800s", () => {
  assertSetEquals(
    new Set([...SCROLL_MILESTONES].map(String)),
    ["25", "50", "75", "100"],
    "SCROLL_MILESTONES",
  );
  assert.equal(MAX_READ_SECONDS, 1800);
});

test("Catálogo de canais = os 8 valores persistidos em `referrer` (trava rename)", () => {
  assertSetEquals(
    new Set(CHANNELS),
    ["direto", "busca", "social", "referencia", "email", "pago", "interno", "desconhecido"],
    "CHANNELS",
  );
});
