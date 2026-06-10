import React from "react";
import { useAds, trackClick } from "./useAds";

interface AdSidebarProps {
  className?: string;
}

function Placeholder() {
  return (
    <div className="w-[300px] h-[280px] bg-gray-50 border border-gray-100 flex flex-col items-center justify-center gap-2">
      <p className="text-[10px] font-semibold tracking-wider text-gray-300 uppercase">Anúncio</p>
      <p className="text-[9px] text-gray-300">300 × 280</p>
    </div>
  );
}

export default function AdSidebar({ className = "" }: AdSidebarProps) {
  const { sidebars, loading } = useAds();
  const ad = sidebars[0] ?? null;

  return (
    <div className={`w-[300px] shrink-0 ${className}`}>
      <div className="sticky top-24 flex flex-col gap-4">
        {loading ? (
          <Placeholder />
        ) : ad ? (
          <a
            href={ad.link}
            target="_blank"
            rel="noreferrer"
            onClick={() => trackClick(ad.id)}
            className="block w-[300px] h-[280px] border border-gray-100 overflow-hidden group"
          >
            <img
              src={ad.imageBase64}
              alt="Publicidade"
              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
            />
          </a>
        ) : (
          <a
            href="https://www.toyota.com.br/modelos/rav4"
            target="_blank"
            rel="noreferrer"
            className="block w-[300px] h-[280px] overflow-hidden group"
          >
            <img
              src="/ad-toyota-rav4.jpg"
              alt="Toyota RAV4 — A vida é uma aventura"
              className="w-full h-full object-cover group-hover:scale-[1.01] transition-transform"
            />
          </a>
        )}
        <p className="text-[8px] text-gray-300 text-center tracking-wider uppercase">Publicidade</p>
      </div>
    </div>
  );
}
