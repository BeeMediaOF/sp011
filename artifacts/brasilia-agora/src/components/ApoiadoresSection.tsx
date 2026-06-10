import { useEffect, useRef } from "react";

const apoiadores = [
  { name: "PABESA",   logo: "/apoiador-pabesa.png",   href: "#", bg: "bg-white" },
  { name: "BeeTale",  logo: "/apoiador-beetale.png",  href: "#", bg: "bg-[#1a1a1a]" },
  { name: "Jámap",    logo: "/apoiador-jamap.png",    href: "#", bg: "bg-white" },
];

// Duplicamos para criar o efeito de loop infinito
const track = [...apoiadores, ...apoiadores, ...apoiadores];

export default function ApoiadoresSection() {
  const railRef = useRef<HTMLDivElement>(null);
  const posRef  = useRef(0);
  const rafRef  = useRef<number>(0);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    const SPEED = 0.5; // px por frame
    const singleWidth = rail.scrollWidth / 3; // 1 cópia

    function step() {
      posRef.current += SPEED;
      if (posRef.current >= singleWidth) posRef.current -= singleWidth;
      rail!.style.transform = `translateX(-${posRef.current}px)`;
      rafRef.current = requestAnimationFrame(step);
    }

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <section className="border-t border-gray-200 py-6 overflow-hidden">
      <div className="max-w-[1280px] mx-auto px-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-1 h-5 bg-[#c8102e]" />
          <h2 className="text-[13px] font-bold text-gray-400 uppercase tracking-widest">
            Apoiadores
          </h2>
        </div>
      </div>

      {/* Faixa com máscara de fade nas bordas */}
      <div className="relative">
        <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none" />

        <div className="overflow-hidden">
          <div ref={railRef} className="flex items-center gap-8 w-max will-change-transform">
            {track.map((ap, i) => (
              <a
                key={i}
                href={ap.href}
                target="_blank"
                rel="noreferrer"
                title={ap.name}
                className={`flex items-center justify-center shrink-0 h-[56px] px-6 rounded-lg border border-gray-100 ${ap.bg} hover:shadow-md transition-shadow duration-200`}
              >
                <img
                  src={ap.logo}
                  alt={ap.name}
                  className="h-[32px] w-auto object-contain select-none"
                  draggable={false}
                />
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
