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

function imgSrc(img: unknown): string {
  if (typeof img === "string") return img;
  return (img as { src?: string })?.src ?? "";
}

export default function SectionBlockDuploDestaque({ title, color, href, articles }: Props) {
  const featured = articles.slice(0, 2);
  const strip = articles.slice(2, 6);

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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          {featured.map((art) => (
            <Link key={art.id} href={`/artigo/${art.id}`} className="group block">
              <div className="relative overflow-hidden bg-gray-100 h-[380px]">
                <img
                  src={imgSrc(art.image)}
                  alt={art.title}
                  className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <span
                    className="inline-block text-white text-[11px] font-bold px-3 py-1 uppercase tracking-wider mb-3"
                    style={{ backgroundColor: color }}
                  >
                    {art.chapeu}
                  </span>
                  <h3
                    className="text-white font-black text-[24px] leading-tight line-clamp-3 mb-2"
                    style={{ fontFamily: "'Merriweather', serif" }}
                  >
                    {art.title}
                  </h3>
                  <p className="text-white/70 text-[13px] line-clamp-2 mb-3">{art.summary}</p>
                  <div className="flex items-center gap-2 text-[11px] text-white/50">
                    <span>{art.author}</span>
                    <span className="w-1 h-1 rounded-full bg-white/40" />
                    <span>{art.time}</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Faixa de 4 notícias menores */}
        {strip.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 border-t border-gray-200 pt-5">
            {strip.map((art) => (
              <Link key={art.id} href={`/artigo/${art.id}`} className="group flex gap-4 items-start">
                <div className="w-[100px] h-[72px] shrink-0 overflow-hidden bg-gray-100">
                  <img
                    src={imgSrc(art.image)}
                    alt={art.chapeu}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <span
                    className="text-[11px] font-bold uppercase tracking-wider block mb-1"
                    style={{ color }}
                  >
                    {art.chapeu}
                  </span>
                  <h4 className="text-[15px] font-bold leading-snug group-hover:text-[#1d4ed8] transition-colors line-clamp-3 text-[#1a1a1a]">
                    {art.title}
                  </h4>
                </div>
              </Link>
            ))}
          </div>
        )}

      </div>
    </section>
  );
}
