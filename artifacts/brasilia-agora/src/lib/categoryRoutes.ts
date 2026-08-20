/**
 * Página de editoria: quais paths existem, com que rótulo e que cor.
 *
 * Fonte ÚNICA de três consumidores que precisam concordar entre si:
 *  1. o App, que monta as rotas fixas e resolve o `/:slug` dinâmico;
 *  2. o middleware de SSR (vite.config.ts), que decide se um path vira HTML
 *     renderizado no servidor — se ele discordar do App, o servidor pinta uma
 *     página e o cliente hidrata OUTRA;
 *  3. o `<title>` servido nessas rotas.
 *
 * Antes as 13 editorias fixas eram 13 arquivos de página de 3 linhas idênticas
 * (`src/pages/Politica.tsx` e cia) e a resolução do `/:slug` morava dentro do
 * App. Sem React aqui de propósito: o `vite.config.ts` importa este módulo.
 */

export interface CategoryRoute {
  /** Path da rota, com barra inicial e sem barra final. */
  path: string;
  /** Rótulo exibido (caixa alta — decisão de layout do cabeçalho/H1). */
  label: string;
  /** Slug da editoria usado no filtro do /api/articles. */
  slug: string;
  /** Cor do chapéu/divisórias da página. */
  color: string;
}

/** Editorias com rota própria no App (rótulo e cor fixos, herdados das páginas). */
export const FIXED_CATEGORIES: readonly CategoryRoute[] = [
  { path: "/politica",   label: "POLÍTICA",   slug: "politica",   color: "#1d4ed8" },
  { path: "/cidade",     label: "CIDADE",     slug: "cidade",     color: "#2563eb" },
  { path: "/seguranca",  label: "SEGURANÇA",  slug: "seguranca",  color: "#dc2626" },
  { path: "/transporte", label: "TRANSPORTE", slug: "transporte", color: "#0284c7" },
  { path: "/saude",      label: "SAÚDE",      slug: "saude",      color: "#16a34a" },
  { path: "/educacao",   label: "EDUCAÇÃO",   slug: "educacao",   color: "#6b21a8" },
  { path: "/cultura",    label: "CULTURA",    slug: "cultura",    color: "#0d9488" },
  { path: "/esportes",   label: "ESPORTES",   slug: "esportes",   color: "#b45309" },
  { path: "/colunas",    label: "COLUNAS",    slug: "colunas",    color: "#7c3aed" },
  { path: "/brasil",     label: "BRASIL",     slug: "brasil",     color: "#1d4ed8" },
  { path: "/mundo",      label: "MUNDO",      slug: "mundo",      color: "#0891b2" },
  { path: "/economia",   label: "ECONOMIA",   slug: "economia",   color: "#b45309" },
  { path: "/tecnologia", label: "TECNOLOGIA", slug: "tecnologia", color: "#6b21a8" },
];

/**
 * Paths de UM segmento que o App resolve ANTES do `/:slug` — não são editoria
 * mesmo que alguém cadastre um menuItem apontando para eles.
 */
const RESERVED_PATHS: ReadonlySet<string> = new Set([
  "/artigo", "/arquivo", "/contato", "/privacidade", "/termos",
]);

const COLOR_PALETTE = [
  "#0b3d91","#c8102e","#16a34a","#6b21a8","#0284c7",
  "#b45309","#0d9488","#dc2626","#ea580c","#7c3aed",
];

/** Cor estável (hash do slug) das editorias que vêm do menu, sem cor cadastrada. */
export function colorForSlug(slug: string): string {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return COLOR_PALETTE[h % COLOR_PALETTE.length]!;
}

/** Formato mínimo de um item de menu (o payload de /api/site e o SiteSettings). */
export interface MenuItemLike {
  label?: string;
  path?: string;
  visible?: boolean;
  children?: MenuItemLike[] | undefined;
}

/** Achata o menu com o submenu de 1 nível, ignorando itens ocultos. */
function flatMenu(items: readonly MenuItemLike[] | undefined): MenuItemLike[] {
  if (!Array.isArray(items)) return [];
  const out: MenuItemLike[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    if (item.visible !== false) out.push(item);
    if (Array.isArray(item.children)) {
      for (const c of item.children) if (c && c.visible !== false) out.push(c);
    }
  }
  return out;
}

/** Formato mínimo de uma editoria declarada em `settings.categories`. */
export interface CategoryLike {
  name?: string;
  slug?: string;
  color?: string;
  visible?: boolean;
}

/**
 * Rótulo e cor de uma editoria. A tabela fixa continua valendo AQUI, e só aqui:
 * ela descreve como as editorias clássicas do engine se APRESENTAM (o acento de
 * "SEGURANÇA", a cor do chapéu), o que é independente de a editoria existir ou
 * não neste blog. Sem este passo, tirar a tabela da resolução de existência
 * trocaria "SEGURANÇA" por "SEGURANCA" no H1 do sp011.
 */
function presentation(path: string, slug: string, label: string, color: string): CategoryRoute {
  const fixed = FIXED_CATEGORIES.find((c) => c.path === path);
  return fixed ? { ...fixed } : { path, slug, label, color };
}

