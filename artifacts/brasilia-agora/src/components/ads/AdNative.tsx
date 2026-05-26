import React from "react";

interface AdNativeProps {
  className?: string;
}

export default function AdNative({ className = "" }: AdNativeProps) {
  return (
    <div className={`bg-white border border-gray-100 rounded-xl overflow-hidden hover:shadow-md transition-shadow ${className}`}>
      <div className="aspect-video bg-gradient-to-br from-[#1a2448]/5 to-[#F5A623]/5 flex items-center justify-center">
        <div className="text-center">
          <p className="text-[10px] font-semibold tracking-wider text-gray-300 uppercase">Anúncio</p>
          <p className="text-[9px] text-gray-300 mt-0.5">Espaço publicitário</p>
        </div>
      </div>
      <div className="p-3">
        <span className="text-[9px] font-bold text-[#F5A623] uppercase tracking-wide">Publicidade</span>
        <p className="text-sm font-semibold text-gray-800 mt-0.5">Seu anúncio aqui</p>
        <p className="text-xs text-gray-400 mt-0.5">Entre em contato para reservar este espaço</p>
      </div>
    </div>
  );
}
