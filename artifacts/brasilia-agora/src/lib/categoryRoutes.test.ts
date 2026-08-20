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
  blogCategorySurface, categoryRouteForSlug,
  type MenuItemLike, type CategoryLike,
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

/* Blog do sp011: menu próprio, NENHUMA editoria declarada em settings. */
const MENU_SP011: MenuItemLike[] = [
  { label: "HOME", path: "/" },
  { label: "POLÍTICA", path: "/politica" },
  { label: "ECONOMIA", path: "/economia" },
  { label: "GERAL", path: "/geral" },
];

/* Blog do OleySports: 9 editorias declaradas (uma delas oculta no menu) e 7 no
   menu. Os dados são os de produção, lidos em 20/08/2026. */
const CATS_OLEY: CategoryLike[] = [
  { name: "COPA DO MUNDO", slug: "copa-do-mundo", color: "#0369a1", visible: false },
  { name: "FUTEBOL", slug: "futebol", color: "#0369a1", visible: true },
  { name: "BASQUETE", slug: "basquete", color: "#0B2A66", visible: true },
];
const MENU_OLEY: MenuItemLike[] = [
  { label: "HOME", path: "/" },
  { label: "FUTEBOL", path: "/futebol" },
];

test("a tabela fixa NAO se aplica a blog que declara o proprio menu", () => {
  /* Correção do P0 de indexação: antes, `/politica` resolvia em TODO blog da
     rede por estar na tabela fixa — inclusive num blog de esporte, onde a
     editoria não tem um único artigo. A tabela é rede de segurança, não regra. */
  assert.equal(resolveCategoryRoute("/politica", MENU), null);
  assert.equal(resolveCategoryRoute("/cidade", MENU_OLEY, CATS_OLEY), null);
});

test("S-7: no sp011 as editorias do menu continuam de pe, e so elas", () => {
  assert.equal(resolveCategoryRoute("/politica", MENU_SP011)?.slug, "politica");
  assert.equal(resolveCategoryRoute("/geral", MENU_SP011)?.slug, "geral");
  // rótulo e cor da tabela fixa são preservados: o H1 não perde o acento
  assert.equal(resolveCategoryRoute("/politica", MENU_SP011)?.label, "POLÍTICA");
  assert.equal(resolveCategoryRoute("/politica", MENU_SP011)?.color, "#1d4ed8");
  // fora do menu do sp011: não está na superfície (mas pode existir por conteúdo)
  assert.equal(resolveCategoryRoute("/colunas", MENU_SP011), null);
  assert.equal(resolveCategoryRoute("/brasil", MENU_SP011), null);
});

test("S-5: editoria com visible:false ENTRA na superficie (existencia != navegacao)", () => {
  const r = resolveCategoryRoute("/copa-do-mundo", MENU_OLEY, CATS_OLEY);
  assert.equal(r?.slug, "copa-do-mundo");
  assert.equal(r?.label, "COPA DO MUNDO");
  assert.equal(r?.color, "#0369a1");
});

test("S-1: superficie do Oley tem as declaradas e nao tem as fixas do sp011", () => {
  const paths = blogCategorySurface(MENU_OLEY, CATS_OLEY).map((c) => c.path);
  assert.ok(paths.includes("/copa-do-mundo"));
  assert.ok(paths.includes("/basquete"));
  assert.ok(paths.includes("/futebol"));
  assert.ok(!paths.includes("/politica"));
  assert.ok(!paths.includes("/cidade"));
});

test("S-2: sem categorias declaradas, a superficie e o menu", () => {
  const paths = blogCategorySurface(MENU_OLEY, undefined).map((c) => c.path);
  assert.deepEqual(paths, ["/futebol"]);
});

test("S-3/S-4: blog sem menu e sem categorias cai nas 13 fixas (rede de seguranca)", () => {
  assert.equal(blogCategorySurface(undefined, undefined).length, FIXED_CATEGORIES.length);
  assert.equal(blogCategorySurface([], []).length, FIXED_CATEGORIES.length);
  // menu só com link externo também não declara nada
  assert.equal(
    blogCategorySurface([{ label: "Parceiro", path: "https://exemplo.com" }], undefined).length,
    FIXED_CATEGORIES.length,
  );
});

test("S-6: slug que esta no menu E nas categorias entra uma vez so", () => {
  const paths = blogCategorySurface(MENU_OLEY, CATS_OLEY).map((c) => c.path);
  assert.equal(paths.filter((p) => p === "/futebol").length, 1);
});

test("S-8: path reservado nunca entra na superficie, nem cadastrado", () => {
  const cats: CategoryLike[] = [{ name: "CONTATO", slug: "contato" }];
  const menu: MenuItemLike[] = [{ label: "Contato", path: "/contato" }];
  assert.ok(!blogCategorySurface(menu, cats).some((c) => c.path === "/contato"));
});

test("categoryRouteForSlug apresenta a editoria historica (Classe 3)", () => {
  // slug da tabela fixa: rótulo e cor clássicos (o /seguranca do sp011)
  assert.equal(categoryRouteForSlug("seguranca")?.label, "SEGURANÇA");
  assert.equal(categoryRouteForSlug("seguranca")?.color, "#dc2626");
  // slug qualquer: hífen vira espaço, caixa alta como o layout exige
  assert.equal(categoryRouteForSlug("copa-do-mundo")?.label, "COPA DO MUNDO");
  assert.equal(categoryRouteForSlug("tebol")?.path, "/tebol");
  // nunca uma rota reservada nem um path de dois segmentos
  assert.equal(categoryRouteForSlug("contato"), null);
  assert.equal(categoryRouteForSlug("a/b"), null);
  assert.equal(categoryRouteForSlug(""), null);
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

test("sem menu e sem categorias (API fora) as editorias fixas continuam de pé", () => {
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
