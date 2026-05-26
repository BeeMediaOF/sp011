import React from "react";
import { useAds, trackClick } from "./useAds";

interface AdInFeedProps {
  className?: string;
}

function Placeholder() {
  return (
    <div className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-100 rounded-xl p-4 h-full min-h-[200px] flex flex-col items-center justify-center text-center gap-2">
      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
        <span className="text-gray-400 text-xs font-bold">AD</span>
      </div>
      <p className="text-[10px] font-semibold tracking-wider text-gray-300 uppercase">Publicidade</p>
      <p className="text-[9px] text-gray-300">300 × 250</p>
    </div>
  );
}

export default function AdInFeed({ className = "" }: AdInFeedProps) {
  const { banners, loading } = useAds();
  const ad = banners[0] ?? null;

  return (
    <div className={`col-span-1 md:col-span-2 lg:col-span-1 ${className}`}>
      {loading || !ad ? (
        <Placeholder />
      ) : (
        <a href={ad.link} target="_blank" rel="noreferrer"
          onClick={() => trackClick(ad.id)}
          className="block h-full min-h-[200px] rounded-xl border border-gray-100 overflow-hidden group relative"
        >
          <img src={ad.imageBase64} alt="Publicidade" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" />
        </a>
      )}
    </div>
  );
}
