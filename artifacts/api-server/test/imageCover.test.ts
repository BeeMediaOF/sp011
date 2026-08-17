/**
 * Recorte no servidor (`fit=cover`) — PRD do borrão dos cards retrato.
 *
 * Os dois pontos que quebram calado:
 *  1. a chave de cache tem que continuar IDÊNTICA quando ninguém pede recorte,
 *     senão o deploy joga fora o cache em disco inteiro de 10 blogs;
 *  2. `escalaCover` existe porque `withoutEnlargement` devolve proporção ERRADA
 *     junto de `fit: "cover"` — se alguém "simplificar" trocando um pelo outro,
 *     a foto volta a ser recortada (e ampliada) no navegador.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cacheKey, escalaCover } from "../src/lib/imageTransform.ts";

test("cacheKey: sem h/fit a chave nao muda (cache em disco sobrevive ao deploy)", () => {
  const antiga = cacheKey("https://x/a.jpg", 640, 86, "webp");
  assert.equal(cacheKey("https://x/a.jpg", 640, 86, "webp", undefined, "inside"), antiga);
});

test("cacheKey: recorte gera chave PROPRIA (nao serve imagem inteira no lugar)", () => {
  const inteira = cacheKey("https://x/a.jpg", 640, 86, "webp");
  const recorte = cacheKey("https://x/a.jpg", 640, 86, "webp", 853, "cover");
  assert.notEqual(recorte, inteira);
  // e alturas diferentes não podem colidir entre si
  assert.notEqual(recorte, cacheKey("https://x/a.jpg", 640, 86, "webp", 360, "cover"));
});

test("escalaCover: origem grande entrega a caixa pedida inteira", () => {
  assert.deepEqual(escalaCover({ width: 2000, height: 1500 }, 296, 395), { width: 296, height: 395 });
});

test("escalaCover: origem 16:9 pedida em 3:4 encolhe MANTENDO a proporcao", () => {
  /* 1280x720 pedido em 592x790: o sharp com withoutEnlargement devolvia
     592x720 (proporção 0,82 em vez de 0,75) e o navegador recortava de novo. */
  const r = escalaCover({ width: 1280, height: 720 }, 592, 790);
  assert.deepEqual(r, { width: 540, height: 720 });
  assert.ok(Math.abs(r.width / r.height - 592 / 790) < 0.002, "proporcao pedida preservada");
  assert.ok(r.height <= 720 && r.width <= 1280, "nunca amplia");
});

test("escalaCover: origem menor que a caixa mantem a proporcao da caixa", () => {
  const r = escalaCover({ width: 400, height: 225 }, 296, 395);
  assert.ok(Math.abs(r.width / r.height - 296 / 395) < 0.01);
  assert.ok(r.width <= 400 && r.height <= 225);
});

test("escalaCover: origem sem metadata legivel entrega o pedido como veio", () => {
  assert.deepEqual(escalaCover({}, 296, 395), { width: 296, height: 395 });
  assert.deepEqual(escalaCover({ width: 0, height: 0 }, 296, 395), { width: 296, height: 395 });
});
