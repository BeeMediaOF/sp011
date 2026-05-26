import React from "react";
import TopBar from "../components/TopBar";
import Header from "../components/Header";
import NavBar from "../components/NavBar";
import HeroSection from "../components/HeroSection";
import DestaquesSection from "../components/DestaquesSection";
import BottomSection from "../components/BottomSection";
import SegurancaSection from "../components/SegurancaSection";
import EsportesSection from "../components/EsportesSection";
import MaisLidasSection from "../components/MaisLidasSection";
import RedacaoBanner from "../components/RedacaoBanner";
import Footer from "../components/Footer";

export default function Home() {
  return (
    <div className="min-h-screen w-full bg-[#fcfcfc] flex flex-col">
      <TopBar />
      <Header />
      <NavBar />
      <main className="flex-1 bg-white">
        <HeroSection />
        <DestaquesSection />
        <BottomSection />
        <SegurancaSection />
        <EsportesSection />
        <MaisLidasSection />
      </main>
      <RedacaoBanner />
      <Footer />
    </div>
  );
}
