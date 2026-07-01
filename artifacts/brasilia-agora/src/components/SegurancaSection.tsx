import { Link } from "wouter";
import policeImg from "../assets/images/police.webp";
import security2Img from "../assets/images/security2.webp";
import { safeTitleHtml } from "@/lib/sanitize";

const articles = [
  {
    id: "seg-1",
    title: "Operação prende 12 suspeitos de tráfico no Recanto das Emas",
    time: "1 hora atrás",
    img: policeImg,
  },
  {
    id: "seg-2",
    title: "PMDF reforça policiamento nos parques do DF neste fim de semana",
    time: "2 horas atrás",
    img: security2Img,
  },
  {
    id: "seg-3",
    title: "Câmeras de monitoramento ajudam a reduzir crimes no Plano Piloto",
    time: "5 horas atrás",
    img: policeImg,
  },
];

export default function SegurancaSection() {
  return (
    <section className="max-w-[1280px] mx-auto px-4 py-8 border-t border-gray-200">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <div className="w-1.5 h-6 bg-[#dc2626] mr-3"></div>
          <h2 className="text-xl font-bold text-[#1a2448]">SEGURANÇA</h2>
        </div>
        <Link href="/seguranca" className="text-xs font-bold text-[#dc2626] hover:underline uppercase tracking-wide">
          Ver mais →
        </Link>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <Link href="/artigo/seg-destaque" className="w-full lg:w-2/5 group cursor-pointer block">
          <div className="relative h-64 overflow-hidden rounded-sm bg-gray-900">
            <img
              src={security2Img}
              alt="Segurança"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent"></div>
            <div className="absolute bottom-0 left-0 p-4">
              <span className="inline-block bg-[#dc2626] text-white text-[10px] font-bold px-2 py-1 mb-2">SEGURANÇA</span>
              <h3 className="text-white font-bold text-lg leading-tight group-hover:text-red-200 transition-colors">
                Polícia Civil do DF registra queda de 18% nos crimes contra o patrimônio em maio
              </h3>
              <span className="text-gray-400 text-xs mt-2 block">30 minutos atrás</span>
            </div>
          </div>
        </Link>

        <div className="w-full lg:w-3/5 flex flex-col justify-between divide-y divide-gray-200">
          {articles.map((item) => (
            <Link
              key={item.id}
              href={`/artigo/${item.id}`}
              className="flex gap-4 group cursor-pointer py-4 first:pt-0 last:pb-0 block"
              data-testid={`card-seguranca-${item.id}`}
            >
              <div className="w-24 h-16 shrink-0 overflow-hidden rounded-sm">
                <img
                  src={item.img}
                  alt={item.title.replace(/<[^>]*>/g, "")}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>
              <div className="flex flex-col justify-center">
                <span className="text-[#dc2626] text-[10px] font-bold mb-1">SEGURANÇA</span>
                <h4 className="font-bold text-[#1a2448] text-sm leading-snug group-hover:text-[#dc2626] transition-colors"
                  dangerouslySetInnerHTML={{ __html: safeTitleHtml(item.title) }}
                />
                <span className="text-gray-500 text-xs mt-1">{item.time}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
