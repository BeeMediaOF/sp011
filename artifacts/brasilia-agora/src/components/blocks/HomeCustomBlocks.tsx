/**
 * Renderizadores dos blocos personalizados da home (tipos não-"content").
 *
 * Cada tipo criado no painel "Adicionar bloco" tem aqui o seu render real:
 * imagem renderiza imagem, carrossel renderiza carrossel, vídeo renderiza
 * vídeo — nunca mais um bloco de artigos genérico.
 *
 * Segurança: links passam por safeLinkUrl (sem javascript:), iframes só com
 * https via safeEmbedUrl/parseVideoEmbedUrl, HTML livre sanitizado com
 * DOMPurify (sanitizeArticleHtml; no SSR usa a variante leve sem DOM — render
 * IGUAL nos dois lados, senão a hidratação descarta o SSR inteiro, #418).
 */
import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { FaFacebook, FaInstagram, FaYoutube, FaTiktok, FaWhatsapp, FaLinkedin } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";
import { ChevronLeft, ChevronRight, Mail, ArrowRight } from "lucide-react";
import AdBanner from "../ads/AdBanner";
import CotacaoWidget from "../CotacaoWidget";
import { useSite } from "../../hooks/useSite";
import { useT } from "../../lib/i18n";
import { safeTitleHtml, sanitizeArticleHtml } from "../../lib/sanitize";
import {
  type HomeBlock, parseVideoEmbedUrl, isDirectVideoFile, safeEmbedUrl, safeLinkUrl,
  parsePlaylistId, categoriesBlockSource, resolveCategoryBlockItems,
} from "../../lib/homeBlocks";
import { categoryIcon } from "../../lib/categoryIcons";
import {
  clubMonogram, positionKey, transferCrestUrl, transferPhotoUrl,
} from "../../lib/transfers";
import { useAdImpression, trackClick, type AdSlotKey } from "../ads/useAds";
import { proxyUrl, buildSrcSet } from "../../lib/newsImage";
import { trackSearch, trackNewsletter } from "../../hooks/useAnalytics";
import { subscribeNewsletter } from "../../lib/newsletter";
import { normalizeSocialUrl, type FooterSocialKey } from "../../lib/footerConfig";
import { blockFontStyle, ensureFontLoaded } from "../../lib/fonts";

/**
 * Aplica a fonte escolhida do bloco (HomeBlock.fontFamily) a todo o seu
 * conteúdo. display:contents não gera caixa (layout/sticky intocados), mas as
 * propriedades herdadas e as variáveis --app-font-* cascateiam normalmente —
 * inclusive sobre os títulos com `font-serif`. Sem fonte definida, é um
 * fragment puro (render byte-idêntico ao atual). Fontes do Google são
 * carregadas sob demanda no cliente; no SSR sai só o style inline (hidrata igual).
 */
export function BlockFontScope({ fontId, devices, children }: {
  fontId?: string;
  /** Telas em que o bloco aparece (ausente/"all" = todas). */
  devices?: "all" | "mobile" | "desktop";
  children: React.ReactNode;
}) {
  useEffect(() => { ensureFontLoaded(fontId); }, [fontId]);
  const style = blockFontStyle(fontId);
  // As classes .block-only-* já trazem display:contents e o desligam no media
  // query — por isso, com elas, o display NÃO pode vir no style inline (inline
  // venceria o @media e o bloco nunca sumiria).
  const cls = devices === "mobile" ? "block-only-mobile"
    : devices === "desktop" ? "block-only-desktop" : undefined;
  if (!style && !cls) return <>{children}</>;
  if (cls) return <div className={cls} style={style ?? undefined}>{children}</div>;
  return <div style={{ display: "contents", ...style }}>{children}</div>;
}

/**
 * Visibilidade por tela para wrappers que JÁ existem e carregam o espaçamento
 * (lateral da notícia: `space-y-*` no <aside>). Ali as classes .block-only-*
 * não servem: elas são display:contents, e margem em display:contents é
 * ignorada — a coluna perderia o respiro entre os blocos. O corte do `lg` do
 * Tailwind é 1024px, o mesmo das .block-only-*.
 */
export function deviceBoxClass(devices?: "all" | "mobile" | "desktop"): string {
  return devices === "mobile" ? "lg:hidden" : devices === "desktop" ? "hidden lg:block" : "";
}

export interface BlockArticle {
  id: string;
  slug?: string;
  title: string;
  summary?: string;
  image: string;
  chapeu: string;
  time: string;
}

export const AD_SLOTS: readonly string[] = [
  "slot_01", "slot_02", "slot_03", "slot_04", "slot_05", "slot_06",
  "slot_07", "slot_08", "slot_09", "slot_10", "slot_11",
];

// ─── Placeholder (apenas no preview do admin) ────────────────────────────────
export function BlockPlaceholder({ label, hint, preview }: { label: string; hint: string; preview?: boolean }) {
  if (!preview) return null;
  return (
    <section className="max-w-[1280px] mx-auto px-4 py-4">
      <div className="border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 px-6 py-8 text-center">
        <p className="text-sm font-bold text-slate-500">{label}</p>
        <p className="text-xs text-slate-400 mt-1">{hint}</p>
      </div>
    </section>
  );
}

// ─── Cabeçalho de seção padrão ───────────────────────────────────────────────
function SectionHeading({ title, color, hideHeader }: { title: string; color: string; hideHeader?: boolean }) {
  if (!title || hideHeader) return null;
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-1 h-5" style={{ backgroundColor: color }} />
      <h2 className="text-[17px] font-bold text-[#1a1a1a] uppercase tracking-wider">{title}</h2>
    </div>
  );
}

