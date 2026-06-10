import React from "react";
import { Link } from "wouter";
import CotacaoWidget from "./CotacaoWidget";
import trafficImg from "../assets/images/traffic.png";
import festivalImg from "../assets/images/festival.png";
import busImg from "../assets/images/bus.png";
import policeImg from "../assets/images/police.png";
import brasilImg from "../assets/images/brasil.png";
import politicaFeatImg from "../assets/images/politica_feat.png";
import heroImg from "../assets/images/hero.png";
import hospitalImg from "../assets/images/hospital.png";
import studentsImg from "../assets/images/students.png";
import { useAds, trackClick } from "./ads/useAds";

const artigos = [
  {
    id: "dlb-1",
    image: trafficImg,
    categoria: "Fornecedores Internacionais",
    categoriaColor: "#f97316",
    tempo: "Ha 1 hora",
    titulo: "Pais coberto por desertos compra areia do exterior para obras",
    resumo: "Material local nao serve para concreto de grandes projetos, levando o reino a depender de fornecedores internacionais para construir",
    slug: "pais-deserto-areia-exterior",
  },
  {
    id: "dlb-2",
    image: festivalImg,
    categoria: "Feminicidio",
    categoriaColor: "#f97316",
    tempo: "Ha 2 horas",
    titulo: "Mulher e morta dentro da propria casa; ex e o principal suspeito",
    resumo: "Homem esperou filhos sairem para a escola para invadir a casa da vitima; ele foi encontrado morto momentos depois do crime",
    slug: "mulher-morta-casa-ex-suspeito",
  },
  {
    id: "dlb-3",
    image: politicaFeatImg,
    categoria: "Tensao Internacional",
    categoriaColor: "#f97316",
    tempo: "Ha 2 horas",
    titulo: "Nos queremos paz, afirma Lula em reuniao ministerial",
    resumo: "Presidente critica o unilateralismo de potencias globais, anuncia carta a Trump e diz que o pais vai mudar de postura",
    slug: "lula-queremos-paz-reuniao-ministerial",
  },
  {
    id: "dlb-4",
    image: busImg,
    categoria: "Infraestrutura",
    categoriaColor: "#f97316",
    tempo: "Ha 3 horas",
    titulo: "Caravana 3D: Governo de SP entrega marginais, ciclovia e novos acessos urbanos na SP-326 em Barretos",
    resumo: "Intervencoes de R$ 4,1 milhoes melhoram a mobilidade, reforcam a seguranca viaria e reorganizam a circulacao no trecho urbano",
    slug: "caravana-3d-sp-326-barretos",
  },
  {
    id: "dlb-5",
    image: brasilImg,
    categoria: "Social",
    categoriaColor: "#f97316",
    tempo: "Ha 4 horas",
    titulo: "Tarifa Social Paulista: numero de beneficiarios cresce mais de 10 vezes em cidades de SP",
    resumo: "Programa do Governo de Sao Paulo que da desconto na conta de agua chega a 6 milhoes de pessoas beneficiadas",
    slug: "tarifa-social-paulista-beneficiarios",
  },
  {
    id: "dlb-6",
    image: policeImg,
    categoria: "Justica e Cidadania",
    categoriaColor: "#f97316",
    tempo: "Ha 5 horas",
    titulo: "Poupatempo Movel chega a Igarata nesta quarta-feira",
    resumo: "Carreta ficara no municipio ate o dia 10 de junho com atendimento presencial e orientacao a populacao",
    slug: "poupatempo-movel-igarata",
  },
];

const maisLidas = [
  { id: "ml-1", rank: 1, title: "Camara Legislativa aprova projeto que cria o programa Morar DF", img: heroImg },
  { id: "ml-2", rank: 2, title: "Obras noEixao alteram transito neste fim de semana em Brasilia", img: trafficImg },
  { id: "ml-3", rank: 3, title: "Hospitais do DF registram queda nos casos de dengue em maio", img: hospitalImg },
  { id: "ml-4", rank: 4, title: "GDF anuncia mais 124 onibus para reforcar o transporte publico", img: busImg },
  { id: "ml-5", rank: 5, title: "Escolas publicas do DF alcancam melhores indices no IDEB 2023", img: studentsImg },
];

function AdSidebarInline() {
  const { sidebars, loading } = useAds();
  const ad = sidebars[0] ?? null;

  return (
    <div className="mt-6">
      <p className="text-[9px] text-gray-300 mb-1 text-center tracking-wider uppercase">Publicidade</p>
      {loading || !ad ? (
        <a
          href="https://www.itau.com.br/personnalite"
          target="_blank"
          rel="noreferrer"
          className="block w-full overflow-hidden rounded"
        >
          <img
            src="/ad-itau-personnalite.png"
            alt="Itau Personnalite — Chegou a conta para seus filhos"
            className="w-full h-auto object-cover"
          />
        </a>
      ) : (
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
        <div className="flex gap-10 items-start">

          {/* ── Coluna principal: lista de noticias ── */}
          <div className="flex-1 min-w-0 ml-[0px] mr-[102px]">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-1 h-5 bg-[#c8102e]" />
              <h2 className="text-[17px] font-bold text-[#1a1a1a] uppercase tracking-wider">
                Ultimas Noticias
              </h2>
            </div>

            <div className="flex flex-col divide-y divide-gray-200">
              {artigos.map((art) => (
                <Link key={art.id} href={`/artigo/${art.slug}`} className="group block py-6 first:pt-0">
                  <div className="flex gap-5 items-start">
                    <img
                      src={art.image}
                      alt={art.titulo}
                      className="w-[220px] h-[148px] object-cover rounded-lg flex-shrink-0 group-hover:opacity-90 transition-opacity"
                    />
                    <div className="flex-1 min-w-0 py-1">
                      <span
                        className="text-[11px] font-bold uppercase tracking-widest mb-2 block"
                        style={{ color: art.categoriaColor }}
                      >
                        {art.categoria}
                      </span>
                      <h3 className="font-serif font-black text-[#1a1a1a] text-[20px] leading-snug mb-2 group-hover:text-[#c8102e] transition-colors">
                        {art.titulo}
                      </h3>
                      <p className="text-[13px] text-gray-500 leading-relaxed mb-3 line-clamp-2">
                        {art.resumo}
                      </p>
                      <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                        {art.tempo}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* ── Sidebar: Cotações + Mais Lidas + Propaganda ── */}
          <aside className="hidden lg:block w-[300px] shrink-0 mt-[10px] mb-[10px]">
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
                      alt={item.title}
                      className="w-16 h-12 object-cover rounded shrink-0"
                    />
                    <h4 className="text-[13px] font-bold text-[#1a1a1a] leading-snug group-hover:text-[#c8102e] transition-colors line-clamp-3">
                      {item.title}
                    </h4>
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
