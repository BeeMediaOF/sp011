import React, { lazy, Suspense } from "react";
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
import AdSlotBand from "../components/ads/AdSlotBand";
import { useArticles } from "../hooks/useArticles";

import { Link } from "wouter";
import { useSite, type HomeBlock } from "../hooks/useSite";
import { useT, formatDayMonth } from "../lib/i18n";
import {
  buildSrcSet, coverSrcSet, aspectClass, CARD_WIDTHS, THUMB_WIDTHS, COVER_WIDTHS, COVER_Q,
  type CoverAspect,
} from "@/lib/newsImage";
import { inferBlockType, segmentBlocks, sampleForPreview, safeLinkUrl, categoryHref, type SegmentEntry } from "../lib/homeBlocks";
import { blogCategorySurface } from "../lib/categoryRoutes";
import { sanitizeArticleHtml, safeTitleHtml } from "../lib/sanitize";
import {
  BlockPlaceholder, ImageBlock, CarouselBlock, VideoEmbedBlock, HtmlBlock,
  EmbedBlock, TickerBlock, NewsletterBlock, CategoriesBlock, SocialLinksBlock,
  QuotesBlock, SeparatorBlock, AdSlotBlock, BlockFontScope, SearchBlock, SearchForm,
  YoutubePlaylistBlock, TransfersBlock,
} from "../components/blocks/HomeCustomBlocks";
import { ZoneBlock, ZoneSectionHeader, MiniCardsGrid } from "../components/blocks/PortalZoneBlocks";

/* Lazy: ColumnistsSection não é crítico para LCP — carregado sob demanda */
const ColumnistsSection = lazy(() => import("../components/ColumnistsSection"));

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
  views?: number;
  /** Tempo de leitura em minutos (api novo; ausente em payload antigo). */
  readingMinutes?: number;
};

/** Ordena por leituras reais (blocos "Mais lidas"); empate mantém a ordem original. */
function sortByViews(list: SectionArticle[]): SectionArticle[] {
  return [...list].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
}

/* Havia aqui um `useArticlesByCategory` — uma segunda cópia, sem uso desde a
   migração para os blocos, do mesmo mapeamento que o `getArticles` do Home faz.
   Removido junto com a otimização do PRD-PERF-07 para não sobrar uma versão
   lenta esperando para ser reintroduzida por engano. */

// ─── Extra layout components ──────────────────────────────────────────────────
/** Props comuns dos layouts de seção do fluxo clássico.
 *  `hideHeader` é o "modo hero" do bloco: esconde título e "Ver mais" sem mexer
 *  no resto do layout (o `name` do bloco continua identificando-o no painel). */
interface SectionLayoutProps {
  title: string; color: string; href?: string; articles: SectionArticle[];
  hideHeader?: boolean;
}

