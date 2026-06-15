import React, { useState, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAds, trackClick, trackImpression, type AdSlotKey } from "./useAds";

interface Props {
  slot: AdSlotKey;
  placeholder?: string;
  interval?: number;
}

export default function AdBanner({ slot, placeholder, interval = 5000 }: Props) {
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
        const nextIdx = (i + 1) % items.length;
        setFading(true);
        setTimeout(() => setFading(false), 220);
        return nextIdx;
      });
    }, interval);
    return () => clearInterval(timer);
  }, [items.length, interval]);

  useEffect(() => {
    if (index >= items.length && items.length > 0) setIndex(0);
  }, [index, items.length]);

  // Track impression once per unique ad shown
  const trackedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const ad = items[index];
    if (ad && !trackedRef.current.has(ad.id)) {
      trackedRef.current.add(ad.id);
      void trackImpression(ad.id);
    }
  }, [index, items]);

  if (loading) {
    return (
      <div className="w-full h-[60px] mx-auto bg-gray-50 rounded-lg border border-gray-100 flex items-center justify-center animate-pulse">
        <p className="text-[10px] font-semibold tracking-wider text-gray-300 uppercase">Publicidade</p>
      </div>
    );
  }

  if (items.length === 0) {
    if (!placeholder) return null;
    return (
      <div className="w-full h-[60px] mx-auto bg-gray-50 rounded-lg border border-gray-100 flex items-center justify-center">
        <p className="text-[10px] font-semibold tracking-wider text-gray-300 uppercase">{placeholder}</p>
      </div>
    );
  }

  const ad = items[index] ?? items[0];
  const isCarousel = items.length > 1;

  return (
    <div className="w-full flex justify-center">
      <div className="relative w-full group">
        {/* Ad image */}
        <a
          href={ad.link}
          target="_blank"
          rel="noreferrer"
          onClick={() => trackClick(ad.id)}
          className="block rounded-lg border border-gray-100 overflow-hidden"
          style={{ opacity: fading ? 0 : 1, transition: "opacity 0.22s ease" }}
        >
          <img
            src={ad.imageBase64}
            alt="Publicidade"
            className="block max-w-full h-auto w-full object-cover"
          />
        </a>

        {/* Carousel controls */}
        {isCarousel && (
          <>
            {/* Prev / Next arrows — appear on hover */}
            <button
              onClick={(e) => { e.stopPropagation(); prev(); }}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
              aria-label="Anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); next(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
              aria-label="Próximo"
            >
              <ChevronRight size={16} />
            </button>

            {/* Dots */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
              {items.map((_, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.stopPropagation(); goTo(i); }}
                  className="w-1.5 h-1.5 rounded-full transition-all"
                  style={{
                    backgroundColor: i === index ? "white" : "rgba(255,255,255,0.45)",
                    transform: i === index ? "scale(1.3)" : "scale(1)",
                  }}
                  aria-label={`Anúncio ${i + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
