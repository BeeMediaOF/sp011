/**
 * Testes da reescrita dos <img> de upload no HTML do operador (PageSpeed do
 * oleysports, 2026-08-26: 252,7 KiB em dois banners PNG, sem width/height).
 *
 * O foco é o que a função NÃO pode fazer: tocar em imagem que não é do portal,
 * desfazer ajuste manual de quem escreveu o HTML, inventar dimensão, ou aceitar
 * travessia de caminho no nome do arquivo.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collectUploadImgNames,
  rewriteUploadImgs,
  uploadImgName,
  HTML_IMG_MAX_W,
} from "../src/lib/htmlUploadImages.ts";

/** Banner real do template da rede, como o painel o grava. */
const BANNER =
  '<img src="/api/uploads/anuncie-faixa-0400599b.png" alt="banner"'
  + ' style="width:100%;height:auto;border-radius:8px;display:block;">';

const semDims = () => null;
const comDims = (n: string) => (n === "anuncie-faixa-0400599b.png" ? { width: 720, height: 65 } : null);

test("HTML sem <img> de upload volta identico", () => {
  for (const html of [
    "",
    "<p>texto</p>",
    '<img src="https://exemplo.com/banner.png" alt="x">',
    '<a href="/api/uploads/x.png">link, nao imagem</a>',
  ]) {
    assert.equal(rewriteUploadImgs(html, comDims), html);
  }
  assert.equal(rewriteUploadImgs(undefined, comDims), "");
});

test("banner ganha WebP dimensionado e width/height nativos", () => {
  const out = rewriteUploadImgs(BANNER, comDims);
  assert.ok(out.includes('src="/api/uploads/anuncie-faixa-0400599b.png?w=720&q=82"'), out);
  assert.ok(out.includes('width="720" height="65"'), out);
  assert.ok(out.includes('decoding="async"'), out);
  // nada mais foi mexido
  assert.ok(out.includes('alt="banner"'));
  assert.ok(out.includes("border-radius:8px"));
});

test("sem dimensoes legiveis ainda converte para WebP, mas nao inventa width/height", () => {
  const out = rewriteUploadImgs(BANNER, semDims);
  assert.ok(out.includes(`?w=${HTML_IMG_MAX_W}&q=82`), out);
  assert.ok(!out.includes("width="), out);
  assert.ok(!out.includes("height="), out);
});

test("origem maior que o teto e pedida no teto, com a proporcao nativa preservada", () => {
  const out = rewriteUploadImgs(
    '<img src="/api/uploads/arte-grande.png">',
    () => ({ width: 2000, height: 1000 }),
  );
  assert.ok(out.includes(`?w=${HTML_IMG_MAX_W}&q=82`), out);
  assert.ok(out.includes('width="2000" height="1000"'), out);
});

test("src que ja tem query e escolha do operador — nao se mexe", () => {
  for (const html of [
    '<img src="/api/uploads/banner-abc123.png?v=2">',
    '<img src="/api/uploads/banner-abc123.png?w=400&q=90">',
    '<img src="/api/uploads/banner-abc123.png#frag">',
  ]) {
    assert.equal(rewriteUploadImgs(html, comDims), html);
  }
});

test("width/height ja escritos na tag nao sao duplicados", () => {
  const html = '<img src="/api/uploads/anuncie-faixa-0400599b.png" width="300" height="50">';
  const out = rewriteUploadImgs(html, comDims);
  assert.equal(out.match(/width=/g)?.length, 1, out);
  assert.ok(out.includes('width="300"'), out);
  // o src continua sendo otimizado
  assert.ok(out.includes("?w=720&q=82"), out);
});

test("decoding ja escrito e respeitado", () => {
  const html = '<img src="/api/uploads/a-1.png" decoding="sync">';
  const out = rewriteUploadImgs(html, semDims);
  assert.equal(out.match(/decoding=/g)?.length, 1, out);
  assert.ok(out.includes('decoding="sync"'), out);
});

test("aspas simples e tag auto-fechada sobrevivem", () => {
  const out = rewriteUploadImgs("<img src='/api/uploads/a-1.png' alt='x' />", () => ({ width: 100, height: 50 }));
  assert.ok(out.includes("src='/api/uploads/a-1.png?w=100&q=82'"), out);
  assert.ok(out.trimEnd().endsWith("/>"), out);
  assert.ok(out.includes('width="100" height="50"'), out);
});

test("travessia de caminho e nome torto nao viram reescrita", () => {
  for (const src of [
    "/api/uploads/../../../etc/passwd",
    "/api/uploads/sub/dir/arquivo.png",
    "/api/uploads/..%2F..%2Fetc%2Fpasswd",
    "/api/uploads/",
    "/api/uploads/arquivo com espaco.png",
  ]) {
    assert.equal(uploadImgName(src), null, src);
    const html = `<img src="${src}">`;
    assert.equal(rewriteUploadImgs(html, comDims), html, src);
  }
});

test("varias imagens no mesmo HTML, cada uma com a sua dimensao", () => {
  const html = `${BANNER}<p>meio</p><img src="/api/uploads/anuncie-lateral-c547f90f.png">`;
  const out = rewriteUploadImgs(html, (n) =>
    n.startsWith("anuncie-faixa") ? { width: 720, height: 65 } : { width: 300, height: 600 });
  assert.ok(out.includes("anuncie-faixa-0400599b.png?w=720&q=82"), out);
  assert.ok(out.includes("anuncie-lateral-c547f90f.png?w=300&q=82"), out);
  assert.ok(out.includes('width="300" height="600"'), out);
  assert.ok(out.includes("<p>meio</p>"), out);
});

test("collectUploadImgNames lista sem repetir e ignora o que nao e upload", () => {
  const html = `${BANNER}${BANNER}<img src="https://x.com/a.png"><img src="/api/uploads/b-2.png">`;
  assert.deepEqual(
    collectUploadImgNames(html).sort(),
    ["anuncie-faixa-0400599b.png", "b-2.png"],
  );
  assert.deepEqual(collectUploadImgNames(undefined), []);
  assert.deepEqual(collectUploadImgNames("<p>nada</p>"), []);
});
