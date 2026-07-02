/**
 * Testes da resolução do rodapé editável: defaults retrocompatíveis
 * (site sem footerConfig continua igual) e prioridade da config salva.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveFooterConfig, normalizeSocialUrl, renderCopyright } from "./footerConfig";

test("resolveFooterConfig: sem config usa contato + menu como default", () => {
  const f = resolveFooterConfig({
    contact: { phone: "(11) 90000-0000", displayEmail: "redacao@sp011.com.br", instagram: "https://instagram.com/sp011" },
    menuItems: [{ label: "HOME", path: "/" }, { label: "POLÍTICA", path: "/politica" }],
    siteName: "SP011",
    tagline: "Notícia. Agora. Sempre.",
  });
  assert.equal(f.phone, "(11) 90000-0000");
  assert.equal(f.email, "redacao@sp011.com.br");
  assert.equal(f.description, "Notícia. Agora. Sempre.");
  assert.equal(f.social.length, 1);
  assert.equal(f.social[0]?.key, "instagram");
  // Colunas padrão: Seções (menu) + Institucional
  assert.equal(f.columns.length, 2);
  assert.equal(f.columns[0]?.title, "Seções");
  assert.equal(f.columns[0]?.links[1]?.href, "/politica");
  assert.ok(f.copyright.includes("SP011"));
  assert.ok(f.copyright.includes(String(new Date().getFullYear())));
});

test("resolveFooterConfig: config salva tem prioridade sobre defaults", () => {
  const f = resolveFooterConfig({
    config: {
      description: "Meu texto",
      phone: "(61) 91111-1111",
      showNewsletter: false,
      columns: [{ id: "c1", title: "Links", links: [{ id: "l1", label: "Contato", href: "/contato" }] }],
      copyright: "© {year} — {site}",
      social: { instagram: "https://instagram.com/outro" },
    },
    contact: { phone: "(11) 90000-0000", instagram: "https://instagram.com/original" },
    siteName: "SP011",
  });
  assert.equal(f.description, "Meu texto");
  assert.equal(f.phone, "(61) 91111-1111");
  assert.equal(f.showNewsletter, false);
  assert.equal(f.columns.length, 1);
  assert.equal(f.columns[0]?.title, "Links");
  assert.equal(f.social.find((s) => s.key === "instagram")?.href, "https://instagram.com/outro");
  assert.equal(f.copyright, `© ${new Date().getFullYear()} — SP011`);
});

test("normalizeSocialUrl: completa handles e limpa whatsapp", () => {
  assert.equal(normalizeSocialUrl("instagram", "@sp011"), "https://instagram.com/sp011");
  assert.equal(normalizeSocialUrl("x", "sp011"), "https://x.com/sp011");
  assert.equal(normalizeSocialUrl("whatsapp", "(61) 99888-0000"), "https://wa.me/61998880000");
  assert.equal(normalizeSocialUrl("facebook", "https://facebook.com/ja.completo"), "https://facebook.com/ja.completo");
  assert.equal(normalizeSocialUrl("youtube", ""), "");
});

test("renderCopyright: substitui placeholders", () => {
  assert.equal(renderCopyright("© {year} {site}", "SP011"), `© ${new Date().getFullYear()} SP011`);
});
