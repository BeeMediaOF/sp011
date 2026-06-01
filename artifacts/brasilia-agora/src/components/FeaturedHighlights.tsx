import { Link } from "wouter";
import cityImg from "../assets/images/city.png";
import busImg from "../assets/images/bus.png";
import hospitalImg from "../assets/images/hospital.png";
import parkImg from "../assets/images/park.png";
import trafficImg from "../assets/images/traffic.png";
import heroImg from "../assets/images/hero.png";
import studentsImg from "../assets/images/students.png";
import policeImg from "../assets/images/police.png";
import culturaFeatImg from "../assets/images/cultura_feat.png";

const highlights = [
  {
    id: "fh-1",
    title: "GDF investe R$ 3 bilhões em infraestrutura para 2026",
    summary: "Recursos serão aplicados em estradas, saneamento e iluminação pública em todo o DF.",
    image: cityImg,
    chapeu: "DF",
    color: "#0b3d91",
    size: "large",
  },
  {
    id: "fh-2",
    title: "Parque Nacional de Brasília recebe certificação internacional",
    summary: "Reconhecimento da UNESCO valoriza preservação ambiental.",
    image: parkImg,
    chapeu: "Meio Ambiente",
    color: "#16a34a",
    size: "medium",
  },
  {
    id: "fh-3",
    title: "Hospital da Asa Norte inaugura UTI Neonatal com 20 leitos",
    summary: "Investimento de R$ 8 milhões vai atender prematuros.",
    image: hospitalImg,
    chapeu: "Saúde",
    color: "#16a34a",
    size: "medium",
  },
  {
    id: "fh-4",
    title: "Brasília se torna polo de inteligência artificial",
    summary: "Hub tecnológico vai acelerar 50 startups de IA.",
    image: heroImg,
    chapeu: "Tecnologia",
    color: "#0284c7",
    size: "medium",
  },
  {
    id: "fh-5",
    title: "DF amplia fiscalização contra desmatamento ilegal",
    summary: "Operação conjunta com Ibama e Polícia Militar.",
    image: policeImg,
    chapeu: "Segurança",
    color: "#dc2626",
    size: "medium",
  },
  {
    id: "fh-6",
    title: "Nova rodoviária interestadual deve ficar pronta em 2026",
    summary: "Terminal moderno terá capacidade para 100 mil passageiros por dia.",
    image: trafficImg,
    chapeu: "Infraestrutura",
    color: "#b45309",
    size: "medium",
  },
];

export default function FeaturedHighlights() {
  const large = highlights[0];
  const medium = highlights.slice(1);

  return (
    <section className="bg-[#f8f9fa] border-t border-b border-gray-200 py-8">
      <div className="max-w-[1280px] mx-auto px-4">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-1 h-5 bg-[#c8102e]" />
          <h2 className="text-[17px] font-bold text-[#1a1a1a] uppercase tracking-wider">Destaques do Dia</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Grande destaque */}
          <Link href={`/artigo/${large.id}`} className="block group lg:col-span-1 lg:row-span-2">
            <div className="relative overflow-hidden bg-gray-100 h-full min-h-[300px] lg:min-h-full">
              <img
                src={large.image}
                alt={large.title}
                className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 p-5 w-full">
                <span className="inline-block text-white text-[11px] font-bold px-3 py-1 uppercase tracking-wider mb-2" style={{ backgroundColor: large.color }}>
                  {large.chapeu}
                </span>
                <h3 className="font-serif text-white text-[22px] font-black leading-snug group-hover:text-white/80 transition-colors">
                  {large.title}
                </h3>
                <p className="text-white/70 text-sm leading-relaxed mt-2 line-clamp-2">
                  {large.summary}
                </p>
              </div>
            </div>
          </Link>

          {/* 4 destaques médios */}
          {medium.map((item) => (
            <Link key={item.id} href={`/artigo/${item.id}`} className="block group">
              <div className="flex gap-3 h-full">
                <div className="w-[120px] h-[90px] shrink-0 overflow-hidden bg-gray-100">
                  <img
                    src={item.image}
                    alt={item.chapeu}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <div className="flex flex-col justify-center min-w-0">
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: item.color }}>
                    {item.chapeu}
                  </span>
                  <h3 className="font-serif text-[#1a1a1a] text-[16px] font-bold leading-snug group-hover:text-[#1d4ed8] transition-colors line-clamp-2">
                    {item.title}
                  </h3>
                  <p className="text-gray-400 text-[12px] mt-1 line-clamp-1">
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
