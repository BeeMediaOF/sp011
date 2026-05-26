import React from "react";
import TopBar from "../components/TopBar";
import Header from "../components/Header";
import NavBar from "../components/NavBar";
import HeroSection from "../components/HeroSection";
import DestaquesSection from "../components/DestaquesSection";
import BottomSection from "../components/BottomSection";
import MaisLidasSection from "../components/MaisLidasSection";
import NewsSection from "../components/NewsSection";
import RedacaoBanner from "../components/RedacaoBanner";
import Footer from "../components/Footer";

import policeImg from "../assets/images/police.png";
import security2Img from "../assets/images/security2.png";
import sportsImg from "../assets/images/sports.png";
import parkImg from "../assets/images/park.png";
import festivalImg from "../assets/images/festival.png";
import culturaFeatImg from "../assets/images/cultura_feat.png";
import culture2Img from "../assets/images/culture2.png";
import heroImg from "../assets/images/hero.png";
import politicaFeatImg from "../assets/images/politica_feat.png";
import politics2Img from "../assets/images/politics2.png";
import brasilImg from "../assets/images/brasil.png";
import especialImg from "../assets/images/especial.png";
import mundoImg from "../assets/images/mundo.png";
import trafficImg from "../assets/images/traffic.png";
import busImg from "../assets/images/bus.png";

export default function Home() {
  return (
    <div className="min-h-screen w-full bg-[#fcfcfc] flex flex-col">
      <TopBar />
      <Header />
      <NavBar />

      <main className="flex-1 bg-white">
        <div className="max-w-[1280px] mx-auto px-4">
          <HeroSection />
          <DestaquesSection />
          <BottomSection />

          {/* Únicos 2 anúncios discretos na página */}
          <div className="w-full h-[90px] bg-gray-50 rounded-lg border border-gray-100 flex items-center justify-center my-6">
            <p className="text-[10px] font-semibold tracking-wider text-gray-300 uppercase">Publicidade — 728 × 90</p>
          </div>

          <NewsSection
            label="SEGURANÇA"
            color="#dc2626"
            href="/seguranca"
            featuredArticle={{
              id: "seg-destaque",
              title: "Polícia Civil do DF registra queda de 18% nos crimes contra o patrimônio em maio",
              time: "30 minutos atrás",
              img: security2Img,
            }}
            articles={[
              { id: "seg-1", title: "Operação prende 12 suspeitos de tráfico no Recanto das Emas", time: "1 hora atrás", img: policeImg },
              { id: "seg-2", title: "PMDF reforça policiamento nos parques do DF neste fim de semana", time: "2 horas atrás", img: security2Img },
              { id: "seg-3", title: "Câmeras de monitoramento ajudam a reduzir crimes no Plano Piloto", time: "5 horas atrás", img: policeImg },
            ]}
          />

          <NewsSection
            label="ESPORTES"
            color="#b45309"
            href="/esportes"
            variant="grid"
            bgGray
            featuredArticle={{
              id: "esp-destaque",
              title: "GDF anuncia investimento de R$ 50 milhões na reforma do Estádio Mané Garrincha",
              time: "1 hora atrás",
              img: sportsImg,
            }}
            articles={[
              { id: "esp-1", title: "Mané Garrincha recebe jogo da Série B neste domingo com mais de 40 mil torcedores", time: "2 horas atrás", img: sportsImg },
              { id: "esp-2", title: "Brasília FC entra na briga pelo acesso à Série A com vitória por 2 a 0", time: "4 horas atrás", img: parkImg },
              { id: "esp-3", title: "Atletas do DF conquistam três medalhas no Campeonato Brasileiro de Atletismo", time: "6 horas atrás", img: festivalImg },
            ]}
          />

          <NewsSection
            label="CULTURA"
            color="#0d9488"
            href="/cultura"
            featuredArticle={{
              id: "cul-destaque",
              title: "Festival de Inverno de Brasília bate recorde de público com mais de 80 mil visitantes",
              time: "45 minutos atrás",
              img: culturaFeatImg,
            }}
            articles={[
              { id: "cul-1", title: "Museu Nacional da República inaugura exposição inédita de arte contemporânea", time: "3 horas atrás", img: culture2Img },
              { id: "cul-2", title: "Cine Brasília celebra 60 anos com programação especial e entrada gratuita", time: "5 horas atrás", img: festivalImg },
              { id: "cul-3", title: "Orquestra Sinfônica do Teatro Nacional apresenta concerto ao ar livre no Parque da Cidade", time: "7 horas atrás", img: culturaFeatImg },
            ]}
          />

          <NewsSection
            label="POLÍTICA"
            color="#1d4ed8"
            href="/politica"
            variant="grid"
            bgGray
            featuredArticle={{
              id: "pol-destaque",
              title: "Governador do DF lança pacote de obras que vai modernizar 15 regiões administrativas",
              time: "1 hora atrás",
              img: politicaFeatImg,
            }}
            articles={[
              { id: "pol-1", title: "Câmara Legislativa aprova projeto que cria o programa Morar DF", time: "2 horas atrás", img: heroImg },
              { id: "pol-2", title: "GDF encaminha à CLDF proposta do orçamento para 2025 com R$ 48 bilhões", time: "4 horas atrás", img: politics2Img },
              { id: "pol-3", title: "Bancada do DF no Congresso articula emendas para transporte e saúde do Distrito Federal", time: "6 horas atrás", img: politicaFeatImg },
            ]}
          />

          <NewsSection
            label="BRASIL"
            color="#16a34a"
            href="/"
            featuredArticle={{
              id: "bra-destaque",
              title: "Governo Federal anuncia novo programa habitacional com 1 milhão de moradias até 2026",
              time: "2 horas atrás",
              img: brasilImg,
            }}
            articles={[
              { id: "bra-1", title: "STF retoma julgamento de casos relacionados ao setor de telecomunicações", time: "3 horas atrás", img: especialImg },
              { id: "bra-2", title: "Inflação recua para 3,8% em maio, menor índice desde 2020, aponta IBGE", time: "5 horas atrás", img: brasilImg },
              { id: "bra-3", title: "Ministério da Saúde lança campanha nacional de vacinação contra influenza para 2024", time: "7 horas atrás", img: busImg },
            ]}
          />

          <NewsSection
            label="MUNDO"
            color="#6b21a8"
            href="/"
            bgGray
            featuredArticle={{
              id: "mun-destaque",
              title: "Cúpula do G7 debate crise climática e promete corte de 50% nas emissões até 2035",
              time: "1 hora atrás",
              img: mundoImg,
            }}
            articles={[
              { id: "mun-1", title: "ONU alerta para avanço dos conflitos armados em três regiões da África", time: "2 horas atrás", img: trafficImg },
              { id: "mun-2", title: "União Europeia aprova pacote de sanções econômicas contra novos países", time: "4 horas atrás", img: mundoImg },
              { id: "mun-3", title: "NASA confirma lançamento de missão tripulada à Lua para o segundo semestre", time: "6 horas atrás", img: especialImg },
            ]}
          />

          <MaisLidasSection />
        </div>
      </main>
      <RedacaoBanner />
      <Footer />
    </div>
  );
}
