import { Link } from "wouter";
import heroImg from "../assets/images/hero.webp";
import trafficImg from "../assets/images/traffic.webp";
import hospitalImg from "../assets/images/hospital.webp";
import busImg from "../assets/images/bus.webp";
import studentsImg from "../assets/images/students.webp";

const maisLidas = [
  { id: "pol-2", rank: 1, title: "Câmara Legislativa aprova projeto que cria o programa Morar DF", img: heroImg },
  { id: "df-3",  rank: 2, title: "Obras no Eixão alteram trânsito neste fim de semana em Brasília", img: trafficImg },
  { id: "sau-1", rank: 3, title: "Hospitais do DF registram queda nos casos de dengue em maio", img: hospitalImg },
  { id: "df-4",  rank: 4, title: "GDF anuncia mais 124 ônibus para reforçar o transporte público", img: busImg },
  { id: "tec-4", rank: 5, title: "Escolas públicas do DF alcançam melhores índices no IDEB 2023", img: studentsImg },
];

export default function MostRead() {
  return (
    <div className="bg-[#f8f9fa] border-t border-b border-gray-200 py-6">
      <div className="max-w-[1280px] mx-auto px-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {maisLidas.map((item) => (
            <Link key={item.id} href={`/artigo/${item.id}`} className="block group">
              <div className="flex items-start gap-3">
                <span className="text-[32px] font-black text-[#c8102e] leading-none shrink-0 w-8 select-none">
                  {item.rank}
                </span>
                <div className="min-w-0">
                  <h4 className="font-serif text-[#1a1a1a] text-[15px] font-bold leading-snug group-hover:text-[#c8102e] transition-colors line-clamp-3">
                    {item.title}
                  </h4>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
