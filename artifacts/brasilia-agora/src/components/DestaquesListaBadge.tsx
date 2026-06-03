import React from "react";
import { Link } from "wouter";
import trafficImg from "../assets/images/traffic.png";
import festivalImg from "../assets/images/festival.png";
import busImg from "../assets/images/bus.png";
import policeImg from "../assets/images/police.png";
import brasilImg from "../assets/images/brasil.png";
import politicaFeatImg from "../assets/images/politica_feat.png";

interface BadgeArticle {
  id: string;
  image: string;
  categoria: string;
  categoriaColor: string;
  tempo: string;
  titulo: string;
  resumo: string;
  slug: string;
}

const artigos: BadgeArticle[] = [
  {
    id: "dlb-1",
    image: trafficImg,
    categoria: "Fornecedores Internacionais",
    categoriaColor: "#f97316",
    tempo: "Há 1 hora",
    titulo: "País coberto por desertos compra areia do exterior para obras",
    resumo: "Material local não serve para concreto de grandes projetos, levando o reino a depender de fornecedores internacionais para construir",
    slug: "pais-deserto-areia-exterior",
  },
  {
    id: "dlb-2",
    image: festivalImg,
    categoria: "Feminicídio",
    categoriaColor: "#f97316",
    tempo: "Há 2 horas",
    titulo: "Mulher é morta dentro da própria casa; ex é o principal suspeito",
    resumo: "Homem esperou filhos saírem para a escola para invadir a casa da vítima; ele foi encontrado morto momentos depois do crime",
    slug: "mulher-morta-casa-ex-suspeito",
  },
  {
    id: "dlb-3",
    image: politicaFeatImg,
    categoria: "Tensão Internacional",
    categoriaColor: "#f97316",
    tempo: "Há 2 horas",
    titulo: '\u201cNós queremos paz\u201d, afirma Lula em reunião ministerial',
    resumo: "Presidente critica o unilateralismo de potências globais, anuncia carta a Trump e diz que o país vai mudar de postura",
    slug: "lula-queremos-paz-reuniao-ministerial",
  },
  {
    id: "dlb-4",
    image: busImg,
    categoria: "Infraestrutura",
    categoriaColor: "#f97316",
    tempo: "Há 3 horas",
    titulo: "Caravana 3D: Governo de SP entrega marginais, ciclovia e novos acessos urbanos na SP-326 em Barretos",
    resumo: "Intervenções de R$ 4,1 milhões melhoram a mobilidade, reforçam a segurança viária e reorganizam a circulação no trecho urbano",
    slug: "caravana-3d-sp-326-barretos",
  },
  {
    id: "dlb-5",
    image: brasilImg,
    categoria: "Social",
    categoriaColor: "#f97316",
    tempo: "Há 4 horas",
    titulo: "Tarifa Social Paulista: número de beneficiários cresce mais de 10 vezes em cidades de SP",
    resumo: "Programa do Governo de São Paulo que dá desconto na conta de água chega a 6 milhões de pessoas beneficiadas",
    slug: "tarifa-social-paulista-beneficiarios",
  },
  {
    id: "dlb-6",
    image: policeImg,
    categoria: "Justiça e Cidadania",
    categoriaColor: "#f97316",
    tempo: "Há 5 horas",
    titulo: "Poupatempo Móvel chega a Igaratá nesta quarta-feira",
    resumo: "Carreta ficará no município até o dia 10 de junho com atendimento presencial e orientação à população",
    slug: "poupatempo-movel-igarata",
  },
];

export default function DestaquesListaBadge() {
  return (
    <section className="border-t border-gray-200 py-8">
      <div className="max-w-[1280px] mx-auto px-4">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-1 h-5 bg-[#c8102e]" />
          <h2 className="text-[17px] font-bold text-[#1a1a1a] uppercase tracking-wider">
            Últimas Notícias
          </h2>
        </div>

        <div className="flex flex-col divide-y divide-gray-200">
          {artigos.map((art) => (
            <Link key={art.id} href={`/artigo/${art.slug}`} className="group block py-6 first:pt-0">
              <div className="flex gap-5 items-start">
                <img
                  src={art.image}
                  alt={art.titulo}
                  className="w-[260px] h-[174px] object-cover rounded-lg flex-shrink-0 group-hover:opacity-90 transition-opacity"
                />

                <div className="flex-1 min-w-0 py-1">
                  <span
                    className="text-[11px] font-bold uppercase tracking-widest mb-2 block"
                    style={{ color: art.categoriaColor }}
                  >
                    {art.categoria}
                  </span>

                  <h3 className="font-bold text-[#1a1a1a] text-[22px] leading-snug mb-2 group-hover:text-[#c8102e] transition-colors">
                    {art.titulo}
                  </h3>

                  <p className="text-[14px] text-gray-500 leading-relaxed mb-3 line-clamp-3">
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
    </section>
  );
}
