import { test } from "node:test";
import assert from "node:assert/strict";
import { renderNewsletterEmail } from "../src/lib/newsletter/email.ts";
import { sanitizeEmailHtml } from "../../../lib/news-engine/src/sanitizeHtml.ts";
import type { SiteSettings } from "../src/lib/store.ts";

// SiteSettings mínimo: renderNewsletterEmail só lê nome/reply-to/site.
const S = { siteName: "Blog", newsletterFromName: "Blog News" } as unknown as SiteSettings;

test("newsletter full-bleed: corpo sem padding, footerHtml full, cartão 640, descadastro presente", () => {
  const { html } = renderNewsletterEmail({
    settings: S,
    subject: "Oi",
    bodyHtml: "<div>corpo</div>",
    unsubscribeUrl: "https://x/unsub?token=abc",
    template: { layout: "full", footerHtml: "<div id=\"rich-footer\">rodape</div>", pageBgColor: "#111111" },
  });
  assert.ok(html.includes('width="640"'), "cartão 640 no full");
  assert.ok(html.includes("padding:0;color:"), "corpo sem padding no full");
  assert.ok(html.includes("rich-footer"), "footerHtml full-bleed presente");
  assert.ok(html.includes("Cancelar inscrição"), "descadastro obrigatório sempre presente");
  assert.ok(!html.includes("#F7F9FC"), "não usa a faixa clara padrão no full");
});

// Regressão 2026-08-03: o corpo da campanha era sanitizado pela política de
// ARTIGO, que descarta `style` e os atributos de tabela — abrir a campanha rica
// no admin e salvar (o "Enviar teste" salva antes) achatava o layout no banco.
// O corpo tem de passar pela MESMA política do cabeçalho/rodapé.
test("corpo rico de campanha sobrevive à sanitização de e-mail (estilo + tabela)", () => {
  const rico =
    '<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#0e2341;">' +
    '<tr><td width="52%" valign="middle" style="padding:38px 34px;">' +
    '<h1 style="color:#ffffff;font-size:34px;">Seja muito bem-vindo(a)!</h1>' +
    '<img src="/api/uploads/nl-hero.jpg" width="250" style="border-radius:20px;" />' +
    "</td></tr></table>";
  const out = sanitizeEmailHtml(rico);
  assert.ok(out.includes("background:#0e2341"), "style inline preservado");
  assert.ok(out.includes('width="52%"'), "atributo de largura preservado");
  assert.ok(out.includes('valign="middle"'), "valign preservado");
  assert.ok(out.includes('cellpadding="0"'), "cellpadding preservado");
  assert.ok(out.includes("/api/uploads/nl-hero.jpg"), "imagem root-relativa preservada");
});

test("sanitização de e-mail ainda barra script e handler inline", () => {
  const out = sanitizeEmailHtml('<div onclick="x()" style="color:red">oi<script>alert(1)</script></div>');
  assert.ok(!/onclick/i.test(out), "handler removido");
  assert.ok(!/<script/i.test(out), "script removido");
  assert.ok(out.includes("color:red"), "estilo seguro mantido");
});

test("newsletter padrão: corpo com margem, faixa clara, descadastro presente", () => {
  const { html } = renderNewsletterEmail({
    settings: S,
    subject: "Oi",
    bodyHtml: "<p>corpo</p>",
    unsubscribeUrl: "https://x/unsub?token=abc",
    template: {},
  });
  assert.ok(html.includes('width="600"'), "cartão 600 no padrão");
  assert.ok(html.includes("padding:32px 40px"), "corpo com margem no padrão");
  assert.ok(html.includes("#F7F9FC"), "faixa clara no padrão");
  assert.ok(html.includes("Cancelar inscrição"), "descadastro presente");
});