// ─── Imagem ──────────────────────────────────────────────────────────────────
/** Larguras servidas do bloco de imagem: cobre a coluna estreita da lateral
 *  (320) até a faixa full-width do desktop 2× (o container é max-w-1280). */
const BLOCK_IMAGE_WIDTHS = [320, 640, 970, 1280];

export function ImageBlock({ block, preview, contained = true }: {
  block: HomeBlock; preview?: boolean;
  /** false = sem o wrapper de página (uso na lateral da notícia/zonas). */
  contained?: boolean;
}) {
  // Bloco marcado "É uma propaganda": mede impressão viewável (≥50% por 1s,
  // 1× por sessão) e cliques como qualquer anúncio, sob a chave block:<id>.
  const adKey = block.isAd ? `block:${block.id}` : undefined;
  const impressionRef = useAdImpression(adKey);
  const src = (block.imageUrl ?? "").trim();
  if (!src) {
    return <BlockPlaceholder preview={preview} label={`Bloco de imagem: ${block.name}`}
      hint="Clique no bloco e envie uma imagem (ou cole uma URL) no painel." />;
  }
  const href = safeLinkUrl(block.linkUrl);
  const caption = (block.caption ?? "").trim();
  const format = block.format ?? "full_width_image";

  /* A imagem do bloco é subida pelo painel e ia CRUA para o navegador. Medido no
     esporteagora em 2026-07-30: um PNG de 1.697 KiB (1366×1152) para um espaço
     de 665×561 — sozinho, o elemento de LCP da home, 15,0 s. O /api/uploads já
     redimensiona e converte para WebP; faltava pedir.
     width/height vêm do /api/site (blockImageMeta.ts): sem eles o `h-auto` deixa
     a imagem com altura zero até chegar, e o que está abaixo dela pula — era
     CLS de 0,945 naquela home. Com os dois atributos o navegador deduz a
     proporção e reserva a caixa desde o HTML do SSR. */
  const img = (
    <img src={proxyUrl(src, BLOCK_IMAGE_WIDTHS[BLOCK_IMAGE_WIDTHS.length - 1]!)}
      srcSet={buildSrcSet(src, BLOCK_IMAGE_WIDTHS) || undefined}
      sizes={contained ? "(max-width: 1280px) 100vw, 1280px" : "(max-width: 1024px) 100vw, 320px"}
      alt={caption || block.name} loading="lazy" decoding="async"
      width={block.imageWidth} height={block.imageHeight}
      className={`w-full h-auto object-cover ${format === "full_width_image" ? "" : "rounded-xl"}`} />
  );

  let body: React.ReactNode;
  if (format === "background_overlay") {
    body = (
      <div className="relative overflow-hidden rounded-xl">
        {img}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent rounded-xl" />
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <p className="text-xl md:text-2xl font-black text-white leading-tight">{caption || block.name}</p>
        </div>
      </div>
    );
  } else if (format === "image_with_text") {
    body = (
      <div className="flex flex-col md:flex-row gap-6 items-center">
        <div className="md:flex-[3] w-full">{img}</div>
        <div className="md:flex-[2]">
          <p className="text-lg font-bold text-[#1a1a1a] leading-snug">{block.name}</p>
          {caption && <p className="text-sm text-gray-600 mt-2 leading-relaxed">{caption}</p>}
        </div>
      </div>
    );
  } else {
    body = (
      <figure>
        {img}
        {caption && <figcaption className="text-xs text-gray-500 mt-2">{caption}</figcaption>}
      </figure>
    );
  }

  const onAdClick = adKey ? () => { void trackClick(adKey); } : undefined;
  const inner = href
    ? (/^https?:\/\//i.test(href)
      ? <a href={href} target="_blank" rel="noopener noreferrer" onClick={onAdClick} className="block hover:opacity-95 transition-opacity">{body}</a>
      : <Link href={href} onClick={onAdClick} className="block hover:opacity-95 transition-opacity">{body}</Link>)
    : body;

  return (
    <section ref={adKey ? impressionRef : undefined} data-bee-ad={adKey ? "1" : undefined}
      className={!contained ? "" : format === "full_width_image" ? "py-4" : "max-w-[1280px] mx-auto px-4 py-6"}>
      {inner}
    </section>
  );
}

