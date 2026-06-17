import React from "react";
import { Link } from "wouter";
import CotacaoWidget from "./CotacaoWidget";
import trafficImg from "../assets/images/traffic.webp";
import festivalImg from "../assets/images/festival.webp";
import busImg from "../assets/images/bus.webp";
import policeImg from "../assets/images/police.webp";
import brasilImg from "../assets/images/brasil.webp";
import politicaFeatImg from "../assets/images/politica_feat.webp";
import heroImg from "../assets/images/hero.webp";
import hospitalImg from "../assets/images/hospital.webp";
import studentsImg from "../assets/images/students.webp";
import { useAds, trackClick } from "./ads/useAds";

const artigos = [
  {
    id: "eco-3",
    image: trafficImg,
    categoria: "Economia",
    categoriaColor: "#b45309",
    tempo: "Ha 1 hora",
    titulo: "Feira de negócios de Brasília reúne mais de 500 empresas",
    resumo: "Evento espera movimentar R$ 1 bilhão em contratos durante a semana. Destaque para o setor de construção civil, tecnologia e agronegócio.",
    slug: "eco-3",
  },
  {
    id: "pol-3",
    image: festivalImg,
    categoria: "Política",
    categoriaColor: "#1d4ed8",
    tempo: "Ha 2 horas",
    titulo: "GDF encaminha à CLDF proposta do orçamento para 2025 com R$ 48 bilhões",
    resumo: "Maior investimento em saúde, educação e infraestrutura da história. Destaque para 12 novos hospitais e 50 escolas de tempo integral na capital federal.",
    slug: "pol-3",
  },
  {
    id: "mun-1",
    image: politicaFeatImg,
    categoria: "Mundo",
    categoriaColor: "#6b21a8",
    tempo: "Ha 2 horas",
    titulo: "Cúpula do G7 debate crise climática e promete corte de 50% nas emissões",
    resumo: "Líderes se comprometem com metas mais ambiciosas para 2035.",
    slug: "mun-1",
  },
  {
    id: "bra-1",
    image: busImg,
    categoria: "Brasil",
    categoriaColor: "#16a34a",
    tempo: "Ha 3 horas",
    titulo: "Governo Federal anuncia novo programa habitacional com 1 milhão de moradias",
    resumo: "Minha Casa Minha Vida volta com novo formato e subsídios para famílias de baixa renda.",
    slug: "bra-1",
  },
  {
    id: "bra-2",
    image: brasilImg,
    categoria: "Brasil",
    categoriaColor: "#16a34a",
    tempo: "Ha 4 horas",
    titulo: "STF retoma julgamento de casos relacionados ao setor de telecomunicações",
    resumo: "Corte analisa ações sobre regulação de internet e 5G no Brasil.",
    slug: "bra-2",
  },
  {
    id: "df-1",
    image: policeImg,
    categoria: "DF",
    categoriaColor: "#0b3d91",
    tempo: "Ha 5 horas",
    titulo: "GDF investe R$ 3 bilhões em infraestrutura para 2026",
    resumo: "Recursos serão aplicados em estradas, saneamento e iluminação pública.",
    slug: "df-1",
  },
];

const maisLidas = [
  { id: "pol-2", rank: 1, title: "Câmara Legislativa aprova projeto que cria o programa Morar DF", img: heroImg },
  { id: "df-3",  rank: 2, title: "Obras no Eixão alteram trânsito neste fim de semana em Brasília", img: trafficImg },
  { id: "sau-1", rank: 3, title: "Hospitais do DF registram queda nos casos de dengue em maio", img: hospitalImg },
  { id: "df-4",  rank: 4, title: "GDF anuncia mais 124 ônibus para reforçar o transporte público", img: busImg },
  { id: "tec-4", rank: 5, title: "Universidade de Brasília desenvolve chip brasileiro para IoT", img: studentsImg },
];

