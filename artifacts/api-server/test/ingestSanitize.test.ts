import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeIngestHtml } from "../src/lib/ingestSanitize.ts";

test("remove blocos executáveis inteiros (script/style/iframe/form)", () => {
  const html = '<p>ok</p><script>alert(1)</script><p>fim</p><iframe src="x"></iframe><form action="x"><input/></form>';
  const out = sanitizeIngestHtml(html);
  assert.ok(!/script|iframe|form/i.test(out));
  assert.ok(out.includes("<p>ok</p>") && out.includes("<p>fim</p>"));
});

test("remove handlers inline e javascript: preservando o resto do atributo", () => {
  const out = sanitizeIngestHtml('<img src="x.jpg" onerror=alert(1)><a href="javascript:alert(1)">link</a><b onclick="x()">n</b>');
  assert.ok(!/onerror|onclick|javascript:/i.test(out));
  assert.ok(out.includes('src="x.jpg"'));
  assert.ok(out.includes(">link</a>"));
});

test("HTML editorial normal passa intacto", () => {
  const html = '<h2>Sub</h2><p>Texto com <b>negrito</b> e <a href="https://ex.com/a">link</a>.</p><ul><li>item</li></ul>';
  assert.equal(sanitizeIngestHtml(html), html);
});

test("tag executável sem fechamento também cai", () => {
  const out = sanitizeIngestHtml('<p>a</p><embed src="x"><link rel="stylesheet" href="evil.css">');
  assert.ok(!/embed|<link/i.test(out));
  assert.ok(out.includes("<p>a</p>"));
});
