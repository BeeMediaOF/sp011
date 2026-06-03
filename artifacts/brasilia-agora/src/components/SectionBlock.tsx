import { useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight } from "lucide-react";
import NewsCard from "./NewsCard";

interface SectionArticle {
  id: string;
  title: string;
  summary: string;
  image: string;
  chapeu: string;
  author: string;
  time: string;
}

interface SectionBlockProps {
  title: string;
  color: string;
  href: string;
  articles: SectionArticle[];
}

const PAGE_SIZE = 3;

export default function SectionBlock({ title, color, href, articles }: SectionBlockProps) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(articles.length / PAGE_SIZE);
  const visible = articles.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <section className="border-t border-gray-200 py-8">
      <div className="max-w-[1280px] mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-1 h-5" style={{ backgroundColor: color }} />
            <h2 className="text-[17px] font-bold text-[#1a1a1a] uppercase tracking-wider">{title}</h2>
          </div>

          <div className="flex items-center gap-3">
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="w-7 h-7 flex items-center justify-center border border-gray-300 text-gray-500 hover:border-gray-500 hover:text-[#1a1a1a] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Anterior"
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                  className="w-7 h-7 flex items-center justify-center border border-gray-300 text-gray-500 hover:border-gray-500 hover:text-[#1a1a1a] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Próximo"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            )}
            <Link
              href={href}
              className="text-[11px] font-bold hover:underline uppercase tracking-wider"
              style={{ color }}
            >
              Ver mais →
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 min-h-[280px]">
          {visible.map((article) => (
            <NewsCard
              key={article.id}
              id={article.id}
              title={article.title}
              summary={article.summary}
              image={article.image}
              chapeu={article.chapeu}
              chapeuColor={color}
              author={article.author}
              time={article.time}
            />
          ))}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1.5 mt-6">
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className="w-1.5 h-1.5 rounded-full transition-all"
                style={{ backgroundColor: i === page ? color : "#d1d5db" }}
                aria-label={`Página ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
