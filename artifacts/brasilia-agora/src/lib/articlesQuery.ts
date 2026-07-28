/**
 * Construção das URLs de /api/articles (PRD-PERF-01).
 *
 * A rota passou a ser paginada; quem consome precisa pedir só o que exibe. A
 * ordem das chaves na query é FIXA porque o boot prefetch do index.html monta a
 * mesma URL à mão: qualquer diferença de bytes faz o fetch do hook virar um
 * segundo download em vez de um hit do cache HTTP.
 */

/** Tamanho da lista pública padrão. Alinhado com o default do /api/articles. */
export const ARTICLES_LIST_LIMIT = 200;
/** Lista enxuta para rotas que só precisam do ticker/sidebar (artigo, categoria). */
export const ARTICLES_TICKER_LIMIT = 30;
/** Página da lista de uma editoria (/politica, /futebol…) e do "Carregar mais". */
export const ARTICLES_CATEGORY_LIMIT = 60;

export interface ArticlesQuery {
  limit?: number | "all";
  offset?: number;
  category?: string;
  q?: string;
  sort?: "recent" | "views";
}

/** Ordem canônica das chaves: limit, offset, category, q, sort. */
export function articlesUrl(params: ArticlesQuery = {}): string {
  const { limit = ARTICLES_LIST_LIMIT, offset = 0, category = "", q = "", sort = "recent" } = params;
  const parts = [`limit=${limit}`, `offset=${offset}`];
  if (category) parts.push(`category=${encodeURIComponent(category)}`);
  if (q) parts.push(`q=${encodeURIComponent(q)}`);
  parts.push(`sort=${sort}`);
  return `/api/articles?${parts.join("&")}`;
}

/** Mesma condição do boot prefetch no index.html. */
export function isHomeRoute(pathname?: string): boolean {
  const p = pathname ?? (typeof location === "undefined" ? "/" : location.pathname);
  return p === "/" || p === "";
}

/** Tamanho da lista que a rota atual precisa: a home usa todos os blocos; o resto
 *  do site só lê o topo da lista (ticker, "mais lidas" da sidebar). */
export function listLimitForRoute(pathname?: string): number {
  return isHomeRoute(pathname) ? ARTICLES_LIST_LIMIT : ARTICLES_TICKER_LIMIT;
}
