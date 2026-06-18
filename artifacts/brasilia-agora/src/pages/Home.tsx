import React from "react";
import TopBar from "../components/TopBar";
import Header from "../components/Header";
import HeroSection from "../components/HeroSection";
import MostRead from "../components/MostRead";
import SectionBlock from "../components/SectionBlock";
import SectionBlockFeatured from "../components/SectionBlockFeatured";
import SectionBlockDuploDestaque from "../components/SectionBlockDuploDestaque";
import SectionBlockCulturaLayout from "../components/SectionBlockCulturaLayout";
import SectionBlockLista from "../components/SectionBlockLista";
import SectionBlockManchete from "../components/SectionBlockManchete";
import DestaquesListaBadge from "../components/DestaquesListaBadge";
import Footer from "../components/Footer";
import AdBanner from "../components/ads/AdBanner";
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
  id: string; slug?: string; title: string; summary: string;
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
      slug: a.slug || a.id,
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
      return <SectionBlockCulturaLayout title={block.name} color={color} href={href} articles={articles} reverse={block.reverse} />;
    case "lista":
      return <SectionBlockLista title={block.name} color={color} href={href} articles={articles} />;
    case "manchete":
      return <SectionBlockManchete title={block.name} color={color} href={href} articles={articles} />;
    case "grid":
    default:
      return <SectionBlock title={block.name} color={color} href={href} articles={articles} pageSize={4} />;
  }
}

// ─── Default configs for predefined blocks ────────────────────────────────────
const PREDEFINED_DEFAULTS: Record<string, {
  category: string;
  layout: "grid" | "featured" | "duplo" | "cultura";
  color: string;
  href: string;
  reverse?: boolean;
}> = {
  brasil:     { category: "brasil",     layout: "grid",    color: "#16a34a", href: "/brasil" },
  mundo:      { category: "mundo",      layout: "grid",    color: "#6b21a8", href: "/mundo" },
  esporte:    { category: "esporte",    layout: "cultura", color: "#dc2626", href: "/esportes", reverse: true },
  cultura:    { category: "cultura",    layout: "cultura", color: "#0d9488", href: "/cultura" },
  df:         { category: "df",         layout: "duplo",   color: "#0b3d91", href: "/cidade" },
  saude:      { category: "saude",      layout: "grid",    color: "#16a34a", href: "/saude" },
  tecnologia: { category: "tecnologia", layout: "cultura", color: "#0284c7", href: "/tecnologia", reverse: true },
};

// ─── Configurable block renderer (predefined + custom) ────────────────────────
function ConfigurableBlock({ block, getArticles }: {
  block: HomeBlock;
  getArticles: (cat: string) => SectionArticle[];
}) {
  const defaults = PREDEFINED_DEFAULTS[block.id];

  const cat    = block.category ?? defaults?.category ?? "geral";
  const color  = block.color    ?? defaults?.color    ?? "#6b7280";
  const layout = block.layout   ?? defaults?.layout   ?? "grid";
  const href   = `/${cat}`;
  const title  = block.name;
  const articles = getArticles(cat);

  if (articles.length === 0) return null;

  switch (layout) {
    case "featured":
      return <SectionBlockFeatured title={title} color={color} href={href} articles={articles} />;
    case "duplo":
      return <SectionBlockDuploDestaque title={title} color={color} href={href} articles={articles} />;
    case "cultura":
      return <SectionBlockCulturaLayout title={title} color={color} href={href} articles={articles} reverse={block.reverse ?? defaults?.reverse} />;
    case "lista":
      return <SectionBlockLista title={title} color={color} href={href} articles={articles} />;
    case "manchete":
      return <SectionBlockManchete title={title} color={color} href={href} articles={articles} />;
    case "grid":
    default:
      return <SectionBlock title={title} color={color} href={href} articles={articles} pageSize={4} />;
  }
}

