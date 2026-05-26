import React from "react";
import { Link } from "wouter";

import heroImg from "../assets/images/hero.png";
import trafficImg from "../assets/images/traffic.png";
import policeImg from "../assets/images/police.png";
import hospitalImg from "../assets/images/hospital.png";
import studentsImg from "../assets/images/students.png";

export default function HeroSection() {
  return (
    <section className="max-w-[1280px] mx-auto px-4 py-8">
      <div className="flex flex-col lg:flex-row gap-6">
        
        {/* Left Column - Main Hero Card */}
        <div className="w-full lg:w-3/5 group cursor-pointer">
          <Link href="/artigo/hero-1">
            <div className="relative h-[400px] lg:h-[500px] overflow-hidden rounded-sm bg-gray-900 block">
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
          </Link>
        </div>

        {/* Right Column - 4 Stacked News (symmetric) */}
        <div className="w-full lg:w-2/5 flex flex-col divide-y divide-gray-200">
          {[
            { id: "hero-2", img: trafficImg, alt: "Trânsito", tagColor: "#ea580c", tag: "TRÂNSITO", title: "Obras no Eixão alteram trânsito neste fim de semana em Brasília", time: "1 hora atrás" },
            { id: "hero-3", img: policeImg,  alt: "Segurança", tagColor: "#dc2626", tag: "SEGURANÇA", title: "Polícia Civil prende grupo suspeito de furtos em comércios do Plano Piloto", time: "3 horas atrás" },
            { id: "hero-4", img: hospitalImg, alt: "Saúde",    tagColor: "#16a34a", tag: "SAÚDE",    title: "Hospitais do DF registram queda nos casos de dengue em maio", time: "4 horas atrás" },
            { id: "hero-5", img: studentsImg, alt: "Educação", tagColor: "#7c3aed", tag: "EDUCAÇÃO", title: "Escolas públicas do DF alcançam melhores índices no IDEB 2023", time: "5 horas atrás" },
          ].map((item) => (
            <Link key={item.id} href={`/artigo/${item.id}`} className="block">
              <div className="flex gap-4 group cursor-pointer py-[14px] first:pt-0 last:pb-0">
                <div className="w-[110px] shrink-0 overflow-hidden self-stretch">
                  <img
                    src={item.img}
                    alt={item.alt}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    style={{ minHeight: "72px" }}
                  />
                </div>
                <div className="flex flex-col justify-center min-w-0">
                  <span className="text-xs font-bold mb-1 block" style={{ color: item.tagColor }}>{item.tag}</span>
                  <h3 className="font-bold text-[#1a2448] text-sm leading-snug group-hover:text-[#1d4ed8] transition-colors mb-1 line-clamp-2">
                    {item.title}
                  </h3>
                  <span className="text-gray-500 text-xs">{item.time}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
