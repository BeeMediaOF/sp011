import React from "react";
import { useAds, trackClick } from "./useAds";

export default function AdCentral() {
  const { ads, centrals, loading } = useAds();
  const ad = centrals[0] ?? ads[0] ?? null;

  if (loading) {
    return (
      <div className="w-full h-[264px] max-w-[952px] mx-auto bg-gray-50 rounded-lg border border-gray-100 flex items-center justify-center animate-pulse">
        <p className="text-[10px] font-semibold tracking-wider text-gray-300 uppercase">Publicidade</p>
      </div>
    );
  }

  if (!ad) {
    return null;
  }

  return (
    <div className="w-full flex justify-center">
      <a
        href={ad.link}
        target="_blank"
        rel="noreferrer"
        onClick={() => trackClick(ad.id)}
        className="block rounded-lg border border-gray-100 overflow-hidden group"
      >
        <img
          src={ad.imageUrl}
          alt="Publicidade"
          width={728}
          height={264}
          loading="lazy"
          decoding="async"
          className="block max-w-full h-auto group-hover:scale-[1.02] transition-transform"
        />
      </a>
    </div>
  );
}
