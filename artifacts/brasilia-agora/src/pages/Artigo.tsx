import React, { useMemo, useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { FaFacebook, FaTwitter, FaWhatsapp, FaLink } from "react-icons/fa";
import TopBar from "../components/TopBar";
import Header from "../components/Header";
import NavBar from "../components/NavBar";
import Footer from "../components/Footer";
import { useArticle } from "../hooks/useArticles";
import {
  brasilArticles,
  mundoArticles,
  politicaArticles,
  economiaArticles,
  esporteArticles,
  culturaArticles,
  saudeArticles,
  tecnologiaArticles,
  dfArticles,
} from "../data/mockData";

const ALL_MOCK = [
  ...brasilArticles,
  ...mundoArticles,
  ...politicaArticles,
  ...economiaArticles,
  ...esporteArticles,
  ...culturaArticles,
  ...saudeArticles,
  ...tecnologiaArticles,
  ...dfArticles,
];

const MAIS_LIDAS = ALL_MOCK.slice(0, 8);

const AD_SLOTS = [
  { label: "Anuncie aqui", size: "300 \u00d7 250", bg: "#f0f4ff", accent: "#0b3d91" },
  { label: "Publicidade", size: "300 \u00d7 250", bg: "#fff4f4", accent: "#c8102e" },
  { label: "Espa\u00e7o publicit\u00e1rio", size: "300 \u00d7 250", bg: "#f0fff8", accent: "#16a34a" },
];

const AD_FOOTER = [
  { label: "Anuncie aqui", size: "970 \u00d7 90", bg: "#f0f4ff", accent: "#0b3d91" },
  { label: "Publicidade", size: "970 \u00d7 90", bg: "#fff4f4", accent: "#c8102e" },
  { label: "Espa\u00e7o publicit\u00e1rio", size: "970 \u00d7 90", bg: "#f0fff8", accent: "#16a34a" },
];

function RotatingAd({
  slots,
  height,
  intervalMs = 5000,
}: {
  slots: typeof AD_SLOTS;
  height: string;
  intervalMs?: number;
}) {
  const [idx, setIdx] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % slots.length);
        setFade(true);
      }, 300);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [slots.length, intervalMs]);

  const slot = slots[idx];

  return (
    <div
      className="w-full rounded-sm border border-gray-100 flex flex-col items-center justify-center gap-2 transition-opacity duration-300"
      style={{ height, backgroundColor: slot.bg, opacity: fade ? 1 : 0 }}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center"
        style={{ backgroundColor: slot.accent + "22" }}
      >
        <span className="text-xs font-black" style={{ color: slot.accent }}>AD</span>
      </div>
      <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: slot.accent }}>
        {slot.label}
      </p>
      <p className="text-[9px] text-gray-400">{slot.size}</p>
      <div className="flex gap-1 mt-1">
        {slots.map((_, i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full transition-colors"
            style={{ backgroundColor: i === idx ? slot.accent : "#d1d5db" }}
          />
        ))}
      </div>
    </div>
  );
}

const editoriaColor: Record<string, string> = {
  brasil: "#16a34a",
  mundo: "#6b21a8",
  politica: "#1d4ed8",
  economia: "#b45309",
  esporte: "#dc2626",
  cultura: "#0d9488",
  saude: "#16a34a",
  tecnologia: "#0284c7",
  df: "#0b3d91",
};

function ArticleSidebar() {
  return (
    <aside className="w-full lg:w-[300px] shrink-0 space-y-6">
      {/* Mais Lidas */}
      <div className="border border-gray-100 rounded-sm overflow-hidden">
        <div className="flex items-center gap-2 bg-[#1a1a1a] px-4 py-3">
          <div className="w-1 h-4 bg-[#c8102e]" />
          <h3 className="text-white text-[13px] font-bold uppercase tracking-wider">
            Mais Lidas
          </h3>
        </div>
        <div className="divide-y divide-gray-100">
          {MAIS_LIDAS.map((item, idx) => (
            <Link
              key={item.id}
              href={`/artigo/${item.id}`}
              className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group"
            >
              <span
                className="text-[22px] font-black leading-none shrink-0 mt-0.5"
                style={{
                  color: idx < 3 ? "#c8102e" : "#d1d5db",
                }}
              >
                {idx + 1}
              </span>
              <p className="text-[13px] text-[#1a1a1a] font-semibold leading-snug group-hover:text-[#c8102e] transition-colors line-clamp-3">
                {item.title}
              </p>
            </Link>
          ))}
        </div>
      </div>

      {/* Propaganda rotativa */}
      <div className="sticky top-24">
        <RotatingAd slots={AD_SLOTS} height="260px" intervalMs={5000} />
      </div>
    </aside>
  );
}

function ArticleSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-4 bg-gray-100 rounded w-1/3" />
      <div className="h-6 bg-gray-200 rounded w-20" />
      <div className="h-10 bg-gray-200 rounded w-full" />
      <div className="h-8 bg-gray-200 rounded w-3/4" />
      <div className="h-px bg-gray-100 w-full my-4" />
      <div className="aspect-[16/9] bg-gray-100 rounded" />
      <div className="space-y-3 mt-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-4 bg-gray-100 rounded" style={{ width: `${85 + (i % 3) * 5}%` }} />
        ))}
      </div>
    </div>
  );
}

export default function Artigo() {
  const { slug } = useParams();

  /* ── Resolução instantânea via mock ───────────────────────────────── */
  const mockFallback = useMemo(
    () => ALL_MOCK.find((a) => a.id === slug) ?? null,
    [slug]
  );

  const { article: apiArticle, loading } = useArticle(slug ?? "");

  /* Usa API se disponível, senão converte o mock para o mesmo shape */
  const article = apiArticle
    ? apiArticle
    : mockFallback
    ? {
        id: mockFallback.id,
        title: mockFallback.title,
        subtitle: mockFallback.summary,
        content: mockFallback.summary +
          " Lorem ipsum dolor sit amet, consectetur adipiscing elit. Pellentesque euismod, nisi vel consectetur interdum, nisl nisi aliquam nisl, nec aliquam nisl nisl sit amet nisl. Sed euismod, nisl vel consectetur interdum, nisl nisi aliquam nisl. " +
          "Vivamus lacinia odio vitae vestibulum. Donec in efficitur leo, in commodo odio. Morbi imperdiet, augue quis sagittis pulvinar, sapien odio blandit nisi, id venenatis justo purus volutpat enim. " +
          "Praesent commodo cursus magna, vel scelerisque nisl consectetur et. Nullam quis risus eget urna mollis ornare vel eu leo. Donec ullamcorper nulla non metus auctor fringilla.",
        category: mockFallback.chapeu.toLowerCase(),
        tag: mockFallback.chapeu,
        imageUrl: typeof mockFallback.image === "string"
          ? mockFallback.image
          : (mockFallback.image as { src?: string })?.src ?? "",
        author: mockFallback.author,
        publishedAt: new Date().toISOString(),
      }
    : null;

  /* Mostra skeleton apenas se não tem mock e a API ainda carrega */
  const showSkeleton = loading && !mockFallback;

  const chapeuColor =
    editoriaColor[article?.category?.toLowerCase() ?? ""] ?? "#c8102e";

  const paragraphs = article
    ? article.content
        .split(/\n\n+/)
        .filter(Boolean)
    : [];

  return (
    <div className="min-h-screen w-full bg-white flex flex-col">
      <TopBar />
      <Header />
      <NavBar />
      <main className="flex-1 bg-white pb-16">
        <div className="max-w-[1280px] mx-auto px-4 mt-6">
          <div className="flex flex-col lg:flex-row gap-8">

            {/* ── CONTEÚDO PRINCIPAL ─────────────────────────────────── */}
            <article className="w-full lg:flex-1 min-w-0 pl-[0px] pr-[0px] pt-[0px] pb-[0px] ml-[0px] mr-[56px] mb-[0px]">
              {showSkeleton ? (
                <ArticleSkeleton />
              ) : !article ? (
                <div className="flex flex-col items-center justify-center py-24 text-gray-400">
                  <p className="text-2xl font-bold mb-2">Artigo não encontrado</p>
                  <Link href="/" className="text-[#1d4ed8] text-sm hover:underline">
                    Voltar à página inicial
                  </Link>
                </div>
              ) : (
                <>
                  {/* Breadcrumb */}
                  <nav className="text-gray-400 text-xs mb-4 flex items-center gap-1.5 flex-wrap">
                    <Link href="/" className="hover:text-[#1d4ed8]">Início</Link>
                    <span>/</span>
                    <Link
                      href={`/${article.category}`}
                      className="hover:text-[#1d4ed8] capitalize"
                    >
                      {article.tag}
                    </Link>
                    <span>/</span>
                    <span className="text-gray-300 truncate max-w-[240px]">
                      {article.title}
                    </span>
                  </nav>

                  {/* Chapéu */}
                  <span
                    className="inline-block text-white text-[11px] font-bold px-3 py-1 rounded-sm mb-3 uppercase tracking-wider"
                    style={{ backgroundColor: chapeuColor }}
                  >
                    {article.tag}
                  </span>

                  {/* Título */}
                  <h1 className="font-black text-[#1a2448] leading-tight mb-3 tracking-tight"
                    style={{ fontSize: "clamp(1.6rem, 3vw, 2.6rem)" }}>
                    {article.title}
                  </h1>

                  {/* Subtítulo */}
                  {article.subtitle && (
                    <p className="text-[17px] text-gray-600 leading-relaxed mb-5 border-l-4 pl-4"
                      style={{ borderColor: chapeuColor }}>
                      {article.subtitle}
                    </p>
                  )}

                  {/* Autor + compartilhamento */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3 border-y border-gray-100 mb-6 gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#0b3d91] flex items-center justify-center shrink-0">
                        <span className="text-white text-xs font-bold">
                          {article.author.slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="font-bold text-sm text-[#1a2448]">
                          Por {article.author}
                        </div>
                        <div className="text-xs text-gray-400">
                          {new Date(article.publishedAt).toLocaleDateString("pt-BR", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-gray-400 tracking-widest uppercase mr-1">
                        Compartilhe:
                      </span>
                      <button className="w-8 h-8 rounded-full bg-[#1877f2] text-white flex items-center justify-center hover:opacity-80 transition-opacity">
                        <FaFacebook size={13} />
                      </button>
                      <button className="w-8 h-8 rounded-full bg-[#1da1f2] text-white flex items-center justify-center hover:opacity-80 transition-opacity">
                        <FaTwitter size={13} />
                      </button>
                      <button className="w-8 h-8 rounded-full bg-[#25d366] text-white flex items-center justify-center hover:opacity-80 transition-opacity">
                        <FaWhatsapp size={13} />
                      </button>
                      <button className="w-8 h-8 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center hover:bg-gray-300 transition-colors">
                        <FaLink size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Imagem principal */}
                  {article.imageUrl && (
                    <figure className="w-full aspect-[16/9] mb-6 overflow-hidden bg-gray-100">
                      <img
                        src={article.imageUrl}
                        alt={article.title}
                        className="w-full h-full object-cover"
                        loading="eager"
                      />
                    </figure>
                  )}

                  {/* Corpo */}
                  <div className="prose prose-lg max-w-none text-[#1a1a1a]">
                    {paragraphs.length > 0
                      ? paragraphs.map((p, i) => (
                          <p key={i} className="mb-5 leading-relaxed text-[16px]">{p}</p>
                        ))
                      : (
                        <p className="mb-5 leading-relaxed text-[16px]">
                          {article.content}
                        </p>
                      )}
                  </div>

                  {/* Tags + compartilhamento inferior */}
                  <div className="mt-8 pt-6 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                    <div className="flex flex-wrap gap-2">
                      {[article.tag, "Brasília", "Notícias"].map((tag) => (
                        <span
                          key={tag}
                          className="text-[11px] font-semibold text-gray-500 border border-gray-200 px-3 py-1 rounded-full hover:border-gray-400 cursor-pointer transition-colors"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-bold text-gray-400 tracking-widest uppercase mr-1">
                        Compartilhe:
                      </span>
                      <button className="w-8 h-8 rounded-full bg-[#1877f2] text-white flex items-center justify-center hover:opacity-80 transition-opacity">
                        <FaFacebook size={13} />
                      </button>
                      <button className="w-8 h-8 rounded-full bg-[#1da1f2] text-white flex items-center justify-center hover:opacity-80 transition-opacity">
                        <FaTwitter size={13} />
                      </button>
                      <button className="w-8 h-8 rounded-full bg-[#25d366] text-white flex items-center justify-center hover:opacity-80 transition-opacity">
                        <FaWhatsapp size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Propaganda rotativa — rodapé do artigo */}
                  <div className="mt-8">
                    <p className="text-[9px] text-gray-300 uppercase tracking-widest text-center mb-1">
                      Publicidade
                    </p>
                    <RotatingAd slots={AD_FOOTER} height="90px" intervalMs={7000} />
                  </div>
                </>
              )}
            </article>

            {/* ── SIDEBAR ────────────────────────────────────────────── */}
            <ArticleSidebar />

          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
