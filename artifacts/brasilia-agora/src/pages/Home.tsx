import React from "react";
import TopBar from "../components/TopBar";
import Header from "../components/Header";
import NavBar from "../components/NavBar";
import HeroSection from "../components/HeroSection";
import MostRead from "../components/MostRead";
import SectionBlock from "../components/SectionBlock";
import SectionBlockFeatured from "../components/SectionBlockFeatured";
import SectionBlockDuploDestaque from "../components/SectionBlockDuploDestaque";
import SectionBlockCulturaLayout from "../components/SectionBlockCulturaLayout";
import EditoriasTriploBloco from "../components/EditoriasTriploBloco";
import DestaquesListaBadge from "../components/DestaquesListaBadge";
import Footer from "../components/Footer";
import AdCentral from "../components/ads/AdCentral";
import AdSidebar from "../components/ads/AdSidebar";
import { useArticles } from "../hooks/useArticles";

import {
  brasilArticles,
  mundoArticles,
  esporteArticles,
  culturaArticles,
  saudeArticles,
  tecnologiaArticles,
  dfArticles,
} from "../data/mockData";

const editoriaColors: Record<string, string> = {
  brasil:     "#16a34a",
  mundo:      "#6b21a8",
  esporte:    "#dc2626",
  cultura:    "#0d9488",
  saude:      "#16a34a",
  tecnologia: "#0284c7",
  df:         "#0b3d91",
};

export default function Home() {
  const { articles } = useArticles();

  const getByCategory = (cat: string, fallback: typeof brasilArticles) => {
    const real = articles.filter((a) =>
      a.category.toLowerCase().includes(cat.toLowerCase())
    );
    if (real.length > 0) {
      return real.map((a) => ({
        id: a.id,
        title: a.title,
        summary: a.subtitle,
        image: a.imageUrl || fallback[0]?.image || brasilArticles[0].image,
        chapeu: a.tag || cat,
        author: a.author,
        time: new Date(a.publishedAt).toLocaleDateString("pt-BR", {
          day: "numeric",
          month: "short",
        }),
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

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ZONA 1 — HERO + MAIS LIDAS + ANÚNCIO
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <HeroSection />

        <div className="max-w-[1280px] mx-auto px-4 py-4">
          <AdCentral />
        </div>

        {/* ━ WRAPPER COM SIDEBARS ━━━━━━━━━━━━━━━
            Colunas 300px visíveis apenas em telas
            muito largas (≥1880px)
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className="flex justify-center gap-0">
          {/* SIDEBAR ESQUERDA */}
          <aside className="hidden [@media(min-width:1880px)]:block w-[300px] shrink-0 pt-8 pl-4">
            <AdSidebar />
          </aside>

          {/* CONTEÚDO CENTRAL */}
          <div className="flex-1 min-w-0 max-w-[1280px]">

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ZONA 2 — NACIONAIS & INTERNACIONAIS
            Carrosseis de 3 cards por página
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <SectionBlock
          title="Brasil"
          color={editoriaColors.brasil}
          href="/brasil"
          articles={getByCategory("brasil", brasilArticles)}
          pageSize={4}
        />

        <MostRead />

        <SectionBlock
          title="Mundo"
          color={editoriaColors.mundo}
          href="/mundo"
          articles={getByCategory("mundo", mundoArticles)}
        />

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ZONA 3 — BLOCO EDITORIAL TRIPLO
            Política | Economia | Negócios
            Card destaque + 2 sub-artigos por coluna
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <EditoriasTriploBloco />

        <div className="max-w-[1280px] mx-auto px-4 py-4">
          <AdCentral />
        </div>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ZONA 5 — ESPORTE & CULTURA
            Dois carrosseis seguidos
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <SectionBlockFeatured
          title="Esporte"
          color={editoriaColors.esporte}
          href="/esporte"
          articles={getByCategory("esporte", esporteArticles)}
        />

        <SectionBlockCulturaLayout
          title="Cultura"
          color={editoriaColors.cultura}
          href="/cultura"
          articles={getByCategory("cultura", culturaArticles)}
        />

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ZONA 7 — CIDADE, SAÚDE & TECNOLOGIA
            Três carrosseis locais
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <SectionBlockDuploDestaque
          title="DF"
          color={editoriaColors.df}
          href="/df"
          articles={getByCategory("df", dfArticles)}
        />

        <SectionBlock
          title="Saúde"
          color={editoriaColors.saude}
          href="/saude"
          articles={getByCategory("saude", saudeArticles)}
          pageSize={4}
        />

        <SectionBlockFeatured
          title="Tecnologia"
          color={editoriaColors.tecnologia}
          href="/tecnologia"
          articles={getByCategory("tecnologia", tecnologiaArticles)}
        />

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ZONA 8 — ÚLTIMAS NOTÍCIAS + SIDEBAR
            Lista com categoria colorida +
            sidebar com Mais Lidas e propaganda
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <DestaquesListaBadge />

          </div>{/* fim CONTEÚDO CENTRAL */}

          {/* SIDEBAR DIREITA */}
          <aside className="hidden [@media(min-width:1880px)]:block w-[300px] shrink-0 pt-8 pr-4">
            <AdSidebar />
          </aside>
        </div>{/* fim WRAPPER COM SIDEBARS */}

      </main>

      <Footer />
    </div>
  );
}
