import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeArticleHtml, sanitizeAmpHtml, sanitizeEmailHtml, containsDangerousHtml } from "../src/sanitizeHtml.ts";

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

test("sanitizeEmailHtml PRESERVA style inline seguro + attrs de tabela (ao contrario do artigo)", () => {
  const html =
    '<table width="100%" bgcolor="#0B2A66" cellpadding="0" cellspacing="0">' +
    '<tr><td valign="top" style="padding:24px;text-align:center;color:#ffffff;background:#0B2A66;">' +
    '<a href="https://exemplo.com" style="color:#fff;text-decoration:none;">Ver no site</a></td></tr></table>';
  const limpo = sanitizeEmailHtml(html);
  // style inline e atributos presentacionais sobrevivem (e-mail so estiliza inline)
  assert.ok(limpo.includes("style="), `perdeu style inline: ${limpo}`);
  assert.ok(limpo.includes('bgcolor="#0B2A66"'), `perdeu bgcolor: ${limpo}`);
  assert.ok(limpo.includes('width="100%"'), `perdeu width: ${limpo}`);
  assert.ok(limpo.includes('href="https://exemplo.com"'), `perdeu href seguro: ${limpo}`);
  // ...mas o sanitizador de ARTIGO continua removendo style (dominios distintos)
  assert.ok(!sanitizeArticleHtml(html).includes("style="), "artigo nao deveria manter style inline");
});

test("sanitizeEmailHtml neutraliza executaveis (script/on*/js: em style/href)", () => {
  const vetores = [
    '<div style="color:red;background:url(javascript:alert(1))">x</div>',
    '<div style="width:expression(alert(1))">x</div>',
    '<td onclick="alert(1)" style="color:#000">x</td>',
    '<a href="javascript:alert(1)" style="color:#000">x</a>',
    '<p>ok</p><script>alert(1)</script>',
  ];
  for (const v of vetores) {
    const limpo = sanitizeEmailHtml(v);
    assert.equal(containsDangerousHtml(limpo), false, `email nao neutralizou: ${v} -> ${limpo}`);
    const low = limpo.toLowerCase();
    for (const proibido of ["onclick", "javascript:", "expression(", "<script"]) {
      assert.ok(!low.includes(proibido), `resto perigoso "${proibido}" em: ${limpo}`);
    }
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

/**
 * Bloco de video do editor (PRD do "Adicionar video"): o iframe de player e a
 * UNICA excecao a DANGEROUS_TAGS no corpo de artigo. Sem isto o video aparecia
 * no editor da central e sumia do blog, apagado aqui na entrega do ingest.
 */
const VIDEO_BLOCK =
  '<div data-block="video" class="video-embed" style="position:relative;padding-bottom:56.25%;">' +
  '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="Video" loading="lazy" ' +
  'frameborder="0" allow="autoplay; encrypted-media" allowfullscreen ' +
  'style="position:absolute;width:100%;height:100%;"></iframe></div>';

test("artigo: player do YouTube/Vimeo sobrevive com a classe do layout", () => {
  const limpo = sanitizeArticleHtml(VIDEO_BLOCK);
  assert.ok(limpo.includes("<iframe"), `perdeu o player: ${limpo}`);
  assert.ok(limpo.includes('src="https://www.youtube.com/embed/dQw4w9WgXcQ"'), limpo);
  assert.ok(limpo.includes("allowfullscreen"), limpo);
  // `class` segura o layout porque o `style` inline morre aqui (por design)
  assert.ok(limpo.includes('class="video-embed"'), `perdeu a classe: ${limpo}`);
  assert.ok(!limpo.includes("style="), `artigo nao deveria manter style: ${limpo}`);
  // ...e o gate nao pode flagrar a propria saida do sanitizador
  assert.equal(containsDangerousHtml(limpo), false, limpo);

  const vimeo = sanitizeArticleHtml('<iframe src="https://player.vimeo.com/video/76979871"></iframe>');
  assert.ok(vimeo.includes("<iframe"), vimeo);
});

test("artigo: iframe de qualquer outro host continua caindo", () => {
  for (const src of [
    "https://evil.com/x",
    "http://www.youtube.com/embed/x",              // http nao vale
    "https://youtube.com.evil.com/embed/x",        // host parecido
    "/local",
    "javascript:alert(1)",
  ]) {
    const limpo = sanitizeArticleHtml(`<p>ok</p><iframe src="${src}"></iframe>`);
    assert.ok(!limpo.includes("<iframe"), `deveria remover iframe de ${src}: ${limpo}`);
  }
  assert.ok(!sanitizeArticleHtml("<iframe>sem src</iframe>").includes("<iframe"));
});

test("artigo: srcdoc e handlers caem mesmo no player permitido", () => {
  const limpo = sanitizeArticleHtml(
    '<iframe src="https://www.youtube.com/embed/x" srcdoc="<script>alert(1)</script>" onload="alert(2)"></iframe>',
  );
  assert.ok(limpo.includes("<iframe"), limpo);
  assert.ok(!limpo.includes("srcdoc"), `srcdoc sobreviveu: ${limpo}`);
  assert.ok(!limpo.includes("onload"), `handler sobreviveu: ${limpo}`);
  assert.equal(containsDangerousHtml(limpo), false, limpo);
});

test("artigo: <video> de upload proprio sobrevive; URL insegura perde o src", () => {
  const limpo = sanitizeArticleHtml(
    '<video class="video-embed-file" src="https://cdn.exemplo.com/a.mp4" controls playsinline></video>',
  );
  assert.ok(limpo.includes("<video"), limpo);
  assert.ok(limpo.includes('src="https://cdn.exemplo.com/a.mp4"'), limpo);
  assert.ok(limpo.includes("controls"), limpo);
  assert.ok(!sanitizeArticleHtml('<video src="javascript:alert(1)"></video>').includes("javascript:"));
});

test("e-mail e AMP NAO ganham player nem video (so o corpo de artigo ganhou)", () => {
  const email = sanitizeEmailHtml(VIDEO_BLOCK);
  assert.ok(!email.includes("<iframe"), `e-mail nao deveria ter iframe: ${email}`);
  const amp = sanitizeAmpHtml(VIDEO_BLOCK);
  assert.ok(!amp.includes("<iframe"), `AMP nao deveria ter iframe: ${amp}`);
  assert.ok(!sanitizeAmpHtml('<video src="https://cdn.exemplo.com/a.mp4"></video>').includes("<video"));
  assert.ok(!sanitizeEmailHtml('<video src="https://cdn.exemplo.com/a.mp4"></video>').includes("<video"));
});
