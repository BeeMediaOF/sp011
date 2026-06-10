import React from "react";
import { Link } from "wouter";
import heroImg from "../assets/images/hero.png";
import trafficImg from "../assets/images/traffic.png";
import policeImg from "../assets/images/police.png";
import hospitalImg from "../assets/images/hospital.png";
import busImg from "../assets/images/bus.png";
import studentsImg from "../assets/images/students.png";

const secondary = [
  { id: "hero-2", img: trafficImg, chapeu: "Trânsito", chapeuColor: "#ea580c", title: "Obras no Eixão alteram trânsito neste fim de semana em Brasília", summary: "Interdições começam na sexta-feira e afetam a região central da capital." },
  { id: "hero-3", img: policeImg, chapeu: "Segurança", chapeuColor: "#dc2626", title: "Polícia Civil prende grupo suspeito de furtos no Plano Piloto", summary: "Operação conjunta resultou em quatro prisões e apreensão de materiais ilícitos." },
  { id: "hero-4", img: hospitalImg, chapeu: "Saúde", chapeuColor: "#16a34a", title: "Hospitais do DF registram queda nos casos de dengue em maio", summary: "Campanha de prevenção e vacinação contribuiu para redução de 12%." },
  { id: "hero-5", img: busImg, chapeu: "DF", chapeuColor: "#0b3d91", title: "GDF anuncia mais 124 ônibus para reforçar o transporte público", summary: "Novos veículos começam a operar em junho nas linhas mais demandadas." },
  { id: "hero-6", img: studentsImg, chapeu: "Educação", chapeuColor: "#0d9488", title: "Escolas públicas do DF alcançam melhores índices no IDEB 2023", summary: "Rede de ensino registra crescimento de 8% na nota do indicador nacional." },
];

export default function HeroSection() {
  return (
    <section className="max-w-[1280px] mx-auto px-4 py-6">
      <div className="flex flex-col lg:flex-row gap-5">

        {/* Principal ~60% */}
        <Link href="/artigo/hero-1" className="block group w-full lg:w-[62%]">
          <div className="relative overflow-hidden bg-gray-100">
            <img
              src={heroImg}
              alt="Câmara Legislativa"
              className="w-full h-[340px] lg:h-[420px] object-cover group-hover:scale-[1.02] transition-transform duration-700"
            />
            {/* Sombra sutil na imagem para texto */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
            <div className="absolute bottom-0 left-0 p-5 w-full">
              <span className="inline-block bg-[#1d4ed8] text-white text-[11px] font-bold px-3 py-1 uppercase tracking-wider mb-2">
                Política
              </span>
            </div>
          </div>
          <div className="pt-4">
            <h1 className="font-serif text-2xl lg:text-[34px] font-black leading-[1.15] group-hover:text-[#1d4ed8] transition-colors mr-[23px] text-[#000000]">
              Câmara Legislativa aprova projeto que cria o programa Morar DF
            </h1>
            <p className="text-gray-500 text-sm leading-relaxed mt-2 max-w-xl">
              Iniciativa prevê subsídio para famílias de baixa renda adquirirem a casa própria no Distrito Federal.
            </p>
            <div className="flex items-center gap-3 text-xs text-gray-400 mt-3">
              <span>Por Redação</span>
              <span className="w-1 h-1 rounded-full bg-gray-300" />
              <span>2 horas atrás</span>
            </div>
          </div>
        </Link>

        {/* Secundárias ~38% */}
        <div className="w-full lg:w-[38%] flex flex-col gap-4">
          {secondary.map((item) => (
            <Link key={item.id} href={`/artigo/${item.id}`} className="block group">
              <div className="flex gap-3">
                <div className="w-[110px] h-[80px] shrink-0 overflow-hidden bg-gray-100">
                  <img
                    src={item.img}
                    alt={item.chapeu}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <div className="flex flex-col justify-center min-w-0">
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: item.chapeuColor }}>
                    {item.chapeu}
                  </span>
                  <h3 className="font-serif text-[15px] font-bold leading-snug group-hover:text-[#1d4ed8] transition-colors line-clamp-2 text-[#000000]">
                    {item.title}
                  </h3>
                  <p className="text-gray-400 text-[11px] mt-1 line-clamp-1 hidden sm:block">
                    {item.summary}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>

      </div>
    </section>
  );
}
