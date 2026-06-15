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
import ColumnistsSection from "../components/ColumnistsSection";
import { useArticles } from "../hooks/useArticles";
import { useSite, type HomeBlock } from "../hooks/useSite";

import {
  brasilArticles,
  mundoArticles,
  esporteArticles,
  culturaArticles,
  saudeArticles,
  tecnologiaArticles,
  dfArticles,
} from "../data/mockData";

// ─── Colors per section ───────────────────────────────────────────────────────
const EDITORIA_COLORS: Record<string, string> = {
  brasil:     "#16a34a",
  mundo:      "#6b21a8",
  esporte:    "#dc2626",
  esportes:   "#dc2626",
  cultura:    "#0d9488",
  saude:      "#16a34a",
  tecnologia: "#0284c7",
  df:         "#0b3d91",
  cidade:     "#0b3d91",
  politica:   "#1d4ed8",
  seguranca:  "#7c3aed",
  educacao:   "#0284c7",
  economia:   "#b45309",
  colunas:    "#7c3aed",
  geral:      "#6b7280",
};

const FALLBACK_DATA: Record<string, typeof brasilArticles> = {
  brasil:     brasilArticles,
  mundo:      mundoArticles,
  esporte:    esporteArticles,
  esportes:   esporteArticles,
  cultura:    culturaArticles,
  saude:      saudeArticles,
  tecnologia: tecnologiaArticles,
  df:         dfArticles,
  cidade:     dfArticles,
};

const DEFAULT_BLOCKS: HomeBlock[] = [
  { id: "hero",       name: "Hero",         visible: true, order: 0 },
  { id: "brasil",     name: "Brasil",       visible: true, order: 1 },
  { id: "mais-lidas", name: "Mais Lidas",   visible: true, order: 2 },
  { id: "mundo",      name: "Mundo",        visible: true, order: 3 },
  { id: "esporte",    name: "Esporte",      visible: true, order: 4 },
  { id: "cultura",    name: "Cultura",      visible: true, order: 5 },
  { id: "df",         name: "DF",           visible: true, order: 6 },
  { id: "saude",      name: "Saúde",        visible: true, order: 7 },
  { id: "tecnologia", name: "Tecnologia",   visible: true, order: 8 },
  { id: "colunistas", name: "Colunistas",   visible: true, order: 9 },
  { id: "ultimas",    name: "Últimas",      visible: true, order: 10 },
];

// ─── Article mapper ───────────────────────────────────────────────────────────
type SectionArticle = {
  id: string; title: string; summary: string;
  image: string; chapeu: string; author: string; time: string;
};

function useArticlesByCategory(category: string, fallback: SectionArticle[]): SectionArticle[] {
  const { articles } = useArticles();
  const real = articles.filter((a) =>
    a.category.toLowerCase().includes(category.toLowerCase())
  );
  if (real.length > 0) {
    return real.map((a) => ({
      id: a.id,
      title: a.title,
      summary: a.subtitle,
      image: a.imageUrl || (fallback[0]?.image ?? brasilArticles[0].image),
      chapeu: a.tag || category.toUpperCase(),
      author: a.author,
      time: new Date(a.publishedAt).toLocaleDateString("pt-BR", {
        day: "numeric", month: "short",
      }),
    }));
  }
  return fallback;
}

// ─── Custom block renderer ────────────────────────────────────────────────────
function CustomBlock({ block, getArticles }: {
  block: HomeBlock;
  getArticles: (cat: string) => SectionArticle[];
}) {
  const cat = block.category ?? "geral";
  const articles = getArticles(cat);
  const color = block.color ?? EDITORIA_COLORS[cat] ?? "#6b7280";
  const href = `/${cat}`;

  if (articles.length === 0) return null;

  switch (block.layout) {
    case "featured":
      return <SectionBlockFeatured title={block.name} color={color} href={href} articles={articles} />;
    case "duplo":
      return <SectionBlockDuploDestaque title={block.name} color={color} href={href} articles={articles} />;
    case "cultura":
      return <SectionBlockCulturaLayout title={block.name} color={color} href={href} articles={articles} />;
    case "grid":
    default:
      return <SectionBlock title={block.name} color={color} href={href} articles={articles} pageSize={4} />;
  }
}

