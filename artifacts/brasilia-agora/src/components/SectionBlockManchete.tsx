import { Link } from "wouter";
import { buildSrcSet, HERO_WIDTHS, CARD_WIDTHS } from "@/lib/newsImage";
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

function imgSrc(img: unknown): string {
  if (typeof img === "string") return img;
  return (img as { src?: string })?.src ?? "";
}

export default function SectionBlockManchete({ title, color, href, articles }: Props) {
  const [hero, ...rest] = articles;
  const secondary = rest.slice(0, 3);
  if (!hero) return null;

  const heroSrc = imgSrc(hero.image);
  const heroSrcSet = buildSrcSet(heroSrc, HERO_WIDTHS);

  return (
    <section className="border-t border-gray-200 py-8">
      <div className="max-w-[1280px] mx-auto px-4">

        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-1 h-5" style={{ backgroundColor: color }} />
            <h2 className="text-[17px] font-bold text-[#1a1a1a] uppercase tracking-wider">{title}</h2>
          </div>
          <Link href={href} className="text-[11px] font-bold hover:underline uppercase tracking-wider" style={{ color }}>
            Ver mais →
          </Link>
        </div>

        {/* Hero — aspect-ratio 21:9 reserva espaço → CLS=0 */}
        <Link href={`/artigo/${hero.slug || hero.id}`} className="group block relative overflow-hidden rounded-sm mb-6">
          <div className="bg-gray-200 overflow-hidden" style={{ aspectRatio: "21/9", position: "relative" }}>
            <img
              src={heroSrc || undefined}
              srcSet={heroSrcSet || undefined}
              sizes={heroSrcSet ? "100vw" : undefined}
              alt={hero.title}
              width={1200}
              height={514}
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-103 transition-transform duration-700"
              loading="lazy"
              decoding="async"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6 lg:p-10">
            <span
              className="inline-block text-white text-[11px] font-bold px-3 py-1 mb-3 uppercase tracking-widest"
              style={{ backgroundColor: color }}
            >
              {hero.chapeu}
            </span>
            <h3 className="text-white font-black text-[28px] lg:text-[42px] leading-tight max-w-4xl group-hover:text-gray-200 transition-colors line-clamp-3 mb-3">
              {hero.title}
            </h3>
            <p className="text-white/80 text-[15px] line-clamp-2 max-w-3xl hidden md:block">
              {hero.summary}
            </p>
            <p className="text-white/60 text-[12px] mt-2">{hero.time}</p>
          </div>
        </Link>

        {/* Secondary articles — aspect-ratio 16:9 → CLS=0 */}
        {secondary.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {secondary.map((item) => {
              const src = imgSrc(item.image);
              const srcset = buildSrcSet(src, CARD_WIDTHS);
              return (
                <Link
                  key={item.id}
                  href={`/artigo/${item.slug || item.id}`}
                  className="group flex flex-col"
                >
                  <div className="overflow-hidden bg-gray-100 rounded-sm mb-3" style={{ aspectRatio: "16/9", position: "relative" }}>
                    <img
                      src={src || undefined}
                      srcSet={srcset || undefined}
                      sizes={srcset ? "(max-width: 768px) 100vw, 33vw" : undefined}
                      alt={item.title.replace(/<[^>]*>/g, "")}
                      width={400}
                      height={225}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-400"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color }}>
                    {item.chapeu}
                  </span>
                  <h4 className="text-[15px] font-bold text-[#1a1a1a] leading-snug group-hover:text-[#c8102e] transition-colors line-clamp-2"
                    dangerouslySetInnerHTML={{ __html: safeTitleHtml(item.title) }}
                  />
                  <p className="text-[11px] text-gray-400 mt-1.5">{item.time}</p>
                </Link>
              );
            })}
          </div>
        )}

      </div>
    </section>
  );
}
