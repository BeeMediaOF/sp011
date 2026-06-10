import React from "react";
import { Link } from "wouter";
import especialImg from "../assets/images/especial.png";
import avatar1 from "../assets/images/avatar1.png";
import avatar2 from "../assets/images/avatar2.png";
import avatar3 from "../assets/images/avatar3.png";

export default function BottomSection() {
  const ultimasNoticias = [
    { id: "ult-1", time: "09:45", text: "GDF entrega 758 unidades habitacionais no Sol Nascente" },
    { id: "ult-2", time: "08:30", text: "Mais de 1,2 mil vagas de emprego estão abertas nas agências do trabalhador" },
    { id: "ult-3", time: "07:15", text: "DF registra menor índice de homicídios dos últimos 10 anos" },
    { id: "ult-4", time: "06:50", text: "Concurso da Educação do DF terá edital publicado em junho" },
    { id: "ult-5", time: "06:20", text: "Fim de semana terá programação gratuita em diversos espaços do DF" }
  ];

  const editoriais = [
    {
      id: "col-1",
      avatar: avatar1,
      name: "Denise Rothenburg",
      desc: "Os bastidores da política que impactam o DF"
    },
    {
      id: "col-2",
      avatar: avatar2,
      name: "Ana Maria Campos",
      desc: "Mobilidade urbana: os caminhos e desafios"
    },
    {
      id: "col-3",
      avatar: avatar3,
      name: "Carlos Alexandre",
      desc: "Segurança pública: avanços e pontos de atenção"
    }
  ];

  return (
    <section className="max-w-[1280px] mx-auto px-4 py-8 border-t border-gray-200">
      <div className="flex flex-col lg:flex-row gap-8">
        
        {/* Left Column: Últimas Notícias */}
        <div className="w-full lg:w-1/4">
          <div className="flex items-center mb-6">
            <div className="w-1.5 h-6 bg-[#1d4ed8] mr-3"></div>
            <h2 className="text-xl font-bold text-[#1a2448]">ÚLTIMAS NOTÍCIAS</h2>
          </div>
          
          <div className="flex flex-col space-y-4">
            {ultimasNoticias.map((item, i) => (
              <React.Fragment key={i}>
                <Link href={`/artigo/${item.id}`} className="block">
                  <div className="flex group cursor-pointer">
                    <span className="text-[#1a2448] font-bold text-sm min-w-[50px] pt-0.5">{item.time}</span>
                    <p className="text-[14px] text-gray-800 font-medium leading-snug group-hover:text-[#c8102e] transition-colors">
                      {item.text}
                    </p>
                  </div>
                </Link>
                {i < ultimasNoticias.length - 1 && <div className="h-px bg-gray-200 w-full"></div>}
              </React.Fragment>
            ))}
          </div>

          <button className="w-full mt-6 py-2 border border-[#1a2448] text-[#1a2448] font-bold text-sm hover:bg-[#1a2448] hover:text-white transition-colors">
            VER TODAS
          </button>
        </div>

        {/* Center Column: Especial */}
        <div className="w-full lg:w-2/4">
          <Link href="/artigo/especial-1">
            <div className="group cursor-pointer block">
              <div className="relative overflow-hidden mb-4">
                <img src={especialImg} alt="Especial Brasília" className="w-full aspect-[16/9] object-cover group-hover:scale-105 transition-transform duration-700" />
                <div className="absolute top-0 left-0 bg-[#ca8a04] text-white text-xs font-bold px-3 py-1">
                  ESPECIAL
                </div>
              </div>
              <h2 className="text-2xl font-bold text-[#1a2448] mb-2 leading-tight group-hover:text-[#c8102e] transition-colors">
                Os 64 anos de Brasília: a capital que inspira o futuro
              </h2>
              <p className="text-gray-600 text-sm mb-3">
                Confira a história, os desafios e as perspectivas da cidade que é patrimônio de todos os brasileiros.
              </p>
              <span className="text-gray-500 text-xs">10 horas atrás</span>
            </div>
          </Link>
        </div>

        {/* Right Column: Editoriais */}
        <div className="w-full lg:w-1/4">
          <div className="flex items-center mb-6">
            <div className="w-1.5 h-6 bg-[#1d4ed8] mr-3"></div>
            <h2 className="text-xl font-bold text-[#1a2448]">EDITORIAIS</h2>
          </div>

          <div className="flex flex-col space-y-6">
            {editoriais.map((item, i) => (
              <Link key={i} href="/colunas" className="block">
                <div className="flex items-start gap-4 group cursor-pointer">
                  <img src={item.avatar} alt={item.name} className="w-12 h-12 rounded-full object-cover border border-gray-200 shrink-0 grayscale group-hover:grayscale-0 transition-all duration-300" />
                  <div>
                    <h4 className="font-bold text-[#1a2448] text-sm group-hover:text-[#c8102e] transition-colors">{item.name}</h4>
                    <p className="text-xs text-gray-600 italic leading-snug mt-1">"{item.desc}"</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <Link href="/colunas">
            <button className="w-full mt-8 py-2 border border-[#1a2448] text-[#1a2448] font-bold text-sm hover:bg-[#1a2448] hover:text-white transition-colors">
              VER TODOS
            </button>
          </Link>
        </div>

      </div>
    </section>
  );
}
