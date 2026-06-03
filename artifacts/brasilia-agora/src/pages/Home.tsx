import React from "react";
import TopBar from "../components/TopBar";
import Header from "../components/Header";
import NavBar from "../components/NavBar";
import HeroSection from "../components/HeroSection";
import MostRead from "../components/MostRead";
import SectionBlock from "../components/SectionBlock";

import DestaquesCardOverlay from "../components/DestaquesCardOverlay";
import DestaquesListaBadge from "../components/DestaquesListaBadge";
import ColunistasSection from "../components/ColunistasSection";
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

        {/* Seções por Editoria — bloco 1 */}
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

        {/* ── MÓDULO DE DESTAQUE — CARDS COM OVERLAY (2 colunas) ── */}
        <DestaquesCardOverlay />

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

        {/* ── COLUNISTAS ── */}
        <ColunistasSection />

        <SectionBlock
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

        <SectionBlock
          title="DF"
          color={editoriaColors.df}
          href="/df"
          articles={getByCategory("df", dfArticles)}
        />

        {/* ── MÓDULO DE DESTAQUE — FIM DA HOME (Lista com badges coloridos) ── */}
        <DestaquesListaBadge />
      </main>

      <Footer />
    </div>
  );
}
