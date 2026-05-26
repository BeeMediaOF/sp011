import React from "react";
import { FaFacebook, FaInstagram, FaYoutube } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";
import { Sun } from "lucide-react";

export default function TopBar() {
  return (
    <div className="bg-[#f5f5f5] text-xs py-2 border-b border-gray-200">
      <div className="max-w-[1280px] mx-auto px-4 flex flex-col sm:flex-row justify-between items-center text-gray-600 space-y-2 sm:space-y-0">
        <div className="flex items-center space-x-4">
          <span>25 de maio de 2024 | Sábado</span>
          <div className="flex items-center space-x-1 font-medium">
            <Sun className="w-4 h-4 text-yellow-500" />
            <span>26°C Céu claro</span>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3 text-gray-500">
            <a href="#" className="hover:text-[#1a2448] transition-colors"><FaInstagram size={14} /></a>
            <a href="#" className="hover:text-[#1a2448] transition-colors"><FaFacebook size={14} /></a>
            <a href="#" className="hover:text-[#1a2448] transition-colors"><FaXTwitter size={14} /></a>
            <a href="#" className="hover:text-[#1a2448] transition-colors"><FaYoutube size={14} /></a>
          </div>
          <button className="text-[#ca8a04] border border-[#ca8a04] px-3 py-1 font-bold hover:bg-[#ca8a04] hover:text-white transition-colors uppercase">
            Anuncie
          </button>
        </div>
      </div>
    </div>
  );
}