function AdSidebarInline() {
  const { sidebars, loading } = useAds();
  const ad = sidebars[0] ?? null;

  return (
    <div className="mt-6">
      <p className="text-[9px] text-gray-300 mb-1 text-center tracking-wider uppercase">Publicidade</p>
      {!loading && ad ? (
        <a
          href={ad.link}
          target="_blank"
          rel="noreferrer"
          onClick={() => trackClick(ad.id)}
          className="block w-full h-[280px] rounded border border-gray-100 overflow-hidden"
        >
          <img src={ad.imageBase64} alt="Publicidade" className="w-full h-full object-cover" />
        </a>
      )}
    </div>
  );
}

export default function DestaquesListaBadge() {
  return (
    <section className="border-t border-gray-200 py-8">
      <div className="max-w-[1280px] mx-auto px-4">
        <div className="flex flex-col lg:flex-row gap-10 items-start">

          {/* ── Coluna principal: lista de noticias ── */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-1 h-5 bg-[#c8102e]" />
              <h2 className="text-[17px] font-bold text-[#1a1a1a] uppercase tracking-wider">
                Ultimas Noticias
              </h2>
            </div>

            <div className="flex flex-col divide-y divide-gray-200">
              {artigos.map((art) => (
                <Link key={art.id} href={`/artigo/${art.slug}`} className="group block py-4 first:pt-0">
                  <div className="flex gap-3 items-start">
                    <img
                      src={art.image}
                      alt={art.titulo}
                      className="w-[90px] h-[68px] sm:w-[160px] sm:h-[108px] object-cover rounded flex-shrink-0 group-hover:opacity-90 transition-opacity"
                    />
                    <div className="flex-1 min-w-0 py-0.5 mr-[101px]">
                      <span
                        className="text-[10px] font-bold uppercase tracking-widest mb-1 block"
                        style={{ color: art.categoriaColor }}
                      >
                        {art.categoria}
                      </span>
                      <h4 className="font-serif font-black text-[#1a1a1a] text-[15px] sm:text-[19px] leading-snug mb-1.5 group-hover:text-[#c8102e] transition-colors line-clamp-3">
                        {art.titulo}
                      </h4>
                      <p className="hidden sm:block text-[13px] text-gray-500 leading-relaxed mb-2 line-clamp-2">
                        {art.resumo}
                      </p>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                        {art.tempo}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* ── Sidebar: Cotações + Mais Lidas + Propaganda ── */}
          <aside className="w-full lg:w-[300px] shrink-0 mt-2 lg:mt-[10px] mb-[10px]">
            {/* Cotações em tempo real */}
            <CotacaoWidget />

            {/* Mais Lidas */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-1 h-5 bg-[#c8102e]" />
              <h2 className="text-[17px] font-bold text-[#1a1a1a] uppercase tracking-wider">
                Mais Lidas
              </h2>
            </div>

            <div className="flex flex-col divide-y divide-gray-200">
              {maisLidas.map((item) => (
                <Link key={item.id} href={`/artigo/${item.id}`} className="group flex items-start gap-3 py-4 first:pt-0">
                  <span className="text-[28px] font-black text-[#c8102e] leading-none w-7 shrink-0 select-none">
                    {item.rank}
                  </span>
                  <div className="flex gap-3 items-start min-w-0">
                    <img
                      src={item.img}
                      alt={item.title.replace(/<[^>]*>/g, "")}
                      className="w-16 h-12 object-cover rounded shrink-0"
                    />
                    <h4 className="text-[13px] font-bold text-[#1a1a1a] leading-snug group-hover:text-[#c8102e] transition-colors line-clamp-3"
                      dangerouslySetInnerHTML={{ __html: item.title }}
                    />
                  </div>
                </Link>
              ))}
            </div>

            {/* Propaganda */}
            <AdSidebarInline />
          </aside>

        </div>
      </div>
    </section>
  );
}
