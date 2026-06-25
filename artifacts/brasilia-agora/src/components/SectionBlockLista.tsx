import { Link } from "wouter";
import { buildSrcSet, THUMB_WIDTHS } from "@/lib/newsImage";

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

export default function SectionBlockLista({ title, color, href, articles }: Props) {
  const items = articles.slice(0, 7);
  if (items.length === 0) return null;

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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y divide-gray-100 md:divide-y-0">
          {items.map((item, idx) => {
            const src = imgSrc(item.image);
            const srcset = buildSrcSet(src, THUMB_WIDTHS);
            return (
              <Link
                key={item.id}
                href={`/artigo/${item.slug || item.id}`}
                className="group flex items-start gap-4 py-4 md:py-3 md:border-b md:border-gray-100 hover:bg-gray-50/50 transition-colors px-2 -mx-2 rounded"
              >
                <span
                  className="text-[22px] font-black tabular-nums shrink-0 w-7 text-center leading-none mt-1"
                  style={{ color }}
                >
                  {idx + 1}
                </span>
                {/* Dimensões explícitas → CLS=0 */}
                <div className="w-[80px] h-[58px] shrink-0 overflow-hidden bg-gray-100 rounded" style={{ position: "relative" }}>
                  <img
                    src={src || undefined}
                    srcSet={srcset || undefined}
                    sizes={srcset ? "80px" : undefined}
                    alt={item.title.replace(/<[^>]*>/g, "")}
                    width={80}
                    height={58}
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider block mb-0.5"
                    style={{ color }}
                  >
                    {item.chapeu}
                  </span>
                  <h4 className="text-[14px] font-bold text-[#1a1a1a] leading-snug group-hover:text-[#c8102e] transition-colors line-clamp-2"
                    dangerouslySetInnerHTML={{ __html: item.title }}
                  />
                  <p className="text-[11px] text-gray-400 mt-1">{item.time}</p>
                </div>
              </Link>
            );
          })}
        </div>

      </div>
    </section>
  );
}
