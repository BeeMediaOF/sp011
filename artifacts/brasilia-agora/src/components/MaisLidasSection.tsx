import { Link } from "wouter";
import heroImg from "../assets/images/hero.png";
import trafficImg from "../assets/images/traffic.png";
import hospitalImg from "../assets/images/hospital.png";
import busImg from "../assets/images/bus.png";
import studentsImg from "../assets/images/students.png";
import policeImg from "../assets/images/police.png";
import parkImg from "../assets/images/park.png";
import culturaFeatImg from "../assets/images/cultura_feat.png";

const maisLidas = [
  { id: "ml-1", rank: 1, title: "Câmara Legislativa aprova projeto que cria o programa Morar DF", tag: "POLÍTICA", tagColor: "#1d4ed8", time: "2 horas atrás", img: heroImg },
  { id: "ml-2", rank: 2, title: "Obras no Eixão alteram trânsito neste fim de semana em Brasília", tag: "TRÂNSITO", tagColor: "#ea580c", time: "1 hora atrás", img: trafficImg },
  { id: "ml-3", rank: 3, title: "Hospitais do DF registram queda nos casos de dengue em maio", tag: "SAÚDE", tagColor: "#16a34a", time: "4 horas atrás", img: hospitalImg },
  { id: "ml-4", rank: 4, title: "GDF anuncia mais 124 ônibus para reforçar o transporte público", tag: "TRANSPORTE", tagColor: "#0284c7", time: "6 horas atrás", img: busImg },
  { id: "ml-5", rank: 5, title: "Escolas públicas do DF alcançam melhores índices no IDEB 2023", tag: "EDUCAÇÃO", tagColor: "#7c3aed", time: "7 horas atrás", img: studentsImg },
];

const noticiasRapidas = [
  { id: "nr-1", time: "10:30", title: "Concurso da Polícia Civil do DF tem edital lançado com 300 vagas" },
  { id: "nr-2", time: "09:55", title: "Governo do DF anuncia reajuste salarial para servidores da saúde" },
  { id: "nr-3", time: "09:20", title: "Metrô do DF vai operar em horário estendido no fim de semana" },
  { id: "nr-4", time: "08:45", title: "Nova UPA é inaugurada na Ceilândia com atendimento 24h" },
  { id: "nr-5", time: "08:10", title: "Brasília recebe etapa do circuito brasileiro de vôlei de praia" },
  { id: "nr-6", time: "07:40", title: "GDF lança edital de licitação para reforma do Parque da Cidade" },
];

export default function MaisLidasSection() {
  return (
    <section className="border-t border-gray-200 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* —— MAIS LIDAS —— Grid de 2 colunas com cards grandes */}
        <div className="lg:col-span-7">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1 h-6 bg-[#c8102e]" />
            <h2 className="text-xl font-black text-[#0d1633] uppercase tracking-wide">Mais Lidas</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Top 1 — card grande destaque */}
            <Link href={`/artigo/${maisLidas[0].id}`} className="sm:col-span-2 block group relative overflow-hidden bg-gray-900">
              <img src={maisLidas[0].img} alt={maisLidas[0].title} className="w-full h-[220px] object-cover group-hover:scale-105 transition-transform duration-700" />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
              <div className="absolute top-3 left-3 bg-[#c8102e] text-white text-[10px] font-black px-2 py-0.5 uppercase tracking-wider">#1 Mais Lida</div>
              <div className="absolute bottom-0 left-0 p-5 w-full">
                <span className="text-[10px] font-bold text-[#1d4ed8] uppercase">{maisLidas[0].tag}</span>
                <h3 className="text-white font-black text-lg leading-snug mt-1 group-hover:text-blue-200 transition-colors">
                  {maisLidas[0].title}
                </h3>
                <span className="text-gray-400 text-xs mt-2 block">{maisLidas[0].time}</span>
              </div>
            </Link>

            {/* #2 a #5 — 4 cards em grid 2x2 */}
            {maisLidas.slice(1, 5).map((item) => (
              <Link key={item.id} href={`/artigo/${item.id}`} className="block group bg-white border border-gray-200 hover:border-[#c8102e] transition-colors">
                <div className="overflow-hidden">
                  <img src={item.img} alt={item.title} className="w-full h-[120px] object-cover group-hover:scale-105 transition-transform duration-500" />
                </div>
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-black text-[#c8102e] bg-[#c8102e]/10 px-1.5 py-0.5">#{item.rank}</span>
                    <span className="text-[10px] font-bold uppercase" style={{ color: item.tagColor }}>{item.tag}</span>
                  </div>
                  <h4 className="font-bold text-[#0d1633] text-sm leading-snug group-hover:text-[#c8102e] transition-colors line-clamp-2">
                    {item.title}
                  </h4>
                  <span className="text-gray-400 text-xs mt-1 block">{item.time}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* —— ÚLTIMAS HORAS —— Timeline vertical com linha */}
        <div className="lg:col-span-5">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1 h-6 bg-[#0d1633]" />
            <h2 className="text-xl font-black text-[#0d1633] uppercase tracking-wide">Últimas Horas</h2>
          </div>

          <div className="relative pl-6">
            {/* Linha vertical da timeline */}
            <div className="absolute left-2 top-2 bottom-2 w-px bg-[#c8102e]/30" />

            <div className="flex flex-col gap-0">
              {noticiasRapidas.map((item, index) => (
                <Link key={item.id} href={`/artigo/${item.id}`} className="block group relative py-3">
                  {/* Bolinha na timeline */}
                  <div className="absolute -left-5 top-5 w-2.5 h-2.5 rounded-full bg-[#c8102e] border-2 border-white group-hover:scale-125 transition-transform" />
                  <div className="flex gap-3 items-start">
                    <span className="text-[#c8102e] font-black text-xs min-w-[38px] pt-0.5 shrink-0">{item.time}</span>
                    <div>
                      <h4 className="font-semibold text-[#0d1633] text-sm leading-snug group-hover:text-[#c8102e] transition-colors">
                        {item.title}
                      </h4>
                      {index === 0 && <span className="inline-block mt-1 bg-[#0d1633] text-white text-[10px] font-bold px-2 py-0.5 uppercase">Nova</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Mini-galeria abaixo */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-1 h-5 bg-[#c8102e]" />
              <h3 className="text-sm font-black text-[#0d1633] uppercase tracking-wide">Galeria</h3>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[policeImg, parkImg, culturaFeatImg].map((img, i) => (
                <Link key={i} href="/" className="block group overflow-hidden">
                  <img src={img} alt="Galeria" className="w-full h-[80px] object-cover group-hover:scale-110 transition-transform duration-500" />
                </Link>
              ))}
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
