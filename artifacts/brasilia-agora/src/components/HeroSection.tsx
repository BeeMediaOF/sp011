import React from "react";

import heroImg from "../assets/images/hero.png";
import trafficImg from "../assets/images/traffic.png";
import policeImg from "../assets/images/police.png";
import hospitalImg from "../assets/images/hospital.png";

export default function HeroSection() {
  return (
    <section className="max-w-[1280px] mx-auto px-4 py-8">
      <div className="flex flex-col lg:flex-row gap-6">
        
        {/* Left Column - Main Hero Card */}
        <div className="w-full lg:w-3/5 group cursor-pointer">
          <div className="relative h-[400px] lg:h-[500px] overflow-hidden rounded-sm bg-gray-900">
            <img 
              src={heroImg} 
              alt="Congresso Nacional" 
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-in-out"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#1a2448] via-[#1a2448]/60 to-transparent"></div>
            
            <div className="absolute bottom-0 left-0 p-6 flex flex-col justify-end w-full">
              <div>
                <span className="inline-block bg-[#1d4ed8] text-white text-xs font-bold px-3 py-1 mb-3">POLÍTICA</span>
              </div>
              <h2 className="text-3xl lg:text-4xl font-bold text-white mb-2 leading-tight group-hover:text-blue-200 transition-colors">
                Câmara Legislativa aprova projeto que cria o programa Morar DF
              </h2>
              <p className="text-gray-300 text-sm lg:text-base mb-3 max-w-2xl">
                Iniciativa prevê subsídio para famílias de baixa renda adquirirem a casa própria no Distrito Federal.
              </p>
              <div className="text-gray-400 text-xs font-medium">
                2 horas atrás
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Stacked News */}
        <div className="w-full lg:w-2/5 flex flex-col justify-between space-y-4">
          
          <div className="flex gap-4 group cursor-pointer bg-white">
            <div className="w-1/3 shrink-0 overflow-hidden">
              <img src={trafficImg} alt="Trânsito" className="w-full h-full object-cover aspect-[4/3] group-hover:scale-105 transition-transform duration-500" />
            </div>
            <div className="flex flex-col justify-center py-1">
              <div><span className="text-[#ea580c] text-xs font-bold mb-1 block">TRÂNSITO</span></div>
              <h3 className="font-bold text-[#1a2448] leading-snug group-hover:text-[#1d4ed8] transition-colors mb-2">
                Obras no Eixão alteram trânsito neste fim de semana em Brasília
              </h3>
              <span className="text-gray-500 text-xs">1 hora atrás</span>
            </div>
          </div>
          
          <div className="h-px bg-gray-200 w-full"></div>

          <div className="flex gap-4 group cursor-pointer bg-white">
            <div className="w-1/3 shrink-0 overflow-hidden">
              <img src={policeImg} alt="Segurança" className="w-full h-full object-cover aspect-[4/3] group-hover:scale-105 transition-transform duration-500" />
            </div>
            <div className="flex flex-col justify-center py-1">
              <div><span className="text-[#dc2626] text-xs font-bold mb-1 block">SEGURANÇA</span></div>
              <h3 className="font-bold text-[#1a2448] leading-snug group-hover:text-[#1d4ed8] transition-colors mb-2">
                Polícia Civil prende grupo suspeito de furtos em comércios do Plano Piloto
              </h3>
              <span className="text-gray-500 text-xs">3 horas atrás</span>
            </div>
          </div>

          <div className="h-px bg-gray-200 w-full"></div>

          <div className="flex gap-4 group cursor-pointer bg-white">
            <div className="w-1/3 shrink-0 overflow-hidden">
              <img src={hospitalImg} alt="Saúde" className="w-full h-full object-cover aspect-[4/3] group-hover:scale-105 transition-transform duration-500" />
            </div>
            <div className="flex flex-col justify-center py-1">
              <div><span className="text-[#16a34a] text-xs font-bold mb-1 block">SAÚDE</span></div>
              <h3 className="font-bold text-[#1a2448] leading-snug group-hover:text-[#1d4ed8] transition-colors mb-2">
                Hospitais do DF registram queda nos casos de dengue em maio
              </h3>
              <span className="text-gray-500 text-xs">4 horas atrás</span>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
