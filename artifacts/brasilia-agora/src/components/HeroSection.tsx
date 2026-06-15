import React, { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import heroImg        from "../assets/images/hero.webp";
import trafficImg     from "../assets/images/traffic.webp";
import policeImg      from "../assets/images/police.webp";
import hospitalImg    from "../assets/images/hospital.webp";
import busImg         from "../assets/images/bus.webp";
import studentsImg    from "../assets/images/students.webp";
import politicaFeatImg from "../assets/images/politica_feat.webp";

const featured = [
  {
    id: "hero-1",
    img: heroImg,
    chapeu: "Política",
    chapeuColor: "#1d4ed8",
    title: "Câmara Legislativa aprova projeto que cria o programa Morar DF",
    summary: "Iniciativa prevê subsídio para famílias de baixa renda adquirirem a casa própria no Distrito Federal.",
    time: "2 horas atrás",
  },
  {
    id: "hero-2",
    img: politicaFeatImg,
    chapeu: "Economia",
    chapeuColor: "#b45309",
    title: "DF bate recorde de exportações no primeiro semestre e lidera crescimento nacional",
    summary: "Brasília é eleita melhor cidade para investir no Brasil em 2025 segundo ranking nacional.",
    time: "3 horas atrás",
  },
  {
    id: "hero-3",
    img: studentsImg,
    chapeu: "Educação",
    chapeuColor: "#0b3d91",
    title: "Escolas públicas do DF alcançam melhores índices no IDEB 2023",
    summary: "Resultado coloca o Distrito Federal entre os três melhores sistemas educacionais do país.",
    time: "5 horas atrás",
  },
];

const secondary = [
  { id: "df-3",  img: trafficImg,  chapeu: "Trânsito",  chapeuColor: "#ea580c", title: "Obras no Eixão alteram trânsito neste fim de semana em Brasília" },
  { id: "pol-3", img: policeImg,   chapeu: "Segurança", chapeuColor: "#dc2626", title: "Polícia Civil prende grupo suspeito de furtos no Plano Piloto" },
  { id: "sau-1", img: hospitalImg, chapeu: "Saúde",     chapeuColor: "#16a34a", title: "Hospitais do DF registram queda nos casos de dengue em maio" },
  { id: "df-4",  img: busImg,      chapeu: "DF",        chapeuColor: "#0b3d91", title: "GDF anuncia mais 124 ônibus para reforçar o transporte público" },
];

// ─── Card de destaque (reutilizado desktop + mobile) ──────────────────────────
function FeaturedCard({
  item,
  priority = false,
  className = "",
}: {
  item: typeof featured[number];
  priority?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={`/artigo/${item.id}`}
      className={`group block relative overflow-hidden bg-gray-100 ${className}`}
    >
      <img
        src={item.img}
        alt={item.title}
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
        <h2 className="font-['Merriweather',serif] font-black text-white leading-tight line-clamp-3 mb-1.5 transition-colors group-hover:text-gray-200">
          {item.title}
        </h2>
        <p className="text-white/65 text-[12px] line-clamp-2 mb-2 hidden sm:block">{item.summary}</p>
        <div className="flex items-center gap-2 text-[11px] text-white/60">
          <img src="/favicon.jpg" alt="SBC Agora" className="w-4 h-4 rounded-full object-cover shrink-0 opacity-80" loading="lazy" />
          <span className="font-medium">Redação</span>
          <span className="w-1 h-1 rounded-full bg-white/40" />
          <span>{item.time}</span>
        </div>
      </div>
    </Link>
  );
}

// ─── Carrossel mobile ─────────────────────────────────────────────────────────
function MobileCarousel() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const next = useCallback(() => setActive((i) => (i + 1) % featured.length), []);
  const prev = useCallback(() => setActive((i) => (i - 1 + featured.length) % featured.length), []);

  // Auto-advance every 5 s (pauses on touch)
  useEffect(() => {
    if (paused) return;
    const t = setInterval(next, 5000);
    return () => clearInterval(t);
  }, [next, paused]);

  // Swipe support
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
    <div
      className="relative overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Slides */}
      <div
        className="flex transition-transform duration-500 ease-in-out"
        style={{ transform: `translateX(-${active * 100}%)` }}
      >
        {featured.map((item, idx) => (
          <div key={item.id} className="w-full shrink-0">
            <FeaturedCard item={item} priority={idx === 0} className="h-[320px]" />
          </div>
        ))}
      </div>

      {/* Dot indicators */}
      <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-10">
        {featured.map((_, i) => (
          <button
            key={i}
            onClick={() => { setActive(i); setPaused(true); setTimeout(() => setPaused(false), 5000); }}
            className={`rounded-full transition-all duration-300 ${i === active ? "bg-white w-5 h-1.5" : "bg-white/40 w-1.5 h-1.5"}`}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>

      {/* Prev / Next arrows (hidden on very small screens) */}
      <button
        onClick={() => { prev(); setPaused(true); setTimeout(() => setPaused(false), 5000); }}
        className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm transition-colors z-10 hidden sm:flex"
        aria-label="Anterior"
      >‹</button>
      <button
        onClick={() => { next(); setPaused(true); setTimeout(() => setPaused(false), 5000); }}
        className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm transition-colors z-10 hidden sm:flex"
        aria-label="Próximo"
      >›</button>
    </div>
  );
}

// ─── Layout desktop: 3 cards de igual tamanho lado a lado ───────────────────
function DesktopGrid() {
  return (
    <div className="grid grid-cols-3 gap-3 h-[420px]">
      {featured.map((item, idx) => (
        <FeaturedCard key={item.id} item={item} priority={idx === 0} className="h-full" />
      ))}
    </div>
  );
}

// ─── HeroSection principal ────────────────────────────────────────────────────
export default function HeroSection() {
  return (
    <section className="max-w-[1280px] mx-auto px-4 py-6">

      {/* Mobile: carrossel rotativo */}
      <div className="block lg:hidden mb-5">
        <MobileCarousel />
      </div>

      {/* Desktop: 1 grande + 2 empilhados */}
      <div className="hidden lg:block mb-5">
        <DesktopGrid />
      </div>

      {/* Faixa de secundárias */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 border-t border-gray-200 pt-5">
        {secondary.map((item) => (
          <Link key={item.id} href={`/artigo/${item.id}`} className="group flex gap-3 items-start">
            <div className="w-[72px] h-[52px] sm:w-[100px] sm:h-[72px] shrink-0 overflow-hidden bg-gray-100">
              <img
                src={item.img}
                alt={item.chapeu}
                width={100}
                height={72}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            </div>
            <div className="flex-1 min-w-0">
              <span
                className="text-[11px] font-bold uppercase tracking-wider block mb-1"
                style={{ color: item.chapeuColor }}
              >
                {item.chapeu}
              </span>
              <h3 className="font-['Merriweather',serif] text-[14px] font-bold leading-snug group-hover:text-[#c8102e] transition-colors line-clamp-3 text-[#1a1a1a]">
                {item.title}
              </h3>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
