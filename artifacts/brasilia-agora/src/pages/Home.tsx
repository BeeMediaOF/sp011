import React from "react";
import TopBar from "../components/TopBar";
import Header from "../components/Header";
import HeroSection from "../components/HeroSection";
import MostRead from "../components/MostRead";
import SectionBlock from "../components/SectionBlock";
import SectionBlockFeatured from "../components/SectionBlockFeatured";
import SectionBlockDuploDestaque from "../components/SectionBlockDuploDestaque";
import SectionBlockCulturaLayout from "../components/SectionBlockCulturaLayout";
import DestaquesListaBadge from "../components/DestaquesListaBadge";
import Footer from "../components/Footer";

import AdCentral from "../components/ads/AdCentral";
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
    <div className="min-h-screen w-full bg-white flex flex-col overflow-x-hidden">
      <TopBar />
      <Header />

      <main className="flex-1">
        <h1 className="sr-only">Últimas notícias de Brasília e do Distrito Federal</h1>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ZONA 1 — HERO + MAIS LIDAS + ANÚNCIO
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <HeroSection />

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ZONA 2 — NACIONAIS & INTERNACIONAIS
            Carrosseis de 3 cards por página
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className="max-w-[1280px] mx-auto px-4 py-4">
          <p className="text-[9px] text-gray-300 mb-1 text-center tracking-wider uppercase">Publicidade</p>
          <div className="flex justify-center">
            <a
              href="https://www.metro.sp.gov.br"
              target="_blank"
              rel="noreferrer"
              className="block w-full max-w-[952px] overflow-hidden group"
            >
              <img
                src="/ad-metro-sp.gif"
                alt="Metrô SP — Linha 15-Prata Expandida"
                className="w-full h-auto object-cover group-hover:scale-[1.01] transition-transform"
              />
            </a>
          </div>
        </div>

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

        <div className="max-w-[1280px] mx-auto px-4 py-4">
          <AdCentral />
        </div>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ZONA 5 — ESPORTE & CULTURA
            Dois carrosseis seguidos
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <SectionBlockCulturaLayout
          title="Esporte"
          color={editoriaColors.esporte}
          href="/esportes"
          articles={getByCategory("esporte", esporteArticles)}
          reverse
        />

        <div className="max-w-[1280px] mx-auto px-4 py-6">
          <p className="text-[9px] text-gray-300 mb-1 text-center tracking-wider uppercase">Publicidade</p>
          <div className="flex justify-center">
            <a
              href="https://bileto.sympla.com.br/event/114114?share_id=1-copiarlink"
              target="_blank"
              rel="noreferrer"
              className="block w-full max-w-[952px] overflow-hidden group"
            >
              <img
                src="/ad-percy-jackson.gif"
                alt="Percy Jackson Musical — Uma aventura épica está para começar"
                className="w-full h-auto object-cover group-hover:scale-[1.01] transition-transform"
              />
            </a>
          </div>
        </div>

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
          href="/cidade"
          articles={getByCategory("df", dfArticles)}
        />

        <SectionBlock
          title="Saúde"
          color={editoriaColors.saude}
          href="/saude"
          articles={getByCategory("saude", saudeArticles)}
          pageSize={4}
        />

        <SectionBlockCulturaLayout
          title="Tecnologia"
          color={editoriaColors.tecnologia}
          href="/tecnologia"
          articles={getByCategory("tecnologia", tecnologiaArticles)}
          reverse
        />

        <div className="max-w-[1280px] mx-auto px-4 py-6">
          <p className="text-[9px] text-gray-300 mb-1 text-center tracking-wider uppercase">Publicidade</p>
          <div className="flex justify-center">
            <a
              href="https://www.byd.com/br/car/atto2"
              target="_blank"
              rel="noreferrer"
              className="block w-full max-w-[952px] overflow-hidden group"
            >
              <img
                src="/ad-byd-atto2.png"
                alt="BYD Atto 2 — Uma revolução movida pelo que você decidir"
                className="w-full h-auto object-cover group-hover:scale-[1.01] transition-transform"
              />
            </a>
          </div>
        </div>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ZONA 8 — ÚLTIMAS NOTÍCIAS + SIDEBAR
            Lista com categoria colorida +
            sidebar com Mais Lidas e propaganda
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <DestaquesListaBadge />

      </main>

      <Footer />
    </div>
  );
}
