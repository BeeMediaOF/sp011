/**
 * Renderizadores dos blocos dentro das zonas da home (coluna principal +
 * barra lateral e pares de meia largura — ver segmentBlocks em lib/homeBlocks).
 *
 * Os componentes clássicos das seções carregam o próprio wrapper
 * max-w-[1280px] e usam breakpoints de viewport, então não servem drop-in em
 * colunas estreitas. Aqui cada renderer é desenhado para a largura da coluna:
 * a zona só existe em lg+ (abaixo disso tudo empilha em coluna única).
 *
 * O layout escolhido no painel (grade, destaque, mosaico…) É respeitado em
 * todas as zonas: ZoneContent mapeia cada HomeBlockLayout para uma variação
 * adequada à largura da coluna. Tipos sem renderer de zona devolvem o
 * `fallback` (componente clássico).
 */
import React from "react";
import { Link } from "wouter";
import HeroSection from "../HeroSection";
import AdBanner from "../ads/AdBanner";
import type { AdSlotKey } from "../ads/useAds";
import { buildSrcSet, CARD_WIDTHS, THUMB_WIDTHS } from "@/lib/newsImage";
import { safeTitleHtml } from "../../lib/sanitize";
import { inferBlockType, sampleForPreview, type HomeBlock } from "../../lib/homeBlocks";
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
  views?: number;
}

/** Ordena por leituras reais ("Most Read"); empate mantém a ordem original. */
function sortByViews(list: ZoneArticle[]): ZoneArticle[] {
  return [...list].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
}

const stripTags = (s: string) => s.replace(/<[^>]*>/g, "");

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

// ─── Peças reutilizáveis ──────────────────────────────────────────────────────

/** Card vertical: imagem com pill de categoria + título + resumo + data. */
function CardItem({ a, color, ratio = "aspect-[3/2]", titleCls = "text-[14px]", sizes = "(max-width: 1024px) 50vw, 230px", summary = true }: {
  a: ZoneArticle; color: string; ratio?: string; titleCls?: string; sizes?: string; summary?: boolean;
}) {
  return (
    <Link href={`/artigo/${a.slug ?? a.id}`} className="group flex flex-col min-w-0">
      <div className={`relative w-full ${ratio} overflow-hidden rounded-lg bg-gray-100 mb-2`}>
        {a.image && (
          <img src={a.image} srcSet={buildSrcSet(a.image, CARD_WIDTHS) || undefined}
            sizes={sizes} alt={stripTags(a.title)}
            width={460} height={307} loading="lazy" decoding="async"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        )}
        <span className="absolute top-2 left-2 text-[9px] font-bold uppercase tracking-wider text-white px-1.5 py-0.5"
          style={{ backgroundColor: color }}>{a.chapeu}</span>
      </div>
      <p className={`${titleCls} font-bold text-[#1a1a1a] leading-snug line-clamp-2 group-hover:underline`}
        dangerouslySetInnerHTML={{ __html: safeTitleHtml(a.title) }} />
      {summary && a.summary && <p className="text-[12px] text-gray-500 leading-snug line-clamp-2 mt-1">{stripTags(a.summary)}</p>}
      <p className="text-[11px] text-gray-400 mt-1">{a.time}</p>
    </Link>
  );
}

/**
 * Card com título sobre a imagem (gradiente). A imagem preenche por posição
 * absoluta, então o tamanho vem do className (aspect-* ou h-full em grades de
 * altura fixa).
 */
