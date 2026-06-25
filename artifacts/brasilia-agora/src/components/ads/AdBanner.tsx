import React, { useState, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAds, trackClick, trackImpression, type AdSlotKey } from "./useAds";

interface Props {
  slot: AdSlotKey;
  interval?: number;
  /**
   * CSS aspect-ratio do container — reserva espaço fixo (skeleton + banner real)
   * para CLS = 0. Deve refletir o formato IAB do slot.
   * Padrão: "728/90" (leaderboard IAB).
   */
  aspectRatio?: string;
  /** @deprecated — mantido para retrocompat; use aspectRatio */
  skeletonHeight?: number;
  /**
   * Se true, imagem carrega eager + fetchpriority=high.
   * Usar APENAS no banner acima da dobra (slot_08 na home).
   */
  priority?: boolean;
}

export default function AdBanner({
  slot,
  interval = 5000,
  aspectRatio = "728/90",
  priority = false,
}: Props) {
  const { getSlotAll, loading } = useAds();
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);

  const items = getSlotAll(slot);

  const goTo = useCallback((next: number) => {
    setFading(true);
    setTimeout(() => {
      setIndex(next);
      setFading(false);
    }, 220);
  }, []);

  const prev = useCallback(() => {
    goTo((index - 1 + items.length) % items.length);
  }, [goTo, index, items.length]);

  const next = useCallback(() => {
    goTo((index + 1) % items.length);
  }, [goTo, index, items.length]);

  useEffect(() => {
    if (items.length < 2) return;
    const timer = setInterval(() => {
      setIndex((i) => {
        setFading(true);
        setTimeout(() => setFading(false), 220);
        return (i + 1) % items.length;
      });
    }, interval);
    return () => clearInterval(timer);
  }, [items.length, interval]);

  useEffect(() => {
    if (index >= items.length && items.length > 0) setIndex(0);
  }, [index, items.length]);

  const trackedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const ad = items[index];
    if (ad && !trackedRef.current.has(ad.id)) {
      trackedRef.current.add(ad.id);
      void trackImpression(ad.id);
    }
  }, [index, items]);

  /*
   * SKELETON — mesma proporção (aspectRatio) que o banner real.
   * Isso garante que o espaço reservado seja idêntico ao banner carregado,
   * eliminando CLS quando o banner substitui o skeleton.
   */
  if (loading) {
    return (
      <div
        aria-hidden="true"
        style={{ aspectRatio, background: "#f3f4f6", borderRadius: 8, width: "100%" }}
      />
    );
  }

  if (items.length === 0) return null;

  const ad = items[index] ?? items[0]!;
  const isCarousel = items.length > 1;

  return (
    <div className="w-full flex justify-center">
      {/*
        Container com aspectRatio fixo → browser reserva altura proporcional
        ANTES de carregar a imagem. Como skeleton e container usam a mesma
        proporção, não há reflow quando o skeleton é substituído pelo banner.
      */}
      <div
        className="relative w-full group"
        style={{ aspectRatio }}
      >
        <a
          href={ad.link}
          target="_blank"
          rel="noreferrer"
          onClick={() => trackClick(ad.id)}
          className="block h-full rounded-lg border border-gray-100 overflow-hidden"
          style={{ opacity: fading ? 0 : 1, transition: "opacity 0.22s ease" }}
        >
          <img
            src={ad.imageUrl}
            alt="Publicidade"
            className="block w-full h-full object-cover"
            width={728}
            height={90}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            decoding={priority ? "sync" : "async"}
          />
        </a>

        {isCarousel && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); prev(); }}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
              aria-label="Anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); next(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
              aria-label="Próximo"
            >
              <ChevronRight size={16} />
            </button>

            {/* Dots — área toque mínima 24×24px via padding */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex z-10">
              {items.map((_, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.stopPropagation(); goTo(i); }}
                  className="p-2 flex items-center justify-center"
                  aria-label={`Anúncio ${i + 1}`}
                >
                  <span
                    className="block w-2 h-2 rounded-full transition-all"
                    style={{
                      backgroundColor: i === index ? "white" : "rgba(255,255,255,0.45)",
                      transform: i === index ? "scale(1.3)" : "scale(1)",
                    }}
                  />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
