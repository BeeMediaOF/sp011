import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { articleService } from "../lib/articleService.js";
import { parseArticleListParams, selectArticles } from "../lib/articlesList.js";
import { parseTopNewsParams, rankTopArticles } from "../lib/topArticles.js";
import { store } from "../lib/store.js";
import { logger } from "../lib/logger.js";

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

/* ── Top News: leituras da janela ──────────────────────────────────────────
 *
 * A agregação varre `analytics_events` e a aba é PÚBLICA — sem cache, um pico
 * de tráfego viraria N varreduras simultâneas da mesma tabela, e a VPS é
 * compartilhada pelos 11 blogs (a Hostinger já estrangulou a CPU uma vez).
 * Daí o TTL de 5 min E o single-flight: enquanto uma consulta está no ar, quem
 * chegar espera nela em vez de abrir a segunda.
 *
 * `is_internal = false` exclui a navegação da redação — o mesmo filtro de todas
 * as agregações do painel. (O acumulado de `article_views` não tem esse filtro;
 * é o desempate, não o critério.)
 */
const TOP_WINDOW_TTL_MS = 5 * 60_000;
const topWindowCache = new Map<number, { at: number; views: Map<string, number> }>();
const topWindowInflight = new Map<number, Promise<Map<string, number>>>();

function topWindowViews(days: number): Promise<Map<string, number>> {
  const hit = topWindowCache.get(days);
  if (hit && Date.now() - hit.at < TOP_WINDOW_TTL_MS) return Promise.resolve(hit.views);
  const flying = topWindowInflight.get(days);
  if (flying) return flying;

  const run = db
    .execute(sql`
      SELECT article_id, count(*)::int AS views
      FROM analytics_events
      WHERE type = 'pageview' AND is_internal = false
        AND article_id IS NOT NULL AND article_id <> ''
        AND ts >= ${new Date(Date.now() - days * 86_400_000)}
      GROUP BY article_id
    `)
    .then((r) => {
      const views = new Map<string, number>();
      for (const row of (r.rows ?? []) as { article_id?: string; views?: number }[]) {
        if (row.article_id) views.set(row.article_id, row.views ?? 0);
      }
      topWindowCache.set(days, { at: Date.now(), views });
      return views;
    })
    .catch((err: unknown) => {
      /* Falha de consulta não pode esvaziar a aba: sem a janela o ranking cai
         no acumulado, que vive em memória e não depende deste SELECT. E o
         resultado NÃO entra no cache — a próxima visita tenta de novo. */
      logger.error({ err }, "top news: agregacao da janela falhou");
      return new Map<string, number>();
    })
    .finally(() => { topWindowInflight.delete(days); });

  topWindowInflight.set(days, run);
  return run;
}

/** GET /api/articles/top — as mais lidas do blog (público).
 *
 *  Params ADITIVOS: `limit` (1–60, padrão 24) e `days` (janela em dias, padrão
 *  7; `0` = todos os tempos). Devolve `{ articles, days, total }`, onde cada
 *  artigo traz `rank` (1..N), `views` (acumulado) e `windowViews`.
 *
 *  Rota própria, e não um `sort=` do /api/articles, porque a ordem depende de
 *  uma consulta ao analytics que a lista comum não faz — e porque `windowViews`
 *  e `rank` não existem lá. Precisa ficar ANTES de `/:id`, senão o Express
 *  entrega "top" como se fosse slug de artigo. */
router.get("/top", async (req, res) => {
  const p = parseTopNewsParams(req.query as Record<string, unknown>);

  const allTime = store.getArticleViews();
  const allTimeOf = (id: string) => allTime[id]?.views ?? 0;

  const [published, winViews] = await Promise.all([
    articleService.getArticles().then((all) => all.filter((a) => a.status === "published")),
    p.days > 0 ? topWindowViews(p.days) : Promise.resolve(new Map<string, number>()),
  ]);
  const windowOf = (id: string) => winViews.get(id) ?? 0;

  const ranked = rankTopArticles(published, windowOf, allTimeOf, p.limit);

  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300, stale-while-revalidate=600");
  res.json({
    days: p.days,
    total: published.length,
    articles: ranked.map((a, i) => ({
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
      rank: i + 1,
      views: allTimeOf(a.id),
      windowViews: windowOf(a.id),
    })),
  });
});

/** GET /api/articles/:id — single article (public).
 *  Vem com `columnist` embutido (foto/nome/bio) quando o texto é assinado por um
 *  colunista: a página do artigo é SSR, e uma 2ª requisição para montar a
 *  assinatura atrasaria o conteúdo acima da dobra. */
router.get("/:id", async (req, res) => {
  const article = await articleService.getArticle(req.params.id ?? "");
  if (!article || article.status !== "published") {
    res.status(404).json({ error: "Article not found" }); return;
  }
  const c = article.columnistId ? store.getColumnist(article.columnistId) : null;
  const columnist = c && c.active
    ? { id: c.id, name: c.name, bio: c.bio, specialty: c.specialty, avatarBase64: c.avatarBase64 }
    : null;
  res.json({ article: { ...article, columnist } });
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
