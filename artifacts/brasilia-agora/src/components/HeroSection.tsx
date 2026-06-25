import React, { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { useArticles } from "../hooks/useArticles";
import { useSite } from "../hooks/useSite";
import { buildSrcSet, HERO_WIDTHS, THUMB_WIDTHS } from "@/lib/newsImage";
import heroImg        from "../assets/images/hero.webp";
import trafficImg     from "../assets/images/traffic.webp";
import policeImg      from "../assets/images/police.webp";
import hospitalImg    from "../assets/images/hospital.webp";
import busImg         from "../assets/images/bus.webp";
import studentsImg    from "../assets/images/students.webp";
import politicaFeatImg from "../assets/images/politica_feat.webp";

// ─── Types ────────────────────────────────────────────────────────────────────
type FeaturedItem = {
  id: string;
  slug?: string;
  img: string;
  chapeu: string;
  chapeuColor: string;
  title: string;
  summary: string;
  time: string;
  author: string;
};

type SecondaryItem = {
  id: string;
  slug?: string;
  img: string;
  chapeu: string;
  chapeuColor: string;
  title: string;
};

// ─── Color map ────────────────────────────────────────────────────────────────
const CHAPEU_COLORS: Record<string, string> = {
  politica:   "#1d4ed8",
  economia:   "#b45309",
  educacao:   "#0b3d91",
  saude:      "#16a34a",
  seguranca:  "#dc2626",
  transporte: "#ea580c",
  trânsito:   "#ea580c",
  cultura:    "#0d9488",
  esportes:   "#dc2626",
  esporte:    "#dc2626",
  brasil:     "#16a34a",
  mundo:      "#6b21a8",
  df:         "#0b3d91",
  cidade:     "#0b3d91",
  tecnologia: "#0284c7",
  colunas:    "#7c3aed",
  geral:      "#6b7280",
};

const FALLBACK_IMGS = [heroImg, politicaFeatImg, studentsImg, trafficImg, policeImg, hospitalImg, busImg];

function chapeuColor(category: string): string {
  return CHAPEU_COLORS[category.toLowerCase()] ?? "#6b7280";
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  <  1) return "agora";
  if (mins  < 60) return `${mins} min atrás`;
  if (hours < 24) return `${hours} hora${hours > 1 ? "s" : ""} atrás`;
  return `${days} dia${days > 1 ? "s" : ""} atrás`;
}


// ─── Card de destaque ─────────────────────────────────────────────────────────
function FeaturedCard({
  item,
  priority = false,
  className = "",
}: {
  item: FeaturedItem;
  priority?: boolean;
  className?: string;
}) {
  const { settings } = useSite();
  const bylineName = settings?.bylineName || settings?.siteName || "Redação";
  const bylineLogo = settings?.bylineLogoBase64 || settings?.logoBase64 || settings?.faviconBase64 || "/favicon.jpg";

  // Gera srcset para imagens metroimg — browser escolhe a menor versão adequada
  const srcset = buildSrcSet(item.img, HERO_WIDTHS);

  return (
    <Link
      href={`/artigo/${item.slug || item.id}`}
      className={`group block relative overflow-hidden bg-gray-100 ${className}`}
    >
      <img
        src={item.img || undefined}
        srcSet={srcset || undefined}
        sizes={srcset
          ? "(max-width: 1024px) 100vw, 33vw"
          : undefined}
        alt={item.title.replace(/<[^>]*>/g, "")}
        width={800}
        height={534}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding={priority ? "sync" : "async"}
        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-5">
        <span
          className="inline-block text-white text-[10px] font-bold px-2.5 py-1 uppercase tracking-wider mb-2"
          style={{ backgroundColor: item.chapeuColor }}
        >
          {item.chapeu}
        </span>
        <h2 className="font-['Merriweather',serif] font-black text-white leading-tight text-[15px] sm:text-[17px] line-clamp-3 mb-2 transition-colors group-hover:text-gray-200"
          dangerouslySetInnerHTML={{ __html: item.title }}
        />
        <div className="flex items-center gap-2 text-[11px] text-white/60">
          <img src={bylineLogo} alt={bylineName} width={16} height={16} className="w-4 h-4 rounded-full object-cover shrink-0 opacity-80" loading="lazy" />
          <span className="font-medium">{bylineName}</span>
          <span className="w-1 h-1 rounded-full bg-white/40" />
          <span>{item.time}</span>
        </div>
      </div>
    </Link>
  );
}

