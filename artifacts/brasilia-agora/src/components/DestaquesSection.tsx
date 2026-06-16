import React from "react";
import { Link } from "wouter";

import parkImg from "../assets/images/park.webp";
import busImg from "../assets/images/bus.webp";
import studentsImg from "../assets/images/students.webp";
import festivalImg from "../assets/images/festival.webp";

export default function DestaquesSection() {
  const destaques = [
    {
      id: "dest-1",
      img: parkImg,
      tag: "CIDADE",
      color: "bg-[#2563eb]",
      title: "Parques do DF terão programação especial no Dia do Meio Ambiente",
      time: "5 horas atrás"
    },
    {
      id: "dest-2",
      img: busImg,
      tag: "TRANSPORTE",
      color: "bg-[#0284c7]",
      title: "GDF anuncia mais 124 ônibus para reforçar o transporte público",
      time: "6 horas atrás"
    },
    {
      id: "dest-3",
      img: studentsImg,
      tag: "EDUCAÇÃO",
      color: "bg-[#7c3aed]",
      title: "Escolas públicas do DF alcançam melhores índices no IDEB 2023",
      time: "7 horas atrás"
    },
    {
      id: "dest-4",
      img: festivalImg,
      tag: "CULTURA",
      color: "bg-[#0d9488]",
      title: "Festival de Inverno começa neste fim de semana no Plano Piloto",
      time: "8 horas atrás"
    }
  ];

  return (
    <section className="max-w-[1280px] mx-auto px-4 py-8 border-t border-gray-200">
      <div className="flex items-center mb-6">
        <div className="w-1.5 h-6 bg-[#1d4ed8] mr-3"></div>
        <h2 className="text-xl font-bold text-[#1a2448]">DESTAQUES DA CAPITAL</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {destaques.map((item, index) => (
          <Link key={index} href={`/artigo/${item.id}`} className="block">
            <div className="group cursor-pointer flex flex-col bg-white h-full">
              <div className="relative overflow-hidden aspect-[16/10] mb-3">
                <img src={item.img} alt={item.title.replace(/<[^>]*>/g, "")} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                <div className={`absolute top-0 left-0 ${item.color} text-white text-[10px] font-bold px-2 py-1`}>
                  {item.tag}
                </div>
              </div>
              <h3 className="font-bold text-[#1a2448] text-[15px] leading-snug mb-2 group-hover:text-[#c8102e] transition-colors flex-grow"
                dangerouslySetInnerHTML={{ __html: item.title }}
              />
              <span className="text-gray-500 text-xs">{item.time}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
