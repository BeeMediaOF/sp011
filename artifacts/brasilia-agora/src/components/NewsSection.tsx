import { Link } from "wouter";

export interface NewsSectionArticle {
  id: string;
  title: string;
  time: string;
  img: string;
}

export interface NewsSectionProps {
  label: string;
  color: string;
  href: string;
  featuredArticle: {
    id: string;
    title: string;
    time: string;
    img: string;
  };
  articles: NewsSectionArticle[];
  bgGray?: boolean;
  variant?: "featured" | "grid";
}

export default function NewsSection({
  label,
  color,
  href,
  featuredArticle,
  articles,
  bgGray = false,
  variant = "featured",
}: NewsSectionProps) {
  const allCards = [featuredArticle, ...articles];

  return (
    <section
      className={`border-t border-gray-200 py-8 ${bgGray ? "bg-[#f7f7f7]" : "bg-white"}`}
    >
      <div className="max-w-[1280px] mx-auto px-4">
        {/* Section header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center">
            <div className="w-1.5 h-6 mr-3" style={{ backgroundColor: color }}></div>
            <h2 className="text-xl font-bold text-[#1a2448]">{label}</h2>
          </div>
          <Link
            href={href}
            className="text-xs font-bold hover:underline uppercase tracking-wide"
            style={{ color }}
          >
            VER MAIS →
          </Link>
        </div>

        {variant === "grid" ? (
          /* ── 4-card grid layout (like Destaques da Capital) ── */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {allCards.slice(0, 4).map((item) => (
              <Link
                key={item.id}
                href={`/artigo/${item.id}`}
                className="group cursor-pointer flex flex-col block"
                data-testid={`card-grid-${item.id}`}
              >
                <div className="relative overflow-hidden aspect-[16/10] mb-3">
                  <img
                    src={item.img}
                    alt={item.title.replace(/<[^>]*>/g, "")}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div
                    className="absolute top-0 left-0 text-white text-[10px] font-bold px-2 py-1"
                    style={{ backgroundColor: color }}
                  >
                    {label}
                  </div>
                </div>
                <h3 className="font-bold text-[#1a2448] text-[15px] leading-snug mb-1 group-hover:text-[#c8102e] transition-colors flex-grow"
                  dangerouslySetInnerHTML={{ __html: item.title }}
                />
                <span className="text-gray-500 text-xs">{item.time}</span>
              </Link>
            ))}
          </div>
        ) : (
          /* ── Featured left + 3 smaller right layout ── */
          <div className="flex flex-col lg:flex-row gap-4">
            <Link
              href={`/artigo/${featuredArticle.id}`}
              className="w-full lg:w-2/5 group cursor-pointer block shrink-0"
              data-testid={`card-featured-${featuredArticle.id}`}
            >
              <div className="relative h-[220px] overflow-hidden bg-gray-900">
                <img
                  src={featuredArticle.img}
                  alt={featuredArticle.title.replace(/<[^>]*>/g, "")}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent"></div>
                <div className="absolute bottom-0 left-0 p-4 w-full">
                  <span
                    className="inline-block text-white text-[10px] font-bold px-2 py-1 mb-2"
                    style={{ backgroundColor: color }}
                  >
                    {label}
                  </span>
                  <h3 className="text-white font-bold text-[15px] leading-snug group-hover:opacity-80 transition-opacity"
                    dangerouslySetInnerHTML={{ __html: featuredArticle.title }}
                  />
                  <span className="text-gray-400 text-xs mt-1 block">{featuredArticle.time}</span>
                </div>
              </div>
            </Link>

            <div className="w-full lg:w-3/5 flex flex-col divide-y divide-gray-200">
              {articles.slice(0, 3).map((item) => (
                <Link
                  key={item.id}
                  href={`/artigo/${item.id}`}
                  className="flex gap-3 group cursor-pointer py-3 first:pt-0 last:pb-0 block"
                  data-testid={`card-news-${item.id}`}
                >
                  <div className="w-[100px] h-[68px] shrink-0 overflow-hidden">
                    <img
                      src={item.img}
                      alt={item.title.replace(/<[^>]*>/g, "")}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                  <div className="flex flex-col justify-center min-w-0">
                    <span
                      className="text-[10px] font-bold mb-1 uppercase"
                      style={{ color }}
                    >
                      {label}
                    </span>
                    <h4 className="font-bold text-[#1a2448] text-sm leading-snug group-hover:text-[#c8102e] transition-colors line-clamp-2"
                      dangerouslySetInnerHTML={{ __html: item.title }}
                    />
                    <span className="text-gray-500 text-xs mt-1">{item.time}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