// ─── Predefined block renderer ────────────────────────────────────────────────
function PredefinedBlock({ block, getArticles }: {
  block: HomeBlock;
  getArticles: (cat: string) => SectionArticle[];
}) {
  switch (block.id) {
    case "hero":
      return <HeroSection />;

    case "brasil":
      return (
        <SectionBlock
          title="Brasil" color={EDITORIA_COLORS.brasil} href="/brasil"
          articles={getArticles("brasil")} pageSize={4}
        />
      );

    case "mais-lidas":
      return <MostRead />;

    case "mundo":
      return (
        <SectionBlock
          title="Mundo" color={EDITORIA_COLORS.mundo} href="/mundo"
          articles={getArticles("mundo")}
        />
      );

    case "esporte":
      return (
        <SectionBlockCulturaLayout
          title="Esporte" color={EDITORIA_COLORS.esporte} href="/esportes"
          articles={getArticles("esporte")} reverse
        />
      );

    case "cultura":
      return (
        <SectionBlockCulturaLayout
          title="Cultura" color={EDITORIA_COLORS.cultura} href="/cultura"
          articles={getArticles("cultura")}
        />
      );

    case "df":
      return (
        <SectionBlockDuploDestaque
          title="DF" color={EDITORIA_COLORS.df} href="/cidade"
          articles={getArticles("df")}
        />
      );

    case "saude":
      return (
        <SectionBlock
          title="Saúde" color={EDITORIA_COLORS.saude} href="/saude"
          articles={getArticles("saude")} pageSize={4}
        />
      );

    case "tecnologia":
      return (
        <SectionBlockCulturaLayout
          title="Tecnologia" color={EDITORIA_COLORS.tecnologia} href="/tecnologia"
          articles={getArticles("tecnologia")} reverse
        />
      );

    case "colunistas":
      return <ColumnistsSection limit={4} />;

    case "ultimas":
      return <DestaquesListaBadge />;

    default:
      return null;
  }
}

// ─── Ads between blocks ───────────────────────────────────────────────────────
const AD_POSITIONS = new Set([1, 3, 7]); // after block index N

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Home() {
  const { articles } = useArticles();
  const { settings } = useSite();

  const blocks: HomeBlock[] = (settings?.homeBlocks && settings.homeBlocks.length > 0)
    ? [...settings.homeBlocks].sort((a, b) => a.order - b.order)
    : DEFAULT_BLOCKS;

  const visibleBlocks = blocks.filter((b) => b.visible);

  function getArticles(cat: string): SectionArticle[] {
    const fallback = FALLBACK_DATA[cat] ?? brasilArticles;
    const real = articles.filter((a) =>
      a.category.toLowerCase().includes(cat.toLowerCase())
    );
    if (real.length > 0) {
      return real.map((a) => ({
        id: a.id,
        title: a.title,
        summary: a.subtitle,
        image: a.imageUrl || (fallback[0]?.image ?? brasilArticles[0].image),
        chapeu: a.tag || cat.toUpperCase(),
        author: a.author,
        time: new Date(a.publishedAt).toLocaleDateString("pt-BR", {
          day: "numeric", month: "short",
        }),
      }));
    }
    return fallback;
  }

  return (
    <div className="min-h-screen w-full bg-white flex flex-col overflow-x-hidden">
      <TopBar />
      <Header />

      <main className="flex-1">
        <h1 className="sr-only">Últimas notícias de Brasília e do Distrito Federal</h1>

        {visibleBlocks.map((block, idx) => (
          <React.Fragment key={block.id}>
            {/* Inject ad after certain positions */}
            {idx === 1 && (
              <div className="max-w-[1280px] mx-auto px-4 py-4">
                <p className="text-[9px] text-gray-300 mb-1 text-center tracking-wider uppercase">Publicidade</p>
                <div className="flex justify-center">
                  <a href="https://www.metro.sp.gov.br" target="_blank" rel="noreferrer"
                    className="block w-full max-w-[952px] overflow-hidden group">
                    <img src="/ad-metro-sp.gif" alt="Metrô SP"
                      className="w-full h-auto object-cover group-hover:scale-[1.01] transition-transform" />
                  </a>
                </div>
              </div>
            )}

            {idx === 4 && (
              <div className="max-w-[1280px] mx-auto px-4 py-6">
                <p className="text-[9px] text-gray-300 mb-1 text-center tracking-wider uppercase">Publicidade</p>
                <div className="flex justify-center">
                  <a href="https://bileto.sympla.com.br/event/114114?share_id=1-copiarlink"
                    target="_blank" rel="noreferrer"
                    className="block w-full max-w-[952px] overflow-hidden group">
                    <img src="/ad-percy-jackson.gif" alt="Percy Jackson Musical"
                      className="w-full h-auto object-cover group-hover:scale-[1.01] transition-transform" />
                  </a>
                </div>
              </div>
            )}

            {idx === 2 && (
              <div className="max-w-[1280px] mx-auto px-4 py-4">
                <AdCentral />
              </div>
            )}

            {idx === 7 && (
              <div className="max-w-[1280px] mx-auto px-4 py-6">
                <p className="text-[9px] text-gray-300 mb-1 text-center tracking-wider uppercase">Publicidade</p>
                <div className="flex justify-center">
                  <a href="https://www.byd.com/br/car/atto2" target="_blank" rel="noreferrer"
                    className="block w-full max-w-[952px] overflow-hidden group">
                    <img src="/ad-byd-atto2.png" alt="BYD Atto 2"
                      className="w-full h-auto object-cover group-hover:scale-[1.01] transition-transform" />
                  </a>
                </div>
              </div>
            )}

            {/* Render the block */}
            {block.custom ? (
              <CustomBlock block={block} getArticles={getArticles} />
            ) : (
              <PredefinedBlock block={block} getArticles={getArticles} />
            )}
          </React.Fragment>
        ))}
      </main>

      <Footer />
    </div>
  );
}
