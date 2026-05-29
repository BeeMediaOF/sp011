import React from "react";
import TopBar from "../components/TopBar";
import Header from "../components/Header";
import NavBar from "../components/NavBar";
import HeroSection from "../components/HeroSection";
import MostRead from "../components/MostRead";
import SectionBlock from "../components/SectionBlock";
import VideoSection from "../components/VideoSection";
import Footer from "../components/Footer";
import AdCentral from "../components/ads/AdCentral";
import { useArticles } from "../hooks/useArticles";

import {
  brasilArticles,
  mundoArticles,
  politicaArticles,
  economiaArticles,
  esporteArticles,
  culturaArticles,
} from "../data/mockData";

const editoriaColors: Record<string, string> = {
  brasil: "#16a34a",
  mundo: "#6b21a8",
  politica: "#1d4ed8",
  economia: "#b45309",
  esporte: "#dc2626",
  cultura: "#0d9488",
};

export default function Home() {
  const { articles, loading } = useArticles();

  // Agrupa artigos reais por categoria (ou usa mock se vazio)
  const getByCategory = (cat: string, fallback: typeof brasilArticles) => {
    const real = articles.filter((a) => a.category.toLowerCase().includes(cat.toLowerCase()));
    if (real.length > 0) {
      return real.map((a) => ({
        id: a.id,
        title: a.title,
        summary: a.subtitle,
        image: a.imageUrl || fallback[0]?.image || brasilArticles[0].image,
        chapeu: a.tag || cat,
        author: a.author,
        time: new Date(a.publishedAt).toLocaleDateString("pt-BR", { day: "numeric", month: "short" }),
      }));
    }
    return fallback;
  };

  return (
    <div className="min-h-screen w-full bg-white flex flex-col">
      <TopBar />
      <Header />
      <NavBar />

      <main className="flex-1">
        {/* Hero Principal */}
        <HeroSection />

        {/* Faixa Mais Lidas */}
        <MostRead />

        {/* Ad Central */}
        <div className="max-w-[1280px] mx-auto px-4 py-6">
          <AdCentral />
        </div>

        {/* Seções por Editoria — artigos reais ou mock */}
        <SectionBlock
          title="Brasil"
          color={editoriaColors.brasil}
          href="/brasil"
          articles={getByCategory("brasil", brasilArticles)}
        />

        <SectionBlock
          title="Mundo"
          color={editoriaColors.mundo}
          href="/mundo"
          articles={getByCategory("mundo", mundoArticles)}
        />

        <SectionBlock
          title="Política"
          color={editoriaColors.politica}
          href="/politica"
          articles={getByCategory("politica", politicaArticles)}
        />

        {/* Ad Central */}
        <div className="max-w-[1280px] mx-auto px-4 py-6">
          <AdCentral />
        </div>

        <SectionBlock
          title="Economia"
          color={editoriaColors.economia}
          href="/economia"
          articles={getByCategory("economia", economiaArticles)}
        />

        <SectionBlock
          title="Esporte"
          color={editoriaColors.esporte}
          href="/esporte"
          articles={getByCategory("esporte", esporteArticles)}
        />

        <SectionBlock
          title="Cultura"
          color={editoriaColors.cultura}
          href="/cultura"
          articles={getByCategory("cultura", culturaArticles)}
        />

        {/* Bloco de Vídeos */}
        <VideoSection />
      </main>

      <Footer />
    </div>
  );
}
