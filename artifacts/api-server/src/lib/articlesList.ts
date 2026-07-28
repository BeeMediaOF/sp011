/**
 * Seleção paginada da lista pública de artigos (GET /api/articles).
 *
 * Vive fora da rota para ser testável sem banco: a rota só injeta os artigos já
 * carregados e a função de views. Antes do PRD-PERF-01 a rota devolvia TODOS os
 * publicados (2,4 MB no sp011) e todo o corte/ordenação acontecia no cliente.
 */

export interface ListableArticle {
  id: string;
  title: string;
  category: string;
  tag: string;
  publishedAt: string;
}

export interface ArticleListParams {
  /** Number.POSITIVE_INFINITY representa `limit=all`. */
  limit: number;
  offset: number;
  /** Slug em minúsculas; vazio = sem filtro. */
  category: string;
  /** Busca em minúsculas; vazio = sem filtro. */
  q: string;
  sort: "recent" | "views";
}

export const ARTICLES_DEFAULT_LIMIT = 200;
export const ARTICLES_MAX_LIMIT = 1000;

function toInt(v: unknown): number {
  const n = Math.trunc(Number(Array.isArray(v) ? v[0] : v));
  return Number.isFinite(n) ? n : 0;
}

function toStr(v: unknown): string {
  return String(Array.isArray(v) ? v[0] ?? "" : v ?? "").trim().toLowerCase();
}

/** Todos os parâmetros são ADITIVOS — nenhum é obrigatório e valor inválido cai no default. */
export function parseArticleListParams(query: Record<string, unknown>): ArticleListParams {
  const n = toInt(query["limit"]);
  /* Fora da faixa (0, negativo, lixo) cai no default em vez de clampar para 1:
     um bug de cliente que mandasse limit=-1 renderizaria a página quase vazia. */
  const limit = toStr(query["limit"]) === "all"
    ? Number.POSITIVE_INFINITY
    : (n > 0 ? Math.min(n, ARTICLES_MAX_LIMIT) : ARTICLES_DEFAULT_LIMIT);
  return {
    limit,
    offset: Math.max(toInt(query["offset"]), 0),
    category: toStr(query["category"]),
    q: toStr(query["q"]),
    sort: toStr(query["sort"]) === "views" ? "views" : "recent",
  };
}

function time(v: string): number {
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Filtra → ordena → corta. `total` é a contagem DEPOIS de category/q e ANTES do
 * corte (é o que o "Carregar mais" do /arquivo usa para saber se há próxima página).
 */
export function selectArticles<T extends ListableArticle>(
  all: readonly T[],
  p: ArticleListParams,
  viewsOf: (id: string) => number,
): { page: T[]; total: number } {
  let list = all as readonly T[];

  if (p.category) {
    /* Igualdade EXATA de slug: includes() fazia /futebol listar futebol-americano.
       Fallback por tag slugificada cobre artigos legados sem category — mesma
       regra que o CategoryArchivePage aplicava no cliente. */
    list = list.filter((a) => {
      const cat = (a.category ?? "").trim().toLowerCase();
      const tag = (a.tag ?? "").trim().toLowerCase().replace(/\s+/g, "-");
      return cat === p.category || (cat === "" && tag === p.category);
    });
  }

  if (p.q) {
    list = list.filter((a) =>
      (a.title ?? "").toLowerCase().includes(p.q) ||
      (a.category ?? "").toLowerCase().includes(p.q));
  }

  const total = list.length;

  const sorted = [...list].sort((x, y) =>
    p.sort === "views"
      ? viewsOf(y.id) - viewsOf(x.id) || time(y.publishedAt) - time(x.publishedAt)
      : time(y.publishedAt) - time(x.publishedAt));

  const page = Number.isFinite(p.limit)
    ? sorted.slice(p.offset, p.offset + p.limit)
    : sorted.slice(p.offset);

  return { page, total };
}
