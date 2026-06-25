import React from "react";
import { useAds, trackClick } from "./useAds";

interface AdSidebarProps {
  className?: string;
}

function Placeholder() {
  return (
    <div className="w-36 h-[600px] bg-gray-50 rounded-xl border border-gray-100 flex flex-col items-center justify-center gap-2 overflow-hidden">
      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
        <span className="text-gray-400 text-xs font-bold">AD</span>
      </div>
      <p className="text-[10px] font-semibold tracking-wider text-gray-300 uppercase">Anúncio</p>
      <p className="text-[9px] text-gray-300">160 × 600</p>
    </div>
  );
}

export default function AdSidebar({ className = "" }: AdSidebarProps) {
  const { sidebars, loading } = useAds();

  const ad = sidebars[0] ?? null;

  return (
    <div className={`hidden lg:flex flex-col gap-4 w-36 shrink-0 ${className}`}>
      <div className="sticky top-24">
        {loading || !ad ? (
          <Placeholder />
        ) : (
          <a href={ad.link} target="_blank" rel="noreferrer"
            onClick={() => trackClick(ad.id)}
            className="block w-36 h-[600px] rounded-xl border border-gray-100 overflow-hidden group relative"
          >
            <img src={ad.imageUrl} alt="Publicidade" width={144} height={600} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" />
          </a>
        )}
        <p className="text-[8px] text-gray-300 mt-1 text-center tracking-wider uppercase">Publicidade</p>
      </div>
    </div>
  );
}
