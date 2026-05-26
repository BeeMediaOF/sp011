import React from "react";

interface AdSlotProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  label?: string;
  sticky?: boolean;
  children?: React.ReactNode;
}

const SIZE_STYLES = {
  sm:  "w-[300px] h-[250px]",   // Square / Medium Rectangle
  md:  "w-[728px] h-[90px]",     // Leaderboard
  lg:  "w-[336px] h-[280px]",    // Large Rectangle
  xl:  "w-full h-[250px]",       // Billboard / Full width
};

export default function AdSlot({ size = "sm", className = "", label, sticky = false, children }: AdSlotProps) {
  return (
    <div className={`flex flex-col items-center ${sticky ? "sticky top-28" : ""} ${className}`}>
      <div
        className={`relative ${SIZE_STYLES[size]} flex items-center justify-center bg-gray-50 rounded-lg border border-gray-100 overflow-hidden group hover:border-gray-200 transition-colors`}
      >
        {children || (
          <div className="text-center space-y-1">
            <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-300">
              {label || "ANÚNCIO"}
            </p>
          </div>
        )}
      </div>
      <p className="text-[8px] text-gray-300 mt-1 tracking-wider uppercase">Publicidade</p>
    </div>
  );
}
