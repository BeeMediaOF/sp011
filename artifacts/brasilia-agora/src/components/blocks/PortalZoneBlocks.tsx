/**
 * Renderizadores dos blocos dentro das zonas da home (coluna principal +
 * barra lateral e pares de meia largura — ver segmentBlocks em lib/homeBlocks).
 *
 * Os componentes clássicos das seções carregam o próprio wrapper
 * max-w-[1280px] e usam breakpoints de viewport, então não servem drop-in em
 * colunas estreitas. Aqui cada renderer é desenhado para a largura da coluna:
 * a zona só existe em lg+ (abaixo disso tudo empilha em coluna única).
 *
 * Tipos sem renderer de zona devolvem o `fallback` (componente clássico).
 */
import React from "react";
import { Link } from "wouter";
import HeroSection from "../HeroSection";
import AdBanner from "../ads/AdBanner";
import type { AdSlotKey } from "../ads/useAds";
import { buildSrcSet, CARD_WIDTHS, THUMB_WIDTHS } from "@/lib/newsImage";
import { safeTitleHtml } from "../../lib/sanitize";
import { inferBlockType, type HomeBlock } from "../../lib/homeBlocks";
import { AD_SLOTS, BlockPlaceholder, HtmlBlock, TickerBlock } from "./HomeCustomBlocks";

/** Mesmo shape do SectionArticle da Home (mapeado de useArticles). */
export interface ZoneArticle {
  id: string;
  slug?: string;
  title: string;
  summary: string;
  image: string;
  chapeu: string;
  author: string;
  time: string;
}

type Zone = "main" | "sidebar" | "half";

// ─── Cabeçalho de seção das zonas (barra de cor + título + link opcional) ─────
function ZoneSectionHeader({ title, color, href, linkLabel }: {
  title: string; color: string; href?: string; linkLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-1 h-5 shrink-0" style={{ backgroundColor: color }} />
        <h2 className="text-[15px] font-bold text-[#1a1a1a] uppercase tracking-wider truncate">{title}</h2>
      </div>
      {href && (
        <Link href={href}
          className="text-[11px] font-bold uppercase tracking-wider text-gray-400 hover:text-gray-600 hover:underline shrink-0 ml-3">
          {linkLabel ?? "Ver mais"}
        </Link>
      )}
    </div>
  );
}