function OverlayCard({ a, color, big = false, className = "" }: {
  a: ZoneArticle; color: string; big?: boolean; className?: string;
}) {
  return (
    <Link href={`/artigo/${a.slug ?? a.id}`}
      className={`group relative block overflow-hidden rounded-lg bg-gray-200 ${className}`}>
      {a.image && (
        <img src={a.image} srcSet={buildSrcSet(a.image, CARD_WIDTHS) || undefined}
          sizes={big ? "(max-width: 1024px) 100vw, 640px" : "(max-width: 1024px) 50vw, 320px"}
          alt={stripTags(a.title)} width={640} height={400} loading="lazy" decoding="async"
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
      <div className={`absolute bottom-0 left-0 right-0 ${big ? "p-4" : "p-3"}`}>
        <span className="inline-block text-[9px] font-bold uppercase tracking-wider text-white px-1.5 py-0.5 mb-1.5"
          style={{ backgroundColor: color }}>{a.chapeu}</span>
        <p className={`${big ? "text-[20px] leading-tight line-clamp-3" : "text-[13px] leading-snug line-clamp-2"} font-black text-white`}
          dangerouslySetInnerHTML={{ __html: safeTitleHtml(a.title) }} />
      </div>
    </Link>
  );
}

/** Linha com título à esquerda e thumb à direita (listas laterais). */
function ThumbRow({ a, color, chapeu = false, small = false }: {
  a: ZoneArticle; color?: string; chapeu?: boolean; small?: boolean;
}) {
  return (
    <Link href={`/artigo/${a.slug ?? a.id}`}
      className="group flex items-start gap-3 py-2.5 border-b border-gray-100 first:pt-0 last:border-0 last:pb-0">
      <div className="flex-1 min-w-0">
        {chapeu && color && (
          <span className="block text-[9px] font-bold uppercase tracking-wider" style={{ color }}>{a.chapeu}</span>
        )}
        <p className="text-[13px] font-semibold text-[#1a1a1a] leading-snug line-clamp-2 group-hover:underline"
          dangerouslySetInnerHTML={{ __html: safeTitleHtml(a.title) }} />
        <p className="text-[11px] text-gray-400 mt-1">{a.time}</p>
      </div>
      {a.image && (
        <img src={a.image} srcSet={buildSrcSet(a.image, THUMB_WIDTHS) || undefined} sizes={small ? "64px" : "80px"}
          alt={stripTags(a.title)} width={small ? 64 : 80} height={small ? 48 : 56} loading="lazy" decoding="async"
          className={`${small ? "w-16 h-12" : "w-20 h-14"} object-cover rounded shrink-0`} />
      )}
    </Link>
  );
}

// ─── Variações de conteúdo (coluna principal e meia largura) ──────────────────

/** Grade de cards (ex.: "Recent News"). */
function CardsGrid({ items, color, cols, narrow = false }: {
  items: ZoneArticle[]; color: string; cols: 2 | 3 | 4; narrow?: boolean;
}) {
  const colsCls = cols === 4 ? "grid-cols-2 lg:grid-cols-4"
    : cols === 3 ? "grid-cols-2 sm:grid-cols-3"
    : "grid-cols-1 sm:grid-cols-2";
  return (
    <div className={`grid ${colsCls} gap-4`}>
      {items.map((a) => (
        <CardItem key={a.id} a={a} color={color}
          titleCls={cols === 2 ? "text-[15px]" : narrow ? "text-[12.5px]" : "text-[14px]"}
          summary={cols !== 3}
          sizes={cols === 2 ? "(max-width: 1024px) 100vw, 300px" : "(max-width: 1024px) 50vw, 230px"} />
      ))}
    </div>
  );
}

/** Grade de cards com título sobre a foto. */
function OverlayGrid({ items, color, cols }: { items: ZoneArticle[]; color: string; cols: 2 | 4 }) {
  const colsCls = cols === 4 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-2";
  return (
    <div className={`grid ${colsCls} gap-4`}>
      {items.map((a) => <OverlayCard key={a.id} a={a} color={color} className="aspect-[3/4]" />)}
    </div>
  );
}

/** 2 cards grandes + tira de manchetes. */
function DuploZone({ items, color, narrow }: { items: ZoneArticle[]; color: string; narrow: boolean }) {
  const big = items.slice(0, 2);
  const strip = items.slice(2, narrow ? 4 : 6);
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {big.map((a) => (
          <CardItem key={a.id} a={a} color={color} ratio="aspect-[16/10]"
            titleCls={narrow ? "text-[15px]" : "text-[17px]"}
            sizes="(max-width: 1024px) 100vw, 440px" />
        ))}
      </div>
      {strip.length > 0 && (
        <div className={`grid grid-cols-1 ${narrow ? "" : "sm:grid-cols-2"} gap-x-6 mt-3 border-t border-gray-100 pt-1`}>
          {strip.map((a) => (
            <Link key={a.id} href={`/artigo/${a.slug ?? a.id}`}
              className="group flex items-start gap-2 py-2 border-b border-gray-100 last:border-0">
              <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-[7px]" style={{ backgroundColor: color }} />
              <p className="min-w-0 text-[13px] font-semibold text-[#1a1a1a] leading-snug line-clamp-2 group-hover:underline"
                dangerouslySetInnerHTML={{ __html: safeTitleHtml(a.title) }} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** 1 destaque grande + lista lateral (coluna principal). */
function FeaturedZone({ items, color }: { items: ZoneArticle[]; color: string }) {
  const [main, ...rest] = items;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-5">
      <CardItem a={main} color={color} ratio="aspect-[16/10]" titleCls="text-[18px]"
        sizes="(max-width: 1024px) 100vw, 580px" />
      {rest.length > 0 && (
        <div className="flex flex-col min-w-0">
          {rest.slice(0, 4).map((a) => <ThumbRow key={a.id} a={a} />)}
        </div>
      )}
    </div>
  );
}

/** 1 destaque em cima + lista embaixo (meia largura). */
function FeaturedStack({ items, color }: { items: ZoneArticle[]; color: string }) {
  const [main, ...rest] = items;
  return (
    <div className="flex flex-col">
      <CardItem a={main} color={color} ratio="aspect-[16/9]" titleCls="text-[16px]"
        sizes="(max-width: 1024px) 100vw, 600px" />
      {rest.length > 0 && (
        <div className="flex flex-col mt-3 pt-1 border-t border-gray-100">
          {rest.slice(0, 3).map((a) => <ThumbRow key={a.id} a={a} />)}
        </div>
      )}
    </div>
  );
}

/** Manchete com overlay + lista lateral (coluna principal). */
function BigStoryZone({ items, color }: { items: ZoneArticle[]; color: string }) {
  const [main, ...rest] = items;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-5 items-start">
      <OverlayCard a={main} color={color} big className="aspect-[16/9]" />
      {rest.length > 0 && (
        <div className="flex flex-col min-w-0">
          {rest.slice(0, 4).map((a) => <ThumbRow key={a.id} a={a} chapeu color={color} />)}
        </div>
      )}
    </div>
  );
}

/**
 * Foto + lista lateral (o visual das seções Football/Basketball do exemplo).
 * Pill do destaque usa a legenda do bloco quando preenchida.
 */
function FotoListaBody({ block, articles, color }: {
  block: HomeBlock; articles: ZoneArticle[]; color: string;
}) {
  const [main, ...rest] = articles;
  const pill = (block.caption ?? "").trim() || main.chapeu;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4">
      <Link href={`/artigo/${main.slug ?? main.id}`} className="group block min-w-0">
        <div className="relative w-full aspect-[16/10] overflow-hidden rounded-lg bg-gray-100 mb-2.5">
          {main.image && (
            <img src={main.image} srcSet={buildSrcSet(main.image, CARD_WIDTHS) || undefined}
              sizes="(max-width: 1024px) 100vw, 360px" alt={stripTags(main.title)}
              width={640} height={400} loading="lazy" decoding="async"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          )}
          <span className="absolute top-2.5 left-2.5 text-[9px] font-bold uppercase tracking-wider text-white px-2 py-0.5"
            style={{ backgroundColor: color }}>{pill}</span>
        </div>
        <h3 className="text-[16px] font-black text-[#1a1a1a] leading-snug line-clamp-2 group-hover:underline"
          dangerouslySetInnerHTML={{ __html: safeTitleHtml(main.title) }} />
        {main.summary && <p className="text-[12.5px] text-gray-500 leading-snug line-clamp-2 mt-1">{stripTags(main.summary)}</p>}
        <p className="text-[11px] text-gray-400 mt-1.5">{main.time}</p>
      </Link>
      {rest.length > 0 && (
        <div className="flex flex-col min-w-0">
          {rest.slice(0, 3).map((a) => <ThumbRow key={a.id} a={a} />)}
        </div>
      )}
    </div>
  );
}

/** Mosaico de overlays com altura travada (1 grande + tiles). */
function MosaicZone({ items, color, narrow }: { items: ZoneArticle[]; color: string; narrow: boolean }) {
  const [big, ...tiles] = items;
  return (
    <div className={`grid grid-cols-2 grid-rows-[minmax(0,1fr)] gap-3 ${narrow ? "h-[240px] sm:h-[300px]" : "h-[280px] sm:h-[400px]"}`}>
      <OverlayCard a={big} color={color} big={!narrow} className="h-full min-h-0" />
      <div className={`grid ${narrow ? "grid-rows-2" : "grid-cols-2 grid-rows-2"} gap-3 min-h-0`}>
        {tiles.slice(0, narrow ? 2 : 4).map((a) => (
          <OverlayCard key={a.id} a={a} color={color} className="h-full min-h-0" />
        ))}
      </div>
    </div>
  );
}

/** Manchete full + fileira de tiles. */
function MancheteZone({ items, color, narrow }: { items: ZoneArticle[]; color: string; narrow: boolean }) {
  const [main, ...tiles] = items;
  const row = tiles.slice(0, narrow ? 2 : 3);
  return (
    <div className="flex flex-col gap-3">
      <OverlayCard a={main} color={color} big className={narrow ? "aspect-[16/9]" : "aspect-[16/7]"} />
      {row.length > 0 && (
        <div className={`grid ${narrow ? "grid-cols-2" : "grid-cols-3"} gap-3`}>
          {row.map((a) => <OverlayCard key={a.id} a={a} color={color} className="aspect-[16/10]" />)}
        </div>
      )}
    </div>
  );
}

/** Capa com overlay + grade de cards embaixo. */
function MagazineZone({ items, color, narrow }: { items: ZoneArticle[]; color: string; narrow: boolean }) {
  const [main, ...rest] = items;
  const grid = rest.slice(0, narrow ? 2 : 4);
  return (
    <div>
      <OverlayCard a={main} color={color} big className={narrow ? "aspect-[16/9]" : "aspect-[16/7]"} />
      {grid.length > 0 && (
        <div className={`grid ${narrow ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4"} gap-4 mt-4`}>
          {grid.map((a) => (
            <CardItem key={a.id} a={a} color={color} titleCls="text-[13px]" summary={false} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Lista numerada com thumbs. */
function NumListZone({ items, color, cols }: { items: ZoneArticle[]; color: string; cols: 1 | 2 }) {
  return (
    <div className={`grid grid-cols-1 ${cols === 2 ? "md:grid-cols-2 gap-x-8" : ""}`}>
      {items.map((a, i) => (
        <Link key={a.id} href={`/artigo/${a.slug ?? a.id}`}
          className="group flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-0">
          <span className="text-[22px] font-black leading-none w-7 shrink-0 text-right mt-0.5" style={{ color }}>{i + 1}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-[#1a1a1a] leading-snug line-clamp-2 group-hover:underline"
              dangerouslySetInnerHTML={{ __html: safeTitleHtml(a.title) }} />
            <p className="text-[11px] text-gray-400 mt-0.5">{a.time}</p>
          </div>
          {a.image && (
            <img src={a.image} srcSet={buildSrcSet(a.image, THUMB_WIDTHS) || undefined} sizes="64px"
              alt={stripTags(a.title)} width={64} height={48} loading="lazy" decoding="async"
              className="w-16 h-12 object-cover rounded shrink-0" />
          )}
        </Link>
      ))}
    </div>
  );
}

/** Lista compacta: thumb à esquerda + chapéu + título. */
function CompactZone({ items, color, cols }: { items: ZoneArticle[]; color: string; cols: 1 | 2 }) {
  return (
    <div className={`grid grid-cols-1 ${cols === 2 ? "md:grid-cols-2 gap-x-8" : ""}`}>
      {items.map((a) => (
        <Link key={a.id} href={`/artigo/${a.slug ?? a.id}`}
          className="group flex gap-3 items-start py-2.5 border-b border-gray-100 last:border-0">
          {a.image && (
            <img src={a.image} srcSet={buildSrcSet(a.image, THUMB_WIDTHS) || undefined} sizes="64px"
              alt={stripTags(a.title)} width={64} height={48} loading="lazy" decoding="async"
              className="w-16 h-12 object-cover rounded shrink-0" />
          )}
          <div className="min-w-0">
            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color }}>{a.chapeu}</span>
            <p className="text-[13px] font-semibold text-[#1a1a1a] leading-tight line-clamp-2 group-hover:underline mt-0.5"
              dangerouslySetInnerHTML={{ __html: safeTitleHtml(a.title) }} />
            <p className="text-[11px] text-gray-400 mt-0.5">{a.time}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

/** Lista com linha do tempo. */
function TimelineZone({ items, color }: { items: ZoneArticle[]; color: string }) {
  return (
    <div className="relative pl-6 border-l-2" style={{ borderColor: color + "40" }}>
      {items.map((a, i) => (
        <Link key={a.id} href={`/artigo/${a.slug ?? a.id}`}
          className={`flex gap-3 items-start group relative ${i < items.length - 1 ? "mb-4" : ""}`}>
          <div className="absolute -left-[31px] w-3.5 h-3.5 rounded-full border-2 bg-white shrink-0 mt-1"
            style={{ borderColor: color }} />
          <div className="flex-1 min-w-0">
            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color }}>{a.chapeu} · {a.time}</span>
            <p className="text-[13.5px] font-semibold text-[#1a1a1a] leading-snug line-clamp-2 group-hover:underline mt-0.5"
              dangerouslySetInnerHTML={{ __html: safeTitleHtml(a.title) }} />
          </div>
          {a.image && (
            <img src={a.image} srcSet={buildSrcSet(a.image, THUMB_WIDTHS) || undefined} sizes="64px"
              alt={stripTags(a.title)} width={64} height={48} loading="lazy" decoding="async"
              className="w-16 h-12 object-cover rounded shrink-0" />
          )}
        </Link>
      ))}
    </div>
  );
}

/**
 * Bloco de conteúdo em zona main/half: cabeçalho de seção + corpo conforme o
 * layout escolhido no painel. Sem layout definido, main usa grade e meia
 * largura usa foto+lista (comportamento original).
 */
function ZoneContent({ block, articles, color, href, zone, preview }: {
  block: HomeBlock; articles: ZoneArticle[]; color: string; href?: string;
  zone: "main" | "half"; preview?: boolean;
}) {
  if (articles.length === 0) {
    return <BlockPlaceholder preview={preview} label={`Seção: ${block.name}`}
      hint="Nenhum artigo publicado na categoria configurada." />;
  }
  const narrow = zone === "half";
  const limit = block.itemsLimit;
  const layout = block.layout ?? (narrow ? "bigstory" : "grid");

  let body: React.ReactNode;
  switch (layout) {
    case "featured":
      body = narrow
        ? <FeaturedStack items={articles.slice(0, 4)} color={color} />
        : <FeaturedZone items={articles.slice(0, 5)} color={color} />;
      break;
    case "duplo":
      body = <DuploZone items={articles.slice(0, narrow ? 4 : 6)} color={color} narrow={narrow} />;
      break;
    case "cultura":
      body = <FotoListaBody block={block} articles={articles.slice(0, 4)} color={color} />;
      break;
    case "lista":
      body = <NumListZone items={articles.slice(0, limit ?? (narrow ? 5 : 6))} color={color} cols={narrow ? 1 : 2} />;
      break;
    case "manchete":
      body = <MancheteZone items={articles.slice(0, narrow ? 3 : 4)} color={color} narrow={narrow} />;
      break;
    case "mosaico":
      body = <MosaicZone items={articles.slice(0, narrow ? 3 : 5)} color={color} narrow={narrow} />;
      break;
    case "trio":
      body = <CardsGrid items={articles.slice(0, 3)} color={color} cols={3} narrow={narrow} />;
      break;
    case "compact":
      body = <CompactZone items={articles.slice(0, limit ?? (narrow ? 5 : 6))} color={color} cols={narrow ? 1 : 2} />;
      break;
    case "bigstory":
      body = narrow
        ? <FotoListaBody block={block} articles={articles.slice(0, 4)} color={color} />
        : <BigStoryZone items={articles.slice(0, 5)} color={color} />;
      break;
    case "timeline":
      body = <TimelineZone items={articles.slice(0, limit ?? (narrow ? 4 : 5))} color={color} />;
      break;
    case "overlay":
      body = <OverlayGrid items={articles.slice(0, limit ?? 4)} color={color} cols={narrow ? 2 : 4} />;
      break;
    case "magazine":
      body = <MagazineZone items={articles.slice(0, narrow ? 3 : 5)} color={color} narrow={narrow} />;
      break;
    case "grid":
    default:
      body = <CardsGrid items={articles.slice(0, limit ?? 4)} color={color} cols={narrow ? 2 : 4} />;
      break;
  }

  return (
    <section className="min-w-0">
      <ZoneSectionHeader title={block.name} color={color} href={href} linkLabel={block.linkLabel} />
      {body}
    </section>
  );
}

// ─── Sidebar (coluna de 320px) ────────────────────────────────────────────────

/** Sidebar: lista numerada com thumb (ex.: "Most Read"). */
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
                alt={stripTags(a.title)} width={64} height={48} loading="lazy" decoding="async"
                className="w-16 h-12 object-cover rounded shrink-0" />
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Sidebar: manchetes em bullets (ex.: "Latest Headlines"). */
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

/** Sidebar: cards empilhados (com ou sem overlay). */
function SidebarCards({ block, articles, color, preview, overlay = false }: {
  block: HomeBlock; articles: ZoneArticle[]; color: string; preview?: boolean; overlay?: boolean;
}) {
  const items = articles.slice(0, block.itemsLimit ?? 3);
  if (items.length === 0) {
    return <BlockPlaceholder preview={preview} label={`Seção: ${block.name}`}
      hint="Nenhum artigo publicado na categoria configurada." />;
  }
  return (
    <section className="border border-gray-200 rounded-lg p-4">
      <ZoneSectionHeader title={block.name} color={color} />
      <div className="flex flex-col gap-4">
        {items.map((a) => overlay
          ? <OverlayCard key={a.id} a={a} color={color} className="aspect-[16/9]" />
          : <CardItem key={a.id} a={a} color={color} ratio="aspect-[16/9]" titleCls="text-[13.5px]"
              sizes="288px" summary={false} />)}
      </div>
    </section>
  );
}

/** Sidebar: 1 card em destaque + lista de manchetes. */
function SidebarFeatured({ block, articles, color, preview }: {
  block: HomeBlock; articles: ZoneArticle[]; color: string; preview?: boolean;
}) {
  const [main, ...rest] = articles;
  if (!main) {
    return <BlockPlaceholder preview={preview} label={`Seção: ${block.name}`}
      hint="Nenhum artigo publicado na categoria configurada." />;
  }
  return (
    <section className="border border-gray-200 rounded-lg p-4">
      <ZoneSectionHeader title={block.name} color={color} />
      <CardItem a={main} color={color} ratio="aspect-[16/10]" titleCls="text-[14px]" sizes="288px" summary={false} />
      {rest.length > 0 && (
        <div className="flex flex-col mt-3 pt-2 border-t border-gray-100">
          {rest.slice(0, 3).map((a) => <ThumbRow key={a.id} a={a} small />)}
        </div>
      )}
    </section>
  );
}

/** Sidebar: lista compacta com thumbs. */
function SidebarCompact({ block, articles, color, preview }: {
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
        {items.map((a) => <ThumbRow key={a.id} a={a} chapeu color={color} small />)}
      </div>
    </section>
  );
}

/** Bloco de conteúdo na sidebar: respeita o layout onde faz sentido em 320px. */
function SidebarContent({ block, articles, color, preview }: {
  block: HomeBlock; articles: ZoneArticle[]; color: string; preview?: boolean;
}) {
  if (block.source === "most_read") {
    return <SidebarMostRead block={block} articles={articles} color={color} preview={preview} />;
  }
  switch (block.layout) {
    case "grid":
    case "trio":
    case "duplo":
      return <SidebarCards block={block} articles={articles} color={color} preview={preview} />;
    case "overlay":
      return <SidebarCards block={block} articles={articles} color={color} preview={preview} overlay />;
    case "featured":
    case "bigstory":
    case "cultura":
    case "mosaico":
    case "manchete":
    case "magazine":
      return <SidebarFeatured block={block} articles={articles} color={color} preview={preview} />;
    case "compact":
      return <SidebarCompact block={block} articles={articles} color={color} preview={preview} />;
    default:
      return <SidebarHeadlines block={block} articles={articles} color={color} preview={preview} />;
  }
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
      return <SidebarMostRead block={block} articles={sortByViews(getArticles(""))} color={color} preview={preview} />;
    }
    return <>{fallback}</>;
  }

  const type = inferBlockType(block);
  const bySource = block.source === "latest" || block.source === "most_read"
    ? getArticles("")
    : getArticles(cat);
  let byCategory = block.source === "most_read" ? sortByViews(bySource) : bySource;
  // Preview do admin: categoria ainda sem notícias exibe amostra "EXEMPLO"
  // para dar noção do layout. No site público o bloco continua não renderizando.
  if (preview && byCategory.length === 0) {
    byCategory = sampleForPreview(getArticles(""), block.id, 8);
  }

  switch (type) {
    case "ticker":
      return <TickerBlock block={block} articles={byCategory} preview={preview} contained={false} />;
    case "html":
      return <HtmlBlock block={block} preview={preview} contained={false} />;
    case "advertising": {
      const slot = AD_SLOTS.includes(block.adSlot ?? "") ? (block.adSlot as AdSlotKey) : "slot_05";
      return <div className="py-1"><AdBanner slot={slot} /></div>;
    }
    case "list": {
      if (zone === "sidebar") {
        return <SidebarHeadlines block={block} articles={byCategory} color={color} preview={preview} />;
      }
      const items = byCategory.slice(0, block.itemsLimit ?? (zone === "half" ? 5 : 6));
      if (items.length === 0) {
        return <BlockPlaceholder preview={preview} label={`Lista: ${block.name}`}
          hint="Nenhum artigo encontrado para a fonte configurada." />;
      }
      return (
        <section className="min-w-0">
          <ZoneSectionHeader title={block.name} color={color} href={href} linkLabel={block.linkLabel} />
          <NumListZone items={items} color={color} cols={zone === "half" ? 1 : 2} />
        </section>
      );
    }
    case "content":
      if (zone === "sidebar") {
        return <SidebarContent block={block} articles={byCategory} color={color} preview={preview} />;
      }
      return <ZoneContent block={block} articles={byCategory} color={color} href={href}
        zone={zone} preview={preview} />;
    default:
      return <>{fallback}</>;
  }
}
