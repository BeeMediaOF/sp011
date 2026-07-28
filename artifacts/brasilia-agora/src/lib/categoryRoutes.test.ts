/**
 * Testes da resolução de página de editoria (PRD-PERF-05). Esta é a função que
 * o App e o middleware de SSR consultam: se os dois discordarem, o servidor
 * pinta uma página e o cliente hidrata outra.
 * Rodar com: pnpm run test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveCategoryRoute, colorForSlug, categoryTitle, smartCase, FIXED_CATEGORIES,
  type MenuItemLike,
} from "./categoryRoutes";

const MENU: MenuItemLike[] = [
  { label: "Home", path: "/" },
  { label: "FUTEBOL", path: "/futebol" },
  { label: "Oculto", path: "/oculto", visible: false },
  { label: "Parceiro", path: "https://exemplo.com" },
  { label: "MAIS", path: "/mais", children: [
    { label: "E-SPORTS", path: "/e-sports" },
    { label: "Escondido", path: "/escondido", visible: false },
  ] },
];

test("editoria fixa vence e traz rótulo e cor próprios", () => {
  const r = resolveCategoryRoute("/politica", MENU);
  assert.deepEqual(r, { path: "/politica", label: "POLÍTICA", slug: "politica", color: "#1d4ed8" });
});

test("editoria do menu: rótulo em caixa alta e cor derivada do slug", () => {
  const r = resolveCategoryRoute("/futebol", MENU);
  assert.equal(r?.slug, "futebol");
  assert.equal(r?.label, "FUTEBOL");
  assert.equal(r?.color, colorForSlug("futebol"));
});

test("submenu de 1 nível também é editoria", () => {
  assert.equal(resolveCategoryRoute("/e-sports", MENU)?.label, "E-SPORTS");
});

test("item oculto do menu não vira página", () => {
  assert.equal(resolveCategoryRoute("/oculto", MENU), null);
  assert.equal(resolveCategoryRoute("/escondido", MENU), null);
});

test("link externo do menu não é seção deste portal", () => {
  assert.equal(resolveCategoryRoute("/exemplo.com", MENU), null);
});

test("rotas que o App resolve ANTES do /:slug nunca são editoria", () => {
  // mesmo que alguém cadastre um menuItem apontando para elas
  const menu: MenuItemLike[] = [{ label: "Contato", path: "/contato" }, { label: "Termos", path: "/termos" }];
  for (const p of ["/contato", "/termos", "/privacidade", "/arquivo", "/artigo"]) {
    assert.equal(resolveCategoryRoute(p, menu), null, p);
  }
});

test("só um segmento, com ou sem barra final", () => {
  assert.equal(resolveCategoryRoute("/futebol/", MENU)?.slug, "futebol");
  assert.equal(resolveCategoryRoute("/futebol/2026", MENU), null);
  assert.equal(resolveCategoryRoute("/", MENU), null);
  assert.equal(resolveCategoryRoute("", MENU), null);
});

test("sem menu (API fora) as editorias fixas continuam de pé", () => {
  assert.equal(resolveCategoryRoute("/esportes", undefined)?.label, "ESPORTES");
  assert.equal(resolveCategoryRoute("/futebol", undefined), null);
});

test("a tabela fixa é consistente: paths únicos e casando com o slug", () => {
  const paths = new Set(FIXED_CATEGORIES.map((c) => c.path));
  assert.equal(paths.size, FIXED_CATEGORIES.length);
  for (const c of FIXED_CATEGORIES) {
    assert.equal(c.path, `/${c.slug}`);
    assert.equal(c.label, c.label.toUpperCase());
    assert.match(c.color, /^#[0-9a-f]{6}$/);
  }
});

test("smartCase tira o grito do rótulo sem estragar sigla", () => {
  assert.equal(smartCase("POLÍTICA"), "Política");
  assert.equal(smartCase("WORLD CUP"), "World Cup");
  assert.equal(smartCase("E-SPORTS"), "E-Sports");
  assert.equal(smartCase("NFL"), "NFL");
  assert.equal(smartCase("F1"), "F1");
  assert.equal(smartCase("Meu Rótulo"), "Meu Rótulo");
});

test("categoryTitle é o mesmo texto no SSR e na página", () => {
  assert.equal(categoryTitle("POLÍTICA", "SP011"), "Política — SP011");
});

test("colorForSlug é estável (o servidor e o cliente pintam igual)", () => {
  assert.equal(colorForSlug("volei"), colorForSlug("volei"));
  assert.match(colorForSlug("qualquer-coisa"), /^#[0-9a-f]{6}$/);
});
