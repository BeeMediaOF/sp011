import { Router } from "express";
import { articleService } from "../lib/articleService.js";
import { parseArticleListParams, selectArticles } from "../lib/articlesList.js";
import { store } from "../lib/store.js";

const router = Router();

/** GET /api/categories — categorias do blog (public).
 *  Com cadastro no painel (settings.categories), devolve SÓ as visíveis, na
 *  ordem cadastrada, com contagem de publicados por slug. Sem cadastro,
 *  mantém a derivação histórica a partir dos artigos existentes. */
router.get("/categories", async (_req, res) => {
  const all = await articleService.getArticles();

  const registered = (store.getSettings().categories ?? []).filter((c) => c.visible !== false);
  if (registered.length > 0) {
    const counts = new Map<string, number>();
    for (const a of all) {
      if (a.status !== "published") continue;
      const key = (a.category ?? "geral").toLowerCase().trim();
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    res.json({
      categories: registered.map((c) => ({
        value: c.slug, label: c.name, tag: c.name.toUpperCase(),
        count: counts.get(c.slug) ?? 0,
      })),
    });
    return;
  }

  const map = new Map<string, { label: string; tag: string; count: number }>();

  for (const a of all) {
    const key = (a.category ?? "geral").toLowerCase().trim();
    if (!key) continue;
    const existing = map.get(key);
    const isPublished = a.status === "published";
    if (existing) {
      if (isPublished) existing.count++;
    } else {
      map.set(key, {
        label: a.tag
          ? a.tag.charAt(0).toUpperCase() + a.tag.slice(1).toLowerCase()
          : key.charAt(0).toUpperCase() + key.slice(1),
        tag: a.tag || key.toUpperCase(),
        count: isPublished ? 1 : 0,
      });
    }
  }

  const categories = Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
    .map(([value, { label, tag, count }]) => ({ value, label, tag, count }));

  res.json({ categories });
});

/** GET /api/articles — list published articles (public).
 *
 *  Params ADITIVOS (nenhum obrigatório): `limit` (1–1000 ou `all`, padrão 200),
 *  `offset`, `category` (slug, igualdade exata + fallback por tag), `q` (busca em
 *  título/categoria) e `sort` (`recent` | `views`). Devolve
 *  `{ articles, total, limit, offset }` — `articles` continua sendo a chave.
 *
 *  Sem limite (até o PRD-PERF-01) esta rota devolvia o acervo inteiro — 2,4 MB no
 *  sp011 — no caminho crítico de TODA rota sem SSR. `socialTitle` e `keywords`
 *  saíram do payload da lista: só o admin e o /api/articles/:id os consomem. */
router.get("/", async (req, res) => {
  const params = parseArticleListParams(req.query as Record<string, unknown>);
  // Views rastreadas pelo analytics (pageview) — usadas pelos blocos "Mais lidas".
  const views = store.getArticleViews();
  const viewsOf = (id: string) => views[id]?.views ?? 0;

  const published = (await articleService.getArticles())
    .filter((a) => a.status === "published");
  const { page, total } = selectArticles(published, params, viewsOf);

  const articles = page.map((a) => ({
    id: a.id,
    slug: a.slug || a.id,
    title: a.title,
    subtitle: a.subtitle,
    category: a.category,
    tag: a.tag,
    imageUrl: a.imageUrl,
    author: a.author,
    publishedAt: a.publishedAt,
    readingMinutes: a.readingMinutes,
    views: viewsOf(a.id),
  }));
  res.setHeader("Cache-Control", "public, max-age=30, s-maxage=30, stale-while-revalidate=300");
  res.json({
    articles,
    total,
    limit: Number.isFinite(params.limit) ? params.limit : total,
    offset: params.offset,
  });
});

/** GET /api/articles/:id — single article (public) */
router.get("/:id", async (req, res) => {
  const article = await articleService.getArticle(req.params.id ?? "");
  if (!article || article.status !== "published") {
    res.status(404).json({ error: "Article not found" }); return;
  }
  res.json({ article });
});

/** GET /api/articles/:id/relacionados — related published articles (?limit=, padrão 4) */
router.get("/:id/relacionados", async (req, res) => {
  const slug = req.params.id ?? "";
  const limit = Math.min(Math.max(Number(req.query.limit) || 4, 1), 12);
  const current = await articleService.getArticle(slug);
  if (!current || current.status !== "published") {
    res.json({ articles: [] }); return;
  }

  const allArticles = await articleService.getArticles();
  const all = allArticles
    .filter((a) => a.status === "published" && a.id !== current.id && (a.slug || a.id) !== slug);

  const currentKeywords = new Set(
    (current.keywords ?? "").toLowerCase().split(/[,\s]+/).filter(Boolean)
  );

  const scored = all.map((a) => {
    let score = 0;
    if (a.category === current.category) score += 10;
    if (currentKeywords.size > 0) {
      const aKw = new Set((a.keywords ?? "").toLowerCase().split(/[,\s]+/).filter(Boolean));
      score += [...currentKeywords].filter((k) => aKw.has(k)).length * 2;
    }
    return { a, score };
  });

  const related = scored
    .sort((x, y) =>
      y.score - x.score ||
      new Date(y.a.publishedAt).getTime() - new Date(x.a.publishedAt).getTime()
    )
    .slice(0, limit)
    .map(({ a }) => ({
      id: a.id,
      slug: a.slug || a.id,
      title: a.title,
      subtitle: a.subtitle,
      imageUrl: a.imageUrl,
      category: a.category,
      tag: a.tag,
      publishedAt: a.publishedAt,
    }));

  res.json({ articles: related });
});

export default router;
