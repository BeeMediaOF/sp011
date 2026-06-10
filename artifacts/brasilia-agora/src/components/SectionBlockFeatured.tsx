import React from "react";
import { Link } from "wouter";

interface Article {
  id: string;
  title: string;
  summary: string;
  image: string;
  chapeu: string;
  author: string;
  time: string;
}

interface Props {
  title: string;
  color: string;
  href: string;
  articles: Article[];
}

export default function SectionBlockFeatured({ title, color, href, articles }: Props) {
  const [featured, ...rest] = articles;
  const sideItems = rest.slice(0, 3);

  if (!featured) return null;

  const imgSrc =
    typeof featured.image === "string"
      ? featured.image
      : (featured.image as { src?: string })?.src ?? "";

  return (
    <section className="border-t border-gray-200 py-8">
      <div className="max-w-[1280px] mx-auto px-4">

        {/* Cabeçalho da seção */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-1 h-5" style={{ backgroundColor: color }} />
            <h2 className="text-[17px] font-bold text-[#1a1a1a] uppercase tracking-wider">
              {title}
            </h2>
          </div>
          <Link
            href={href}
            className="text-[11px] font-bold hover:underline uppercase tracking-wider"
            style={{ color }}
          >
            Ver mais →
          </Link>
        </div>

        {/* Layout: destaque (esq) + lista (dir) */}
        <div className="flex flex-col lg:flex-row gap-6">

          {/* Destaque principal */}
          <Link
            href={`/artigo/${featured.id}`}
            className="group block lg:w-[58%] shrink-0"
          >
            <div className="relative overflow-hidden aspect-[16/9] bg-gray-100">
              <img
                src={imgSrc}
                alt={featured.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <span
                  className="inline-block text-white text-[10px] font-bold px-2 py-0.5 mb-2 uppercase tracking-wider"
                  style={{ backgroundColor: color }}
                >
                  {featured.chapeu}
                </span>
                <h3 className="text-white font-black text-[18px] leading-snug line-clamp-3">
                  {featured.title}
                </h3>
              </div>
            </div>
            <div className="pt-3">
              <p className="text-gray-500 text-[13px] leading-relaxed line-clamp-2">
                {featured.summary}
              </p>
              <div className="flex items-center gap-2 mt-2 text-[11px] text-gray-400">
                <span>{featured.author}</span>
                <span className="w-1 h-1 rounded-full bg-gray-300" />
                <span>{featured.time}</span>
              </div>
            </div>
          </Link>

          {/* Lista lateral — 3 notícias */}
          <div className="flex-1 flex flex-col divide-y divide-gray-100">
            {sideItems.map((item) => {
              const src =
                typeof item.image === "string"
                  ? item.image
                  : (item.image as { src?: string })?.src ?? "";
              return (
                <Link
                  key={item.id}
                  href={`/artigo/${item.id}`}
                  className="group flex gap-4 py-4 first:pt-0 last:pb-0 items-start"
                >
                  <div className="w-[96px] h-[68px] shrink-0 overflow-hidden bg-gray-100">
                    <img
                      src={src}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-400"
                      loading="lazy"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider block mb-1"
                      style={{ color }}
                    >
                      {item.chapeu}
                    </span>
                    <h4 className="text-[14px] font-bold text-[#1a1a1a] leading-snug group-hover:text-[#c8102e] transition-colors line-clamp-2">
                      {item.title}
                    </h4>
                    <p className="text-[11px] text-gray-400 mt-1">{item.time}</p>
                  </div>
                </Link>
              );
            })}
          </div>

        </div>
      </div>
    </section>
  );
}