// ─── Carrossel de notícias ───────────────────────────────────────────────────
export function CarouselBlock({ block, articles, preview }: {
  block: HomeBlock; articles: BlockArticle[]; preview?: boolean;
}) {
  const { t } = useT();
  const scrollRef = useRef<HTMLDivElement>(null);
  const color = block.color ?? "#0B2A66";
  const items = articles.slice(0, block.itemsLimit ?? 8);

  if (items.length === 0) {
    return <BlockPlaceholder preview={preview} label={`Carrossel: ${block.name}`}
      hint="Nenhum artigo encontrado para a fonte/categoria configurada." />;
  }

  function scrollBy(dir: 1 | -1) {
    scrollRef.current?.scrollBy({ left: dir * 300, behavior: "smooth" });
  }

  return (
    <section className="border-t border-gray-200 py-8">
      <div className="max-w-[1280px] mx-auto px-4">
        <div className="flex items-center justify-between mb-4">
          <SectionHeading title={block.name} color={color} />
          <div className="hidden md:flex gap-1">
            <button type="button" aria-label={t("common.previous")} onClick={() => scrollBy(-1)}
              className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors">
              <ChevronLeft size={16} />
            </button>
            <button type="button" aria-label={t("common.next")} onClick={() => scrollBy(1)}
              className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <div ref={scrollRef} className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 scrollbar-thin">
          {items.map((a) => (
            <Link key={a.id} href={`/artigo/${a.slug ?? a.id}`}
              className="snap-start shrink-0 w-[240px] md:w-[280px] group flex flex-col">
              {a.image && (
                <img src={a.image} alt={a.title} width={280} height={187} loading="lazy" decoding="async"
                  className="w-full aspect-[3/2] object-cover rounded-lg mb-2 group-hover:brightness-95 transition-all" />
              )}
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color }}>{a.chapeu}</span>
              <p className="text-[14px] font-bold text-[#1a1a1a] leading-snug group-hover:underline line-clamp-3"
                dangerouslySetInnerHTML={{ __html: safeTitleHtml(a.title) }} />
              <p className="text-[11px] text-gray-400 mt-1">{a.time}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Vídeo ───────────────────────────────────────────────────────────────────
export function VideoEmbedBlock({ block, preview }: { block: HomeBlock; preview?: boolean }) {
  const embed = parseVideoEmbedUrl(block.videoUrl);
  const color = block.color ?? "#E71D36";
  if (!embed) {
    return <BlockPlaceholder preview={preview} label={`Bloco de vídeo: ${block.name}`}
      hint="Cole no painel uma URL do YouTube, Vimeo ou arquivo .mp4." />;
  }
  return (
    <section className="border-t border-gray-200 py-8">
      <div className="max-w-[1280px] mx-auto px-4">
        <SectionHeading title={block.name} color={color} />
        <div className="relative w-full max-w-[960px] mx-auto aspect-video rounded-xl overflow-hidden bg-black">
          {isDirectVideoFile(embed) ? (
            <video src={embed} controls preload="metadata" className="w-full h-full object-contain" />
          ) : (
            <iframe src={embed} title={block.name} loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
              className="absolute inset-0 w-full h-full border-0" />
          )}
        </div>
      </div>
    </section>
  );
}

// ─── Playlist do YouTube ─────────────────────────────────────────────────────
interface PlaylistVideo { id: string; title: string; thumb: string; publishedAt: string }

/**
 * Player + lista de vídeos da playlist, no visual do portal (não o embed cru do
 * YouTube). A lista vem de `/api/youtube/playlist`, que lê o feed público —
 * nenhum blog precisa de chave de API no `.env`.
 *
 * Sempre no cliente: é conteúdo de terceiro que muda sozinho e não entra no
 * SSR da home (buscar no servidor a cada render atrasaria o topo da página).
 * Enquanto carrega, o bloco não desenha nada — nunca um esqueleto que some.
 */
export function YoutubePlaylistBlock({ block, preview }: { block: HomeBlock; preview?: boolean }) {
  const playlistId = parsePlaylistId(block.playlistUrl);
  const [videos, setVideos] = useState<PlaylistVideo[]>([]);
  const [feedTitle, setFeedTitle] = useState("");
  const [current, setCurrent] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const color = block.color ?? "#E71D36";

  useEffect(() => {
    if (!playlistId) return;
    let alive = true;
    fetch(`/api/youtube/playlist?id=${encodeURIComponent(playlistId)}`)
      .then((r) => r.json())
      .then((data: { title?: string; videos?: PlaylistVideo[] }) => {
        if (!alive) return;
        setVideos(data.videos ?? []);
        setFeedTitle(data.title ?? "");
        setCurrent(0);
        setLoaded(true);
      })
      .catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [playlistId]);

  if (!playlistId) {
    return <BlockPlaceholder preview={preview} label={`Playlist do YouTube: ${block.name}`}
      hint="Cole no painel o link da playlist (youtube.com/playlist?list=...)." />;
  }
  if (!loaded) return null;
  if (videos.length === 0) {
    return <BlockPlaceholder preview={preview} label={`Playlist do YouTube: ${block.name}`}
      hint="A playlist não devolveu vídeos. Confira se ela é pública e se o link está correto." />;
  }

  const playing = videos[Math.min(current, videos.length - 1)]!;
  const limited = block.itemsLimit ? videos.slice(0, block.itemsLimit) : videos;

  return (
    <section className="border-t border-gray-200 py-8">
      <div className="max-w-[1280px] mx-auto px-4">
        {/* Cabeçalho: título do bloco + atalho para a playlist no YouTube */}
        <div className="flex items-end justify-between gap-4 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-1 h-5 shrink-0" style={{ backgroundColor: color }} />
            <h2 className="text-[17px] font-bold text-[#1a1a1a] uppercase tracking-wider truncate">
              {block.name || feedTitle}
            </h2>
          </div>
          <a
            href={`https://www.youtube.com/playlist?list=${playlistId}`}
            target="_blank" rel="noopener noreferrer"
            className="text-[11px] font-bold uppercase tracking-wider shrink-0 hover:underline"
            style={{ color }}
          >
            {block.linkLabel?.trim() || "Abrir no YouTube"}
          </a>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 items-start">
          {/* Player */}
          <div>
            <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${playing.id}?list=${playlistId}&rel=0`}
                title={playing.title}
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                className="absolute inset-0 w-full h-full border-0"
              />
            </div>
            <h3 className="text-[15px] font-bold text-[#1a1a1a] mt-3 leading-snug">{playing.title}</h3>
          </div>

          {/* Lista de vídeos */}
          <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Reproduzindo agora
              </span>
              <span className="text-[10px] font-semibold text-gray-400">
                {Math.min(current, limited.length - 1) + 1}/{limited.length}
              </span>
            </div>
            <ul className="max-h-[360px] overflow-y-auto divide-y divide-gray-100">
              {limited.map((v, i) => {
                const active = i === Math.min(current, limited.length - 1);
                return (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => setCurrent(i)}
                      aria-current={active ? "true" : undefined}
                      className={`w-full flex items-start gap-2.5 p-2.5 text-left transition-colors ${
                        active ? "bg-gray-50" : "hover:bg-gray-50"
                      }`}
                    >
                      <span className="relative shrink-0">
                        <img
                          src={v.thumb} alt="" width={96} height={54} loading="lazy" decoding="async"
                          className="w-24 h-[54px] rounded-md object-cover bg-gray-100"
                        />
                        {active && (
                          <span className="absolute inset-0 rounded-md pointer-events-none"
                            style={{ boxShadow: `inset 0 0 0 2px ${color}` }} />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span
                          className={`block text-[12px] leading-snug line-clamp-3 ${active ? "font-bold text-[#1a1a1a]" : "text-gray-700"}`}
                        >
                          {v.title}
                        </span>
                        {active && (
                          <span className="block text-[10px] font-bold uppercase tracking-wider mt-1" style={{ color }}>
                            Reproduzindo
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── HTML livre (sanitizado) ─────────────────────────────────────────────────
export function HtmlBlock({ block, preview, contained = true }: {
  block: HomeBlock; preview?: boolean;
  /** false = sem o wrapper max-w próprio (uso dentro da zona de colunas da home). */
  contained?: boolean;
}) {
  // Bloco marcado "É uma propaganda": impressão viewável (≥50% por 1s, 1× por
  // sessão) + qualquer clique em link do bloco conta como clique de anúncio.
  const adKey = block.isAd ? `block:${block.id}` : undefined;
  const impressionRef = useAdImpression(adKey);
  const clean = sanitizeArticleHtml(block.html);
  const link = safeLinkUrl(block.linkUrl);
  if (!clean) {
    return <BlockPlaceholder preview={preview} label={`Bloco HTML: ${block.name}`}
      hint="Adicione o código HTML no painel (scripts são removidos por segurança)." />;
  }
  const body = <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: clean }} />;
  return (
    <section ref={adKey ? impressionRef : undefined} data-bee-ad={adKey ? "1" : undefined}
      className={contained ? "max-w-[1280px] mx-auto px-4 py-6" : ""}
      onClick={adKey ? (e) => {
        // Delegação: cobre o overlay E os <a> do próprio HTML sanitizado.
        if ((e.target as HTMLElement).closest("a")) void trackClick(adKey);
      } : undefined}>
      {link ? (
        // Link por overlay: o banner inteiro fica clicável sem aninhar <a>
        // dentro de possíveis <a> do próprio HTML (aninhado é HTML inválido).
        <div className="relative">
          {body}
          <a href={link} target="_blank" rel="noopener noreferrer sponsored"
            className="absolute inset-0 z-10" aria-label={block.name} />
        </div>
      ) : body}
    </section>
  );
}

// ─── Embed / Mapa (iframe https) ─────────────────────────────────────────────
export function EmbedBlock({ block, preview, map }: { block: HomeBlock; preview?: boolean; map?: boolean }) {
  const url = safeEmbedUrl(block.embedUrl);
  if (!url) {
    return <BlockPlaceholder preview={preview} label={`${map ? "Mapa" : "Embed"}: ${block.name}`}
      hint={map
        ? "Cole a URL de incorporação do Google Maps (Compartilhar → Incorporar um mapa)."
        : "Cole uma URL https de conteúdo externo no painel."} />;
  }
  return (
    <section className="max-w-[1280px] mx-auto px-4 py-6">
      <SectionHeading title={block.name} color={block.color ?? "#0B2A66"} />
      <iframe src={url} title={block.name} loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        className="w-full border-0 rounded-xl bg-gray-50"
        style={{ height: map ? 420 : 480 }} allowFullScreen={map} />
    </section>
  );
}

// ─── Ticker de manchetes ─────────────────────────────────────────────────────
export function TickerBlock({ block, articles, preview, contained = true }: {
  block: HomeBlock; articles: BlockArticle[]; preview?: boolean;
  /** false = sem o wrapper max-w próprio (uso dentro da zona de colunas da home). */
  contained?: boolean;
}) {
  const { t } = useT();
  const color = block.color ?? "#E71D36";
  const items = articles.slice(0, block.itemsLimit ?? 10);
  if (items.length === 0) {
    return <BlockPlaceholder preview={preview} label={`Ticker: ${block.name}`}
      hint="Sem notícias para exibir na faixa rolante." />;
  }
  // Lista duplicada para o loop contínuo da animação.
  const loop = [...items, ...items];
  return (
    <section className={contained ? "py-2" : ""}>
      <style>{`@keyframes hb-ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`}</style>
      {/* Contido na largura do site (não full-bleed) — mesma faixa dos portais de referência. */}
      <div className={contained ? "max-w-[1280px] mx-auto px-4" : ""}>
      <div className="flex items-center border border-gray-200 bg-white">
        <span className="shrink-0 text-[11px] font-black text-white uppercase tracking-wider px-3 py-2"
          style={{ backgroundColor: color }}>
          {block.name || t("home.latest")}
        </span>
        {/* Área de rolagem com clipping próprio — sem ela a faixa animada
            desliza por cima do rótulo e vaza pela borda esquerda. */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex whitespace-nowrap w-max" style={{ animation: `hb-ticker ${Math.max(20, items.length * 6)}s linear infinite` }}>
            {loop.map((a, i) => (
              <Link key={`${a.id}-${i}`} href={`/artigo/${a.slug ?? a.id}`}
                className="text-[13px] text-gray-700 hover:text-black px-4 py-2 inline-flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span dangerouslySetInnerHTML={{ __html: safeTitleHtml(a.title) }} />
              </Link>
            ))}
          </div>
        </div>
      </div>
      </div>
    </section>
  );
}

// ─── Newsletter ──────────────────────────────────────────────────────────────
export function NewsletterBlock({ block }: { block: HomeBlock }) {
  const { t, lang } = useT();
  const { settings } = useSite();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "err">("idle");
  const color = block.color ?? "#0B2A66";
  // Variante "card" (mock dos portais B2B): cartão arredondado contido, com
  // ícone de envelope no acento do site e nota curta (linkLabel) sob o form.
  const isCard = block.format === "card";
  const accent = settings?.menuActiveColor || settings?.footerAccentColor || "";
  const caption = block.caption
    || (lang === "en" ? "Get the top stories in your inbox." : "Receba as principais notícias no seu e-mail.");
  const note = (block.linkLabel ?? "").trim();
  // Rótulo do botão configurável por bloco (mock Crédito.vc: "Quero receber").
  const btnLabel = (block.buttonLabel ?? "").trim() || t("newsletter.subscribe");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = email.trim();
    if (!v || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setStatus("err"); return; }
    // Inscrição (subscribeNewsletter) = consentimento próprio de marketing, sai
    // SEMPRE, fora do gate de analytics (PRD-NEWSLETTER-01 RF1). A métrica
    // (trackNewsletter) segue atrás do gate. Fire-and-forget — "ok" imediato.
    subscribeNewsletter(v, "home_block");
    trackNewsletter(v);
    setStatus("ok");
    setEmail("");
  }

  const errMsg = status === "err" && (
    <p className="text-xs text-white/90 mt-2">{lang === "en" ? "Enter a valid email." : "Informe um e-mail válido."}</p>
  );

  if (isCard) {
    return (
      // id = âncora navegável (busca do hero/CTA do cabeçalho → "#<id do bloco>").
      <section id={block.id} className="max-w-[1280px] mx-auto px-4 py-6">
        <div className="rounded-3xl px-6 py-7 md:px-10 md:py-8 shadow-[0_8px_28px_rgba(15,23,42,.08)] flex flex-col md:flex-row md:items-center gap-5 md:gap-8"
          style={{ backgroundColor: color }}>
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: accent || "rgba(255,255,255,.15)" }}>
              <Mail size={26} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-lg md:text-xl font-black text-white leading-snug">{block.name || "Newsletter"}</p>
              <p className="text-sm text-white/75 mt-1">{caption}</p>
            </div>
          </div>
          <div className="w-full md:w-auto">
            {status === "ok" ? (
              <p className="text-sm font-bold text-white bg-white/15 rounded-xl px-4 py-3">{t("newsletter.thanks")}</p>
            ) : (
              <>
                <form onSubmit={submit} className="flex w-full md:w-auto md:min-w-[380px]">
                  <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); if (status === "err") setStatus("idle"); }}
                    placeholder={t("newsletter.email")} aria-label={t("newsletter.emailAria")} required
                    className="flex-1 min-w-0 bg-white text-gray-800 placeholder-gray-400 px-4 py-2.5 text-sm rounded-l-xl focus:outline-none" />
                  {accent ? (
                    <button type="submit" disabled={status === "sending"}
                      className="text-white text-sm font-bold px-5 py-2.5 rounded-r-xl hover:opacity-90 disabled:opacity-60 transition-opacity"
                      style={{ backgroundColor: accent }}>
                      {status === "sending" ? t("newsletter.sending") : btnLabel}
                    </button>
                  ) : (
                    <button type="submit" disabled={status === "sending"}
                      className="bg-white text-sm font-bold px-5 py-2.5 rounded-r-xl hover:bg-white/90 disabled:opacity-60 transition-colors border-l border-gray-200"
                      style={{ color }}>
                      {status === "sending" ? t("newsletter.sending") : btnLabel}
                    </button>
                  )}
                </form>
                {note && <p className="text-[11px] text-white/60 mt-2">{note}</p>}
                {errMsg}
              </>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    // id = âncora navegável: o bloco de busca (nota "inscreva-se") e o CTA do
    // cabeçalho apontam para cá via href="#<id do bloco>".
    <section id={block.id} className="py-8" style={{ backgroundColor: color }}>
      <div className="max-w-[1280px] mx-auto px-4 flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
        <div className="flex-1">
          <p className="text-lg font-black text-white">{block.name || "Newsletter"}</p>
          <p className="text-sm text-white/80 mt-1">{caption}</p>
        </div>
        {status === "ok" ? (
          <p className="text-sm font-bold text-white bg-white/15 rounded-lg px-4 py-3">{t("newsletter.thanks")}</p>
        ) : (
          <form onSubmit={submit} className="flex w-full md:w-auto md:min-w-[380px]">
            <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); if (status === "err") setStatus("idle"); }}
              placeholder={t("newsletter.email")} aria-label={t("newsletter.emailAria")} required
              className="flex-1 bg-white/10 border border-white/25 text-white placeholder-white/50 px-4 py-2.5 text-sm rounded-l-lg focus:outline-none focus:border-white" />
            <button type="submit" disabled={status === "sending"}
              className="bg-white text-sm font-bold px-5 py-2.5 rounded-r-lg hover:bg-white/90 disabled:opacity-60 transition-colors"
              style={{ color }}>
              {status === "sending" ? t("newsletter.sending") : btnLabel}
            </button>
          </form>
        )}
        {status === "err" && <p className="text-xs text-white/90 md:ml-2">{lang === "en" ? "Enter a valid email." : "Informe um e-mail válido."}</p>}
      </div>
    </section>
  );
}

// ─── Busca ───────────────────────────────────────────────────────────────────
/**
 * Bloco de busca FUNCIONAL: envia para /arquivo?q=… (mesmo destino da busca do
 * cabeçalho) e registra o termo no analytics. Formatos:
 *  - "search_bar" (padrão): cabeçalho de seção opcional + campo.
 *  - "search_card": card claro com conteúdo HTML acima do campo (hero de
 *    boas-vindas) e nota-link opcional abaixo (linkLabel + linkUrl; destino
 *    "#<id de bloco>" rola até o bloco na própria home — ex.: newsletter).
 */
/** Campo de busca reutilizável (SearchBlock e hero "revista"): envia para
 *  /arquivo?q=… — mesmo destino da busca do cabeçalho — e registra o termo. */
export function SearchForm({ placeholder, color }: { placeholder?: string; color: string }) {
  const { t } = useT();
  const [, navigate] = useLocation();
  const [q, setQ] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    trackSearch(query);
    navigate(`/arquivo?q=${encodeURIComponent(query)}`);
  }

  return (
    <form onSubmit={submit}
      className="flex items-center gap-2 border border-gray-200 rounded-2xl bg-white pl-4 pr-1.5 py-1.5">
      <input type="text" value={q} onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder || t("search.placeholder")}
        aria-label={t("search.site")}
        className="flex-1 min-w-0 text-[14px] text-gray-700 placeholder-gray-400 bg-transparent focus:outline-none py-1.5" />
      <button type="submit"
        className="shrink-0 text-white text-[13px] font-bold px-5 py-2 rounded-xl hover:opacity-90 transition-opacity"
        style={{ backgroundColor: color }}>
        {t("search.submit")}
      </button>
    </form>
  );
}

export function SearchBlock({ block, contained = true }: {
  block: HomeBlock;
  /** false = sem o wrapper max-w próprio (uso dentro das zonas da home). */
  contained?: boolean;
}) {
  const color = block.color ?? "#0B2A66";
  const isCard = block.format === "search_card";
  const topHtml = isCard ? sanitizeArticleHtml(block.html) : "";
  const note = (block.linkLabel ?? "").trim();
  const noteHref = (block.linkUrl ?? "").trim();

  function noteClick(e: React.MouseEvent) {
    // "#id" rola até o bloco alvo na própria página (ex.: newsletter no fim).
    if (!noteHref.startsWith("#")) return;
    e.preventDefault();
    document.getElementById(noteHref.slice(1))?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const form = <SearchForm placeholder={(block.caption ?? "").trim() || undefined} color={color} />;

  const noteCls = "block text-[13px] text-gray-500 mt-3";
  const noteEl = !note ? null
    : noteHref.startsWith("#")
      ? <a href={noteHref} onClick={noteClick} className={`${noteCls} hover:underline`}>{note}</a>
      : safeLinkUrl(noteHref)
        ? (/^https?:\/\//i.test(noteHref)
          ? <a href={noteHref} target="_blank" rel="noopener noreferrer" className={`${noteCls} hover:underline`}>{note}</a>
          : <Link href={noteHref} className={`${noteCls} hover:underline`}>{note}</Link>)
        : <p className={noteCls}>{note}</p>;

  if (isCard) {
    return (
      <section className={`${contained ? "max-w-[1280px] mx-auto px-4 py-6" : ""} h-full`}>
        <div className="h-full bg-white border border-gray-200 rounded-2xl shadow-[0_8px_28px_rgba(15,23,42,.06)] p-6 sm:p-7 flex flex-col justify-center">
          {topHtml && <div className="mb-5" dangerouslySetInnerHTML={{ __html: topHtml }} />}
          {form}
          {noteEl}
        </div>
      </section>
    );
  }

  return (
    <section className={contained ? "max-w-[1280px] mx-auto px-4 py-6" : ""}>
      {block.name && <SectionHeading title={block.name} color={color} />}
      <div className="max-w-[640px]">{form}{noteEl}</div>
    </section>
  );
}

// ─── Categorias (navegação por editoria) ─────────────────────────────────────
/** Ícone que é fallback de iniciais ("BR"), não emoji: pede fonte menor e cor
 *  do bloco para não parecer texto solto dentro do círculo. */
const INITIALS_RE = /^[\p{Lu}\p{N}]{1,2}$/u;

/**
 * Monta a navegação a partir das CATEGORIAS do blog (painel → Categorias); cai
 * para os itens do menu quando o blog ainda não salvou a lista, ou quando o
 * operador escolhe "menu" na origem. Origem "html" entrega o markup livre —
 * é a saída para quem quer um layout próprio sem trocar o tipo do bloco.
 *
 * Cada editoria vira um cartão com a imagem enviada no painel ou, sem imagem,
 * o ícone padrão do slug (lib/categoryIcons.ts). O formato "pills" preserva o
 * visual antigo do bloco.
 */
export function CategoriesBlock({ block, preview, contained = true }: {
  block: HomeBlock; preview?: boolean;
  /** false = sem o wrapper max-w próprio (uso dentro da zona de colunas). */
  contained?: boolean;
}) {
  const { settings } = useSite();
  const color = block.color ?? "#0B2A66";
  const source = categoriesBlockSource(block);

  if (source === "html") return <HtmlBlock block={block} preview={preview} contained={contained} />;

  const items = resolveCategoryBlockItems(
    block, settings?.categories, settings?.menuItems, categoryIcon,
  );
  if (items.length === 0) {
    return <BlockPlaceholder preview={preview} label={`Editorias: ${block.name}`}
      hint="Cadastre as editorias em Categorias (ou adicione itens ao menu) para exibi-las aqui." />;
  }

  const allHref = safeLinkUrl(block.linkUrl) ?? "/arquivo";
  const allLabel = (block.linkLabel ?? "").trim();
  const wrap = contained ? "max-w-[1280px] mx-auto px-4 py-6" : "";
  const heading = block.name && !block.hideHeader
    ? (block.sectionStyle === "revista"
      ? <h2 className="text-[22px] font-extrabold text-[#1a1a1a] leading-tight mb-5">{block.name}</h2>
      : <SectionHeading title={block.name} color={color} />)
    : null;

  if (block.format === "pills") {
    return (
      <section className={contained ? "border-t border-gray-200 py-8" : ""}>
        <div className={contained ? "max-w-[1280px] mx-auto px-4" : ""}>
          {heading}
          <div className="flex flex-wrap gap-2">
            {items.map((c) => (
              <Link key={c.slug} href={c.href}
                className="px-4 py-2 rounded-full border border-gray-200 text-[13px] font-semibold text-gray-700 hover:text-white transition-colors"
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = color; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = ""; }}>
                {c.label}
              </Link>
            ))}
          </div>
        </div>
      </section>
    );
  }

  const card = (href: string, label: string, icon: string, imageUrl?: string) => (
    <Link key={href} href={href}
      className="bg-white border border-gray-200 rounded-2xl px-2.5 py-4 text-center block hover:border-gray-300 hover:shadow-[0_8px_28px_rgba(15,23,42,.06)] transition-all">
      <span className="w-[54px] h-[54px] rounded-full border border-gray-200 bg-[#f8fafc] flex items-center justify-center leading-none mx-auto mb-2 overflow-hidden">
        {imageUrl
          ? <img src={imageUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
          : <span className={INITIALS_RE.test(icon)
            ? "text-[15px] font-extrabold tracking-tight" : "text-[22px]"}
            style={INITIALS_RE.test(icon) ? { color } : undefined}>{icon}</span>}
      </span>
      <span className="block font-semibold text-[#334155] text-[13px] leading-snug">{label}</span>
    </Link>
  );

  // Quebra de linha: sem `columns`, a fileira enche sozinha (auto-fit). Com
  // ele, o desktop passa a ter exatamente N por fileira — a conta vive no CSS
  // (.category-grid--fixed no index.css) porque estilo inline não tem media
  // query, e forçar 8 colunas no celular espremeria os cartões.
  const cols = Math.min(10, Math.max(2, Math.round(block.columns ?? 0)));
  const fixed = (block.columns ?? 0) >= 2;
  return (
    <section className={wrap}>
      {heading}
      <div className={`category-grid${fixed ? " category-grid--fixed" : ""}`}
        style={fixed ? ({ "--cat-cols": cols } as React.CSSProperties) : undefined}>
        {items.map((c) => card(c.href, c.label, c.icon, c.imageUrl))}
        {allLabel && card(allHref, allLabel, "\u{1F4F0}")}
      </div>
    </section>
  );
}

// ─── Redes sociais ───────────────────────────────────────────────────────────
const SOCIAL_ICONS: Record<FooterSocialKey, React.ElementType> = {
  instagram: FaInstagram, facebook: FaFacebook, x: FaXTwitter,
  youtube: FaYoutube, tiktok: FaTiktok, whatsapp: FaWhatsapp, linkedin: FaLinkedin,
};

export function SocialLinksBlock({ block, preview }: { block: HomeBlock; preview?: boolean }) {
  const { settings } = useSite();
  const contact = settings?.contact ?? {};
  const color = block.color ?? "#0B2A66";
  const links = (Object.keys(SOCIAL_ICONS) as FooterSocialKey[])
    .map((key) => ({ key, href: normalizeSocialUrl(key, (contact[key === "whatsapp" ? "whatsapp" : key] ?? "") as string) }))
    .filter((s) => s.href !== "");

  if (links.length === 0) {
    return <BlockPlaceholder preview={preview} label={`Redes sociais: ${block.name}`}
      hint="Preencha as redes em Configurações → Contato para exibi-las aqui." />;
  }
  return (
    <section className="border-t border-gray-200 py-8">
      <div className="max-w-[1280px] mx-auto px-4 flex flex-col items-center gap-4">
        <SectionHeading title={block.name} color={color} hideHeader={block.hideHeader} />
        <div className="flex flex-wrap justify-center gap-3">
          {links.map(({ key, href }) => {
            const Icon = SOCIAL_ICONS[key];
            return (
              <a key={key} href={href} target="_blank" rel="noopener noreferrer" aria-label={key}
                className="w-11 h-11 rounded-full flex items-center justify-center text-white hover:opacity-85 transition-opacity"
                style={{ backgroundColor: color }}>
                <Icon size={18} />
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── Cotações ────────────────────────────────────────────────────────────────
export function QuotesBlock() {
  return (
    <section className="py-2 border-y border-gray-200">
      <CotacaoWidget />
    </section>
  );
}

// ─── Separador ───────────────────────────────────────────────────────────────
export function SeparatorBlock({ block }: { block: HomeBlock }) {
  return (
    <div className="max-w-[1280px] mx-auto px-4 py-6" aria-hidden="true">
      <hr className="border-0 h-px" style={{ backgroundColor: block.color ?? "#e5e7eb" }} />
    </div>
  );
}

// ─── Propaganda (slot do AdBanner) ───────────────────────────────────────────
export function AdSlotBlock({ block, preview }: { block: HomeBlock; preview?: boolean }) {
  const slot = AD_SLOTS.includes(block.adSlot ?? "") ? (block.adSlot as AdSlotKey) : "slot_05";
  return (
    <div className="max-w-[1280px] mx-auto px-4 py-4">
      <AdBanner slot={slot} adId={block.adId} />
      {preview && !block.adSlot && (
        <p className="text-center text-[11px] text-slate-400 mt-1">
          Espaço de anúncio ({slot}) — escolha o slot e cadastre a arte em Propagandas.
        </p>
      )}
    </div>
  );
}

// ─── Transferências (rumores de mercado) ─────────────────────────────────────
/**
 * Painel de possíveis transferências: foto do jogador, clube de origem → clube
 * de destino e o selo de probabilidade à direita.
 *
 * Os dados vêm prontos do `/api/site` (`lib/transfers.ts` do api-server já
 * filtrou os ativos, resolveu os clubes e ordenou por data da informação), e é
 * isso que faz o bloco nascer no HTML do SERVIDOR: sem fetch no cliente, sem
 * CLS e sem o "pisca" do bloco de playlist.
 *
 * Ordem: data da informação, mais recente primeiro — decisão do usuário. A
 * probabilidade continua no selo, com o mesmo peso visual; ela só não ordena.
 *
 * Cor: a do bloco, e como reserva as das settings do PRÓPRIO blog. A imagem é a
 * mesma para os 11 — nada de tinta de marca escrita aqui.
 */
function alphaOn(color: string, alpha: string): string | undefined {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? `${color}${alpha}` : undefined;
}

/** Escudo do clube; sem arquivo, o monograma com as iniciais. Escudo é marca de
 *  terceiro — o seed não traz nenhum, e o bloco nunca pode ficar com buraco. */
function ClubCrest({ name, crestUrl, accent, size = 20 }: {
  name: string; crestUrl?: string; accent: string; size?: number;
}) {
  if (crestUrl) {
    return (
      <img
        src={transferCrestUrl(crestUrl, size)}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className="object-contain shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="shrink-0 inline-flex items-center justify-center rounded-full font-bold"
      style={{
        width: size, height: size,
        backgroundColor: alphaOn(accent, "1f") ?? "#e5e7eb",
        color: accent,
        fontSize: Math.max(8, Math.round(size * 0.42)),
      }}
    >
      {clubMonogram(name)}
    </span>
  );
}

export function TransfersBlock({ block, preview }: { block: HomeBlock; preview?: boolean }) {
  const { settings } = useSite();
  const { t } = useT();
  const rows = settings?.transfers ?? [];
  const accent = block.color || settings?.footerAccentColor || settings?.menuBarBgColor || "#1d4ed8";

  if (rows.length === 0) {
    return <BlockPlaceholder preview={preview} label={`Transferências: ${block.name}`}
      hint="Nenhum rumor ativo. Cadastre em Painel → Transferências para o bloco aparecer no site." />;
  }

  const limit = block.itemsLimit && block.itemsLimit > 0 ? block.itemsLimit : 5;
  const visiveis = rows.slice(0, limit);
  const selo = alphaOn(accent, "14");

  return (
    <section className="max-w-[1280px] mx-auto px-4 py-6">
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 sm:px-5 pt-4">
          <SectionHeading title={block.name || t("transfers.title")} color={accent} hideHeader={block.hideHeader} />
        </div>

        <ul className="px-4 sm:px-5 pb-1">
          {visiveis.map((r) => (
            <li key={r.id} className="flex items-center gap-3 sm:gap-4 py-3 border-b border-gray-100 last:border-0">
              {/* Foto (círculo). Sem foto, o círculo vira as iniciais do jogador
                  — a linha não pode ficar torta por falta de imagem. */}
              {r.playerPhotoUrl ? (
                <img
                  src={transferPhotoUrl(r.playerPhotoUrl, 56)}
                  alt={r.playerName}
                  width={56}
                  height={56}
                  loading="lazy"
                  decoding="async"
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover shrink-0 bg-gray-100"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-full shrink-0 inline-flex items-center justify-center text-[13px] font-bold"
                  style={{ backgroundColor: alphaOn(accent, "1f") ?? "#e5e7eb", color: accent }}
                >
                  {clubMonogram(r.playerName)}
                </span>
              )}

              <div className="flex-1 min-w-0">
                <p className="text-[14px] sm:text-[15px] font-bold text-[#1a1a1a] leading-tight truncate">
                  {r.playerName}
                </p>
                <p className="text-[11px] text-gray-400 leading-tight mb-1">
                  {t(positionKey(r.position) as Parameters<typeof t>[0])}
                </p>
                <div className="flex items-center gap-1.5 min-w-0 text-[11px] sm:text-[12px] text-gray-600">
                  <ClubCrest name={r.from.name} crestUrl={r.from.crestUrl} accent={accent} />
                  <span className="truncate max-w-[80px] sm:max-w-[140px]">{r.from.name}</span>
                  <ArrowRight size={13} className="shrink-0 text-gray-300" aria-hidden="true" />
                  <ClubCrest name={r.to.name} crestUrl={r.to.crestUrl} accent={accent} />
                  <span className="truncate max-w-[80px] sm:max-w-[140px] font-semibold text-[#1a1a1a]">{r.to.name}</span>
                </div>
              </div>

              {/* Selo de probabilidade */}
              <div
                className="shrink-0 text-center rounded-xl px-2.5 sm:px-3 py-1.5"
                style={{ backgroundColor: selo ?? "#f3f4f6" }}
              >
                <span className="block text-[17px] sm:text-[19px] font-black leading-none tabular-nums" style={{ color: accent }}>
                  {r.probability}%
                </span>
                <span className="block text-[8px] sm:text-[9px] uppercase tracking-wider text-gray-400 mt-0.5">
                  {t("transfers.probability")}
                </span>
              </div>
            </li>
          ))}
        </ul>

        <div className="px-4 sm:px-5 py-3 border-t border-gray-100 bg-gray-50/60">
          <Link
            href="/transferencias"
            className="text-[11px] font-bold uppercase tracking-wider hover:underline"
            style={{ color: accent }}
          >
            {block.linkLabel?.trim() || t("transfers.seeAll")}
          </Link>
        </div>
      </div>
    </section>
  );
}
