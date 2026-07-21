import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeArticleHtml, sanitizeAmpHtml, containsDangerousHtml } from "../src/sanitizeHtml.ts";

/**
 * PRD-04a — bateria de bypass que a regex antiga (DANGEROUS_HTML) NAO pegava.
 * Cada vetor deve ser DETECTADO (containsDangerousHtml === true) e NEUTRALIZADO
 * (apos sanitizar, containsDangerousHtml === false e o executavel some).
 */
// [nome, vetor, detectaRaw] — detectaRaw=false quando o parser ja torna o
// vetor INERTE (ex.: <scr<script>ipt>): nesse caso a garantia e a neutralizacao,
// nao a "deteccao" (o material parseado nao contem no perigoso).
const BYPASS: Array<[string, string, boolean]> = [
  ["svg/onload", "<svg onload=alert(1)></svg>", true],
  ["math/href-js", '<math href="javascript:alert(1)">x</math>', true],
  ["img/onerror sem aspas", "<p>ok</p><img src=x onerror=alert(1)>", true],
  ["a/href-js", '<a href="javascript:alert(1)">x</a>', true],
  ["a/href-data-html", '<a href="data:text/html,<b>x</b>">x</a>', true],
  ["div/style-expression", '<div style="expression(alert(1))">x</div>', true],
  ["script aninhado/malformado", "<scr<script>ipt>alert(1)</script>", false],
  ["IFRAME maiusculo", '<IFRAME SRC="javascript:alert(1)"></IFRAME>', true],
  ["p/onclick", "<p onclick=alert(1)>x</p>", true],
  ["href com tab ofuscando esquema", '<a href="java\tscript:alert(1)">x</a>', true],
];

for (const [nome, vetor, detectaRaw] of BYPASS) {
  test(`neutraliza (e detecta quando aplicavel): ${nome}`, () => {
    if (detectaRaw) {
      assert.equal(containsDangerousHtml(vetor), true, `deveria detectar: ${nome}`);
    }
    const limpo = sanitizeArticleHtml(vetor);
    assert.equal(containsDangerousHtml(limpo), false, `deveria neutralizar: ${nome} -> ${limpo}`);
    const low = limpo.toLowerCase();
    for (const proibido of ["onload", "onerror", "onclick", "javascript:", "expression(", "<script", "<svg", "<iframe", "<math"]) {
      assert.ok(!low.includes(proibido), `resto perigoso "${proibido}" em: ${limpo}`);
    }
  });
}

test("HTML editorial legitimo passa intacto e nao e flagrado", () => {
  const legit =
    '<h2>Titulo da materia</h2><p>Texto com <b>negrito</b> e um <a href="https://exemplo.com/x" title="link">link</a>.</p>' +
    '<ul><li>item um</li><li>item dois</li></ul>' +
    '<img src="https://cdn.exemplo.com/foto.jpg" alt="foto">' +
    '<h3>Subtitulo</h3><blockquote>Citacao.</blockquote>';
  assert.equal(containsDangerousHtml(legit), false);
  const limpo = sanitizeArticleHtml(legit);
  for (const tag of ["<h2>", "<p>", "<b>", "<ul>", "<li>", "<h3>", "<blockquote>", "<img", 'href="https://exemplo.com/x"']) {
    assert.ok(limpo.includes(tag), `perdeu conteudo legitimo: ${tag} -> ${limpo}`);
  }
});

test("sanitizeAmpHtml converte img->amp-img e neutraliza bypass", () => {
  const amp = sanitizeAmpHtml('<p>ok</p><img src="https://cdn.exemplo.com/a.jpg" alt="a">');
  assert.ok(amp.includes("<amp-img"), `deveria ter amp-img: ${amp}`);
  assert.ok(!/<img[\s>]/i.test(amp), `nao deveria restar <img> cru: ${amp}`);
  assert.ok(amp.includes('layout="responsive"'), amp);
  // bypass no AMP tambem neutralizado
  for (const [, vetor] of BYPASS) {
    assert.equal(containsDangerousHtml(sanitizeAmpHtml(vetor)), false, `AMP nao neutralizou: ${vetor}`);
  }
});
