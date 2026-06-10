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
    return (
      <div className="w-full flex justify-center">
        <a
          href="https://www.ze.delivery/produtos"
          target="_blank"
          rel="noreferrer"
          className="block w-full max-w-[952px] overflow-hidden group"
        >
          <img
            src="/ad-ze-delivery.jpg"
            alt="Zé Delivery — Entrega grátis de segunda a sexta"
            className="w-full h-auto object-cover group-hover:scale-[1.01] transition-transform"
          />
        </a>
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
        className="block w-full max-w-[952px] h-[264px] rounded-lg border border-gray-100 overflow-hidden group relative"
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
