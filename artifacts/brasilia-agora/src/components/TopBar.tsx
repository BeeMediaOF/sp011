import React from "react";

export default function TopBar() {
  const today = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="bg-[#1a1a1a] text-white text-[11px] py-1.5 border-b border-gray-800">
      <div className="max-w-[1280px] mx-auto px-4 flex flex-col sm:flex-row justify-between items-center text-gray-400 space-y-1 sm:space-y-0">
        <span className="capitalize">{today}</span>
      </div>
    </div>
  );
}
