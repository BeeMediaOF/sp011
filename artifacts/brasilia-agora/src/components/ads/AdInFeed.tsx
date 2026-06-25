import React from "react";
import { useAds, trackClick } from "./useAds";

interface AdInFeedProps {
  className?: string;
}

function Placeholder() {
  return (
    <a
      href="https://www.toyota.com.br/modelos/rav4"
      target="_blank"
      rel="noreferrer"
      className="block h-full min-h-[200px] rounded-xl overflow-hidden group"
    >
      <img
        src="/ad-toyota-rav4.jpg"
        alt="Toyota RAV4 — A Vida É Uma Aventura"
        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
      />
    </a>
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
          <img src={ad.imageUrl} alt="Publicidade" width={480} height={200} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" />
        </a>
      )}
    </div>
  );
}