/**
 * SUPERFÍCIE DE EDITORIAS DO BLOG: os paths de um segmento que existem neste
 * portal. Responde a UMA pergunta — "esta rota existe?" — e só a ela.
 *
 * Três conceitos que não se confundem:
 *   existir na taxonomia  !=  aparecer na navegação  !=  ser indexável.
 *
 * Por isso as editorias com `visible: false` ENTRAM: `visible` é visibilidade
 * de MENU. É o caso de `copa-do-mundo` no OleySports — 86 artigos publicados
 * numa editoria que o menu não mostra. Copiar para cá o filtro
 * `visible !== false` da rota `/api/articles/categories` (aquele é de UI)
 * apagaria a segunda maior editoria do portal.
 *
 * A tabela fixa é REDE DE SEGURANÇA, não regra: entra somente quando o blog não
 * declarou nada (instalação nova, wizard incompleto). Blog com menu próprio não
 * herda as 13 editorias do portal que gerou a imagem Docker compartilhada.
 *
 * O que esta função NÃO decide: editoria histórica, fora da superfície, mas com
 * artigos publicados continua existindo. Isso se responde pela CONTAGEM de
 * artigos — que é dado, não configuração — no middleware de SSR.
 */
export function blogCategorySurface(
  menuItems: readonly MenuItemLike[] | undefined,
  categories: readonly CategoryLike[] | undefined,
): CategoryRoute[] {
  const out: CategoryRoute[] = [];
  const seen = new Set<string>();
  const add = (rawSlug: string, label: string, color: string): void => {
    const slug = rawSlug.trim().replace(/^\/+/, "").replace(/\/+$/, "");
    if (!slug || slug.includes("/")) return;
    const path = `/${slug}`;
    if (RESERVED_PATHS.has(path) || seen.has(path)) return;
    seen.add(path);
    out.push(presentation(path, slug, label || slug.toUpperCase(), color));
  };

  /* 1. Menu do portal primeiro: assim rótulo e cor saem exatamente como a
        página de editoria já os exibe hoje. */
  for (const m of flatMenu(menuItems)) {
    const mp = (m.path ?? "").trim();
    if (!mp.startsWith("/") || mp === "/") continue; // link externo não é seção
    add(mp.slice(1), (m.label ?? "").toUpperCase(), colorForSlug(mp.slice(1).replace(/\/+$/, "")));
  }
  /* 2. Editorias declaradas no painel, INCLUSIVE as ocultas no menu. */
  for (const c of categories ?? []) {
    const slug = (c?.slug ?? "").trim();
    if (!slug) continue;
    add(slug, ((c.name ?? "").trim() || slug).toUpperCase(), (c.color ?? "").trim() || colorForSlug(slug));
  }
  /* 3. Rede de segurança: blog sem menu E sem categorias declaradas. */
  if (out.length === 0) return FIXED_CATEGORIES.map((c) => ({ ...c }));
  return out;
}

/**
 * Apresentação de uma editoria que NÃO está na superfície mas tem conteúdo
 * publicado (arquivo histórico, taxonomia anterior). Quem decide que ela existe
 * é a contagem de artigos; esta função só resolve como ela aparece.
 */
export function categoryRouteForSlug(slug: string): CategoryRoute | null {
  const s = (slug || "").trim().replace(/^\/+/, "").replace(/\/+$/, "");
  if (!s || s.includes("/")) return null;
  const path = `/${s}`;
  if (RESERVED_PATHS.has(path)) return null;
  return presentation(path, s, s.replace(/-/g, " ").toUpperCase(), colorForSlug(s));
}

/**
 * Resolve o path de uma página de editoria contra a superfície do blog.
 * `null` = o path não está na superfície — o que NÃO significa "não existe":
 * falta consultar o conteúdo. Quem faz essa segunda pergunta é o middleware de
 * SSR (e, no cliente, a semente que ele deixa).
 */
export function resolveCategoryRoute(
  pathOnly: string,
  menuItems: readonly MenuItemLike[] | undefined,
  categories?: readonly CategoryLike[] | undefined,
): CategoryRoute | null {
  const p = (pathOnly || "").replace(/\/+$/, "");
  if (!/^\/[^/]+$/.test(p) || RESERVED_PATHS.has(p)) return null;
  return blogCategorySurface(menuItems, categories).find((c) => c.path === p) ?? null;
}

/**
 * "POLÍTICA" -> "Política", "WORLD CUP" -> "World Cup"; rótulos que já têm
 * minúsculas são respeitados. Os rótulos vêm em caixa alta por decisão de
 * layout do cabeçalho — em texto corrido (título de aba, llms.txt) isso vira
 * grito. Sigla = rótulo de UMA palavra com até 3 caracteres (NFL, F1, TV): fica
 * intacto. A regra é a palavra isolada, e não o tamanho do token, senão o "CUP"
 * de "WORLD CUP" também passaria por sigla ("World CUP").
 */
export function smartCase(label: string): string {
  const s = label.trim();
  if (s !== s.toUpperCase()) return s;
  if (s.length <= 3 && !/[\s-]/.test(s)) return s;
  return s.replace(/[^\s-]+/g, (w) => w.charAt(0) + w.slice(1).toLocaleLowerCase());
}

/** `<title>` da página de editoria — o SSR escreve no HTML e a página repete. */
export function categoryTitle(label: string, siteName: string): string {
  return `${smartCase(label)} — ${siteName}`;
}
