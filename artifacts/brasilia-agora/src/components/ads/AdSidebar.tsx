import React from "react";

interface AdSidebarProps {
  className?: string;
}

export default function AdSidebar({ className = "" }: AdSidebarProps) {
  return (
    <div className={`hidden lg:flex flex-col gap-4 w-36 shrink-0 ${className}`}>
      {/* Skyscraper 160×600 */}
      <div className="sticky top-24">
        <div className="w-36 h-[600px] bg-gray-50 rounded-xl border border-gray-100 flex flex-col items-center justify-center gap-2 overflow-hidden">
          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
            <span className="text-gray-400 text-xs font-bold">AD</span>
          </div>
          <p className="text-[10px] font-semibold tracking-wider text-gray-300 uppercase">Anúncio</p>
          <p className="text-[9px] text-gray-300">160 × 600</p>
        </div>
        <p className="text-[8px] text-gray-300 mt-1 text-center tracking-wider uppercase">Publicidade</p>
      </div>
    </div>
  );
}