function SectionBlockTrio({ title, color, href, articles, hideHeader }: SectionLayoutProps) {
  const { t } = useT();
  const items = articles.slice(0, 3);
  if (items.length === 0) return null;
  return (
    <section className="border-t border-gray-200 py-8">
      <div className="max-w-[1280px] mx-auto px-4">
        {!hideHeader && (
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-1 h-5" style={{ backgroundColor: color }} />
            <h2 className="text-[17px] font-bold text-[#1a1a1a] uppercase tracking-wider">{title}</h2>
          </div>
          {href && <Link href={href} className="text-xs font-semibold uppercase tracking-wider hover:underline" style={{ color }}>{t("common.seeMore")}</Link>}
        </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {items.map((a) => (
            <Link key={a.id} href={`/artigo/${a.slug ?? a.id}`} className="group flex flex-col">
              {a.image && <img src={a.image} srcSet={buildSrcSet(a.image, CARD_WIDTHS) || undefined} sizes="(max-width: 768px) 100vw, 33vw" alt={a.title} width={480} height={360} loading="lazy" decoding="async" className="w-full aspect-[4/3] object-cover rounded-lg mb-3 group-hover:brightness-95 transition-all" />}
              <span className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color }}>{a.chapeu}</span>
              <p className="text-[15px] font-bold text-[#1a1a1a] leading-snug group-hover:underline">{a.title}</p>
              <p className="text-[12px] text-gray-400 mt-1">{a.time}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function SectionBlockCompact({ title, color, href, articles, hideHeader }: SectionLayoutProps) {
  const { t } = useT();
  const items = articles.slice(0, 6);
  if (items.length === 0) return null;
  return (
    <section className="border-t border-gray-200 py-6">
      <div className="max-w-[1280px] mx-auto px-4">
        {!hideHeader && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-1 h-5" style={{ backgroundColor: color }} />
            <h2 className="text-[17px] font-bold text-[#1a1a1a] uppercase tracking-wider">{title}</h2>
          </div>
          {href && <Link href={href} className="text-xs font-semibold uppercase tracking-wider hover:underline" style={{ color }}>{t("common.seeMore")}</Link>}
        </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-3">
          {items.map((a) => (
            <Link key={a.id} href={`/artigo/${a.slug ?? a.id}`} className="flex gap-3 items-start group border-b border-gray-100 pb-3 last:border-0">
              {a.image && <img src={a.image} srcSet={buildSrcSet(a.image, THUMB_WIDTHS) || undefined} sizes="64px" alt={a.title} width={64} height={48} loading="lazy" decoding="async" className="w-16 h-12 object-cover rounded shrink-0" />}
              <div className="min-w-0">
                <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color }}>{a.chapeu}</span>
                <p className="text-[13px] font-semibold text-[#1a1a1a] leading-tight group-hover:underline line-clamp-2 mt-0.5">{a.title}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{a.time}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function SectionBlockBigStory({ title, color, href, articles, hideHeader }: SectionLayoutProps) {
  const { t } = useT();
  const [main, ...rest] = articles;
  if (!main) return null;
  return (
    <section className="border-t border-gray-200 py-8">
      <div className="max-w-[1280px] mx-auto px-4">
        {!hideHeader && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-1 h-5" style={{ backgroundColor: color }} />
            <h2 className="text-[17px] font-bold text-[#1a1a1a] uppercase tracking-wider">{title}</h2>
          </div>
          {href && <Link href={href} className="text-xs font-semibold uppercase tracking-wider hover:underline" style={{ color }}>{t("common.seeMore")}</Link>}
        </div>
        )}
        <div className="flex flex-col lg:flex-row gap-6">
          <Link href={`/artigo/${main.slug ?? main.id}`} className="flex-[3] relative group overflow-hidden rounded-xl">
            <div className="relative w-full aspect-[16/7] overflow-hidden rounded-xl">
              {main.image && <img src={main.image} srcSet={buildSrcSet(main.image, CARD_WIDTHS) || undefined} sizes="(max-width: 1024px) 100vw, 66vw" alt={main.title} width={900} height={394} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent rounded-xl" />
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <span className="inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded mb-2 text-white" style={{ backgroundColor: color }}>{main.chapeu}</span>
                <h3 className="text-2xl font-black text-white leading-tight">{main.title}</h3>
                {main.summary && <p className="text-[13px] text-white/80 mt-2 line-clamp-2">{main.summary}</p>}
              </div>
            </div>
          </Link>
          {rest.length > 0 && (
            <div className="flex-1 flex flex-col gap-3 justify-center">
              {rest.slice(0, 4).map((a) => (
                <Link key={a.id} href={`/artigo/${a.slug ?? a.id}`} className="flex gap-3 items-start group border-b border-gray-100 pb-3 last:border-0">
                  {a.image && <img src={a.image} srcSet={buildSrcSet(a.image, THUMB_WIDTHS) || undefined} sizes="80px" alt={a.title} width={80} height={56} loading="lazy" decoding="async" className="w-20 h-14 object-cover rounded shrink-0" />}
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color }}>{a.chapeu}</span>
                    <p className="text-[13px] font-semibold text-[#1a1a1a] leading-tight group-hover:underline line-clamp-2 mt-0.5">{a.title}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{a.time}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function SectionBlockTimeline({ title, color, href, articles, hideHeader }: SectionLayoutProps) {
  const { t } = useT();
  const items = articles.slice(0, 6);
  if (items.length === 0) return null;
  return (
    <section className="border-t border-gray-200 py-8">
      <div className="max-w-[1280px] mx-auto px-4">
        {!hideHeader && (
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-1 h-5" style={{ backgroundColor: color }} />
            <h2 className="text-[17px] font-bold text-[#1a1a1a] uppercase tracking-wider">{title}</h2>
          </div>
          {href && <Link href={href} className="text-xs font-semibold uppercase tracking-wider hover:underline" style={{ color }}>{t("common.seeMore")}</Link>}
        </div>
        )}
        <div className="relative pl-6 border-l-2" style={{ borderColor: color + "40" }}>
          {items.map((a, i) => (
            <Link key={a.id} href={`/artigo/${a.slug ?? a.id}`} className={`flex gap-4 items-start group relative ${i < items.length - 1 ? "mb-5" : ""}`}>
              <div className="absolute -left-[25px] w-3.5 h-3.5 rounded-full border-2 bg-white shrink-0 mt-1" style={{ borderColor: color }} />
              <div className="flex-1 min-w-0">
                <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color }}>{a.chapeu} · {a.time}</span>
                <p className="text-[14px] font-semibold text-[#1a1a1a] leading-snug group-hover:underline mt-0.5">{a.title}</p>
              </div>
              {a.image && <img src={a.image} srcSet={buildSrcSet(a.image, THUMB_WIDTHS) || undefined} sizes="80px" alt={a.title} width={80} height={56} loading="lazy" decoding="async" className="w-20 h-14 object-cover rounded shrink-0" />}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function SectionHeaderClassic({ title, color, href, hideHeader }: {
  title: string; color: string; href?: string; hideHeader?: boolean;
}) {
  const { t } = useT();
  if (hideHeader) return null;
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <div className="w-1 h-5" style={{ backgroundColor: color }} />
        <h2 className="text-[17px] font-bold text-[#1a1a1a] uppercase tracking-wider">{title}</h2>
      </div>
      {href && <Link href={href} className="text-xs font-semibold uppercase tracking-wider hover:underline" style={{ color }}>{t("common.seeMore")}</Link>}
    </div>
  );
}

/**
 * Card com título sobre a imagem (usado por overlay/mosaico/magazine).
 *
 * `sizes` é OBRIGATÓRIO nos chamadores com caixa recortada: aqui a foto é
 * posicionada em absoluto com `object-cover`, então quem manda no tamanho de
 * origem é o maior entre a largura da caixa e `altura x proporção da foto` —
 * ver o comentário de COVER_WIDTHS em lib/newsImage.
 */
function OverlayCardClassic({ a, color, big = false, className = "", sizes, widths = COVER_WIDTHS, aspect }: {
  a: SectionArticle; color: string; big?: boolean; className?: string;
  sizes?: string; widths?: number[]; aspect?: CoverAspect;
}) {
  // Com `aspect` (proporção fixa em TODO breakpoint) o servidor entrega a foto
  // já recortada e o `sizes` é a largura CSS da caixa. Sem ele — caixa que muda
  // de proporção no md, como o mosaico e a faixa revista — segue o caminho por
  // largura, com o `sizes` corrigido pela altura.
  const srcSet = a.image
    ? (aspect ? coverSrcSet(a.image, aspect) : buildSrcSet(a.image, widths, COVER_Q)) || undefined
    : undefined;
  return (
    <Link href={`/artigo/${a.slug ?? a.id}`}
      className={`group relative block overflow-hidden rounded-lg bg-gray-200 ${aspect ? `${aspectClass(aspect)} ` : ""}${className}`}>
      {a.image && (
        <img src={a.image} srcSet={srcSet}
          sizes={sizes ?? (big ? "(max-width: 1024px) 100vw, 640px" : "(max-width: 1024px) 50vw, 320px")}
          alt={a.title} width={640} height={400} loading="lazy" decoding="async"
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
      <div className={`absolute bottom-0 left-0 right-0 ${big ? "p-5" : "p-3"}`}>
        <span className="inline-block text-[9px] font-bold uppercase tracking-wider text-white px-1.5 py-0.5 mb-1.5"
          style={{ backgroundColor: color }}>{a.chapeu}</span>
        <p className={`${big ? "text-[22px] leading-tight line-clamp-3" : "text-[14px] leading-snug line-clamp-2"} font-black text-white`}>{a.title}</p>
      </div>
    </Link>
  );
}

function SectionBlockMosaico({ title, color, href, articles, hideHeader }: SectionLayoutProps) {
  const [big, ...tiles] = articles.slice(0, 5);
  if (!big) return null;
  return (
    <section className="border-t border-gray-200 py-8">
      <div className="max-w-[1280px] mx-auto px-4">
        <SectionHeaderClassic title={title} color={color} href={href} hideHeader={hideHeader} />
        {/* Altura travada em md+; a linha implícita precisa de minmax(0,1fr)
            para imagens verticais não estourarem o bloco. */}
        {/* Alturas travadas em md+ (420px o grande, 204px cada tile): o recorte
            precisa de ~1,6x a altura em largura de origem, não da largura da caixa. */}
        <div className="grid grid-cols-1 md:grid-cols-2 md:grid-rows-[minmax(0,1fr)] gap-3 md:h-[420px]">
          <OverlayCardClassic a={big} color={color} big className="aspect-[16/10] md:aspect-auto md:h-full min-h-0"
            sizes="(max-width: 768px) 100vw, 700px" />
          <div className="grid grid-cols-2 grid-rows-2 gap-3 min-h-0">
            {tiles.slice(0, 4).map((a) => (
              <OverlayCardClassic key={a.id} a={a} color={color} className="aspect-[16/10] md:aspect-auto md:h-full min-h-0"
                sizes="(max-width: 768px) 50vw, 340px" />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SectionBlockOverlay({ title, color, href, articles, hideHeader }: SectionLayoutProps) {
  const items = articles.slice(0, 4);
  if (items.length === 0) return null;
  return (
    <section className="border-t border-gray-200 py-8">
      <div className="max-w-[1280px] mx-auto px-4">
        <SectionHeaderClassic title={title} color={color} href={href} hideHeader={hideHeader} />
        {/* Card RETRATO ~296x395: o servidor entrega já em 3:4, então o sizes
            volta a ser a largura da caixa (era 640 para cobrir a altura). */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {items.map((a) => (
            <OverlayCardClassic key={a.id} a={a} color={color} aspect="3/4"
              sizes="(max-width: 768px) 50vw, 296px" />
          ))}
        </div>
      </div>
    </section>
  );
}

function SectionBlockMagazine({ title, color, href, articles, hideHeader }: SectionLayoutProps) {
  const [main, ...rest] = articles;
  if (!main) return null;
  const grid = rest.slice(0, 4);
  return (
    <section className="border-t border-gray-200 py-8">
      <div className="max-w-[1280px] mx-auto px-4">
        <SectionHeaderClassic title={title} color={color} href={href} hideHeader={hideHeader} />
        {/* Faixa panorâmica: ocupa os 1248px do container — pedir 640 entregava
            metade da resolução necessária. */}
        <OverlayCardClassic a={main} color={color} big className="aspect-[16/9] md:aspect-[16/6]"
          sizes="(max-width: 1280px) 100vw, 1248px" />
        {grid.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
            {grid.map((a) => (
              <Link key={a.id} href={`/artigo/${a.slug ?? a.id}`} className="group flex flex-col min-w-0">
                {a.image && (
                  <img src={a.image} srcSet={buildSrcSet(a.image, CARD_WIDTHS) || undefined}
                    sizes="(max-width: 768px) 50vw, 25vw" alt={a.title} width={460} height={307}
                    loading="lazy" decoding="async"
                    className="w-full aspect-[3/2] object-cover rounded-lg mb-2 group-hover:brightness-95 transition-all" />
                )}
                <span className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color }}>{a.chapeu}</span>
                <p className="text-[14px] font-bold text-[#1a1a1a] leading-snug line-clamp-2 group-hover:underline">{a.title}</p>
                <p className="text-[11px] text-gray-400 mt-1">{a.time}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Layouts "revista" (mock dos portais B2B: PontoFarma/Crédito.vc) ─────────
/** Faixa de mini cards em largura total (título grande + "Ver todos" colorido).
 *  Recebe o bloco inteiro (≠ dos SectionBlock* clássicos): usa itemsLimit,
 *  linkLabel e linkUrl. Fontes latest/most_read não têm página de categoria —
 *  o "Ver todos" vem de linkUrl (ex.: /arquivo). format "destaque" (mock
 *  "Escolha do Editor" do Crédito.vc): 1º item vira card grande com título
 *  sobre a foto e os demais seguem como mini cards ao lado. */
function SectionBlockMini({ block, color, articles }: {
  block: HomeBlock; color: string; articles: SectionArticle[];
}) {
  const { t } = useT();
  const href = block.source !== "latest" && block.source !== "most_read" && block.category
    ? `/${block.category}` : safeLinkUrl(block.linkUrl) ?? undefined;
  const items = articles.slice(0, block.itemsLimit ?? 5);
  if (items.length === 0) return null;
  const destaque = block.format === "destaque" && items.length >= 2;
  const hideHeader = block.hideHeader === true;
  return (
    <section className="max-w-[1280px] mx-auto px-4 py-6">
      <ZoneSectionHeader variant="revista" title={hideHeader ? "" : block.name} color={color}
        href={hideHeader ? undefined : href} linkLabel={block.linkLabel} />
      {destaque ? (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] gap-5 items-stretch">
          <HeroOverlayCard a={items[0]} color={color} big eager={false}
            minRead={t("common.minRead")}
            className="aspect-[16/10] lg:aspect-auto lg:h-full lg:min-h-[320px]" />
          <MiniCardsGrid items={items.slice(1)} color={color}
            cols={Math.min(5, Math.max(3, items.length - 1)) as 3 | 4 | 5} />
        </div>
      ) : (
        <MiniCardsGrid items={items} color={color}
          cols={Math.min(5, Math.max(3, block.itemsLimit ?? 4)) as 3 | 4 | 5} />
      )}
    </section>
  );
}

/** Card com título sobre a foto do hero revista (destaque grande e laterais).
 *  eager=false para uso abaixo da dobra (ex.: destaque da Escolha do Editor). */
function HeroOverlayCard({ a, color, big = false, minRead, className = "", eager = true }: {
  a: SectionArticle; color: string; big?: boolean; minRead: string; className?: string; eager?: boolean;
}) {
  const meta = [
    a.readingMinutes ? `${a.readingMinutes} ${minRead}` : "",
    a.time,
  ].filter(Boolean).join(" · ");
  return (
    <Link href={`/artigo/${a.slug ?? a.id}`}
      className={`group relative block overflow-hidden rounded-2xl bg-gray-200 ${className}`}>
      {a.image && (
        // Caixa de recorte (h-full/min-h): larguras COVER para o degrau de 1280
        // das telas 2x — o CARD_WIDTHS parava em 960 e serrilhava o destaque.
        <img src={a.image} srcSet={buildSrcSet(a.image, COVER_WIDTHS, COVER_Q) || undefined}
          sizes={big ? "(max-width: 1024px) 100vw, 640px" : "(max-width: 1024px) 100vw, 300px"}
          alt={a.title} width={640} height={400} loading={eager ? "eager" : "lazy"} decoding="async"
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
      <div className={`absolute bottom-0 left-0 right-0 ${big ? "p-5" : "p-4"}`}>
        <span className="inline-block text-[9px] font-bold uppercase tracking-wider text-white px-2 py-0.5 rounded-full mb-1.5"
          style={{ backgroundColor: color }}>{a.chapeu}</span>
        <p className={`${big ? "text-[22px] md:text-[24px] leading-tight line-clamp-3" : "text-[14px] leading-snug line-clamp-2"} font-black text-white`}
          dangerouslySetInnerHTML={{ __html: safeTitleHtml(a.title) }} />
        {big && a.summary && (
          <p className="text-[13px] text-white/80 leading-snug line-clamp-2 mt-1.5">{a.summary}</p>
        )}
        {meta && <p className={`${big ? "text-[12px]" : "text-[11px]"} text-white/70 mt-1.5`}>{meta}</p>}
      </div>
    </Link>
  );
}

/** Hero "revista" de 3 colunas (mock): boas-vindas (html do bloco) + busca à
 *  esquerda, destaque grande no centro e 2 cards menores à direita. linkLabel/
 *  linkUrl viram a nota sob a busca (âncora "#<id>" rola até o bloco — ex.:
 *  newsletter no fim da home). */
function SectionBlockHero({ block, color, articles }: {
  block: HomeBlock; color: string; articles: SectionArticle[];
}) {
  const { t } = useT();
  const { settings } = useSite();
  const [main, ...side] = articles.slice(0, block.itemsLimit ?? 3);
  const html = sanitizeArticleHtml(block.html);
  const note = (block.linkLabel ?? "").trim();
  const noteHref = (block.linkUrl ?? "").trim();
  const minRead = t("common.minRead");

  function noteClick(e: React.MouseEvent) {
    if (!noteHref.startsWith("#")) return;
    e.preventDefault();
    document.getElementById(noteHref.slice(1))?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (!main) return null;
  const mainMeta = [
    settings?.siteName ?? "",
    main.readingMinutes ? `${main.readingMinutes} ${minRead}` : "",
    main.time,
  ].filter(Boolean).join(" · ");

  return (
    <section className="max-w-[1280px] mx-auto px-4 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)_300px] gap-5 items-stretch">
        <div className="flex flex-col justify-center min-w-0 lg:pr-2">
          {html && <div className="mb-5" dangerouslySetInnerHTML={{ __html: html }} />}
          <SearchForm placeholder={(block.caption ?? "").trim() || undefined} color={color} />
          {note && (
            noteHref.startsWith("#")
              ? <a href={noteHref} onClick={noteClick} className="block text-[13px] text-gray-500 mt-3 hover:underline">{note}</a>
              : <p className="text-[13px] text-gray-500 mt-3">{note}</p>
          )}
        </div>
        <div className="min-w-0">
          <Link href={`/artigo/${main.slug ?? main.id}`}
            className="group relative block overflow-hidden rounded-2xl bg-gray-200 aspect-[16/10] lg:aspect-auto lg:h-full lg:min-h-[400px]">
            {main.image && (
              // Destaque do hero: caixa de recorte de ~568x400 → precisa de 640
              // de origem (400 x 1,6), e do degrau 1280 nas telas 2x.
              <img src={main.image} srcSet={buildSrcSet(main.image, COVER_WIDTHS, COVER_Q) || undefined}
                sizes="(max-width: 1024px) 100vw, 640px" alt={main.title}
                width={640} height={400} loading="eager" fetchPriority="high" decoding="sync"
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-5">
              <span className="inline-block text-[9px] font-bold uppercase tracking-wider text-white px-2 py-0.5 rounded-full mb-1.5"
                style={{ backgroundColor: color }}>{main.chapeu}</span>
              <p className="text-[22px] md:text-[24px] font-black text-white leading-tight line-clamp-3"
                dangerouslySetInnerHTML={{ __html: safeTitleHtml(main.title) }} />
              {main.summary && (
                <p className="text-[13px] text-white/80 leading-snug line-clamp-2 mt-1.5">{main.summary}</p>
              )}
              {mainMeta && <p className="text-[12px] text-white/70 mt-1.5">{mainMeta}</p>}
            </div>
          </Link>
        </div>
        {side.length > 0 && (
          <div className="flex flex-row lg:flex-col gap-5 min-w-0">
            {side.slice(0, 2).map((a) => (
              <HeroOverlayCard key={a.id} a={a} color={color} minRead={minRead}
                className="flex-1 aspect-[16/10] lg:aspect-auto lg:min-h-0" />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Custom block renderer ────────────────────────────────────────────────────
function CustomBlock({ block, getArticles, preview }: {
  block: HomeBlock;
  getArticles: (cat: string) => SectionArticle[];
  preview?: boolean;
}) {
  const { settings } = useSite();
  const type = inferBlockType(block);
  const cat = block.category ?? "geral";
  const color = block.color ?? EDITORIA_COLORS[cat] ?? "#6b7280";
  /* "Ver mais" só existe se o destino existir NESTE blog: a categoria do bloco
     é validada contra a superfície de editorias, não contra a presença do
     campo. `undefined` faz o link sumir do cabeçalho da seção. */
  const surface = React.useMemo(
    () => blogCategorySurface(settings?.menuItems, settings?.categories),
    [settings?.menuItems, settings?.categories],
  );
  const href = categoryHref(block.category, surface);

  // Fonte dos artigos (carrossel/ticker/lista/conteúdo): por categoria ou geral.
  // getArticles("") devolve todos (mais recentes primeiro); "most_read" reordena
  // por leituras reais registradas pelo analytics.
  const bySource = block.source === "latest" || block.source === "most_read"
    ? getArticles("")
    : getArticles(cat);
  let byCategory = block.source === "most_read" ? sortByViews(bySource) : bySource;
  // Preview do admin: categoria ainda sem notícias exibe uma amostra aleatória
  // (chapéu "EXEMPLO") para dar noção do layout. No site público continua null.
  if (preview && byCategory.length === 0) {
    byCategory = sampleForPreview(getArticles(""), block.id, 8);
  }
  // itemsLimit só vale para lista/carrossel/ticker (e para os layouts revista
  // "mini"/"hero", que fatiam por conta própria) — os demais layouts editoriais
  // (featured, duplo, mosaico…) definem as próprias contagens.
  const limited = block.itemsLimit ? byCategory.slice(0, block.itemsLimit) : byCategory;
  // "Modo hero": some o cabeçalho de seção (título + "Ver mais") deste bloco.
  const hd = block.hideHeader === true;

  // ── Tipos não-editoriais: cada bloco renderiza o SEU conteúdo ──
  switch (type) {
    case "image":       return <ImageBlock block={block} preview={preview} />;
    case "video":       return <VideoEmbedBlock block={block} preview={preview} />;
    case "playlist":    return <YoutubePlaylistBlock block={block} preview={preview} />;
    case "transfers":   return <TransfersBlock block={block} preview={preview} />;
    case "carousel":    return <CarouselBlock block={block} articles={byCategory} preview={preview} />;
    case "ticker":      return <TickerBlock block={block} articles={byCategory} preview={preview} />;
    case "advertising": return <AdSlotBlock block={block} preview={preview} />;
    case "newsletter":  return <NewsletterBlock block={block} />;
    case "search":      return <SearchBlock block={block} />;
    case "categories":  return <CategoriesBlock block={block} preview={preview} />;
    case "social":      return <SocialLinksBlock block={block} preview={preview} />;
    case "quotes":      return <QuotesBlock />;
    case "html":        return <HtmlBlock block={block} preview={preview} />;
    case "embed":       return <EmbedBlock block={block} preview={preview} />;
    case "map":         return <EmbedBlock block={block} preview={preview} map />;
    case "sep":         return <SeparatorBlock block={block} />;
    case "list":
      return limited.length > 0
        ? <SectionBlockLista title={block.name} color={color} href={href} articles={limited} hideHeader={hd} />
        : <BlockPlaceholder preview={preview} label={`Lista: ${block.name}`}
            hint="Nenhum artigo encontrado para a categoria configurada." />;
    case "weather":
    case "table":
    case "counter":
      // Tipos ainda sem renderizador dedicado — nunca mostrar conteúdo errado.
      return <BlockPlaceholder preview={preview} label={block.name}
        hint="Este tipo de bloco ainda não possui visual no site (em desenvolvimento)." />;
  }

  // ── Conteúdo editorial (layouts de artigos) ──
  const articles = byCategory;
  if (articles.length === 0) {
    return <BlockPlaceholder preview={preview} label={`Seção: ${block.name}`}
      hint="Nenhum artigo publicado na categoria configurada." />;
  }

  switch (block.layout) {
    case "featured":
      return <SectionBlockFeatured title={block.name} color={color} href={href} articles={articles} hideHeader={hd} />;
    case "duplo":
      return <SectionBlockDuploDestaque title={block.name} color={color} href={href} articles={articles} hideHeader={hd} />;
    case "cultura":
      return <SectionBlockCulturaLayout title={block.name} color={color} href={href} articles={articles} reverse={block.reverse} hideHeader={hd} />;
    case "lista":
      return <SectionBlockLista title={block.name} color={color} href={href} articles={articles} hideHeader={hd} />;
    case "manchete":
      return <SectionBlockManchete title={block.name} color={color} href={href} articles={articles} hideHeader={hd} />;
    case "mosaico":
      return <SectionBlockMosaico title={block.name} color={color} href={href} articles={articles} hideHeader={hd} />;
    case "overlay":
      return <SectionBlockOverlay title={block.name} color={color} href={href} articles={articles} hideHeader={hd} />;
    case "magazine":
      return <SectionBlockMagazine title={block.name} color={color} href={href} articles={articles} hideHeader={hd} />;
    case "trio":
      return <SectionBlockTrio title={block.name} color={color} href={href} articles={articles} hideHeader={hd} />;
    case "compact":
      return <SectionBlockCompact title={block.name} color={color} href={href} articles={articles} hideHeader={hd} />;
    case "bigstory":
      return <SectionBlockBigStory title={block.name} color={color} href={href} articles={articles} hideHeader={hd} />;
    case "timeline":
      return <SectionBlockTimeline title={block.name} color={color} href={href} articles={articles} hideHeader={hd} />;
    case "mini":
      return <SectionBlockMini block={block} color={color} articles={articles} />;
    case "hero":
      return <SectionBlockHero block={block} color={color} articles={articles} />;
    case "grid":
    default:
      return <SectionBlock title={block.name} color={color} href={href} articles={articles} pageSize={4} hideHeader={hd} />;
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
function ConfigurableBlock({ block, getArticles, preview }: {
  block: HomeBlock;
  getArticles: (cat: string) => SectionArticle[];
  preview?: boolean;
}) {
  const { settings } = useSite();
  const defaults = PREDEFINED_DEFAULTS[block.id];

  const cat    = block.category ?? defaults?.category ?? "geral";
  const color  = block.color    ?? defaults?.color    ?? "#6b7280";
  const layout = block.layout   ?? defaults?.layout   ?? "grid";
  /* Mesma validação do CustomBlock: destino conferido contra a superfície. */
  const surface = React.useMemo(
    () => blogCategorySurface(settings?.menuItems, settings?.categories),
    [settings?.menuItems, settings?.categories],
  );
  const href   = categoryHref(block.category ?? defaults?.category, surface);
  const title  = block.name;
  const hd     = block.hideHeader === true;
  let articles = getArticles(cat);

  // Preview do admin: categoria vazia mostra amostra "EXEMPLO" (público: null).
  if (preview && articles.length === 0) {
    articles = sampleForPreview(getArticles(""), block.id, 8);
  }
  if (articles.length === 0) return null;

  switch (layout) {
    case "featured":
      return <SectionBlockFeatured title={title} color={color} href={href} articles={articles} hideHeader={hd} />;
    case "duplo":
      return <SectionBlockDuploDestaque title={title} color={color} href={href} articles={articles} hideHeader={hd} />;
    case "cultura":
      return <SectionBlockCulturaLayout title={title} color={color} href={href} articles={articles} reverse={block.reverse ?? defaults?.reverse} hideHeader={hd} />;
    case "lista":
      return <SectionBlockLista title={title} color={color} href={href} articles={articles} hideHeader={hd} />;
    case "manchete":
      return <SectionBlockManchete title={title} color={color} href={href} articles={articles} hideHeader={hd} />;
    case "mosaico":
      return <SectionBlockMosaico title={title} color={color} href={href} articles={articles} hideHeader={hd} />;
    case "overlay":
      return <SectionBlockOverlay title={title} color={color} href={href} articles={articles} hideHeader={hd} />;
    case "magazine":
      return <SectionBlockMagazine title={title} color={color} href={href} articles={articles} hideHeader={hd} />;
    case "trio":
      return <SectionBlockTrio title={title} color={color} href={href} articles={articles} hideHeader={hd} />;
    case "compact":
      return <SectionBlockCompact title={title} color={color} href={href} articles={articles} hideHeader={hd} />;
    case "bigstory":
      return <SectionBlockBigStory title={title} color={color} href={href} articles={articles} hideHeader={hd} />;
    case "timeline":
      return <SectionBlockTimeline title={title} color={color} href={href} articles={articles} hideHeader={hd} />;
    case "mini":
      return <SectionBlockMini block={block} color={color} articles={articles} />;
    case "hero":
      return <SectionBlockHero block={block} color={color} articles={articles} />;
    case "grid":
    default:
      return <SectionBlock title={title} color={color} href={href} articles={articles} pageSize={4} hideHeader={hd} />;
  }
}

// ─── Predefined block renderer ────────────────────────────────────────────────
function PredefinedBlock({ block, getArticles, preview }: {
  block: HomeBlock;
  getArticles: (cat: string) => SectionArticle[];
  preview?: boolean;
}) {
  // Special fixed blocks (no category makes sense)
  if (block.id === "hero")       return <HeroSection variant={block.layout} />;
  if (block.id === "mais-lidas") return <MostRead />;
  if (block.id === "colunistas") return <Suspense fallback={null}><ColumnistsSection limit={4} /></Suspense>;
  if (block.id === "ultimas")    return <DestaquesListaBadge />;

  // All other predefined blocks are fully configurable
  if (PREDEFINED_DEFAULTS[block.id]) {
    return <ConfigurableBlock block={block} getArticles={getArticles} preview={preview} />;
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
  const { t, lang, tz } = useT();

  const isAdminPreview = typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("adminPreview") === "1";

  const baseBlocks: HomeBlock[] = (settings?.homeBlocks && settings.homeBlocks.length > 0)
    ? [...settings.homeBlocks].sort((a, b) => a.order - b.order)
    : DEFAULT_BLOCKS;

  const [previewBlocks, setPreviewBlocks] = React.useState<HomeBlock[]>([]);
  // Quando true, o preview passa a ser controlado AO VIVO pelo painel admin
  // (via postMessage). A partir daí, refetch de /api/site não sobrescreve mais os
  // blocos — evita o "preview um passo atrás" quando o servidor responde atrasado.
  const previewLiveRef = React.useRef(false);
  const [dragIdx, setDragIdx] = React.useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = React.useState<number | null>(null);
  const [selectedBlockId, setSelectedBlockId] = React.useState<string | null>(null);

  React.useEffect(() => {
    // Só semeia a partir do servidor enquanto o admin ainda não assumiu o controle
    // ao vivo. Depois disso, o postMessage é a fonte da verdade.
    if (previewLiveRef.current) return;
    setPreviewBlocks(baseBlocks.filter((b) => b.visible));
  }, [settings]);

  // Listen for block selection and live preview updates from admin panel
  React.useEffect(() => {
    if (!isAdminPreview) return;
    function onMessage(e: MessageEvent) {
      if (!e.data || typeof e.data !== "object") return;
      if (e.data.type === "block:select" && e.data.blockId) {
        setSelectedBlockId(e.data.blockId);
        const el = document.getElementById(`block-${e.data.blockId}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      // Instant preview: update a single block immediately without re-fetching settings
      if (e.data.type === "block:preview" && e.data.block) {
        previewLiveRef.current = true;
        const updated = e.data.block as HomeBlock;
        setPreviewBlocks((prev) =>
          prev.map((b) => b.id === updated.id ? { ...b, ...updated } : b)
        );
      }
      // Full blocks list update (reorder / visibility toggle)
      if (e.data.type === "blocks:update" && Array.isArray(e.data.blocks)) {
        previewLiveRef.current = true;
        setPreviewBlocks(e.data.blocks as HomeBlock[]);
      }
      // Live color preview for header and footer
      if (e.data.type === "style:preview") {
        if (e.data.headerBgColor) {
          const hdr = document.querySelector<HTMLElement>("header");
          if (hdr) hdr.style.backgroundColor = e.data.headerBgColor as string;
        }
        if (e.data.footerBgColor) {
          const ftr = document.querySelector<HTMLElement>("footer");
          if (ftr) ftr.style.backgroundColor = e.data.footerBgColor as string;
        }
      }
    }
    window.addEventListener("message", onMessage);
    // Avisa o painel admin que o preview está montado e com o listener pronto.
    // O admin responde com o estado atual dos blocos (blocks:update), evitando que
    // o (re)load do iframe mostre o estado antigo do servidor ("um passo atrás").
    window.parent.postMessage({ type: "preview:ready" }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, [isAdminPreview]);

  const visibleBlocks = isAdminPreview ? previewBlocks : baseBlocks.filter((b) => b.visible);

  /**
   * Cache das listas já mapeadas, por categoria pedida (PRD-PERF-07).
   *
   * `getArticles` é chamada por CADA bloco durante o render, e percorre a lista
   * inteira — 200 artigos, formatando a data de todos, inclusive dos que o bloco
   * descarta logo em seguida ao fatiar 3–6. Com os 22 blocos do template de
   * portal isso dava ~4.400 formatações de data por render (677 ms de CPU de
   * desktop; ~2,7 s no celular do PageSpeed), repetidas a cada re-render — a
   * hidratação, a chegada do /api/site e a do /api/articles são três.
   *
   * Guardar o resultado por categoria transforma "uma passada por bloco" em "uma
   * passada por categoria distinta", e o `useMemo` faz os re-renders custarem
   * zero. Só se invalida quando muda algo que altera a saída (a lista, o idioma
   * ou o fuso) — `cat` continua sendo a chave porque o `chapeu` de quem não tem
   * `tag` deriva dela.
   */
  const articlesByCat = React.useMemo(
    () => new Map<string, SectionArticle[]>(),
    [articles, lang, tz],
  );

  function getArticles(cat: string): SectionArticle[] {
    const cached = articlesByCat.get(cat);
    if (cached) return cached;
    // Igualdade EXATA de slug ("" = curinga p/ latest/most_read): includes()
    // fazia "futebol" casar "futebol-americano" — artigo na seção errada em
    // TODOS os blocos da home (CSR e SSR).
    const want = cat.trim().toLowerCase();
    const list = articles
      .filter((a) => want === "" || (a.category ?? "").trim().toLowerCase() === want)
      .map((a) => ({
        id: a.id,
        slug: a.slug || a.id,
        title: a.title,
        summary: a.subtitle,
        image: a.imageUrl || "",
        chapeu: a.tag || cat.toUpperCase(),
        author: a.author,
        time: formatDayMonth(a.publishedAt, lang, tz),
        views: a.views,
        readingMinutes: a.readingMinutes,
      }));
    articlesByCat.set(cat, list);
    return list;
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

  // Fluxo clássico (blocos sem area/width) — JSX idêntico ao layout original:
  // ads por índice global, cv-auto a partir do 4º bloco, wrapper de edição no preview.
  function renderFlowBlock(block: HomeBlock, idx: number): React.ReactNode {
    const content = (
      <>
        {idx === 0 && <AdSlotBand slot="slot_08" priority className="max-w-[1280px] mx-auto px-4 pt-4 pb-2" />}
        {idx === 1 && <AdSlotBand slot="slot_01" className="max-w-[1280px] mx-auto px-4 py-4" />}
        {idx === 2 && <AdSlotBand slot="slot_02" className="max-w-[1280px] mx-auto px-4 py-4" />}
        {idx === 4 && <AdSlotBand slot="slot_03" className="max-w-[1280px] mx-auto px-4 py-4" />}
        {idx === 7 && <AdSlotBand slot="slot_04" className="max-w-[1280px] mx-auto px-4 py-4" />}
        <BlockFontScope fontId={block.fontFamily} devices={block.devices}>
          {block.custom
            ? <CustomBlock block={block} getArticles={getArticles} preview={isAdminPreview} />
            : <PredefinedBlock block={block} getArticles={getArticles} preview={isAdminPreview} />
          }
        </BlockFontScope>
      </>
    );

    if (!isAdminPreview) {
      // Blocos abaixo da dobra (idx >= 3) ganham content-visibility:auto para
      // baratear o render inicial. Os 3 primeiros (hero/destaques) renderizam
      // imediatamente. Não aplicado no modo admin para não afetar drag/scroll.
      return idx >= 3
        ? <div key={block.id} className="cv-auto">{content}</div>
        : <React.Fragment key={block.id}>{content}</React.Fragment>;
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
  }

  // Bloco dentro de zona (coluna principal/lateral/meia largura): renderer
  // dedicado com fallback para o componente clássico; mantém o wrapper de
  // edição do preview com o índice global (drag reordena a lista plana).
  function renderZoneItem(entry: SegmentEntry, zone: "main" | "sidebar" | "half"): React.ReactNode {
    const { block, idx } = entry;
    const inner = (
      <BlockFontScope fontId={block.fontFamily} devices={block.devices}>
        <ZoneBlock block={block} zone={zone} getArticles={getArticles} preview={isAdminPreview}
          fallback={block.custom
            ? <CustomBlock block={block} getArticles={getArticles} preview={isAdminPreview} />
            : <PredefinedBlock block={block} getArticles={getArticles} preview={isAdminPreview} />} />
      </BlockFontScope>
    );
    if (!isAdminPreview) return <React.Fragment key={block.id}>{inner}</React.Fragment>;
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
        <div id={`block-${block.id}`}>{inner}</div>
      </AdminBlockWrapper>
    );
  }

  return (
    // Fundo da home configurável (mock dos portais B2B usa #f7f9fb); demais
    // páginas seguem brancas — o campo só afeta a home.
    <div className="min-h-screen w-full flex flex-col overflow-x-hidden"
      style={{ backgroundColor: settings?.pageBgColor || "#ffffff" }}>
      <TopBar />
      <Header />

      {isAdminPreview && (
        <div className="sticky top-0 z-[100] bg-[#0B2A66] text-white text-[11px] font-semibold flex items-center justify-center gap-2 py-1.5 px-4 shadow-md">
          <span className="w-2 h-2 rounded-full bg-[#E71D36] animate-pulse shrink-0" />
          Modo de edição — clique em qualquer bloco para editar
        </div>
      )}

      <main className="flex-1">
        {/* H1 das settings em AMBOS os idiomas: o literal do dicionário fala de
            Brasília/DF e a imagem é compartilhada — todo blog replicado servia
            esse H1 aos buscadores (invariante §13: nada hardcoded por blog).
            Sem settings carregadas, mantém o literal antigo byte-idêntico. */}
        <h1 className="sr-only">{settings?.siteName
          ? `${settings.siteName} — ${settings.tagline || t("home.h1")}`
          : t("home.h1")}</h1>

        {segmentBlocks(visibleBlocks).map((seg) => {
          if (seg.kind === "flow") return renderFlowBlock(seg.block, seg.idx);

          const firstId = seg.kind === "zone"
            ? (seg.main[0] ?? seg.sidebar[0])!.block.id
            : seg.items[0]!.block.id;
          const belowFold = !isAdminPreview && seg.startIdx >= 3;

          if (seg.kind === "zone") {
            const hasBoth = seg.main.length > 0 && seg.sidebar.length > 0;
            return (
              <div key={`zone-${firstId}`} className={belowFold ? "cv-auto" : undefined}>
                <div className="max-w-[1280px] mx-auto px-4 py-6">
                  <div className={`grid grid-cols-1 gap-6 items-start ${hasBoth ? "lg:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
                    {seg.main.length > 0 && (
                      <div className="min-w-0 flex flex-col gap-6">
                        {seg.main.map((e) => renderZoneItem(e, "main"))}
                      </div>
                    )}
                    {seg.sidebar.length > 0 && (
                      <aside className="min-w-0 flex flex-col gap-6">
                        {seg.sidebar.map((e) => renderZoneItem(e, "sidebar"))}
                      </aside>
                    )}
                  </div>
                </div>
              </div>
            );
          }

          // Run inteiro de blocos 1/4 abre para 4 colunas no desktop largo
          // (seções por modalidade do portal); misto/half mantém os pares.
          const allQuarter = seg.items.every((e) => e.block.width === "quarter");
          return (
            <div key={`half-${firstId}`} className={belowFold ? "cv-auto" : undefined}>
              <div className="max-w-[1280px] mx-auto px-4 py-4">
                <div className={`grid grid-cols-1 md:grid-cols-2 ${allQuarter ? "xl:grid-cols-4" : ""} gap-x-6 gap-y-8`}>
                  {seg.items.map((e) => renderZoneItem(e, "half"))}
                </div>
              </div>
            </div>
          );
        })}

        {/* slot_09 — Rodapé da Home (sem anúncio = sem faixa reservada) */}
        <AdSlotBand slot="slot_09" className="max-w-[1280px] mx-auto px-4 py-6" />
      </main>

      <Footer />
    </div>
  );
}
