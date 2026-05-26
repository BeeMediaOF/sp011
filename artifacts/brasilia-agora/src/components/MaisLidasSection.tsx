import { Link } from "wouter";
import heroImg from "../assets/images/hero.png";
import trafficImg from "../assets/images/traffic.png";
import hospitalImg from "../assets/images/hospital.png";
import busImg from "../assets/images/bus.png";
import studentsImg from "../assets/images/students.png";

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
];

export default function MaisLidasSection() {
  return (
    <section className="max-w-[1280px] mx-auto px-4 py-8 border-t border-gray-200">
      <div className="flex flex-col lg:flex-row gap-8">

        <div className="w-full lg:w-3/5">
          <div className="flex items-center mb-6">
            <div className="w-1.5 h-6 bg-[#1a2448] mr-3"></div>
            <h2 className="text-xl font-bold text-[#1a2448]">MAIS LIDAS</h2>
          </div>

          <div className="flex flex-col divide-y divide-gray-200">
            {maisLidas.map((item) => (
              <Link
                key={item.id}
                href={`/artigo/${item.id}`}
                className="flex gap-4 group cursor-pointer py-4 first:pt-0 last:pb-0 block"
                data-testid={`card-mais-lidas-${item.id}`}
              >
                <div className="text-5xl font-black text-gray-100 leading-none w-10 shrink-0 select-none">
                  {item.rank}
                </div>
                <div className="w-20 h-14 shrink-0 overflow-hidden rounded-sm">
                  <img
                    src={item.img}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <div className="flex flex-col justify-center min-w-0">
                  <span className="text-[10px] font-bold mb-1" style={{ color: item.tagColor }}>{item.tag}</span>
                  <h4 className="font-bold text-[#1a2448] text-sm leading-snug group-hover:text-[#1d4ed8] transition-colors line-clamp-2">
                    {item.title}
                  </h4>
                  <span className="text-gray-500 text-xs mt-1">{item.time}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="w-full lg:w-2/5">
          <div className="flex items-center mb-6">
            <div className="w-1.5 h-6 bg-[#F5A623] mr-3"></div>
            <h2 className="text-xl font-bold text-[#1a2448]">ÚLTIMAS HORAS</h2>
          </div>

          <div className="flex flex-col divide-y divide-gray-200">
            {noticiasRapidas.map((item) => (
              <Link
                key={item.id}
                href={`/artigo/${item.id}`}
                className="flex gap-3 group cursor-pointer py-3 first:pt-0 last:pb-0 block"
                data-testid={`card-ultimas-horas-${item.id}`}
              >
                <span className="text-[#1a2448] font-bold text-sm min-w-[46px] pt-0.5 shrink-0">{item.time}</span>
                <p className="text-sm text-gray-800 font-medium leading-snug group-hover:text-[#1d4ed8] transition-colors">
                  {item.title}
                </p>
              </Link>
            ))}
          </div>

          <div className="mt-6 bg-[#1a2448] text-white p-4 rounded-sm">
            <p className="text-xs font-bold uppercase tracking-wider mb-1 text-[#F5A623]">Newsletter</p>
            <p className="text-sm font-semibold mb-3">Receba as principais notícias do DF no seu e-mail</p>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="Seu e-mail"
                className="flex-1 bg-white/10 border border-white/20 text-white placeholder-white/50 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#F5A623]"
                data-testid="input-newsletter-email"
              />
              <button
                className="bg-[#F5A623] text-[#1a2448] font-bold text-sm px-4 py-2 hover:bg-[#e09620] transition-colors"
                data-testid="button-newsletter-subscribe"
              >
                OK
              </button>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
