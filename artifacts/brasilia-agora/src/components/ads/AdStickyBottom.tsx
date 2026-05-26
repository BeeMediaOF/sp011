import React, { useState, useEffect } from "react";

export default function AdStickyBottom() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
      <div className="max-w-[1280px] mx-auto px-4 py-2 flex items-center justify-center gap-3 relative">
        <span className="text-[9px] text-gray-300 uppercase tracking-wider absolute left-4 top-1">Publicidade</span>
        <div className="w-[728px] h-[60px] bg-gray-50 rounded border border-gray-100 flex items-center justify-center">
          <p className="text-[10px] font-semibold tracking-wider text-gray-300 uppercase">Anúncio — 728 × 60</p>
        </div>
        <button
          onClick={() => setVisible(false)}
          className="text-gray-300 hover:text-gray-500 text-xs absolute right-4"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
