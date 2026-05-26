import React from "react";
import { Link } from "wouter";
import ArticleCard from "./ArticleCard";
import avatar1 from "../assets/images/avatar1.png";
import avatar2 from "../assets/images/avatar2.png";
import avatar3 from "../assets/images/avatar3.png";

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
}

export default function CategoryPage({
  category,
  color,
  articles,
  featuredArticle,
}: CategoryPageProps) {
  return (
    <div className="w-full pb-12">
      {/* Category Header Bar */}
      <div style={{ backgroundColor: color }} className="w-full py-6">
        <div className="max-w-[1280px] mx-auto px-4">
          <div className="text-white/80 text-xs font-medium mb-1">
            <Link href="/" className="hover:text-white transition-colors">Início</Link> &gt; {category}
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tight">{category}</h1>
        </div>
      </div>

      <div className="max-w-[1280px] mx-auto px-4 mt-8">
        {/* Featured Article */}
        {featuredArticle && (
          <Link href={`/artigo/${featuredArticle.id}`}>
            <div className="relative w-full aspect-[16/9] md:aspect-[21/9] overflow-hidden group cursor-pointer mb-8 rounded-sm">
              <img src={featuredArticle.imageUrl} alt={featuredArticle.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
                <span className="text-white text-xs font-bold px-2 py-1 mb-3 inline-block rounded-sm" style={{ backgroundColor: featuredArticle.tagColor }}>
                  {featuredArticle.tag}
                </span>
                <h2 className="text-2xl md:text-4xl font-bold text-white mb-2 leading-tight group-hover:text-gray-200 transition-colors">{featuredArticle.title}</h2>
                {featuredArticle.subtitle && (
                  <p className="text-gray-300 md:text-lg max-w-3xl line-clamp-2">{featuredArticle.subtitle}</p>
                )}
                <div className="text-gray-400 text-sm mt-3 font-medium">{featuredArticle.time} {featuredArticle.author && `• Por ${featuredArticle.author}`}</div>
              </div>
            </div>
          </Link>
        )}

        {/* Ônico anúncio discreto */}
        <div className="w-full h-[90px] bg-gray-50 rounded-lg border border-gray-100 flex items-center justify-center mb-8">
          <p className="text-[10px] font-semibold tracking-wider text-gray-300 uppercase">Publicidade — 728 × 90</p>
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

            {/* Editoriais */}
            <div>
              <div className="flex items-center mb-6">
                <div className="w-1.5 h-5 bg-[#1a2448] mr-3" />
                <h3 className="text-lg font-bold text-[#1a2448]">EDITORIAIS</h3>
              </div>
              <div className="flex flex-col space-y-5">
                {[
                  { avatar: avatar1, name: "Denise Rothenburg", desc: "Bastidores e nos corredores do poder no DF" },
                  { avatar: avatar2, name: "Ana Maria Campos", desc: "Cidades inteligentes e mobilidade urbana" },
                  { avatar: avatar3, name: "Carlos Alexandre", desc: "Análise da criminalidade e políticas" }
                ].map((item, i) => (
                  <Link key={i} href={`/colunas`}>
                    <div className="flex items-start gap-4 group cursor-pointer">
                      <img src={item.avatar} alt={item.name} className="w-14 h-14 rounded-full object-cover border border-gray-200 shrink-0 grayscale group-hover:grayscale-0 transition-all duration-300" />
                      <div>
                        <h4 className="font-bold text-[#1a2448] text-sm group-hover:text-[#1d4ed8] transition-colors">{item.name}</h4>
                        <p className="text-xs text-gray-600 italic leading-snug mt-1">"{item.desc}"</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
              <Link href="/colunas">
                <button className="w-full mt-6 py-2 border border-gray-300 text-gray-600 font-bold text-xs hover:bg-gray-100 transition-colors">
                  VER TODOS OS COLUNISTAS
                </button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
