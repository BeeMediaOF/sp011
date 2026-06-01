import { Link } from "wouter";
import cityImg from "../assets/images/city.png";
import busImg from "../assets/images/bus.png";
import hospitalImg from "../assets/images/hospital.png";
import parkImg from "../assets/images/park.png";
import trafficImg from "../assets/images/traffic.png";
import policeImg from "../assets/images/police.png";
import heroImg from "../assets/images/hero.png";
import studentsImg from "../assets/images/students.png";
import culturaFeatImg from "../assets/images/cultura_feat.png";

const sidebarNews = [
  {
    id: "sb-1",
    title: "GDF investe R$ 3 bilhões em infraestrutura para 2026",
    image: cityImg,
    chapeu: "DF",
    time: "10 min",
    color: "#0b3d91",
  },
  {
    id: "sb-2",
    title: "Parque Nacional de Brasília recebe certificação internacional",
    image: parkImg,
    chapeu: "Meio Ambiente",
    time: "25 min",
    color: "#16a34a",
  },
  {
    id: "sb-3",
    title: "Eixo Monumental ganha projeto de revitalização urbanística",
    image: trafficImg,
    chapeu: "Urbanismo",
    time: "40 min",
    color: "#1d4ed8",
  },
  {
    id: "sb-4",
    title: "DF amplia rede de coleta seletiva para todas as RAs",
    image: busImg,
    chapeu: "Sustentabilidade",
    time: "55 min",
    color: "#16a34a",
  },
  {
    id: "sb-5",
    title: "Brasília completa 66 anos com programação especial",
    image: culturaFeatImg,
    chapeu: "Cultura",
    time: "1h",
    color: "#0d9488",
  },
  {
    id: "sb-6",
    title: "Hospital da Asa Norte inaugura UTI Neonatal com 20 leitos",
    image: hospitalImg,
    chapeu: "Saúde",
    time: "1h",
    color: "#16a34a",
  },
  {
    id: "sb-7",
    title: "DF amplia fiscalização contra desmatamento ilegal",
    image: policeImg,
    chapeu: "Segurança",
    time: "2h",
    color: "#dc2626",
  },
  {
    id: "sb-8",
    title: "Nova rodoviária interestadual de Brasília deve ficar pronta em 2026",
    image: trafficImg,
    chapeu: "Infraestrutura",
    time: "2h",
    color: "#b45309",
  },
  {
    id: "sb-9",
    title: "Brasília se torna polo de IA com nova incubadora",
    image: heroImg,
    chapeu: "Tecnologia",
    time: "3h",
    color: "#0284c7",
  },
  {
    id: "sb-10",
    title: "Universidade de Brasília abre 2 mil vagas em tecnologia",
    image: studentsImg,
    chapeu: "Educação",
    time: "3h",
    color: "#0d9488",
  },
];

export default function NewsSidebar() {
  return (
    <div className="bg-white border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1 h-4 bg-[#c8102e]" />
        <h3 className="text-[13px] font-bold text-[#1a1a1a] uppercase tracking-wider">Em Destaque</h3>
      </div>
      <div className="flex flex-col gap-4">
        {sidebarNews.map((item, index) => (
          <Link key={item.id} href={`/artigo/${item.id}`} className="block group">
            <div className="flex gap-3">
              <div className="w-[70px] h-[50px] shrink-0 overflow-hidden bg-gray-100">
                <img
                  src={item.image}
                  alt={item.chapeu}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: item.color }}>
                  {item.chapeu}
                </span>
                <h4 className="font-serif text-[#1a1a1a] text-[13px] font-bold leading-snug group-hover:text-[#1d4ed8] transition-colors line-clamp-2">
                  {item.title}
                </h4>
                <span className="text-[10px] text-gray-400">{item.time}</span>
              </div>
            </div>
            {index < sidebarNews.length - 1 && <div className="border-b border-gray-100 mt-4" />}
          </Link>
        ))}
      </div>
    </div>
  );
}
