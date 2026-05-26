import React from "react";

interface AdSlotProps {
  width?: number;
  height?: number;
  label?: string;
  className?: string;
  variant?: "banner" | "square" | "skyscraper" | "rectangle" | "billboard" | "custom";
  sticky?: boolean;
  children?: React.ReactNode;
}

const SIZES = {
  banner:    { w: 728, h: 90,  label: "728 × 90" },
  square:    { w: 300, h: 250, label: "300 × 250" },
  skyscraper:{ w: 160, h: 600, label: "160 × 600" },
  rectangle: { w: 336, h: 280, label: "336 × 280" },
  billboard: { w: 970, h: 250, label: "970 × 250" },
  custom:    { w: 0,   h: 0,   label: "Personalizado" },
};

export default function AdSlot({
  width,
  height,
  label,
  className = "",
  variant = "custom",
  sticky = false,
  children,
}: AdSlotProps) {
  const s = SIZES[variant];
  const w = width ?? s.w;
  const h = height ?? s.h;
  const lbl = label ?? s.label;

  return (
    <div className={`flex flex-col items-center ${sticky ? "sticky top-24" : ""} ${className}`}>
      <div
        className="relative flex items-center justify-center border border-dashed border-gray-300 rounded bg-gray-50 text-gray-400 overflow-hidden group hover:border-[#1a2448]/30 transition-colors"
        style={w && h ? { width: w, height: h } : undefined}
      >
        {children || (
          <div className="text-center space-y-1 px-2">
            <p className="text-xs font-semibold tracking-wider uppercase text-gray-300">ANÚNCIO</p>
            {w && h ? (
              <p className="text-[10px] text-gray-300">{lbl}</p>
            ) : (
              <p className="text-[10px] text-gray-300">Adicione seu anúncio aqui</p>
            )}
          </div>
        )}
      </div>
      <p className="text-[9px] text-gray-300 mt-1 tracking-wider uppercase">Publicidade</p>
    </div>
  );
}
