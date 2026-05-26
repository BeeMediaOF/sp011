import { Link } from "wouter";
import sportsImg from "../assets/images/sports.png";
import parkImg from "../assets/images/park.png";
import festivalImg from "../assets/images/festival.png";

const articles = [
  {
    id: "esp-1",
    title: "Mané Garrincha recebe jogo da Série B neste domingo com mais de 40 mil torcedores",
    time: "2 horas atrás",
    img: sportsImg,
  },
  {
    id: "esp-2",
    title: "Brasília FC entra na briga pelo acesso à Série A com vitória por 2 a 0",
    time: "4 horas atrás",
    img: parkImg,
  },
  {
    id: "esp-3",
    title: "Atletas do DF conquistam três medalhas no Campeonato Brasileiro de Atletismo",
    time: "6 horas atrás",
    img: festivalImg,
  },
];

export default function EsportesSection() {
  return (
    <section className="bg-[#f7f7f7] py-8 border-t border-gray-200">
      <div className="max-w-[1280px] mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <div className="w-1.5 h-6 bg-[#b45309] mr-3"></div>
            <h2 className="text-xl font-bold text-[#1a2448]">ESPORTES</h2>
          </div>
          <Link href="/esportes" className="text-xs font-bold text-[#b45309] hover:underline uppercase tracking-wide">
            Ver mais →
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Link href="/artigo/esp-destaque" className="lg:col-span-1 group cursor-pointer block">
            <div className="relative h-64 overflow-hidden rounded-sm bg-gray-900">
              <img
                src={sportsImg}
                alt="Esportes"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"></div>
              <div className="absolute bottom-0 left-0 p-4 w-full">
                <span className="inline-block bg-[#b45309] text-white text-[10px] font-bold px-2 py-1 mb-2">ESPORTES</span>
                <h3 className="text-white font-bold text-base leading-snug group-hover:text-amber-200 transition-colors">
                  GDF anuncia investimento de R$ 50 milhões na reforma do Estádio Mané Garrincha
                </h3>
                <span className="text-gray-400 text-xs mt-1 block">1 hora atrás</span>
              </div>
            </div>
          </Link>

          <div className="lg:col-span-2 flex flex-col divide-y divide-gray-200 bg-white rounded-sm px-4">
            {articles.map((item) => (
              <Link
                key={item.id}
                href={`/artigo/${item.id}`}
                className="flex gap-4 group cursor-pointer py-4 first:pt-4 last:pb-4 block"
                data-testid={`card-esportes-${item.id}`}
              >
                <div className="w-28 h-20 shrink-0 overflow-hidden rounded-sm">
                  <img
                    src={item.img}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <div className="flex flex-col justify-center">
                  <span className="text-[#b45309] text-[10px] font-bold mb-1">ESPORTES</span>
                  <h4 className="font-bold text-[#1a2448] text-sm leading-snug group-hover:text-[#b45309] transition-colors">
                    {item.title}
                  </h4>
                  <span className="text-gray-500 text-xs mt-1">{item.time}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
