/**
 * Ranking da aba "Top News" — as notícias mais lidas DESTE blog.
 *
 * Vive fora da rota pelo mesmo motivo do `articlesList.ts`: a regra de ordem é
 * o que pode dar errado, e ela precisa de teste sem banco. A rota só injeta os
 * artigos publicados e as duas funções de contagem.
 *
 * DUAS contagens, e a diferença entre elas é o feature inteiro:
 *
 *  - JANELA (`analytics_events`, pageviews não-internos dos últimos N dias) é o
 *    que faz a aba ser "top news" e não "hall da fama". Só com o acumulado, a
 *    página congelaria nos mesmos cinco artigos para sempre — quanto mais
 *    tempo no ar, mais impossível de qualquer notícia nova aparecer.
 *  - ACUMULADO (`article_views`) é o desempate, e é o que segura a página em pé
 *    onde a janela é rala. Os blogs da rede são novos e de tráfego baixo: numa
 *    semana ruim, metade do catálogo tem ZERO leitura na janela. Sem o segundo
 *    critério, essa metade sairia em ordem arbitrária.
 *
 * O último desempate é a data. Assim um blog recém-publicado, sem UMA leitura
 * registrada, ainda serve uma página cheia e coerente (as mais recentes) em vez
 * de uma lista vazia ou embaralhada — estado inicial de todo blog novo da rede.
 *
 * O que esta função deliberadamente NÃO faz: cortar por data de publicação. Uma
 * matéria de dois meses que voltou a ser lida é exatamente o que uma aba de
 * mais lidas existe para mostrar; filtrar por recência transformaria a página
 * numa segunda home.
 */

export interface TopRankable {
  id: string;
  publishedAt: string;
}

/** Quantos artigos a aba mostra por padrão (3 do pódio + 21 da lista). */
export const TOP_NEWS_DEFAULT_LIMIT = 24;
export const TOP_NEWS_MAX_LIMIT = 60;
/** Janela padrão: 7 dias — o "mais lidas da semana" clássico. */
export const TOP_NEWS_DEFAULT_DAYS = 7;
export const TOP_NEWS_MAX_DAYS = 365;

export interface TopNewsParams {
  limit: number;
  /** Dias da janela; `0` = sem janela (só o acumulado de todos os tempos). */
  days: number;
}

function toInt(v: unknown): number {
  const n = Math.trunc(Number(Array.isArray(v) ? v[0] : v));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parâmetros ADITIVOS: nenhum é obrigatório e valor inválido cai no default —
 * mesma regra do `parseArticleListParams`. `days=0` é um valor VÁLIDO (pedido
 * explícito de "sempre") e por isso não pode ser tratado como ausência.
 */
export function parseTopNewsParams(query: Record<string, unknown>): TopNewsParams {
  const rawLimit = toInt(query["limit"]);
  const limit = rawLimit > 0 ? Math.min(rawLimit, TOP_NEWS_MAX_LIMIT) : TOP_NEWS_DEFAULT_LIMIT;

  const hasDays = query["days"] !== undefined && String(query["days"]).trim() !== "";
  const rawDays = toInt(query["days"]);
  const days = !hasDays
    ? TOP_NEWS_DEFAULT_DAYS
    : rawDays <= 0
      ? 0
      : Math.min(rawDays, TOP_NEWS_MAX_DAYS);

  return { limit, days };
}

function time(v: string): number {
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Ordena por leituras na janela → leituras acumuladas → data de publicação, e
 * corta em `limit`. A ordem de entrada NUNCA é mutada (a rota reusa a mesma
 * lista de artigos publicados noutras respostas).
 */
export function rankTopArticles<T extends TopRankable>(
  published: readonly T[],
  windowViewsOf: (id: string) => number,
  allTimeViewsOf: (id: string) => number,
  limit: number,
): T[] {
  return [...published]
    .sort((x, y) =>
      windowViewsOf(y.id) - windowViewsOf(x.id) ||
      allTimeViewsOf(y.id) - allTimeViewsOf(x.id) ||
      time(y.publishedAt) - time(x.publishedAt))
    .slice(0, Math.max(limit, 0));
}
