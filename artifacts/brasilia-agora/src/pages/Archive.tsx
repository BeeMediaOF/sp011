import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import TopBar from "../components/TopBar";
import Header from "../components/Header";
import NavBar from "../components/NavBar";
import ArticleCard from "../components/ArticleCard";
import Footer from "../components/Footer";
import { type Article } from "../lib/adminApi";
import { Calendar, Search } from "lucide-react";

export default function Archive() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  useEffect(() => {
    fetch("/api/articles")
      .then((r) => r.json())
      .then((d) => {
        setArticles(d.articles ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = articles.filter((a) => {
    const matchText = !filter || a.title.toLowerCase().includes(filter.toLowerCase()) || a.category.toLowerCase().includes(filter.toLowerCase());
    const matchDate = !dateFilter || a.publishedAt.startsWith(dateFilter);
    return matchText && matchDate;
  });

  const recent = filtered.slice(0, 12);

  const newsModules = [
    { label: "Política", color: "#1d4ed8", articles: filtered.filter((a) => a.category.includes("politica") || a.tag.includes("POLÍTICA")).slice(0, 6) },
    { label: "Cidade", color: "#2563eb", articles: filtered.filter((a) => a.category.includes("cidade") || a.tag.includes("CIDADE")).slice(0, 6) },
    { label: "Segurança", color: "#dc2626", articles: filtered.filter((a) => a.category.includes("seguran") || a.tag.includes("SEGURAN")).slice(0, 6) },
    { label: "Saúde", color: "#16a34a", articles: filtered.filter((a) => a.category.includes("saúde") || a.tag.includes("SAÚDE")).slice(0, 6) },
    { label: "Transporte", color: "#0284c7", articles: filtered.filter((a) => a.category.includes("transporte") || a.tag.includes("TRANSPORTE")).slice(0, 6) },
    { label: "Cultura", color: "#0d9488", articles: filtered.filter((a) => a.category.includes("cultura") || a.tag.includes("CULTURA")).slice(0, 6) },
    { label: "Esportes", color: "#b45309", articles: filtered.filter((a) => a.category.includes("esporte") || a.tag.includes("ESPORTE")).slice(0, 6) },
    { label: "Educação", color: "#6b21a8", articles: filtered.filter((a) => a.category.includes("educa") || a.tag.includes("EDUCA")).slice(0, 6) },
    { label: "Colunas", color: "#7c3aed", articles: filtered.filter((a) => a.category.includes("coluna") || a.tag.includes("COLUNA")).slice(0, 6) },
  ];

  return (
    <div className="min-h-screen w-full bg-[#fcfcfc] flex flex-col">
      <TopBar />
      <Header />
      <NavBar />

      <main className="flex-1 bg-white pb-16">
        {/* Header */}
        <div className="bg-[#1a2448] py-8">
          <div className="max-w-[1280px] mx-auto px-4">
            <h1 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tight">Arquivo de Notícias</h1>
            <p className="text-white/60 text-sm mt-2">Todas as notícias publicadas no portal</p>
          </div>
        </div>

        <div className="max-w-[1280px] mx-auto px-4 mt-8 space-y-12">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar notícias..." className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F5A623]" />
            </div>
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-gray-400" />
              <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F5A623]" />
              {dateFilter && <button onClick={() => setDateFilter("")} className="text-xs text-[#1d4ed8] hover:underline">Limpar</button>}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-16 text-gray-400">Carregando...</div>
          ) : (
            <>
              {/* Recentes Grid */}
              <section>
                <div className="flex items-center mb-6">
                  <div className="w-1.5 h-6 bg-[#F5A623] mr-3" />
                  <h2 className="text-xl font-bold text-[#1a2448] uppercase">Mais Recentes</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {recent.map((a) => (
                    <ArticleCard key={a.id} id={a.id} title={a.title} time={new Date(a.publishedAt).toLocaleDateString("pt-BR")} imageUrl={a.imageUrl || ""} tag={a.tag} tagColor="#1a2448" />
                  ))}
                  {recent.length === 0 && <p className="text-gray-400 col-span-3 text-center py-8">Nenhuma notícia encontrada.</p>}
                </div>
              </section>

              {/* Category Modules */}
              {newsModules.map((mod) => {
                if (mod.articles.length === 0) return null;
                return (
                  <section key={mod.label}>
                    <div className="flex items-center mb-6">
                      <div className="w-1.5 h-6 mr-3" style={{ backgroundColor: mod.color }} />
                      <h2 className="text-xl font-bold text-[#1a2448] uppercase">{mod.label}</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {mod.articles.map((a) => (
                        <ArticleCard key={`${mod.label}-${a.id}`} id={a.id} title={a.title} time={new Date(a.publishedAt).toLocaleDateString("pt-BR")} imageUrl={a.imageUrl || ""} tag={a.tag} tagColor={mod.color} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