// ─── Coluna principal: grade de cards (ex.: "Recent News") ────────────────────
function ZoneCardsGrid({ block, articles, color, href, preview }: {
  block: HomeBlock; articles: ZoneArticle[]; color: string; href?: string; preview?: boolean;
}) {
  const items = articles.slice(0, block.itemsLimit ?? 4);
  if (items.length === 0) {
    return <BlockPlaceholder preview={preview} label={`Seção: ${block.name}`}
      hint="Nenhum artigo publicado na categoria configurada." />;
  }
  return (
    <section className="min-w-0">
      <ZoneSectionHeader title={block.name} color={color} href={href} linkLabel={block.linkLabel} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {items.map((a) => (
          <Link key={a.id} href={`/artigo/${a.slug ?? a.id}`} className="group flex flex-col min-w-0">
            <div className="relative w-full aspect-[3/2] overflow-hidden rounded-lg bg-gray-100 mb-2">
              {a.image && (
                <img src={a.image} srcSet={buildSrcSet(a.image, CARD_WIDTHS) || undefined}
                  sizes="(max-width: 1024px) 50vw, 230px" alt={a.title.replace(/<[^>]*>/g, "")}
                  width={460} height={307} loading="lazy" decoding="async"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              )}
              <span className="absolute top-2 left-2 text-[9px] font-bold uppercase tracking-wider text-white px-1.5 py-0.5"
                style={{ backgroundColor: color }}>{a.chapeu}</span>
            </div>
            <p className="text-[14px] font-bold text-[#1a1a1a] leading-snug line-clamp-2 group-hover:underline"
              dangerouslySetInnerHTML={{ __html: safeTitleHtml(a.title) }} />
            {a.summary && <p className="text-[12px] text-gray-500 leading-snug line-clamp-2 mt-1">{a.summary}</p>}
            <p className="text-[11px] text-gray-400 mt-1">{a.time}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ─── Sidebar: lista numerada com thumb (ex.: "Most Read") ────────────────────
function SidebarMostRead({ block, articles, color, preview }: {
  block: HomeBlock; articles: ZoneArticle[]; color: string; preview?: boolean;
}) {
  const items = articles.slice(0, block.itemsLimit ?? 5);
  if (items.length === 0) {
    return <BlockPlaceholder preview={preview} label={`Seção: ${block.name}`}
      hint="Sem artigos para listar ainda." />;
  }
  return (
    <section className="border border-gray-200 rounded-lg p-4">
      <ZoneSectionHeader title={block.name} color={color} />
      <div className="flex flex-col">
        {items.map((a, i) => (
          <Link key={a.id} href={`/artigo/${a.slug ?? a.id}`}
            className="group flex items-start gap-3 py-2.5 border-b border-gray-100 first:pt-0 last:border-0 last:pb-0">
            <span className="w-6 h-6 rounded-full text-white text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5"
              style={{ backgroundColor: color }}>{i + 1}</span>
            <p className="flex-1 min-w-0 text-[13px] font-semibold text-[#1a1a1a] leading-snug line-clamp-3 group-hover:underline"
              dangerouslySetInnerHTML={{ __html: safeTitleHtml(a.title) }} />
            {a.image && (
              <img src={a.image} srcSet={buildSrcSet(a.image, THUMB_WIDTHS) || undefined} sizes="64px"
                alt={a.title.replace(/<[^>]*>/g, "")} width={64} height={48} loading="lazy" decoding="async"
                className="w-16 h-12 object-cover rounded shrink-0" />
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}

// ─── Sidebar: manchetes em bullets (ex.: "Latest Headlines") ─────────────────
function SidebarHeadlines({ block, articles, color, preview }: {
  block: HomeBlock; articles: ZoneArticle[]; color: string; preview?: boolean;
}) {
  const items = articles.slice(0, block.itemsLimit ?? 5);
  if (items.length === 0) {
    return <BlockPlaceholder preview={preview} label={`Lista: ${block.name}`}
      hint="Nenhum artigo encontrado para a fonte configurada." />;
  }
  return (
    <section className="border border-gray-200 rounded-lg p-4">
      <ZoneSectionHeader title={block.name} color={color} />
      <div className="flex flex-col">
        {items.map((a) => (
          <Link key={a.id} href={`/artigo/${a.slug ?? a.id}`}
            className="group flex items-start gap-2.5 py-2 border-b border-gray-100 first:pt-0 last:border-0 last:pb-0">
            <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-[7px]" style={{ backgroundColor: color }} />
            <p className="min-w-0 text-[13px] text-[#1a1a1a] leading-snug line-clamp-2 group-hover:underline"
              dangerouslySetInnerHTML={{ __html: safeTitleHtml(a.title) }} />
          </Link>
        ))}
      </div>
    </section>
  );
}

// ─── Meia largura: destaque + lista lateral (seções Football/Basketball…) ─────
function HalfSection({ block, articles, color, href, preview }: {
  block: HomeBlock; articles: ZoneArticle[]; color: string; href?: string; preview?: boolean;
}) {
  const [main, ...rest] = articles;
  if (!main) {
    return <BlockPlaceholder preview={preview} label={`Seção: ${block.name}`}
      hint="Nenhum artigo publicado na categoria configurada." />;
  }
  const pill = (block.caption ?? "").trim() || main.chapeu;
  return (
    <section className="min-w-0">
      <ZoneSectionHeader title={block.name} color={color} href={href} linkLabel={block.linkLabel} />
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4">
        <Link href={`/artigo/${main.slug ?? main.id}`} className="group block min-w-0">
          <div className="relative w-full aspect-[16/10] overflow-hidden rounded-lg bg-gray-100 mb-2.5">
            {main.image && (
              <img src={main.image} srcSet={buildSrcSet(main.image, CARD_WIDTHS) || undefined}
                sizes="(max-width: 1024px) 100vw, 360px" alt={main.title.replace(/<[^>]*>/g, "")}
                width={640} height={400} loading="lazy" decoding="async"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            )}
            <span className="absolute top-2.5 left-2.5 text-[9px] font-bold uppercase tracking-wider text-white px-2 py-0.5"
              style={{ backgroundColor: color }}>{pill}</span>
          </div>
          <h3 className="text-[16px] font-black text-[#1a1a1a] leading-snug line-clamp-2 group-hover:underline"
            dangerouslySetInnerHTML={{ __html: safeTitleHtml(main.title) }} />
          {main.summary && <p className="text-[12.5px] text-gray-500 leading-snug line-clamp-2 mt-1">{main.summary}</p>}
          <p className="text-[11px] text-gray-400 mt-1.5">{main.time}</p>
        </Link>
        {rest.length > 0 && (
          <div className="flex flex-col min-w-0">
            {rest.slice(0, 3).map((a) => (
              <Link key={a.id} href={`/artigo/${a.slug ?? a.id}`}
                className="group flex items-start gap-3 py-2.5 border-b border-gray-100 first:pt-0 last:border-0 last:pb-0">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[#1a1a1a] leading-snug line-clamp-2 group-hover:underline"
                    dangerouslySetInnerHTML={{ __html: safeTitleHtml(a.title) }} />
                  <p className="text-[11px] text-gray-400 mt-1">{a.time}</p>
                </div>
                {a.image && (
                  <img src={a.image} srcSet={buildSrcSet(a.image, THUMB_WIDTHS) || undefined} sizes="80px"
                    alt={a.title.replace(/<[^>]*>/g, "")} width={80} height={56} loading="lazy" decoding="async"
                    className="w-20 h-14 object-cover rounded shrink-0" />
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────
export function ZoneBlock({ block, zone, getArticles, preview, fallback }: {
  block: HomeBlock;
  zone: Zone;
  getArticles: (cat: string) => ZoneArticle[];
  preview?: boolean;
  /** Renderização clássica do bloco — usada quando o tipo não tem renderer de zona. */
  fallback: React.ReactNode;
}) {
  const cat = block.category ?? "geral";
  const color = block.color ?? (block.id === "mais-lidas" ? "#c8102e" : "#6b7280");
  // Link do cabeçalho só quando o bloco aponta para uma categoria concreta
  // (fontes "latest"/"most_read" não têm página de arquivo própria).
  const href = block.source !== "latest" && block.source !== "most_read" && block.category
    ? `/${block.category}` : undefined;

  // Blocos pré-definidos com renderer de zona
  if (!block.custom) {
    if (block.id === "hero" && zone === "main") {
      return <HeroSection variant={block.layout} contained={false} />;
    }
    if (block.id === "mais-lidas" && zone === "sidebar") {
      return <SidebarMostRead block={block} articles={getArticles("")} color={color} preview={preview} />;
    }
    return <>{fallback}</>;
  }

  const type = inferBlockType(block);
  const byCategory = block.source === "latest" || block.source === "most_read"
    ? getArticles("")
    : getArticles(cat);

  switch (type) {
    case "ticker":
      return <TickerBlock block={block} articles={byCategory} preview={preview} contained={false} />;
    case "html":
      return <HtmlBlock block={block} preview={preview} contained={false} />;
    case "advertising": {
      const slot = AD_SLOTS.includes(block.adSlot ?? "") ? (block.adSlot as AdSlotKey) : "slot_05";
      return <div className="py-1"><AdBanner slot={slot} /></div>;
    }
    case "list":
      if (zone === "sidebar") {
        return <SidebarHeadlines block={block} articles={byCategory} color={color} preview={preview} />;
      }
      return <>{fallback}</>;
    case "content":
      if (zone === "sidebar") {
        return block.source === "most_read"
          ? <SidebarMostRead block={block} articles={byCategory} color={color} preview={preview} />
          : <SidebarHeadlines block={block} articles={byCategory} color={color} preview={preview} />;
      }
      if (zone === "main" && (block.layout === "grid" || !block.layout)) {
        return <ZoneCardsGrid block={block} articles={byCategory} color={color} href={href} preview={preview} />;
      }
      return <HalfSection block={block} articles={byCategory} color={color} href={href} preview={preview} />;
    default:
      return <>{fallback}</>;
  }
}