// ─── Predefined block renderer ────────────────────────────────────────────────
function PredefinedBlock({ block, getArticles }: {
  block: HomeBlock;
  getArticles: (cat: string) => SectionArticle[];
}) {
  // Special fixed blocks (no category makes sense)
  if (block.id === "hero")       return <HeroSection />;
  if (block.id === "mais-lidas") return <MostRead />;
  if (block.id === "colunistas") return <ColumnistsSection limit={4} />;
  if (block.id === "ultimas")    return <DestaquesListaBadge />;

  // All other predefined blocks are fully configurable
  if (PREDEFINED_DEFAULTS[block.id]) {
    return <ConfigurableBlock block={block} getArticles={getArticles} />;
  }

  return null;
}

// ─── Admin preview overlay ────────────────────────────────────────────────────
function AdminBlockWrapper({
  block, idx, total, dragOver, isSelected, children,
  onEdit, onDragStart, onDragOver, onDragEnd, isDragging,
}: {
  block: HomeBlock; idx: number; total: number; dragOver: boolean; isSelected: boolean;
  children: React.ReactNode;
  onEdit: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  isDragging: boolean;
}) {
  return (
    <div
      className={`group relative cursor-pointer transition-all duration-150
        ${isDragging ? "opacity-40 scale-[0.99]" : ""}
        ${isSelected
          ? "outline outline-2 outline-offset-[-2px] outline-[#2563EB]"
          : "outline outline-2 outline-offset-[-2px] outline-transparent hover:outline-[#2563EB]/50"}
        ${dragOver ? "outline-[#E71D36]" : ""}
      `}
      onClick={onEdit}
      draggable
      onDragStart={(e) => { e.stopPropagation(); onDragStart(); }}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      {/* Block content */}
      {children}

      {/* Floating toolbar — appears on hover or when selected */}
      <div
        className={`absolute top-2 right-3 z-50 flex items-center gap-1 transition-all duration-150
          ${isSelected ? "opacity-100 translate-y-0" : "opacity-0 group-hover:opacity-100 -translate-y-1 group-hover:translate-y-0"}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Name badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#0B2A66] text-white text-[11px] font-bold rounded-full shadow-lg select-none">
          <svg width="9" height="9" viewBox="0 0 12 12" fill="currentColor" className="opacity-60 cursor-grab shrink-0"
            onMouseDown={(e) => { e.stopPropagation(); onDragStart(); }}>
            <circle cx="3" cy="3" r="1.2"/><circle cx="9" cy="3" r="1.2"/>
            <circle cx="3" cy="6" r="1.2"/><circle cx="9" cy="6" r="1.2"/>
            <circle cx="3" cy="9" r="1.2"/><circle cx="9" cy="9" r="1.2"/>
          </svg>
          <span className="max-w-[120px] truncate">{block.name}</span>
          <span className="text-white/40 text-[9px] shrink-0">{idx + 1}/{total}</span>
        </div>
        {/* Edit button */}
        <button
          onClick={onEdit}
          className="flex items-center gap-1 px-2.5 py-1 bg-[#2563EB] hover:bg-[#1d4ed8] text-white text-[11px] font-bold rounded-full shadow-lg transition-colors"
        >
          ✏️ Editar
        </button>
      </div>

      {/* Selected indicator — blue corner tag */}
      {isSelected && (
        <div className="absolute top-0 left-0 bg-[#2563EB] text-white text-[9px] font-bold px-2 py-0.5 rounded-br-lg select-none pointer-events-none z-50">
          Selecionado
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Home() {
  const { articles } = useArticles();
  const { settings } = useSite();

  const isAdminPreview = typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("adminPreview") === "1";

  const baseBlocks: HomeBlock[] = (settings?.homeBlocks && settings.homeBlocks.length > 0)
    ? [...settings.homeBlocks].sort((a, b) => a.order - b.order)
    : DEFAULT_BLOCKS;

  const [previewBlocks, setPreviewBlocks] = React.useState<HomeBlock[]>([]);
  const [dragIdx, setDragIdx] = React.useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = React.useState<number | null>(null);
  const [selectedBlockId, setSelectedBlockId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setPreviewBlocks(baseBlocks.filter((b) => b.visible));
  }, [settings]);

  // Listen for block selection from admin panel
  React.useEffect(() => {
    if (!isAdminPreview) return;
    function onMessage(e: MessageEvent) {
      if (!e.data || typeof e.data !== "object") return;
      if (e.data.type === "block:select" && e.data.blockId) {
        setSelectedBlockId(e.data.blockId);
        const el = document.getElementById(`block-${e.data.blockId}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [isAdminPreview]);

  const visibleBlocks = isAdminPreview ? previewBlocks : baseBlocks.filter((b) => b.visible);

  function getArticles(cat: string): SectionArticle[] {
    const fallback = FALLBACK_DATA[cat] ?? brasilArticles;
    const real = articles.filter((a) =>
      a.category.toLowerCase().includes(cat.toLowerCase())
    );
    if (real.length > 0) {
      return real.map((a) => ({
        id: a.id,
        slug: a.slug || a.id,
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

  function handlePreviewDragStart(idx: number) {
    setDragIdx(idx);
  }

  function handlePreviewDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    setDragOverIdx(idx);
    setPreviewBlocks((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(idx, 0, moved!);
      return next;
    });
    setDragIdx(idx);
  }

  function handlePreviewDragEnd() {
    setDragIdx(null);
    setDragOverIdx(null);
    if (isAdminPreview) {
      window.parent.postMessage(
        { type: "block:reorder", blockIds: previewBlocks.map((b) => b.id) },
        "*"
      );
    }
  }

  function handleEditBlock(blockId: string) {
    setSelectedBlockId(blockId);
    if (isAdminPreview) {
      window.parent.postMessage({ type: "block:edit", blockId }, "*");
    }
  }

  return (
    <div className="min-h-screen w-full bg-white flex flex-col overflow-x-hidden">
      <TopBar />
      <Header />

      {isAdminPreview && (
        <div className="sticky top-0 z-[100] bg-[#0B2A66] text-white text-[11px] font-semibold flex items-center justify-center gap-2 py-1.5 px-4 shadow-md">
          <span className="w-2 h-2 rounded-full bg-[#E71D36] animate-pulse shrink-0" />
          Modo de edição — clique em qualquer bloco para editar
        </div>
      )}

      <main className="flex-1">
        <h1 className="sr-only">Últimas notícias de Brasília e do Distrito Federal</h1>

        {visibleBlocks.map((block, idx) => {
          const content = (
            <>
              {idx === 0 && <div className="max-w-[1280px] mx-auto px-4 pt-4 pb-2"><AdBanner slot="slot_08" /></div>}
              {idx === 1 && <div className="max-w-[1280px] mx-auto px-4 py-4"><AdBanner slot="slot_01" /></div>}
              {idx === 2 && <div className="max-w-[1280px] mx-auto px-4 py-4"><AdBanner slot="slot_02" /></div>}
              {idx === 4 && <div className="max-w-[1280px] mx-auto px-4 py-4"><AdBanner slot="slot_03" /></div>}
              {idx === 7 && <div className="max-w-[1280px] mx-auto px-4 py-4"><AdBanner slot="slot_04" /></div>}
              {block.custom
                ? <CustomBlock block={block} getArticles={getArticles} />
                : <PredefinedBlock block={block} getArticles={getArticles} />
              }
            </>
          );

          if (!isAdminPreview) {
            return <React.Fragment key={block.id}>{content}</React.Fragment>;
          }

          return (
            <AdminBlockWrapper
              key={block.id}
              block={block}
              idx={idx}
              total={visibleBlocks.length}
              dragOver={dragOverIdx === idx}
              isDragging={dragIdx === idx}
              isSelected={selectedBlockId === block.id}
              onEdit={() => handleEditBlock(block.id)}
              onDragStart={() => handlePreviewDragStart(idx)}
              onDragOver={(e) => handlePreviewDragOver(e, idx)}
              onDragEnd={handlePreviewDragEnd}
            >
              <div id={`block-${block.id}`}>{content}</div>
            </AdminBlockWrapper>
          );
        })}

        {/* slot_09 — Rodapé da Home */}
        <div className="max-w-[1280px] mx-auto px-4 py-6">
          <p className="text-[9px] text-gray-300 uppercase tracking-widest text-center mb-1">Publicidade</p>
          <AdBanner slot="slot_09" />
        </div>
      </main>

      <Footer />
    </div>
  );
}
