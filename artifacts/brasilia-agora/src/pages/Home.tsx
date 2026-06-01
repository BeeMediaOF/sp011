import React from "react";
import TopBar from "../components/TopBar";
import Header from "../components/Header";
import NavBar from "../components/NavBar";
import HeroSection from "../components/HeroSection";
import MostRead from "../components/MostRead";
import LatestNews from "../components/LatestNews";
import SectionBlock from "../components/SectionBlock";
import Brasilia24hSection from "../components/Brasilia24hSection";
import FeaturedHighlights from "../components/FeaturedHighlights";
import TwoColumnSection from "../components/TwoColumnSection";
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
  saudeArticles,
  tecnologiaArticles,
  dfArticles,
} from "../data/mockData";

const editoriaColors: Record<string, string> = {
  brasil: "#16a34a",
  mundo: "#6b21a8",
  politica: "#1d4ed8",
  economia: "#b45309",
  esporte: "#dc2626",
  cultura: "#0d9488",
  saude: "#16a34a",
  tecnologia: "#0284c7",
  df: "#0b3d91",
};

export default function Home() {
  const { articles } = useArticles();

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

        {/* Últimas Notícias de Brasília */}
        <LatestNews />

        {/* Ad Central */}
        <div className="max-w-[1280px] mx-auto px-4 py-6">
          <AdCentral />
        </div>

        {/* Seção especial Brasília 24h */}
        <Brasilia24hSection />

        {/* Destaques do Dia — grande bloco com imagens */}
        <FeaturedHighlights />

        {/* Ad Central */}
        <div className="max-w-[1280px] mx-auto px-4 py-6">
          <AdCentral />
        </div>

        {/* Seções por Editoria — com sidebar para as primeiras */}
        <TwoColumnSection
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

        <TwoColumnSection
          title="Política"
          color={editoriaColors.politica}
          href="/politica"
          articles={getByCategory("politica", politicaArticles)}
        />

        {/* Ad Central */}
        <div className="max-w-[1280px] mx-auto px-4 py-6">
          <AdCentral />
        </div>

        <TwoColumnSection
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

        <TwoColumnSection
          title="Cultura"
          color={editoriaColors.cultura}
          href="/cultura"
          articles={getByCategory("cultura", culturaArticles)}
        />

        {/* Ad Central */}
        <div className="max-w-[1280px] mx-auto px-4 py-6">
          <AdCentral />
        </div>

        <TwoColumnSection
          title="Saúde"
          color={editoriaColors.saude}
          href="/saude"
          articles={getByCategory("saude", saudeArticles)}
        />

        <SectionBlock
          title="Tecnologia"
          color={editoriaColors.tecnologia}
          href="/tecnologia"
          articles={getByCategory("tecnologia", tecnologiaArticles)}
        />

        <TwoColumnSection
          title="DF"
          color={editoriaColors.df}
          href="/df"
          articles={getByCategory("df", dfArticles)}
        />
      </main>

      <Footer />
    </div>
  );
}
