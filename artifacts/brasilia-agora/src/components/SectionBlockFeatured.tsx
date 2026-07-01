import React from "react";
import { Link } from "wouter";
import { useSite } from "../hooks/useSite";
import { buildSrcSet, HERO_WIDTHS, THUMB_WIDTHS } from "@/lib/newsImage";
import { safeTitleHtml } from "@/lib/sanitize";

interface Article {
  id: string;
  slug?: string;
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
  const { settings } = useSite();
  const bylineName = settings?.bylineName || settings?.siteName || "Redação";
  const bylineLogo = settings?.bylineLogoBase64 || settings?.logoBase64 || settings?.faviconBase64 || "/favicon.jpg";

  const [featured, ...rest] = articles;
  const sideItems = rest.slice(0, 4);

  if (!featured) return null;

  const imgSrc =
    typeof featured.image === "string"
      ? featured.image
      : (featured.image as { src?: string })?.src ?? "";

  const featuredSrcSet = buildSrcSet(imgSrc, HERO_WIDTHS);

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

          {/* Destaque principal — aspect-ratio reserva espaço → CLS=0 */}
          <Link
            href={`/artigo/${featured.slug || featured.id}`}
            className="group block lg:w-[58%] shrink-0"
          >
            <div className="relative overflow-hidden bg-gray-100" style={{ aspectRatio: "16/9" }}>
              <img
                src={imgSrc || undefined}
                srcSet={featuredSrcSet || undefined}
                sizes={featuredSrcSet ? "(max-width: 1024px) 100vw, 58vw" : undefined}
                alt={featured.title.replace(/<[^>]*>/g, "")}
                width={800}
                height={450}
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                loading="lazy"
                decoding="async"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <span
                  className="inline-block text-white text-[10px] font-bold px-2 py-0.5 mb-2 uppercase tracking-wider"
                  style={{ backgroundColor: color }}
                >
                  {featured.chapeu}
                </span>
                <h3 className="text-white font-black line-clamp-3 text-[27px] mr-[46px] mb-[11px] pt-[0px] pb-[0px] group-hover:text-red-300 transition-colors"
                  dangerouslySetInnerHTML={{ __html: safeTitleHtml(featured.title) }}
                />
              </div>
            </div>
            <div className="pt-3">
              <p className="text-gray-500 line-clamp-2 text-[18px]">
                {featured.summary}
              </p>
              <div className="flex items-center gap-2 mt-2 text-[11px] text-gray-400">
                <img src={bylineLogo} alt={bylineName} width={16} height={16} className="w-4 h-4 rounded-full object-cover shrink-0" loading="lazy" />
                <span className="font-medium text-gray-600">{bylineName}</span>
                <span className="w-1 h-1 rounded-full bg-gray-300" />
                <span>{featured.time}</span>
              </div>
            </div>
          </Link>

          {/* Lista lateral */}
          <div className="flex-1 flex flex-col divide-y divide-gray-100">
            {sideItems.map((item) => {
              const src =
                typeof item.image === "string"
                  ? item.image
                  : (item.image as { src?: string })?.src ?? "";
              const srcset = buildSrcSet(src, THUMB_WIDTHS);
              return (
                <Link
                  key={item.id}
                  href={`/artigo/${item.slug || item.id}`}
                  className="group flex gap-4 py-4 first:pt-0 last:pb-0 items-start"
                >
                  {/* Dimensões explícitas → CLS=0 */}
                  <div className="w-[96px] h-[68px] shrink-0 overflow-hidden bg-gray-100" style={{ position: "relative" }}>
                    <img
                      src={src || undefined}
                      srcSet={srcset || undefined}
                      sizes={srcset ? "96px" : undefined}
                      alt={item.title.replace(/<[^>]*>/g, "")}
                      width={96}
                      height={68}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-400"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider block mb-1"
                      style={{ color }}
                    >
                      {item.chapeu}
                    </span>
                    <h4 className="text-[16px] font-bold text-[#1a1a1a] leading-snug group-hover:text-[#c8102e] transition-colors line-clamp-2"
                      dangerouslySetInnerHTML={{ __html: safeTitleHtml(item.title) }}
                    />
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
