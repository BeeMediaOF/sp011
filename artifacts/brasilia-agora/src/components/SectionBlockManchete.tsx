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

export default function SectionBlockManchete({ title, color, href, articles }: Props) {
  const [hero, ...rest] = articles;
  const secondary = rest.slice(0, 3);
  if (!hero) return null;

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

        {/* Hero — full width with dark overlay */}
        <Link href={`/artigo/${hero.id}`} className="group block relative overflow-hidden rounded-sm mb-6">
          <div className="aspect-[21/9] bg-gray-200 overflow-hidden">
            <img
              src={imgSrc(hero.image)}
              alt={hero.title}
              className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-700"
              loading="lazy"
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

        {/* Secondary articles */}
        {secondary.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {secondary.map((item) => (
              <Link
                key={item.id}
                href={`/artigo/${item.id}`}
                className="group flex flex-col"
              >
                <div className="aspect-[16/9] overflow-hidden bg-gray-100 rounded-sm mb-3">
                  <img
                    src={imgSrc(item.image)}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-400"
                    loading="lazy"
                  />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color }}>
                  {item.chapeu}
                </span>
                <h4 className="text-[15px] font-bold text-[#1a1a1a] leading-snug group-hover:text-[#c8102e] transition-colors line-clamp-2">
                  {item.title}
                </h4>
                <p className="text-[11px] text-gray-400 mt-1.5">{item.time}</p>
              </Link>
            ))}
          </div>
        )}

      </div>
    </section>
  );
}