// ─── Carrossel mobile ─────────────────────────────────────────────────────────
function MobileCarousel({ items }: { items: FeaturedItem[] }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const next = useCallback(() => setActive((i) => (i + 1) % items.length), [items.length]);
  const prev = useCallback(() => setActive((i) => (i - 1 + items.length) % items.length), [items.length]);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(next, 5000);
    return () => clearInterval(t);
  }, [next, paused]);

  const touchStartX = React.useRef<number>(0);
  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]!.clientX;
    setPaused(true);
  }
  function onTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0]!.clientX - touchStartX.current;
    if (Math.abs(dx) > 40) dx < 0 ? next() : prev();
    setTimeout(() => setPaused(false), 3000);
  }

  return (
    /*
      Container com aspect-ratio fixo → reserva espaço antes de carregar.
      No mobile o hero ocupa a viewport inteira, 16:9 é a proporção correta.
    */
    <div
      className="relative overflow-hidden"
      style={{ aspectRatio: "16/9" }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="flex h-full transition-transform duration-500 ease-in-out"
        style={{ transform: `translateX(-${active * 100}%)` }}
      >
        {items.map((item, idx) => (
          <div key={item.id} className="w-full shrink-0 h-full">
            <FeaturedCard item={item} priority={idx === 0} className="h-full" />
          </div>
        ))}
      </div>

      <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-10">
        {items.map((_, i) => (
          <button
            key={i}
            onClick={() => { setActive(i); setPaused(true); setTimeout(() => setPaused(false), 5000); }}
            className={`rounded-full transition-all duration-300 ${i === active ? "bg-white w-5 h-1.5" : "bg-white/40 w-1.5 h-1.5"}`}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>

      <button onClick={() => { prev(); setPaused(true); setTimeout(() => setPaused(false), 5000); }}
        className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm transition-colors z-10 hidden sm:flex"
        aria-label="Anterior">‹</button>
      <button onClick={() => { next(); setPaused(true); setTimeout(() => setPaused(false), 5000); }}
        className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm transition-colors z-10 hidden sm:flex"
        aria-label="Próximo">›</button>
    </div>
  );
}

// ─── Layout desktop ───────────────────────────────────────────────────────────
function DesktopGrid({ items }: { items: FeaturedItem[] }) {
  return (
    /*
      Grid com altura fixa — reserva espaço antes das imagens carregarem.
      h-[420px] garante CLS=0 nesse bloco.
    */
    <div className="grid grid-cols-3 gap-3 h-[420px]">
      {items.map((item, idx) => (
        <FeaturedCard key={item.id} item={item} priority={idx === 0} className="h-full" />
      ))}
    </div>
  );
}

// ─── Mobile horizontal carousel for secondary items ───────────────────────────
function SecondaryCarousel({ items }: { items: SecondaryItem[] }) {
  return (
    <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-1 -mx-4 px-4">
      {items.map((item) => {
        const srcset = buildSrcSet(item.img, THUMB_WIDTHS);
        return (
          <a
            key={item.id}
            href={`/artigo/${item.slug || item.id}`}
            className="group flex gap-2.5 items-start snap-start shrink-0 w-[72vw] max-w-[280px]"
          >
            {/* Container com dimensões explícitas → CLS=0 */}
            <div className="w-[72px] h-[52px] shrink-0 overflow-hidden bg-gray-100 rounded-sm" style={{ position: "relative" }}>
              <img
                src={item.img || undefined}
                srcSet={srcset || undefined}
                sizes={srcset ? "72px" : undefined}
                alt={item.chapeu}
                width={72}
                height={52}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            </div>
            <div className="flex-1 min-w-0">
              <span
                className="text-[11px] font-bold uppercase tracking-wider block mb-1"
                style={{ color: item.chapeuColor }}
              >
                {item.chapeu}
              </span>
              <h3
                className="font-['Merriweather',serif] text-[13px] font-bold leading-snug group-hover:text-[#c8102e] transition-colors line-clamp-3 text-[#1a1a1a]"
                dangerouslySetInnerHTML={{ __html: item.title }}
              />
            </div>
          </a>
        );
      })}
    </div>
  );
}

// ─── HeroSection principal ────────────────────────────────────────────────────
export default function HeroSection() {
  const { articles, loading } = useArticles();
  const { settings } = useSite();

  const sorted = [...articles].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  const featured: FeaturedItem[] = sorted.slice(0, 3).map((a, i) => ({
    id:          a.id,
    slug:        a.slug || a.id,
    img:         a.imageUrl || FALLBACK_IMGS[i % FALLBACK_IMGS.length]!,
    chapeu:      a.tag || a.category.toUpperCase(),
    chapeuColor: chapeuColor(a.category),
    title:       a.title,
    summary:     a.subtitle,
    time:        relativeTime(a.publishedAt),
    author:      a.author,
  }));

  const secondary: SecondaryItem[] = sorted.slice(3, 7).map((a, i) => ({
    id:          a.id,
    slug:        a.slug || a.id,
    img:         a.imageUrl || FALLBACK_IMGS[(i + 3) % FALLBACK_IMGS.length]!,
    chapeu:      a.tag || a.category.toUpperCase(),
    chapeuColor: chapeuColor(a.category),
    title:       a.title,
  }));

  if (!loading && featured.length === 0) return null;

  return (
    <section className="max-w-[1280px] mx-auto px-4 py-6">
      <div className="block lg:hidden mb-5">
        {featured.length > 0 && <MobileCarousel items={featured} />}
      </div>

      <div className="hidden lg:block mb-5">
        {featured.length > 0 && <DesktopGrid items={featured} />}
      </div>

      {(settings?.showHeroStrip ?? true) && secondary.length > 0 && (
        <>
          {/* Mobile: horizontal snap carousel */}
          <div className="lg:hidden border-t border-gray-200 pt-5">
            <SecondaryCarousel items={secondary} />
          </div>

          {/* Desktop: 4-column grid */}
          <div className="hidden lg:grid lg:grid-cols-4 gap-4 border-t border-gray-200 pt-5">
            {secondary.map((item) => {
              const srcset = buildSrcSet(item.img, THUMB_WIDTHS);
              return (
                <Link key={item.id} href={`/artigo/${item.slug || item.id}`} className="group flex gap-3 items-start">
                  {/* Dimensões explícitas → CLS=0 */}
                  <div className="w-[100px] h-[72px] shrink-0 overflow-hidden bg-gray-100" style={{ position: "relative" }}>
                    <img
                      src={item.img || undefined}
                      srcSet={srcset || undefined}
                      sizes={srcset ? "100px" : undefined}
                      alt={item.chapeu}
                      width={100}
                      height={72}
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span
                      className="text-[11px] font-bold uppercase tracking-wider block mb-1"
                      style={{ color: item.chapeuColor }}
                    >
                      {item.chapeu}
                    </span>
                    <h3 className="font-['Merriweather',serif] text-[14px] font-bold leading-snug group-hover:text-[#c8102e] transition-colors line-clamp-3 text-[#1a1a1a]"
                      dangerouslySetInnerHTML={{ __html: item.title }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
