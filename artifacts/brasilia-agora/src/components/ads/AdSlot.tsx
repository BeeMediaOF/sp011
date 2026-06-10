import React from "react";
import { useAds, trackClick } from "./useAds";

interface AdSlotProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  label?: string;
  sticky?: boolean;
  children?: React.ReactNode;
}

const SIZE_STYLES = {
  sm:  "w-[300px] h-[250px]",
  md:  "w-full max-w-[728px] h-[90px]",
  lg:  "w-full max-w-[336px] h-[280px]",
  xl:  "w-full h-[250px]",
};

function Placeholder({ size }: { size: string; label?: string }) {
  return (
    <a
      href="https://www.toyota.com.br/modelos/rav4"
      target="_blank"
      rel="noreferrer"
      className={`relative block ${SIZE_STYLES[size as keyof typeof SIZE_STYLES]} overflow-hidden rounded-lg group`}
    >
      <img
        src="/ad-toyota-rav4.jpg"
        alt="Toyota RAV4 — A Vida É Uma Aventura"
        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
      />
    </a>
  );
}

export default function AdSlot({ size = "sm", className = "", label, sticky = false, children }: AdSlotProps) {
  const { banners, loading } = useAds();
  const ad = banners[0] ?? null;

  return (
    <div className={`flex flex-col items-center ${sticky ? "sticky top-28" : ""} ${className}`}>
      {loading || !ad ? (
        <Placeholder size={size} label={label} />
      ) : (
        <a href={ad.link} target="_blank" rel="noreferrer"
          onClick={() => trackClick(ad.id)}
          className={`block ${SIZE_STYLES[size]} rounded-lg border border-gray-100 overflow-hidden group relative`}
        >
          <img src={ad.imageBase64} alt="Publicidade" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" />
        </a>
      )}
      <p className="text-[8px] text-gray-300 mt-1 tracking-wider uppercase">Publicidade</p>
      {children}
    </div>
  );
}
