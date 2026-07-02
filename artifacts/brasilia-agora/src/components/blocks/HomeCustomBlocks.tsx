/**
 * Renderizadores dos blocos personalizados da home (tipos não-"content").
 *
 * Cada tipo criado no painel "Adicionar bloco" tem aqui o seu render real:
 * imagem renderiza imagem, carrossel renderiza carrossel, vídeo renderiza
 * vídeo — nunca mais um bloco de artigos genérico.
 *
 * Segurança: links passam por safeLinkUrl (sem javascript:), iframes só com
 * https via safeEmbedUrl/parseVideoEmbedUrl, HTML livre sanitizado com
 * DOMPurify (sanitizeArticleHtml). No SSR o HTML livre rende vazio (fail-closed).
 */
import React, { useRef, useState } from "react";
import { Link } from "wouter";
import { FaFacebook, FaInstagram, FaYoutube, FaTiktok, FaWhatsapp } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";
import { ChevronLeft, ChevronRight } from "lucide-react";
import AdBanner from "../ads/AdBanner";
import CotacaoWidget from "../CotacaoWidget";
import { useSite } from "../../hooks/useSite";
import { safeTitleHtml, sanitizeArticleHtml } from "../../lib/sanitize";
import {
  type HomeBlock, parseVideoEmbedUrl, isDirectVideoFile, safeEmbedUrl, safeLinkUrl,
} from "../../lib/homeBlocks";
import type { AdSlotKey } from "../ads/useAds";
import { normalizeSocialUrl, type FooterSocialKey } from "../../lib/footerConfig";

export interface BlockArticle {
  id: string;
  slug?: string;
  title: string;
  summary?: string;
  image: string;
  chapeu: string;
  time: string;
}

const AD_SLOTS: readonly string[] = [
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
function SectionHeading({ title, color }: { title: string; color: string }) {
  if (!title) return null;
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-1 h-5" style={{ backgroundColor: color }} />
      <h2 className="text-[17px] font-bold text-[#1a1a1a] uppercase tracking-wider">{title}</h2>
    </div>
  );
}

