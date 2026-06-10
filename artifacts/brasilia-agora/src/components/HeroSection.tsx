import React from "react";
import { Link } from "wouter";
import heroImg from "../assets/images/hero.png";
import trafficImg from "../assets/images/traffic.png";
import policeImg from "../assets/images/police.png";
import hospitalImg from "../assets/images/hospital.png";
import busImg from "../assets/images/bus.png";
import studentsImg from "../assets/images/students.png";
import politicaFeatImg from "../assets/images/politica_feat.png";

const featured = [
  {
    id: "hero-1",
    img: heroImg,
    chapeu: "Política",
    chapeuColor: "#1d4ed8",
    title: "Câmara Legislativa aprova projeto que cria o programa Morar DF",
    summary: "Iniciativa prevê subsídio para famílias de baixa renda adquirirem a casa própria no Distrito Federal.",
    author: "Por Redação",
    time: "2 horas atrás",
  },
  {
    id: "hero-2",
    img: politicaFeatImg,
    chapeu: "Economia",
    chapeuColor: "#b45309",
    title: "DF bate recorde de exportações no primeiro semestre e lidera crescimento nacional",
    summary: "Brasília é eleita melhor cidade para investir no Brasil em 2025 segundo ranking nacional.",
    author: "Por Redação",
    time: "3 horas atrás",
  },
];

const secondary = [
  { id: "hero-3", img: trafficImg,  chapeu: "Trânsito",  chapeuColor: "#ea580c", title: "Obras no Eixão alteram trânsito neste fim de semana em Brasília" },
  { id: "hero-4", img: policeImg,   chapeu: "Segurança", chapeuColor: "#dc2626", title: "Polícia Civil prende grupo suspeito de furtos no Plano Piloto" },
  { id: "hero-5", img: hospitalImg, chapeu: "Saúde",     chapeuColor: "#16a34a", title: "Hospitais do DF registram queda nos casos de dengue em maio" },
  { id: "hero-6", img: busImg,      chapeu: "DF",        chapeuColor: "#0b3d91", title: "GDF anuncia mais 124 ônibus para reforçar o transporte público" },
];

export default function HeroSection() {
  return (
    <section className="max-w-[1280px] mx-auto px-4 py-6">

      {/* Dois destaques grandes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {featured.map((item) => (
          <Link key={item.id} href={`/artigo/${item.id}`} className="group block">
            <div className="relative overflow-hidden bg-gray-100 h-[420px]">
              <img
                src={item.img}
                alt={item.title}
                className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <span
                  className="inline-block text-white text-[11px] font-bold px-3 py-1 uppercase tracking-wider mb-3"
                  style={{ backgroundColor: item.chapeuColor }}
                >
                  {item.chapeu}
                </span>
                <h2 className="text-white font-black text-[26px] leading-tight line-clamp-3 mb-2"
                    style={{ fontFamily: "'Merriweather', serif" }}>
                  {item.title}
                </h2>
                <p className="text-white/70 text-[13px] line-clamp-2 mb-3">{item.summary}</p>
                <div className="flex items-center gap-2 text-[11px] text-white/50">
                  <span>{item.author}</span>
                  <span className="w-1 h-1 rounded-full bg-white/40" />
                  <span>{item.time}</span>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Faixa de secundárias */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 border-t border-gray-200 pt-5">
        {secondary.map((item) => (
          <Link key={item.id} href={`/artigo/${item.id}`} className="group flex gap-4 items-start">
            <div className="w-[100px] h-[72px] shrink-0 overflow-hidden bg-gray-100">
              <img
                src={item.img}
                alt={item.chapeu}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[11px] font-bold uppercase tracking-wider block mb-1" style={{ color: item.chapeuColor }}>
                {item.chapeu}
              </span>
              <h3 className="text-[15px] font-bold leading-snug group-hover:text-[#1d4ed8] transition-colors line-clamp-3 text-[#1a1a1a]">
                {item.title}
              </h3>
            </div>
          </Link>
        ))}
      </div>

    </section>
  );
}
