import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import TopBar from "../components/TopBar";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { type Article } from "../lib/adminApi";
import { Search, Calendar, ChevronRight } from "lucide-react";

const CATEGORY_DEFS = [
  { label: "Política",   slug: "politica",   color: "#1d4ed8" },
  { label: "Cidade",     slug: "cidade",      color: "#2563eb" },
  { label: "Segurança",  slug: "seguran",     color: "#dc2626" },
  { label: "Saúde",      slug: "saude",       color: "#16a34a" },
  { label: "Transporte", slug: "transporte",  color: "#0284c7" },
  { label: "Cultura",    slug: "cultura",     color: "#0d9488" },
  { label: "Esportes",   slug: "esporte",     color: "#b45309" },
  { label: "Educação",   slug: "educa",       color: "#6b21a8" },
  { label: "Colunas",    slug: "coluna",      color: "#7c3aed" },
];

function imgFallback(url: string) {
  return url || "https://placehold.co/400x260/e5e7eb/9ca3af?text=Sem+imagem";
}

function FeaturedCard({ article, color }: { article: Article; color: string }) {
  return (
    <Link href={`/artigo/${article.id}`} className="group block">
      <div className="relative overflow-hidden bg-gray-100 aspect-[16/10]">
        <img
          src={imgFallback(article.imageUrl || "")}
          alt={article.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <span
            className="inline-block text-white text-[10px] font-bold px-2 py-0.5 mb-2 uppercase tracking-wider"
            style={{ backgroundColor: color }}
          >
            {article.tag || article.category}
          </span>
          <h3 className="font-serif text-white font-black text-[16px] leading-snug line-clamp-2">
            {article.title}
          </h3>
          <p className="text-white/50 text-[11px] mt-1">
            {new Date(article.publishedAt).toLocaleDateString("pt-BR")}
          </p>
        </div>
      </div>
    </Link>
  );
}

function ListCard({ article, color }: { article: Article; color: string }) {
  return (
    <Link href={`/artigo/${article.id}`} className="group flex gap-4 py-3 items-start border-b border-gray-100 last:border-0">
      <div className="w-[96px] h-[64px] shrink-0 overflow-hidden bg-gray-100">
        <img
          src={imgFallback(article.imageUrl || "")}
          alt={article.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-400"
          loading="lazy"
        />
      </div>
      <div className="flex-1 min-w-0">
        <span
          className="text-[10px] font-bold uppercase tracking-wider block mb-1"
          style={{ color }}
        >
          {article.tag || article.category}
        </span>
        <h4 className="font-serif text-[13px] font-bold text-[#1a1a1a] leading-snug group-hover:text-[#c8102e] transition-colors line-clamp-2">
          {article.title}
        </h4>
        <p className="text-[11px] text-gray-400 mt-1">
          {new Date(article.publishedAt).toLocaleDateString("pt-BR")}
        </p>
      </div>
    </Link>
  );
}

export default function Archive() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/articles")
      .then((r) => r.json())
      .then((d) => { setArticles(d.articles ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = articles.filter((a) => {
    const matchText = !filter ||
      a.title.toLowerCase().includes(filter.toLowerCase()) ||
      a.category.toLowerCase().includes(filter.toLowerCase());
    const matchDate = !dateFilter || a.publishedAt.startsWith(dateFilter);
    const matchCat = !activeCategory ||
      a.category.toLowerCase().includes(activeCategory) ||
      a.tag.toLowerCase().includes(activeCategory.toUpperCase());
    return matchText && matchDate && matchCat;
  });

  const recent = filtered.slice(0, 8);
  const categoryModules = CATEGORY_DEFS.map((cat) => ({
    ...cat,
    articles: filtered
      .filter((a) =>
        a.category.toLowerCase().includes(cat.slug) ||
        a.tag.toLowerCase().includes(cat.slug)
      )
      .slice(0, 5),
  })).filter((m) => m.articles.length > 0);

  return (
    <div className="min-h-screen w-full bg-white flex flex-col">
      <TopBar />
      <Header />

      <main className="flex-1 pb-16">

        {/* Banner topo */}
        <div className="bg-[#1a1a1a] border-t-4 border-[#c8102e] py-8">
          <div className="max-w-[1280px] mx-auto px-4">
            <h1
              className="text-[32px] font-black text-white uppercase tracking-tight"
             
            >
              Arquivo de Notícias
            </h1>
            <p className="text-white/50 text-[13px] mt-1">
              Todas as notícias publicadas no portal
            </p>
          </div>
        </div>

        <div className="max-w-[1280px] mx-auto px-4 mt-8">

          {/* Filtros */}
          <div className="flex flex-col sm:flex-row gap-3 mb-8 pb-6 border-b border-gray-200">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Buscar por título ou categoria..."
                className="w-full pl-9 pr-4 py-2 border border-gray-200 text-[13px] focus:outline-none focus:border-[#c8102e] transition-colors"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Calendar size={14} className="text-gray-400" />
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="px-3 py-2 border border-gray-200 text-[13px] focus:outline-none focus:border-[#c8102e]"
              />
              {dateFilter && (
                <button onClick={() => setDateFilter("")} className="text-[11px] text-[#c8102e] hover:underline font-bold">
                  Limpar
                </button>
              )}
            </div>
          </div>

          {/* Filtro rápido por categoria */}
          <div className="flex flex-wrap gap-2 mb-8">
            <button
              onClick={() => setActiveCategory(null)}
              className={`px-3 py-1 text-[11px] font-bold uppercase tracking-wider border transition-colors ${
                !activeCategory
                  ? "bg-[#1a1a1a] text-white border-[#1a1a1a]"
                  : "text-gray-500 border-gray-200 hover:border-gray-400"
              }`}
            >
              Todas
            </button>
            {CATEGORY_DEFS.map((cat) => (
              <button
                key={cat.slug}
                onClick={() => setActiveCategory(activeCategory === cat.slug ? null : cat.slug)}
                className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider border transition-colors"
                style={
                  activeCategory === cat.slug
                    ? { backgroundColor: cat.color, color: "#fff", borderColor: cat.color }
                    : { color: cat.color, borderColor: cat.color + "55" }
                }
              >
                {cat.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24 text-gray-400 text-sm">
              Carregando...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400 gap-2">
              <Search size={32} className="text-gray-200" />
              <p className="text-sm">Nenhuma notícia encontrada.</p>
              <button onClick={() => { setFilter(""); setDateFilter(""); setActiveCategory(null); }} className="text-[11px] text-[#c8102e] hover:underline font-bold mt-1">Limpar filtros</button>
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-10">

              {/* Coluna principal */}
              <div className="flex-1 min-w-0 space-y-12">

                {/* Mais Recentes */}
                {!activeCategory && recent.length > 0 && (
                  <section>
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-1 h-5 bg-[#c8102e]" />
                      <h2 className="text-[17px] font-bold text-[#1a1a1a] uppercase tracking-wider">Mais Recentes</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                      {recent.map((a) => (
                        <FeaturedCard key={a.id} article={a} color="#c8102e" />
                      ))}
                    </div>
                  </section>
                )}

                {/* Resultados filtrados (quando há busca/filtro ativo) */}
                {(filter || dateFilter || activeCategory) && (
                  <section>
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-1 h-5 bg-[#0b3d91]" />
                      <h2 className="text-[17px] font-bold text-[#1a1a1a] uppercase tracking-wider">
                        Resultados
                        <span className="text-[13px] font-normal text-gray-400 ml-2 normal-case tracking-normal">
                          {filtered.length} notícia{filtered.length !== 1 ? "s" : ""}
                        </span>
                      </h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      {filtered.map((a) => {
                        const cat = CATEGORY_DEFS.find((c) =>
                          a.category.toLowerCase().includes(c.slug) || a.tag.toLowerCase().includes(c.slug)
                        );
                        return <FeaturedCard key={a.id} article={a} color={cat?.color ?? "#1a1a1a"} />;
                      })}
                    </div>
                  </section>
                )}

                {/* Módulos por categoria */}
                {!filter && !dateFilter && !activeCategory && categoryModules.map((mod) => (
                  <section key={mod.label}>
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-3">
                        <div className="w-1 h-5" style={{ backgroundColor: mod.color }} />
                        <h2 className="text-[17px] font-bold text-[#1a1a1a] uppercase tracking-wider">
                          {mod.label}
                        </h2>
                      </div>
                      <button
                        onClick={() => setActiveCategory(mod.slug)}
                        className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider hover:underline"
                        style={{ color: mod.color }}
                      >
                        Ver mais <ChevronRight size={12} />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                      {mod.articles.map((a) => (
                        <ListCard key={a.id} article={a} color={mod.color} />
                      ))}
                    </div>
                  </section>
                ))}

              </div>

              {/* Sidebar */}
              <aside className="hidden lg:block w-[280px] shrink-0 space-y-8">

                {/* Categorias */}
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-1 h-5 bg-[#1a1a1a]" />
                    <h3 className="text-[15px] font-bold text-[#1a1a1a] uppercase tracking-wider">Categorias</h3>
                  </div>
                  <div className="flex flex-col divide-y divide-gray-100">
                    {CATEGORY_DEFS.map((cat) => {
                      const count = articles.filter((a) =>
                        a.category.toLowerCase().includes(cat.slug) ||
                        a.tag.toLowerCase().includes(cat.slug)
                      ).length;
                      return (
                        <button
                          key={cat.slug}
                          onClick={() => setActiveCategory(activeCategory === cat.slug ? null : cat.slug)}
                          className="flex items-center justify-between py-2.5 group text-left"
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                            <span
                              className="text-[13px] font-semibold group-hover:underline transition-colors"
                              style={{ color: activeCategory === cat.slug ? cat.color : "#1a1a1a" }}
                            >
                              {cat.label}
                            </span>
                          </div>
                          {count > 0 && (
                            <span className="text-[11px] text-gray-400 font-medium">{count}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Busca rápida */}
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-1 h-5 bg-[#c8102e]" />
                    <h3 className="text-[15px] font-bold text-[#1a1a1a] uppercase tracking-wider">Busca por data</h3>
                  </div>
                  <input
                    type="date"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 text-[13px] focus:outline-none focus:border-[#c8102e]"
                  />
                  {dateFilter && (
                    <button onClick={() => setDateFilter("")} className="text-[11px] text-[#c8102e] hover:underline font-bold mt-2 block">
                      Limpar data
                    </button>
                  )}
                </div>

              </aside>

            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
