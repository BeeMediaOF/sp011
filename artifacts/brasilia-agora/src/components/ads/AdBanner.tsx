import React from "react";
import { useAds, trackClick } from "./useAds";

export default function AdBanner({ index = 0 }: { index?: number }) {
  const { banners, loading } = useAds();
  const ad = banners[index] ?? banners[0] ?? null;

  if (loading) {
    return (
      <div className="w-full h-[90px] max-w-[728px] mx-auto bg-gray-50 rounded-lg border border-gray-100 flex items-center justify-center animate-pulse">
        <p className="text-[10px] font-semibold tracking-wider text-gray-300 uppercase">Publicidade</p>
      </div>
    );
  }

  if (!ad) {
    return (
      <div className="w-full h-[90px] max-w-[728px] mx-auto bg-gray-50 rounded-lg border border-gray-100 flex items-center justify-center">
        <p className="text-[10px] font-semibold tracking-wider text-gray-300 uppercase">Publicidade — 728 × 90</p>
      </div>
    );
  }

  return (
    <div className="w-full flex justify-center">
      <a
        href={ad.link}
        target="_blank"
        rel="noreferrer"
        onClick={() => trackClick(ad.id)}
        className="block w-full max-w-[728px] h-[90px] rounded-lg border border-gray-100 overflow-hidden group relative"
      >
        <img
          src={ad.imageBase64}
          alt="Publicidade"
          className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
        />
      </a>
    </div>
  );
}
