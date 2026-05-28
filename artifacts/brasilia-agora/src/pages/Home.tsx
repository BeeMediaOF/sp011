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

import {
  brasilArticles,
  mundoArticles,
  politicaArticles,
  economiaArticles,
  esporteArticles,
  culturaArticles,
} from "../data/mockData";

export default function Home() {
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

        {/* Seções por Editoria */}
        <SectionBlock
          title="Brasil"
          color="#16a34a"
          href="/brasil"
          articles={brasilArticles}
        />

        <SectionBlock
          title="Mundo"
          color="#6b21a8"
          href="/mundo"
          articles={mundoArticles}
        />

        <SectionBlock
          title="Política"
          color="#1d4ed8"
          href="/politica"
          articles={politicaArticles}
        />

        {/* Ad Central */}
        <div className="max-w-[1280px] mx-auto px-4 py-6">
          <AdCentral />
        </div>

        <SectionBlock
          title="Economia"
          color="#b45309"
          href="/economia"
          articles={economiaArticles}
        />

        <SectionBlock
          title="Esporte"
          color="#dc2626"
          href="/esporte"
          articles={esporteArticles}
        />

        <SectionBlock
          title="Cultura"
          color="#0d9488"
          href="/cultura"
          articles={culturaArticles}
        />

        {/* Bloco de Vídeos */}
        <VideoSection />
      </main>

      <Footer />
    </div>
  );
}
