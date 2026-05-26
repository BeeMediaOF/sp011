import React from "react";
import { FaWhatsapp } from "react-icons/fa";

export default function RedacaoBanner() {
  return (
    <div className="bg-[#1a2448] py-8">
      <div className="max-w-[1280px] mx-auto px-4 flex flex-col md:flex-row justify-between items-center bg-[#1a2448] border border-white/20 p-6 md:p-8 rounded-sm">
        
        <div className="flex items-center mb-6 md:mb-0">
          <div className="w-14 h-14 bg-green-500 rounded-full flex items-center justify-center mr-5 shrink-0">
            <FaWhatsapp className="w-8 h-8 text-white" />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-white tracking-tight">FALE COM A REDAÇÃO</h3>
            <p className="text-gray-300 text-sm mt-1">Envie sua denúncia, sugestão ou pauta</p>
          </div>
        </div>

        <button className="bg-[#F5A623] hover:bg-yellow-500 text-[#1a2448] font-bold py-3 px-6 transition-colors w-full md:w-auto text-center flex items-center justify-center">
          CLIQUE AQUI E ENVIE <span className="ml-2">→</span>
        </button>

      </div>
    </div>
  );
}
