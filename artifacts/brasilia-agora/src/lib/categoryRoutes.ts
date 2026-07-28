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

/**
 * Resolve o path de uma página de editoria: editoria fixa primeiro, senão um
 * item do menu apontando para ele. `null` = o path não é página de editoria
 * (no App vira NotFound; no SSR vira `next()` e cai na SPA).
 */
export function resolveCategoryRoute(
  pathOnly: string,
  menuItems: readonly MenuItemLike[] | undefined,
): CategoryRoute | null {
  const p = (pathOnly || "").replace(/\/+$/, "");
  if (!/^\/[^/]+$/.test(p) || RESERVED_PATHS.has(p)) return null;
  const fixed = FIXED_CATEGORIES.find((c) => c.path === p);
  if (fixed) return fixed;
  const slug = p.slice(1);
  for (const m of flatMenu(menuItems)) {
    const mp = (m.path ?? "").trim();
    if (!mp.startsWith("/")) continue; // link externo do menu não é seção
    if (mp === p || mp.replace(/^\//, "").replace(/\/+$/, "") === slug) {
      // .toUpperCase() e nada de limpeza no rótulo: é o que o DynamicCategory
      // sempre fez, e o H1 da página precisa sair igual no servidor e no cliente.
      return { path: p, slug, label: (m.label ?? slug).toUpperCase(), color: colorForSlug(slug) };
    }
  }
  return null;
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
