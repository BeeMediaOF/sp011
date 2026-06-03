import React from "react";
import { Link } from "wouter";
import { Share2 } from "lucide-react";
import hospitalImg from "../assets/images/hospital.png";
import cityImg from "../assets/images/city.png";
import culturaFeatImg from "../assets/images/cultura_feat.png";
import parkImg from "../assets/images/park.png";

const shareIcons = (
  <div className="flex items-center gap-2 mt-2">
    <button className="text-gray-400 hover:text-[#c8102e] transition-colors" title="Compartilhar">
      <Share2 size={14} />
    </button>
    <a
      href="#"
      className="text-gray-400 hover:text-[#25D366] transition-colors text-[12px] font-bold"
      title="WhatsApp"
      aria-label="WhatsApp"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    </a>
    <a
      href="#"
      className="text-gray-400 hover:text-[#1877F2] transition-colors"
      title="Facebook"
      aria-label="Facebook"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    </a>
    <a
      href="#"
      className="text-gray-400 hover:text-[#000] transition-colors"
      title="X (Twitter)"
      aria-label="X"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    </a>
    <a
      href="#"
      className="text-gray-400 hover:text-[#c8102e] transition-colors"
      title="E-mail"
      aria-label="Email"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
        <rect width="20" height="16" x="2" y="4" rx="2" />
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      </svg>
    </a>
  </div>
);

const cards = [
  {
    id: "dco-1",
    image: hospitalImg,
    categoria: "Meio Ambiente",
    categoriaColor: "bg-[#eab308]",
    titulo: "Tarifa Social Paulista dobra alcance e bate recorde de 6 milhões de pessoas com desconto na conta de água",
    slug: "tarifa-social-paulista-6-milhoes",
  },
  {
    id: "dco-2",
    image: cityImg,
    categoria: "Meio Ambiente",
    categoriaColor: "bg-[#eab308]",
    titulo: "SP tem 7 cidades no ranking das 12 com padrão de excelência entre as que menos desperdiçam água no Brasil",
    slug: "sp-cidades-ranking-agua",
  },
  {
    id: "dco-3",
    image: culturaFeatImg,
    categoria: "Cultura",
    categoriaColor: "bg-[#0d9488]",
    titulo: "Festival de artes de Brasília reúne mais de 30 atrações neste fim de semana no Plano Piloto",
    slug: "festival-artes-brasilia",
  },
  {
    id: "dco-4",
    image: parkImg,
    categoria: "Cidade",
    categoriaColor: "bg-[#1d4ed8]",
    titulo: "Parque Nacional de Brasília abre trilhas inéditas para visitação com guias especializados",
    slug: "parque-nacional-trilhas-ineditas",
  },
];

export default function DestaquesCardOverlay() {
  return (
    <section className="border-t border-gray-200 py-8">
      <div className="max-w-[1280px] mx-auto px-4">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-1 h-5 bg-[#c8102e]" />
          <h2 className="text-[17px] font-bold text-[#1a1a1a] uppercase tracking-wider">
            Em Destaque
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {cards.map((card) => (
            <div key={card.id} className="group relative">
              <Link href={`/artigo/${card.slug}`} className="block">
                <div className="relative overflow-hidden aspect-[16/9]">
                  <img
                    src={card.image}
                    alt={card.titulo}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <span className={`inline-block text-white text-[10px] font-bold px-2 py-0.5 mb-2 ${card.categoriaColor}`}>
                      {card.categoria}
                    </span>
                    <h3 className="text-white font-bold text-[15px] leading-snug">
                      {card.titulo}
                    </h3>
                  </div>
                </div>
              </Link>
              <div className="px-1 pt-1">
                {shareIcons}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
