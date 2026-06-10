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

export default function SectionBlockCulturaLayout({ title, color, href, articles }: Props) {
  const [featured, ...rest] = articles;
  const listItems = rest.slice(0, 4);

  if (!featured) return null;

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

        {/* Layout 2 colunas */}
        <div className="flex flex-col lg:flex-row gap-8">

          {/* Destaque principal — imagem overlay */}
          <Link href={`/artigo/${featured.id}`} className="group flex lg:w-[46%] shrink-0 self-stretch">
            <div className="relative overflow-hidden w-full h-full min-h-[340px] bg-gray-100">
              <img
                src={imgSrc(featured.image)}
                alt={featured.title}
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-5">
                <span
                  className="inline-block text-white text-[10px] font-bold px-2 py-0.5 mb-3 uppercase tracking-wider"
                  style={{ backgroundColor: color }}
                >
                  {featured.chapeu}
                </span>
                <h3 className="text-white font-black text-[24px] leading-tight line-clamp-3 mb-2">
                  {featured.title}
                </h3>
                <p className="text-white/70 text-[13px] line-clamp-2">{featured.summary}</p>
                <div className="flex items-center gap-2 mt-3 text-[11px] text-white/60">
                  <span>{featured.author}</span>
                  <span className="w-1 h-1 rounded-full bg-white/40" />
                  <span>{featured.time}</span>
                </div>
              </div>
            </div>
          </Link>

          {/* Lista com miniatura — estilo referência */}
          <div className="flex-1 flex flex-col divide-y divide-gray-200">
            {listItems.map((item) => (
              <Link
                key={item.id}
                href={`/artigo/${item.id}`}
                className="group flex gap-5 py-5 first:pt-0 last:pb-0 items-start"
              >
                <div className="w-[200px] h-[134px] shrink-0 overflow-hidden bg-gray-100">
                  <img
                    src={imgSrc(item.image)}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-400"
                    loading="lazy"
                  />
                </div>
                <div className="flex-1 min-w-0 py-1">
                  <h4 className="font-black text-[#1a1a1a] text-[20px] leading-snug group-hover:text-[#c8102e] transition-colors line-clamp-3 mb-2" style={{ fontFamily: "'Merriweather', serif" }}>
                    {item.title}
                  </h4>
                  <div className="flex items-center gap-2 text-[12px] text-gray-500">
                    <span>Escrito por <strong className="font-bold text-[#1a1a1a]">{item.author || "Redação"}</strong></span>
                    <span className="text-gray-300">|</span>
                    <span>{item.time}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}
