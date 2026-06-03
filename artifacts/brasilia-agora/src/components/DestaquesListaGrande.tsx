import React from "react";
import { Link } from "wouter";
import brasilImg from "../assets/images/brasil.png";
import politicaFeatImg from "../assets/images/politica_feat.png";
import sportsImg from "../assets/images/sports.png";

interface SubArticle {
  title: string;
  slug: string;
  author?: string;
}

interface DestaqueItem {
  id: string;
  image: string;
  imageAlt: string;
  categoria: string;
  categoriaColor: string;
  titulo: string;
  slug: string;
  tempo: string;
  editoria: string;
  subArtigos?: SubArticle[];
}

const destaques: DestaqueItem[] = [
  {
    id: "dl-1",
    image: brasilImg,
    imageAlt: "Desmatamento",
    categoria: "Meio Ambiente",
    categoriaColor: "#16a34a",
    titulo: "EUA usam dados antigos de desmatamento e excluem madeira do tarifaço",
    slug: "eua-dados-desmatamento-tarifaco",
    tempo: "Há 31 minutos",
    editoria: "Meio Ambiente",
    subArtigos: [
      { title: "CAMILA BOMFIM: secretário dos EUA diz que quer manter diálogo", slug: "secretario-eua-dialogo" },
    ],
  },
  {
    id: "dl-2",
    image: politicaFeatImg,
    imageAlt: "Lula",
    categoria: "Política",
    categoriaColor: "#1d4ed8",
    titulo: "Lula diz que foi pego de surpresa com tarifaço e que vai enviar carta a Trump",
    slug: "lula-surpresa-tarifaco-carta-trump",
    tempo: "Há 2 horas",
    editoria: "Política",
    subArtigos: [
      { title: "China chama ação dos EUA de 'desculpa para manipulação política'", slug: "china-eua-manipulacao-politica" },
    ],
  },
  {
    id: "dl-3",
    image: sportsImg,
    imageAlt: "Manifestação",
    categoria: "Eleições 2026",
    categoriaColor: "#c8102e",
    titulo: "Flávio diz esperar que Trump não aplique tarifaço ao Brasil",
    slug: "flavio-trump-tarifaco-brasil",
    tempo: "Há 2 horas",
    editoria: "Eleições 2026 em Minas Gerais",
    subArtigos: [
      { title: "SANDRA COHEN: com elogios a Flávio, Trump aterrissa na campanha eleitoral", slug: "cohen-flavio-trump-campanha", author: "SANDRA COHEN" },
      { title: "SADI: tarifaço 2.0 está na mesa do bolsonarismo", slug: "sadi-tarifaco-bolsonarismo", author: "SADI" },
    ],
  },
];

export default function DestaquesListaGrande() {
  return (
    <section className="border-t border-gray-200 py-8">
      <div className="max-w-[1280px] mx-auto px-4">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-1 h-5 bg-[#c8102e]" />
          <h2 className="text-[17px] font-bold text-[#1a1a1a] uppercase tracking-wider">
            Destaques
          </h2>
        </div>

        <div className="flex flex-col divide-y divide-gray-200">
          {destaques.map((item) => (
            <div key={item.id} className="py-6 first:pt-0">
              <div className="flex gap-5 items-start">
                <Link href={`/artigo/${item.slug}`} className="flex-shrink-0 block">
                  <img
                    src={item.image}
                    alt={item.imageAlt}
                    className="w-[340px] h-[220px] object-cover hover:opacity-90 transition-opacity"
                  />
                </Link>

                <div className="flex-1 min-w-0">
                  <Link href={`/artigo/${item.slug}`} className="block group">
                    <h2 className="font-serif text-[24px] font-bold text-[#c8102e] leading-snug mb-3 group-hover:opacity-80 transition-opacity">
                      {item.titulo}
                    </h2>
                  </Link>

                  {item.subArtigos && item.subArtigos.length > 0 && (
                    <ul className="mb-3 space-y-1">
                      {item.subArtigos.map((sub, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-[#c8102e] mt-1 flex-shrink-0">•</span>
                          <Link
                            href={`/artigo/${sub.slug}`}
                            className="text-[13px] font-bold text-[#1d4ed8] hover:underline leading-snug uppercase tracking-wide"
                          >
                            {sub.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}

                  <span className="text-[12px] text-gray-500">
                    {item.tempo} — Em{" "}
                    <Link
                      href={`/${item.editoria.toLowerCase().replace(/ /g, "-")}`}
                      className="text-[#1a1a1a] hover:underline font-medium"
                    >
                      {item.editoria}
                    </Link>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
