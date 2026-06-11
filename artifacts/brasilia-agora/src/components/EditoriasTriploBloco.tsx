import React from "react";
import { Link } from "wouter";
import politicaFeatImg from "../assets/images/politica_feat.webp";
import politics2Img from "../assets/images/politics2.webp";
import heroImg from "../assets/images/hero.webp";
import cityImg from "../assets/images/city.webp";
import brasilImg from "../assets/images/brasil.webp";
import economiaImg from "../assets/images/especial.webp";
import busImg from "../assets/images/bus.webp";
import trafficImg from "../assets/images/traffic.webp";
import festivalImg from "../assets/images/festival.webp";
import hospitalImg from "../assets/images/hospital.webp";
import policeImg from "../assets/images/police.webp";
import studentsImg from "../assets/images/students.webp";

interface MiniArticle {
  img: string;
  titulo: string;
  slug: string;
}

interface Coluna {
  label: string;
  labelColor: string;
  overlayColor: string;
  href: string;
  destaque: { img: string; titulo: string; slug: string };
  artigos: MiniArticle[];
}

const colunas: Coluna[] = [
  {
    label: "Politica",
    labelColor: "#1d4ed8",
    overlayColor: "rgba(29,78,216,0.78)",
    href: "/politica",
    destaque: {
      img: politicaFeatImg,
      titulo: "Governador do DF lanca pacote de obras que vai modernizar 15 regioes administrativas",
      slug: "governador-df-obras-modernizar",
    },
    artigos: [
      { img: politics2Img, titulo: "Camara Legislativa aprova aumento de 12% para servidores publicos do DF", slug: "cldf-aumento-servidores" },
      { img: heroImg, titulo: "GDF encaminha a CLDF proposta do orcamento para 2025 com R$ 48 bilhoes", slug: "gdf-orcamento-2025" },
      { img: policeImg, titulo: "Ministerio da Justica lanca programa nacional de combate a corrupcao municipal", slug: "mj-programa-corrupcao" },
    ],
  },
  {
    label: "Economia",
    labelColor: "#f97316",
    overlayColor: "rgba(194,65,12,0.78)",
    href: "/economia",
    destaque: {
      img: cityImg,
      titulo: "DF bate recorde de exportacoes no primeiro semestre e lidera crescimento nacional",
      slug: "df-recorde-exportacoes",
    },
    artigos: [
      { img: economiaImg, titulo: "Brasilia e eleita melhor cidade para investir no Brasil em 2025", slug: "brasilia-melhor-cidade-investir" },
      { img: brasilImg, titulo: "GDF libera R$ 500 milhoes em credito para micro e pequenas empresas", slug: "gdf-credito-micro-empresas" },
      { img: hospitalImg, titulo: "Inflacao recua para 3,8% em maio, menor indice desde 2020", slug: "inflacao-recua-maio-2025" },
    ],
  },
  {
    label: "Negocios",
    labelColor: "#0d9488",
    overlayColor: "rgba(15,118,110,0.78)",
    href: "/economia",
    destaque: {
      img: festivalImg,
      titulo: "Feira de negocios de Brasilia reune mais de 500 empresas e espera movimentar R$ 1 bilhao",
      slug: "feira-negocios-brasilia-500-empresas",
    },
    artigos: [
      { img: busImg, titulo: "Setor de tecnologia do DF cria 2 mil novas vagas de emprego em startups", slug: "tecnologia-df-vagas-emprego" },
      { img: trafficImg, titulo: "GDF anuncia incentivos fiscais para empresas de energia solar na capital", slug: "gdf-incentivos-energia-solar" },
    ],
  },
];

export default function EditoriasTriploBloco() {
  return (
    <section className="border-t border-gray-200 py-8">
      <div className="max-w-[1280px] mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-200">
          {colunas.map((col) => (
            <div key={col.label} className="px-0 md:px-6 first:pl-0 last:pr-0 py-6 md:py-0">
              {/* Cabecalho da coluna */}
              <div className="flex items-center justify-between mb-4 pb-3 border-b-2" style={{ borderColor: col.labelColor }}>
                <h2
                  className="text-[20px] font-black tracking-tight"
                  style={{ color: col.labelColor }}
                >
                  {col.label}
                </h2>
                <Link
                  href={col.href}
                  className="text-[10px] font-bold uppercase tracking-widest hover:underline"
                  style={{ color: col.labelColor }}
                >
                  Ver mais
                </Link>
              </div>

              {/* Card destaque */}
              <Link href={`/artigo/${col.destaque.slug}`} className="group block mb-4">
                <div className="relative overflow-hidden aspect-[4/3]">
                  <img
                    src={col.destaque.img}
                    alt={col.destaque.titulo}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div
                    className="absolute inset-0"
                    style={{ background: `linear-gradient(to top, ${col.overlayColor} 0%, transparent 55%)` }}
                  />
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <h3 className="text-white font-bold text-[16px] leading-snug">
                      {col.destaque.titulo}
                    </h3>
                  </div>
                </div>
              </Link>

              {/* Artigos menores */}
              <div className="flex flex-col divide-y divide-gray-100">
                {col.artigos.map((art) => (
                  <Link key={art.slug} href={`/artigo/${art.slug}`} className="group flex gap-3 items-start py-3 first:pt-0">
                    <img
                      src={art.img}
                      alt={art.titulo}
                      className="w-16 h-14 object-cover rounded shrink-0"
                    />
                    <h4 className="text-[13px] font-bold text-[#1a1a1a] leading-snug group-hover:text-[#c8102e] transition-colors line-clamp-3">
                      {art.titulo}
                    </h4>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
