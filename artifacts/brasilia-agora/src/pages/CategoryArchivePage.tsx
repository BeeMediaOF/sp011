import React, { useEffect, useState } from "react";
import TopBar from "../components/TopBar";
import Header from "../components/Header";
import Footer from "../components/Footer";
import CategoryPage from "../components/CategoryPage";
import type { Article as CategoryArticle, MostReadItem } from "../components/CategoryPage";
import type { Article as ApiArticle } from "../lib/adminApi";
import { useAnalytics } from "../hooks/useAnalytics";
import { useT, relativeTimeOrDate } from "../lib/i18n";

interface Props {
  category: string;
  slug: string;
  color: string;
}

export default function CategoryArchivePage({ category, slug, color }: Props) {
  const [articles, setArticles] = useState<CategoryArticle[]>([]);
  const [mostRead, setMostRead] = useState<MostReadItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const { trackCategory } = useAnalytics();
  const { t, lang, tz } = useT();

  // Track category view when user lands on this page
  useEffect(() => {
    trackCategory(slug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    fetch("/api/articles")
      .then((r) => r.json())
      .then((d: { articles: ApiArticle[] }) => {
        const filtered = (d.articles ?? [])
          .filter((a) => {
            const cat = (a.category ?? "").toLowerCase();
            const tag = (a.tag ?? "").toLowerCase();
            return cat === slug || cat.includes(slug) || tag.includes(slug);
          })
          .sort((a, b) =>
            new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
          )
          .map((a): CategoryArticle => ({
            id:       a.id,
            slug:     a.slug || a.id,
            title:    a.title,
            subtitle: a.subtitle,
            time:     relativeTimeOrDate(a.publishedAt, lang, tz),
            imageUrl: a.imageUrl || `https://placehold.co/640x380/e5e7eb/9ca3af?text=${t("category.imgNone")}`,
            tag:      a.tag || category,
            tagColor: color,
            author:   a.author,
          }));
        setArticles(filtered);
        // Mais lidas REAIS do site inteiro (por views), para a sidebar
        const top = [...(d.articles ?? [])]
          .sort((a, b) =>
            ((b as ApiArticle & { views?: number }).views ?? 0) -
            ((a as ApiArticle & { views?: number }).views ?? 0))
          .slice(0, 5)
          .map((a): MostReadItem => ({ id: a.id, slug: a.slug || a.id, title: a.title }));
        setMostRead(top);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // t é recriada a cada render (deixá-la nas deps loopar ia o fetch); lang/tz
  // são strings estáveis e já forçam o refetch quando o idioma/fuso muda.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, category, color, lang, tz]);

  const placeholder: CategoryArticle = {
    id:       "__placeholder__",
    title:    t("category.empty"),
    time:     "—",
    imageUrl: `https://placehold.co/640x380/e5e7eb/9ca3af?text=${t("category.imgSoon")}`,
    tag:      category,
    tagColor: color,
  };

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
            mostRead={mostRead}
          />
        )}
      </main>
      <Footer />
    </div>
  );
}
