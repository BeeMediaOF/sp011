import React, { useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight } from "lucide-react";

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

const CAROUSEL_SIZE = 5;

function imgSrc(img: unknown): string {
  if (typeof img === "string") return img;
  return (img as { src?: string })?.src ?? "";
}

export default function SectionBlockDuploDestaque({ title, color, href, articles }: Props) {
  const [page, setPage] = useState(0);

  const featured = articles.slice(0, 2);
  const rest = articles.slice(2);
  const totalPages = Math.ceil(rest.length / CAROUSEL_SIZE);
  const visible = rest.slice(page * CAROUSEL_SIZE, page * CAROUSEL_SIZE + CAROUSEL_SIZE);

  return (
    <section className="border-t border-gray-200 py-8">
      <div className="max-w-[1280px] mx-auto px-4">

        {/* Cabeçalho */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-1 h-5" style={{ backgroundColor: color }} />
            <h2 className="text-[17px] font-bold text-[#1a1a1a] uppercase tracking-wider">{title}</h2>
          </div>
          <Link href={href} className="text-[11px] font-bold hover:underline uppercase tracking-wider" style={{ color }}>
            Ver mais →
          </Link>
        </div>

        {/* 2 destaques grandes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
          {featured.map((art) => (
            <Link key={art.id} href={`/artigo/${art.id}`} className="group block">
              <div className="relative overflow-hidden aspect-[16/9] bg-gray-100">
                <img
                  src={imgSrc(art.image)}
                  alt={art.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <span
                    className="inline-block text-white text-[10px] font-bold px-2 py-0.5 mb-2 uppercase tracking-wider"
                    style={{ backgroundColor: color }}
                  >
                    {art.chapeu}
                  </span>
                  <h3 className="text-white font-black text-[18px] leading-snug line-clamp-2">
                    {art.title}
                  </h3>
                  <p className="text-white/70 text-[12px] mt-1 line-clamp-1">{art.summary}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Carrossel de 5 notícias menores */}
        {rest.length > 0 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {visible.map((art) => (
                <Link key={art.id} href={`/artigo/${art.id}`} className="group block">
                  <div className="aspect-[4/3] overflow-hidden bg-gray-100 mb-2">
                    <img
                      src={imgSrc(art.image)}
                      alt={art.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-400"
                      loading="lazy"
                    />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color }}>
                    {art.chapeu}
                  </span>
                  <h4 className="text-[13px] font-bold text-[#1a1a1a] leading-snug group-hover:text-[#c8102e] transition-colors line-clamp-3">
                    {art.title}
                  </h4>
                  <p className="text-[10px] text-gray-400 mt-1">{art.time}</p>
                </Link>
              ))}
            </div>

            {/* Navegação do carrossel */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-5">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="w-7 h-7 flex items-center justify-center border border-gray-300 text-gray-500 hover:border-gray-500 hover:text-[#1a1a1a] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={15} />
                </button>
                <div className="flex gap-1.5">
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setPage(i)}
                      className="w-1.5 h-1.5 rounded-full transition-all"
                      style={{ backgroundColor: i === page ? color : "#d1d5db" }}
                    />
                  ))}
                </div>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                  className="w-7 h-7 flex items-center justify-center border border-gray-300 text-gray-500 hover:border-gray-500 hover:text-[#1a1a1a] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            )}
          </>
        )}

      </div>
    </section>
  );
}
