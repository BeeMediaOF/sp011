import React, { useState, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAds, trackClick, trackImpression, type AdSlotKey, SLOT_CONFIG } from "./useAds";

interface Props {
  slot: AdSlotKey;
  interval?: number;
  /** Override do aspectRatio do SLOT_CONFIG — usar apenas em casos especiais */
  aspectRatio?: string;
  /** @deprecated — use o SLOT_CONFIG; mantido só para retrocompat */
  skeletonHeight?: number;
  /** Se true, imagem carrega eager + fetchpriority=high (slot acima da dobra) */
  priority?: boolean;
  /** Se false, esconde o label "PUBLICIDADE". Padrão: true */
  showLabel?: boolean;
}

export default function AdBanner({
  slot,
  interval = 5000,
  aspectRatio: aspectRatioProp,
  priority = false,
  showLabel = true,
}: Props) {
  const { getSlotAll, loading } = useAds();
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);

  const cfg = SLOT_CONFIG[slot];
  const aspectRatio = aspectRatioProp ?? cfg?.aspectRatio ?? "970/90";
  const { imgWidth, imgHeight } = cfg ?? { imgWidth: 970, imgHeight: 90 };

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

  if (loading) {
    return (
      <div className="w-full">
        {showLabel && (
          <p className="text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 mb-1.5 select-none">
            Publicidade
          </p>
        )}
        <div
          aria-hidden="true"
          style={{ aspectRatio, background: "#f3f4f6", width: "100%" }}
        />
      </div>
    );
  }

  if (items.length === 0) return null;

  const ad = items[index] ?? items[0]!;
  const isCarousel = items.length > 1;

  return (
    <div className="w-full">
      {showLabel && (
        <p className="text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 mb-1.5 select-none">
          Publicidade
        </p>
      )}

      <div className="w-full flex justify-center">
        <div
          className="relative w-full group"
          style={{ aspectRatio }}
        >
          <a
            href={ad.link}
            target="_blank"
            rel="noreferrer"
            onClick={() => trackClick(ad.id)}
            className="block h-full overflow-hidden border border-gray-100"
            style={{ opacity: fading ? 0 : 1, transition: "opacity 0.22s ease" }}
          >
            <img
              src={ad.imageUrl}
              alt="Publicidade"
              className="block w-full h-full object-cover"
              width={imgWidth}
              height={imgHeight}
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
    </div>
  );
}
