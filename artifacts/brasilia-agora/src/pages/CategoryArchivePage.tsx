import React, { useEffect, useState } from "react";
import TopBar from "../components/TopBar";
import Header from "../components/Header";
import Footer from "../components/Footer";
import CategoryPage from "../components/CategoryPage";
import type { Article as CategoryArticle } from "../components/CategoryPage";
import type { Article as ApiArticle } from "../lib/adminApi";
import { useAnalytics } from "../hooks/useAnalytics";

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return "—";
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60)     return "agora mesmo";
  if (diff < 3600)   return `${Math.floor(diff / 60)} min atrás`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)} h atrás`;
  if (diff < 172800) return "ontem";
  if (diff < 604800) return `${Math.floor(diff / 86400)} dias atrás`;
  return new Date(dateStr).toLocaleDateString("pt-BR");
}

interface Props {
  category: string;
  slug: string;
  color: string;
}

export default function CategoryArchivePage({ category, slug, color }: Props) {
  const [articles, setArticles] = useState<CategoryArticle[]>([]);
  const [loading, setLoading]   = useState(true);
  const { trackCategory } = useAnalytics();

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
            time:     relativeTime(a.publishedAt),
            imageUrl: a.imageUrl || "https://placehold.co/640x380/e5e7eb/9ca3af?text=Sem+imagem",
            tag:      a.tag || category,
            tagColor: color,
            author:   a.author,
          }));
        setArticles(filtered);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug, category, color]);

  const placeholder: CategoryArticle = {
    id:       "__placeholder__",
    title:    "Nenhuma notícia publicada nesta categoria ainda.",
    time:     "—",
    imageUrl: "https://placehold.co/640x380/e5e7eb/9ca3af?text=Em+breve",
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
            Carregando…
          </div>
        ) : (
          <CategoryPage
            category={category}
            color={color}
            articles={rest}
            featuredArticle={featured}
          />
        )}
      </main>
      <Footer />
    </div>
  );
}
