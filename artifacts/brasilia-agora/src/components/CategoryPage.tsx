import React from "react";
import { Link } from "wouter";
import ArticleCard from "./ArticleCard";
import avatar1 from "../assets/images/avatar1.png";
import avatar2 from "../assets/images/avatar2.png";
import avatar3 from "../assets/images/avatar3.png";
import AdSidebar from "./ads/AdSidebar";
import AdBanner from "./ads/AdBanner";
import AdCentral from "./ads/AdCentral";

export interface Article {
  id: string;
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
        </div>
      </div>

      <div className="max-w-[1280px] mx-auto px-4 mt-8">
        <div className="flex-1 min-w-0">
          {/* 2 Destaques grandes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
            {[featuredArticle, second].filter(Boolean).map((art) => art && (
              <Link key={art.id} href={`/artigo/${art.id}`} className="group block">
                <div className="relative overflow-hidden bg-gray-100 h-[380px]">
                  <img
                    src={art.imageUrl}
                    alt={art.title}
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
                    <h2
                      className="font-serif text-white font-black text-[24px] leading-tight line-clamp-3 mb-2"
                     
                    >
                      {art.title}
                    </h2>
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
            <AdCentral />
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
              {/* Mais Lidas */}
              <div className="bg-gray-50 p-6 rounded-sm border border-gray-100">
                <h3 className="font-bold text-[#1a2448] text-lg mb-4 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-600" />
                  MAIS LIDAS
                </h3>
                <div className="flex flex-col space-y-4">
                  {[
                    "GDF lança novo programa de pavimentação em Vicente Pires",
                    "Concurso da Saúde tem edital publicado com 1.200 vagas",
                    "Mané Garrincha receberá jogo da Seleção Brasileira em outubro",
                    "Obras da linha do BRT avançam no Recanto das Emas",
                    "Festival de Cinema de Brasília bate recorde de público"
                  ].map((title, idx) => (
                    <Link key={idx} href={`/artigo/mais-lidas-${idx+1}`}>
                      <div className="flex gap-3 group cursor-pointer">
                        <span className="text-3xl font-black text-gray-200 group-hover:text-gray-300 transition-colors leading-none">{idx + 1}</span>
                        <p className="text-sm font-bold text-[#1a2448] group-hover:text-[#1d4ed8] transition-colors leading-snug pt-1">{title}</p>
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
        <AdBanner />
      </div>
    </div>
  );
}
