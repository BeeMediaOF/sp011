import React from "react";

interface AdInFeedProps {
  className?: string;
}

export default function AdInFeed({ className = "" }: AdInFeedProps) {
  return (
    <div className={`col-span-1 md:col-span-2 lg:col-span-1 ${className}`}>
      <div className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-100 rounded-xl p-4 h-full min-h-[200px] flex flex-col items-center justify-center text-center gap-2 hover:border-gray-200 transition-colors cursor-default">
        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
          <span className="text-gray-400 text-xs font-bold">AD</span>
        </div>
        <p className="text-[10px] font-semibold tracking-wider text-gray-300 uppercase">Publicidade</p>
        <p className="text-[9px] text-gray-300">300 × 250</p>
      </div>
    </div>
  );
}
