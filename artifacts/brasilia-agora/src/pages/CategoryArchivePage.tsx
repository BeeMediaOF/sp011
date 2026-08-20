import React, { useEffect, useRef, useState } from "react";
import TopBar from "../components/TopBar";
import Header from "../components/Header";
import Footer from "../components/Footer";
import CategoryPage from "../components/CategoryPage";
import type { Article as CategoryArticle, MostReadItem } from "../components/CategoryPage";
import type { Article as ApiArticle } from "../lib/adminApi";
import { useAnalytics } from "../hooks/useAnalytics";
import { useSite } from "../hooks/useSite";
import { useT, relativeTimeOrDate } from "../lib/i18n";
import { articlesUrl, ARTICLES_CATEGORY_LIMIT } from "../lib/articlesQuery";
import { readCategorySeed } from "../lib/categorySeed";
import { categoryTitle } from "../lib/categoryRoutes";

interface Props {
  category: string;
  slug: string;
  color: string;
}

interface ArticlesPage { articles?: ApiArticle[]; total?: number }

export default function CategoryArchivePage({ category, slug, color }: Props) {
  const { trackCategory } = useAnalytics();
  const { t, lang, tz } = useT();
  const { settings } = useSite();

  /* Mapeamento do payload da API para o shape do CategoryPage. Fora do efeito
     para o "Carregar mais" reusar exatamente a mesma conversão. */
  const toCard = React.useCallback((a: ApiArticle): CategoryArticle => ({
    id:       a.id,
    slug:     a.slug || a.id,
    title:    a.title,
    subtitle: a.subtitle,
    time:     relativeTimeOrDate(a.publishedAt, lang, tz),
    imageUrl: a.imageUrl || `https://placehold.co/640x380/e5e7eb/9ca3af?text=${t("category.imgNone")}`,
    tag:      a.tag || category,
    tagColor: color,
    author:   a.author,
  // t é recriada a cada render; lang/tz/category/color são estáveis e bastam.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [category, color, lang, tz]);

  /* Semente do SSR (PRD-PERF-05): o fetch abaixo vive num useEffect, que o
     renderToString não executa — sem isto o servidor pintaria só o
     "Carregando…". Lida no inicializador do useState para que o 1º render do
     cliente (hidratação) seja idêntico ao do servidor. */
  const seed = readCategorySeed(slug);
  const [articles, setArticles] = useState<CategoryArticle[]>(() => (seed?.articles ?? []).map(toCard));
  const [mostRead, setMostRead] = useState<MostReadItem[]>(() => seed?.mostRead ?? []);
  const [loading, setLoading]   = useState(seed === null);
  const [total, setTotal]       = useState(seed?.total ?? 0);
  const [loadingMore, setLoadingMore] = useState(false);
  /* Qual slug já veio pronto do servidor: o primeiro efeito dele não pode
     rebuscar (o setLoading(true) apagaria da tela o conteúdo recém-hidratado). */
  const seededSlug = useRef<string | null>(seed ? slug : null);

  // Track category view when user lands on this page
  useEffect(() => {
    trackCategory(slug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  /* <title> da editoria — o mesmo texto que o SSR já escreveu no HTML. Sem
     isto o SEOHead (que roda antes, por ser irmão anterior na árvore) deixaria
     todas as editorias com o título genérico do portal. */
  useEffect(() => {
    const siteName = settings?.siteName;
    if (!siteName) return undefined;
    const prev = document.title;
    document.title = categoryTitle(category, siteName);
    return () => { document.title = prev; };
  }, [category, settings?.siteName]);

  useEffect(() => {
    if (seededSlug.current === slug) { seededSlug.current = null; return undefined; }
    /* Dois pedidos enxutos em vez de baixar (e parsear DUAS vezes) o acervo
       inteiro: o filtro por categoria — igualdade exata + fallback por tag para
       artigos legados — e a ordenação agora são do servidor (PRD-PERF-01). */
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(articlesUrl({ category: slug, limit: ARTICLES_CATEGORY_LIMIT, sort: "recent" }))
        .then((r) => r.json()) as Promise<ArticlesPage>,
      // "Mais lidas" da sidebar continua sendo do SITE INTEIRO, não da categoria.
      fetch(articlesUrl({ limit: 5, sort: "views" }))
        .then((r) => r.json()) as Promise<ArticlesPage>,
    ])
      .then(([list, top]) => {
        if (cancelled) return;
        setArticles((list.articles ?? []).map(toCard));
        setTotal(list.total ?? (list.articles ?? []).length);
        setMostRead((top.articles ?? [])
          .map((a): MostReadItem => ({ id: a.id, slug: a.slug || a.id, title: a.title })));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug, toCard]);

  /* A lista da categoria vem paginada (PRD-PERF-01) — sem isto, o acervo antigo
     ficaria inalcançável a partir da página de editoria. O botão já existia no
     CategoryPage, mas sem handler: não fazia nada. */
  function loadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
    fetch(articlesUrl({
      category: slug, limit: ARTICLES_CATEGORY_LIMIT, offset: articles.length, sort: "recent",
    }))
      .then((r) => r.json())
      .then((d: ArticlesPage) => {
        const next = (d.articles ?? []).map(toCard);
        // Concatena ignorando ids já presentes (artigo novo publicado entre as
        // páginas desloca o offset e reapareceria duplicado).
        setArticles((prev) => {
          const seen = new Set(prev.map((a) => a.id));
          return [...prev, ...next.filter((a) => !seen.has(a.id))];
        });
        if (typeof d.total === "number") setTotal(d.total);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }

  /* Cartão de ESTADO VAZIO — não é artigo. O id sintético `__placeholder__`
     virava `href="/artigo/__placeholder__"` no destaque do CategoryPage, e o
     HTML de toda editoria sem conteúdo publicava esse link. O `isEmpty` abaixo
     é o que diz ao componente para desenhar o cartão sem destino. */
  const placeholder: CategoryArticle = {
    id:       "empty-state",
    title:    t("category.empty"),
    time:     "—",
    imageUrl: `https://placehold.co/640x380/e5e7eb/9ca3af?text=${t("category.imgSoon")}`,
    tag:      category,
    tagColor: color,
  };

  const isEmpty  = articles.length === 0;
  const featured = articles[0] ?? placeholder;
  const rest     = articles.slice(1);

  return (
    <div className="min-h-screen w-full bg-[#fcfcfc] flex flex-col">
      <TopBar />
      <Header />
      <main className="flex-1 bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-gray-300 text-sm">
            {t("common.loading")}
          </div>
        ) : (
          <CategoryPage
            category={category}
            color={color}
            articles={rest}
            featuredArticle={featured}
            isEmpty={isEmpty}
            mostRead={mostRead}
            onLoadMore={loadMore}
            hasMore={articles.length < total}
            loadingMore={loadingMore}
          />
        )}
      </main>
      <Footer />
    </div>
  );
}
