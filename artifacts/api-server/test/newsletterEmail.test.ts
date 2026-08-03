import { test } from "node:test";
import assert from "node:assert/strict";
import { renderNewsletterEmail } from "../src/lib/newsletter/email.ts";
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
