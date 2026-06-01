import { Link } from "wouter";
import NewsCard from "./NewsCard";
import NewsSidebar from "./NewsSidebar";

interface SectionArticle {
  id: string;
  title: string;
  summary: string;
  image: string;
  chapeu: string;
  author: string;
  time: string;
}

interface TwoColumnSectionProps {
  title: string;
  color: string;
  href: string;
  articles: SectionArticle[];
}

export default function TwoColumnSection({ title, color, href, articles }: TwoColumnSectionProps) {
  return (
    <section className="border-t border-gray-200 py-8">
      <div className="max-w-[1280px] mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-1 h-5" style={{ backgroundColor: color }} />
            <h2 className="text-[17px] font-bold text-[#1a1a1a] uppercase tracking-wider">{title}</h2>
          </div>
          <Link
            href={href}
            className="text-[11px] font-bold hover:underline uppercase tracking-wider"
            style={{ color }}
          >
            Ver mais →
          </Link>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Main column - 4 cards */}
          <div className="w-full lg:w-3/4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {articles.slice(0, 6).map((article) => (
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
          </div>

          {/* Sidebar */}
          <div className="w-full lg:w-1/4">
            <NewsSidebar />
          </div>
        </div>
      </div>
    </section>
  );
}