// ─── Imagem ──────────────────────────────────────────────────────────────────
export function ImageBlock({ block, preview }: { block: HomeBlock; preview?: boolean }) {
  const src = (block.imageUrl ?? "").trim();
  if (!src) {
    return <BlockPlaceholder preview={preview} label={`Bloco de imagem: ${block.name}`}
      hint="Clique no bloco e envie uma imagem (ou cole uma URL) no painel." />;
  }
  const href = safeLinkUrl(block.linkUrl);
  const caption = (block.caption ?? "").trim();
  const format = block.format ?? "full_width_image";

  const img = (
    <img src={src} alt={caption || block.name} loading="lazy" decoding="async"
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

  const inner = href
    ? (/^https?:\/\//i.test(href)
      ? <a href={href} target="_blank" rel="noopener noreferrer" className="block hover:opacity-95 transition-opacity">{body}</a>
      : <Link href={href} className="block hover:opacity-95 transition-opacity">{body}</Link>)
    : body;

  return (
    <section className={format === "full_width_image" ? "py-4" : "max-w-[1280px] mx-auto px-4 py-6"}>
      {format === "full_width_image" ? inner : inner}
    </section>
  );
}

// ─── Carrossel de notícias ───────────────────────────────────────────────────
export function CarouselBlock({ block, articles, preview }: {
  block: HomeBlock; articles: BlockArticle[]; preview?: boolean;
}) {
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
            <button type="button" aria-label="Anterior" onClick={() => scrollBy(-1)}
              className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors">
              <ChevronLeft size={16} />
            </button>
            <button type="button" aria-label="Próximo" onClick={() => scrollBy(1)}
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

// ─── HTML livre (sanitizado) ─────────────────────────────────────────────────
export function HtmlBlock({ block, preview }: { block: HomeBlock; preview?: boolean }) {
  const clean = sanitizeArticleHtml(block.html);
  if (!clean) {
    return <BlockPlaceholder preview={preview} label={`Bloco HTML: ${block.name}`}
      hint="Adicione o código HTML no painel (scripts são removidos por segurança)." />;
  }
  return (
    <section className="max-w-[1280px] mx-auto px-4 py-6">
      <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: clean }} />
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
export function TickerBlock({ block, articles, preview }: {
  block: HomeBlock; articles: BlockArticle[]; preview?: boolean;
}) {
  const color = block.color ?? "#E71D36";
  const items = articles.slice(0, block.itemsLimit ?? 10);
  if (items.length === 0) {
    return <BlockPlaceholder preview={preview} label={`Ticker: ${block.name}`}
      hint="Sem notícias para exibir na faixa rolante." />;
  }
  // Lista duplicada para o loop contínuo da animação.
  const loop = [...items, ...items];
  return (
    <section className="py-2">
      <style>{`@keyframes hb-ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`}</style>
      <div className="flex items-center overflow-hidden border-y border-gray-200 bg-white">
        <span className="shrink-0 text-[11px] font-black text-white uppercase tracking-wider px-3 py-2"
          style={{ backgroundColor: color }}>
          {block.name || "Últimas"}
        </span>
        <div className="flex whitespace-nowrap" style={{ animation: `hb-ticker ${Math.max(20, items.length * 6)}s linear infinite` }}>
          {loop.map((a, i) => (
            <Link key={`${a.id}-${i}`} href={`/artigo/${a.slug ?? a.id}`}
              className="text-[13px] text-gray-700 hover:text-black px-4 py-2 inline-flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span dangerouslySetInnerHTML={{ __html: safeTitleHtml(a.title) }} />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Newsletter ──────────────────────────────────────────────────────────────
function getSessionId(): string {
  try {
    let id = sessionStorage.getItem("bee_session_id");
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem("bee_session_id", id);
    }
    return id;
  } catch { return "unknown"; }
}

export function NewsletterBlock({ block }: { block: HomeBlock }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "err">("idle");
  const color = block.color ?? "#0B2A66";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = email.trim();
    if (!v || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setStatus("err"); return; }
    setStatus("sending");
    try {
      await fetch("/api/analytics/behavior", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType: "newsletter", value: v, sessionId: getSessionId() }),
      });
      setStatus("ok");
      setEmail("");
    } catch { setStatus("err"); }
  }

  return (
    <section className="py-8" style={{ backgroundColor: color }}>
      <div className="max-w-[1280px] mx-auto px-4 flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
        <div className="flex-1">
          <p className="text-lg font-black text-white">{block.name || "Newsletter"}</p>
          <p className="text-sm text-white/80 mt-1">{block.caption || "Receba as principais notícias no seu e-mail."}</p>
        </div>
        {status === "ok" ? (
          <p className="text-sm font-bold text-white bg-white/15 rounded-lg px-4 py-3">Inscrição registrada. Obrigado!</p>
        ) : (
          <form onSubmit={submit} className="flex w-full md:w-auto md:min-w-[380px]">
            <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); if (status === "err") setStatus("idle"); }}
              placeholder="Seu e-mail" aria-label="Seu e-mail para a newsletter" required
              className="flex-1 bg-white/10 border border-white/25 text-white placeholder-white/50 px-4 py-2.5 text-sm rounded-l-lg focus:outline-none focus:border-white" />
            <button type="submit" disabled={status === "sending"}
              className="bg-white text-sm font-bold px-5 py-2.5 rounded-r-lg hover:bg-white/90 disabled:opacity-60 transition-colors"
              style={{ color }}>
              {status === "sending" ? "Enviando…" : "Assinar"}
            </button>
          </form>
        )}
        {status === "err" && <p className="text-xs text-white/90 md:ml-2">Informe um e-mail válido.</p>}
      </div>
    </section>
  );
}

// ─── Categorias (navegação) ──────────────────────────────────────────────────
export function CategoriesBlock({ block }: { block: HomeBlock }) {
  const { settings } = useSite();
  const items = (settings?.menuItems ?? []).filter((m) => m.path !== "/");
  const color = block.color ?? "#0B2A66";
  if (items.length === 0) return null;
  return (
    <section className="border-t border-gray-200 py-8">
      <div className="max-w-[1280px] mx-auto px-4">
        <SectionHeading title={block.name} color={color} />
        <div className="flex flex-wrap gap-2">
          {items.map((m) => (
            <Link key={m.path} href={m.path}
              className="px-4 py-2 rounded-full border border-gray-200 text-[13px] font-semibold text-gray-700 hover:text-white transition-colors"
              style={{ ["--hover-bg" as string]: color }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = color; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = ""; }}>
              {m.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Redes sociais ───────────────────────────────────────────────────────────
const SOCIAL_ICONS: Record<FooterSocialKey, React.ElementType> = {
  instagram: FaInstagram, facebook: FaFacebook, x: FaXTwitter,
  youtube: FaYoutube, tiktok: FaTiktok, whatsapp: FaWhatsapp,
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
        <SectionHeading title={block.name} color={color} />
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
      <AdBanner slot={slot} />
      {preview && !block.adSlot && (
        <p className="text-center text-[11px] text-slate-400 mt-1">
          Espaço de anúncio ({slot}) — escolha o slot e cadastre a arte em Propagandas.
        </p>
      )}
    </div>
  );
}
