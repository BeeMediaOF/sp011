import React from "react";
import { Link } from "wouter";
import ArticleCard from "./ArticleCard";
import avatar1 from "../assets/images/avatar1.png";
import avatar2 from "../assets/images/avatar2.png";
import avatar3 from "../assets/images/avatar3.png";
import AdBanner from "./ads/AdBanner";

export interface Article {
  id: string;
  slug?: string;
  title: string;
  subtitle?: string;
  time: string;
  imageUrl: string;
  tag: string;
  tagColor: string;
  author?: string;
}

interface CategoryPageProps {
  category: string;
  color: string;
  articles: Article[];
  featuredArticle: Article;
  featuredArticle2?: Article;
}

export default function CategoryPage({
  category,
  color,
  articles,
  featuredArticle,
  featuredArticle2,
}: CategoryPageProps) {
  const second = featuredArticle2 ?? articles[0];

  return (
    <div className="w-full pb-12">
      {/* Category Header Bar */}
      <div style={{ backgroundColor: color }} className="w-full py-4">
        <div className="max-w-[1280px] mx-auto px-4">
          <div className="text-white/80 text-xs font-medium">
            <Link href="/" className="hover:text-white transition-colors">Início</Link> &gt; {category}
          </div>
          <h1 className="text-white text-2xl font-black mt-1 leading-tight">{category}</h1>
        </div>
      </div>

      <div className="max-w-[1280px] mx-auto px-4 mt-8">
        <div className="flex-1 min-w-0">
          {/* 2 Destaques grandes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
            {[featuredArticle, second].filter(Boolean).map((art, idx) => art && (
              <Link key={art.id} href={`/artigo/${art.slug || art.id}`} className="group block">
                <div className="relative overflow-hidden bg-gray-100 h-[220px] sm:h-[300px] md:h-[380px]">
                  <img
                    src={art.imageUrl}
                    alt={art.title}
                    width={640}
                    height={380}
                    loading={idx === 0 ? "eager" : "lazy"}
                    fetchPriority={idx === 0 ? "high" : "auto"}
                    decoding={idx === 0 ? "sync" : "async"}
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-6">
                    <span
                      className="inline-block text-white text-[11px] font-bold px-3 py-1 uppercase tracking-wider mb-3"
                      style={{ backgroundColor: art.tagColor || color }}
                    >
                      {art.tag}
                    </span>
                    <h3
                      className="font-serif text-white font-black text-[24px] leading-tight line-clamp-3 mb-2"
                    >
                      {art.title}
                    </h3>
                    {art.subtitle && (
                      <p className="text-white/70 text-[13px] line-clamp-2 mb-3">{art.subtitle}</p>
                    )}
                    <div className="flex items-center gap-2 text-[11px] text-white/50">
                      {art.author && <span>Por {art.author}</span>}
                      {art.author && <span className="w-1 h-1 rounded-full bg-white/40" />}
                      <span>{art.time}</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div className="mb-8">
            <p className="text-[9px] text-gray-300 uppercase tracking-widest text-center mb-1">Publicidade</p>
            <AdBanner slot="slot_05" placeholder="Publicidade" />
          </div>

          {/* Divider */}
          <div className="flex items-center mb-6">
            <div className="w-1.5 h-6 mr-3" style={{ backgroundColor: color }} />
            <h2 className="text-xl font-bold text-[#1a2448]">MAIS NOTÍCIAS</h2>
          </div>

          {/* 2-Column Grid */}
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Left: Article List */}
            <div className="w-full lg:w-2/3">
              <div className="flex flex-col">
                {articles.map((article) => (
                  <ArticleCard key={article.id} {...article} />
                ))}
              </div>
              <button className="w-full mt-8 py-3 border border-gray-300 text-[#1a2448] font-bold text-sm hover:bg-[#1a2448] hover:text-white transition-colors">
                CARREGAR MAIS
              </button>
            </div>

            {/* Right: Sidebar */}
            <div className="w-full lg:w-1/3 space-y-8">
              {/* Propaganda sidebar — gerenciada pelo painel */}
              <div>
                <p className="text-[9px] text-gray-300 uppercase tracking-widest text-center mb-1">Publicidade</p>
                <AdBanner slot="slot_11" />
              </div>

              {/* Mais Lidas */}
              <div className="bg-gray-50 p-6 rounded-sm border border-gray-100">
                <h3 className="font-bold text-[#1a2448] text-lg mb-4 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-600" />
                  MAIS LIDAS
                </h3>
                <div className="flex flex-col space-y-4">
                  {[
                    { id: "pol-2", title: "Câmara Legislativa aprova projeto que cria o programa Morar DF" },
                    { id: "df-3",  title: "Obras no Eixão alteram trânsito neste fim de semana em Brasília" },
                    { id: "sau-1", title: "Hospitais do DF registram queda nos casos de dengue em maio" },
                    { id: "df-4",  title: "GDF anuncia mais 124 ônibus para reforçar o transporte público" },
                    { id: "cul-1", title: "Festival de Cinema de Brasília bate recorde de público" },
                  ].map(({ id, title }, idx) => (
                    <Link key={id} href={`/artigo/${id}`}>
                      <div className="flex gap-3 group cursor-pointer">
                        <span className="text-3xl font-black text-gray-200 group-hover:text-gray-300 transition-colors leading-none">{idx + 1}</span>
                        <p className="text-sm font-bold text-[#1a2448] group-hover:text-[#c8102e] transition-colors leading-snug pt-1">{title}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>

      </div>

      {/* Banner acima do rodapé */}
      <div className="max-w-[1280px] mx-auto px-4 py-6">
        <AdBanner slot="slot_05" />
      </div>
    </div>
  );
}
