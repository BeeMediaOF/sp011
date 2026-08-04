/**
 * Busca dos artigos que viram card na newsletter — a metade "com banco" do
 * `articleCards.ts` (que é puro e testável sem infraestrutura).
 *
 * Reusa a MESMA regra da lista pública (`selectArticles`): filtro exato de
 * editoria com fallback por tag, ordenação por data ou por views do analytics.
 * Duplicar a regra aqui faria a newsletter divergir do site com o tempo.
 */

import { articleService } from "../articleService.js";
import { selectArticles } from "../articlesList.js";
import { store } from "../store.js";
import type { ArticleToken, CardArticle } from "./articleCards.js";

export async function loadCardArticles(t: ArticleToken): Promise<CardArticle[]> {
  const views = store.getArticleViews();
  const viewsOf = (id: string) => views[id]?.views ?? 0;
  const published = (await articleService.getArticles()).filter((a) => a.status === "published");
  const { page } = selectArticles(
    published,
    { limit: t.count, offset: 0, category: t.category, q: "", sort: t.sort },
    viewsOf,
  );
  return page.map((a) => ({
    id: a.id,
    slug: a.slug,
    title: a.title,
    category: a.category,
    imageUrl: a.imageUrl,
  }));
}
