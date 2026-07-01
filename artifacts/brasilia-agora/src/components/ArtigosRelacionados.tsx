import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import { safeTitleHtml } from "@/lib/sanitize";

interface RelatedArticle {
  id: string;
  slug?: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  category?: string;
  tag?: string;
  publishedAt?: string;
}

interface Props {
  currentSlug: string;
}

const categoryColor: Record<string, string> = {
  brasil: "#16a34a", mundo: "#6b21a8", politica: "#1d4ed8",
  economia: "#b45309", esporte: "#dc2626", cultura: "#0d9488",
  saude: "#16a34a", tecnologia: "#0284c7", df: "#0b3d91",
};

function Skeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="animate-pulse space-y-2">
          <div className="w-full aspect-[16/9] bg-gray-200 rounded" />
          <div className="h-3 bg-gray-200 rounded w-1/3" />
          <div className="h-4 bg-gray-200 rounded w-full" />
          <div className="h-4 bg-gray-200 rounded w-3/4" />
        </div>
      ))}
    </div>
  );
}

export default function ArtigosRelacionados({ currentSlug }: Props) {
  const [articles, setArticles] = useState<RelatedArticle[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!currentSlug) return;
    setLoading(true);
    fetch(`/api/articles/${encodeURIComponent(currentSlug)}/relacionados`)
      .then((r) => r.ok ? r.json() : { articles: [] })
      .then((data) => setArticles(data.articles ?? []))
      .catch(() => setArticles([]))
      .finally(() => setLoading(false));
  }, [currentSlug]);

  if (loading) return <Skeleton />;
  if (!articles.length) return null;

  return (
    <section className="mt-10 pt-8 border-t border-gray-100">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-1 h-5 bg-[#c8102e]" />
        <h2 className="text-[15px] font-black text-[#1a2448] uppercase tracking-wider">
          Relacionadas
        </h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {articles.map((a) => {
          const href  = `/artigo/${a.slug || a.id}`;
          const color = categoryColor[(a.category ?? "").toLowerCase()] ?? "#c8102e";
          const time  = a.publishedAt
            ? new Date(a.publishedAt).toLocaleDateString("pt-BR", { day: "numeric", month: "short" })
            : "";
          return (
            <Link key={a.id} href={href} className="group block">
              <div className="overflow-hidden bg-gray-100 rounded-sm mb-2 aspect-[16/9]">
                {a.imageUrl ? (
                  <img
                    src={a.imageUrl}
                    alt={a.title.replace(/<[^>]*>/g, "")}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-200" />
                )}
              </div>
              {a.tag && (
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color }}>
                  {a.tag}
                </span>
              )}
              <h3
                className="text-[13px] font-bold text-[#1a1a1a] leading-snug mt-0.5 group-hover:text-[#c8102e] transition-colors line-clamp-3"
                dangerouslySetInnerHTML={{ __html: safeTitleHtml(a.title) }}
              />
              {time && <p className="text-[11px] text-gray-400 mt-1">{time}</p>}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
