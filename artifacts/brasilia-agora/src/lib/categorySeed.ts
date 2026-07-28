/**
 * Semente da página de editoria (SSR + hidratação).
 *
 * A CategoryArchivePage busca a lista dentro de um `useEffect` — que NÃO roda no
 * `renderToString`. Sem esta semente o servidor renderizaria só o "Carregando…"
 * e o SSR da editoria não valeria nada. O middleware busca os mesmos dois
 * endpoints que a página buscaria, serializa em `__SSR_DATA__`, e os dois lados
 * (servidor e cliente, antes de hidratar) semeiam AQUI — o 1º render do cliente
 * sai igual ao do servidor.
 *
 * Mesmo padrão de `seedArticles`/`seedSite`/`seedAds`, com uma diferença: a
 * chave é o slug, porque cada editoria tem a sua página.
 */
import type { Article as ApiArticle } from "./adminApi";

export interface CategorySeedData {
  slug: string;
  /** Página da editoria (mesmo limite que a página pede no cliente). */
  articles: ApiArticle[];
  /** Total de publicados na editoria — decide o botão "Carregar mais". */
  total: number;
  /** "Mais lidas" do SITE (por views), não da editoria. */
  mostRead: Array<{ id: string; slug?: string; title: string }>;
}

/** Mesma janela do cache de HTML da rota: passou disto, a página rebusca. */
const SEED_TTL_MS = 60_000;

/* Uma entrada por editoria (a chave só recebe slug que o menu confirmou), então
   o mapa é limitado pelo tamanho do menu do portal mesmo no processo de SSR,
   que fica de pé por semanas. Reeditar a mesma editoria substitui a entrada. */
const _seeds = new Map<string, { data: CategorySeedData; at: number }>();

export function seedCategoryArchive(data: CategorySeedData): void {
  _seeds.set(data.slug, { data, at: Date.now() });
}

/** Semente ainda válida para o slug, ou null. Não consome: o servidor renderiza
 *  uma vez e o cliente lê de novo no 1º render da hidratação. */
export function readCategorySeed(slug: string): CategorySeedData | null {
  const hit = _seeds.get(slug);
  if (!hit) return null;
  if (Date.now() - hit.at >= SEED_TTL_MS) {
    _seeds.delete(slug);
    return null;
  }
  return hit.data;
}
