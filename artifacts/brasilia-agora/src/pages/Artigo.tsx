import React, { useMemo, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useAnalytics, useScrollDepth } from "../hooks/useAnalytics";
import { FaFacebook, FaTwitter, FaWhatsapp, FaLink } from "react-icons/fa";
import TopBar from "../components/TopBar";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useArticle } from "../hooks/useArticles";
import { useSite } from "../hooks/useSite";
import { categoryRoute } from "../lib/categoryRoute";
import AdBanner from "../components/ads/AdBanner";
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
              <p className="text-[13px] text-[#1a1a1a] font-semibold leading-snug group-hover:text-[#c8102e] transition-colors line-clamp-3"
                dangerouslySetInnerHTML={{ __html: item.title }}
              />
            </Link>
          ))}
        </div>
      </div>

      {/* Propaganda sidebar — gerenciada pelo painel */}
      <div className="sticky top-24">
        <p className="text-[9px] text-gray-300 uppercase tracking-widest text-center mb-1">Publicidade</p>
        <AdBanner slot="slot_07" placeholder="Publicidade" />
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
  const { settings } = useSite();
  const { trackArticle, trackShare } = useAnalytics();
  useScrollDepth(slug);

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

  /* Track article once resolved */
  useEffect(() => {
    if (article) {
      trackArticle(article.id, article.title, article.category ?? "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article?.id]);

  /* Mostra skeleton apenas se não tem mock e a API ainda carrega */
  const showSkeleton = loading && !mockFallback;

  const chapeuColor =
    editoriaColor[article?.category?.toLowerCase() ?? ""] ?? "#c8102e";

  // ── Content renderer ─────────────────────────────────────────────────────
  // Handles: HTML content (from AI rewrite) and legacy markdown format

  /** Detect if content is HTML (AI rewrite output) */
  function isHtmlContent(s: string): boolean {
    return /^\s*<[hpbuol]/i.test(s.trimStart());
  }

  function renderInline(text: string): React.ReactNode[] {
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*|\[[^\]]+\]\([^)]+\))/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**"))
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      if (part.startsWith("*") && part.endsWith("*"))
        return <em key={i}>{part.slice(1, -1)}</em>;
      const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link)
        return <a key={i} href={link[2]} target="_blank" rel="noreferrer" className="text-[#0b3d91] underline hover:text-[#c8102e] transition-colors">{link[1]}</a>;
      return part;
    });
  }

  /** Remove trailing navigation/widget noise from scraped content */
  function cleanContent(raw: string): string {
    // Truncate at common Brazilian news-site end-of-article markers
    const SENTINELS = [
      /\bRelacionadas?\b/,
      /\bVer mais\b/i,
      /\bMais not[ií]cias?\b/i,
      /\bDestaques EBC\b/i,
      /\bRadioagência\b/i,
      /\bTV Brasil\b/i,
      /\bCompartilhe essa not[ií]cia\b/i,
      /\bContinuar lendo\b/i,
      /\bLeia (também|mais)\b/i,
      /\bEdi[çc][aã]o:\s/i,
      /\bEdição:/i,
      /\bPublicidade\b/i,
      /\bNewsletter\b/i,
      /\bSiga o canal\b/i,
      /\bSiga nosso\b/i,
      /seg,\s+\d{2}\/\d{2}\/\d{4}\s+-\s+\d{2}:\d{2}/i,  // "seg, 15/06/2026 - 14:00"
    ];
    let text = raw;
    for (const s of SENTINELS) {
      const m = s.exec(text);
      if (m && m.index > 200) {
        text = text.slice(0, m.index).trim();
        break;
      }
    }
    // Strip leading metadata block (category label, title echo, byline, date, city, "Versão em áudio")
    // Strategy: find "Versão em áudio" in first 1000 chars — everything before it is header noise
    const audioIdx = text.search(/Versão em áudio/i);
    if (audioIdx > 0 && audioIdx < 1000) {
      text = text.slice(audioIdx + "Versão em áudio".length).trim();
    } else {
      // Fallback: strip byline/date patterns
      text = text
        .replace(/^[\s\S]{0,300}?Publicado em \d{2}\/\d{2}\/\d{4}[^.\n]{0,80}/i, "")
        .trim();
    }

    // Strip reporter bylines: "Nome Sobrenome – Repórter da Agência"
    text = text.replace(/^[^.!?]{0,80}–\s*(Repórter|Correspondente|Colaborad[oa]r|Editor)\b[^.\n]{0,100}/i, "").trim();

    text = text
      .replace(/Publicado em \d{2}\/\d{2}\/\d{4}[^.\n]*?(Versão em áudio\s*)?/gi, "")
      .replace(/>>?\s*Siga .{0,100}/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    return text;
  }

  /** Split a wall-of-text into readable paragraphs using sentence boundaries */
  function smartSplit(text: string): string[] {
    // Split on ". Uppercase", "? Uppercase", "! Uppercase" — handles PT-BR
    const sentences = text.split(
      /(?<=[.!?])\s+(?=[A-ZÁÀÂÃÉÈÊÍÌÓÒÔÕÚÙÇ"'"'0-9(])/g
    );
    const paras: string[] = [];
    const PER_PARA = 4; // sentences per paragraph
    for (let i = 0; i < sentences.length; i += PER_PARA) {
      const chunk = sentences.slice(i, i + PER_PARA).join(" ").trim();
      if (chunk) paras.push(chunk);
    }
    return paras;
  }

  function renderContent(raw: string): React.ReactNode[] {
    // Handle JSON-wrapped content (AI rewrite saved full JSON response instead of just HTML)
    const stripped = raw.trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    if (stripped.startsWith("{")) {
      try {
        const parsed = JSON.parse(stripped) as Record<string, unknown>;
        const html = (parsed.content_html ?? parsed.contentHtml ?? parsed.content ?? "") as string;
        if (html) return renderContent(html);
      } catch {}
    }

    // HTML content (from AI JSON rewrite) — render directly with styles
    if (isHtmlContent(raw)) {
      return [
        <div
          key="html-body"
          className="article-body"
          style={{ "--chapeu": chapeuColor } as React.CSSProperties}
          dangerouslySetInnerHTML={{ __html: raw }}
        />,
      ];
    }

    // 1. Clean noise first (works on both old stored articles and new ones)
    const cleaned = cleanContent(raw);

    // 2. If content has no line breaks → scraped wall of text, split by sentences
    const hasStructure = /\n/.test(cleaned);
    const lines = hasStructure
      ? cleaned.split(/\n\n+|\n/).map((l) => l.trim()).filter(Boolean)
      : smartSplit(cleaned);

    const nodes: React.ReactNode[] = [];
    let listItems: string[] = [];

    function flushList() {
      if (listItems.length === 0) return;
      nodes.push(
        <ul key={`ul-${nodes.length}`} className="list-disc pl-6 mb-5 space-y-1.5">
          {listItems.map((item, i) => (
            <li key={i} className="text-[16px] leading-relaxed text-[#2a2a2a]">
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
      listItems = [];
    }

    for (const line of lines) {
      // ## H2
      if (line.startsWith("## ")) {
        flushList();
        const text = line.replace(/^##\s+/, "");
        nodes.push(
          <h2 key={`h2-${nodes.length}`}
            className="text-[20px] font-bold text-[#1a2448] mt-8 mb-3 leading-snug border-l-4 pl-3"
            style={{ borderColor: chapeuColor }}
          >
            {text}
          </h2>
        );
      // ### H3
      } else if (line.startsWith("### ")) {
        flushList();
        const text = line.replace(/^###\s+/, "");
        nodes.push(
          <h3 key={`h3-${nodes.length}`}
            className="text-[17px] font-bold text-[#1a2448] mt-6 mb-2 leading-snug"
          >
            {text}
          </h3>
        );
      // #### H4
      } else if (line.startsWith("#### ")) {
        flushList();
        const text = line.replace(/^####\s+/, "");
        nodes.push(
          <h4 key={`h4-${nodes.length}`}
            className="text-[15px] font-semibold text-gray-700 mt-4 mb-1.5 leading-snug uppercase tracking-wide"
          >
            {text}
          </h4>
        );
      // - Lista
      } else if (/^[-•]\s+/.test(line)) {
        listItems.push(line.replace(/^[-•]\s+/, ""));
      // Parágrafo normal
      } else {
        flushList();
        nodes.push(
          <p key={`p-${nodes.length}`}
            className="mb-5 leading-relaxed text-[16.5px] text-[#2a2a2a]"
          >
            {renderInline(line)}
          </p>
        );
      }
    }
    flushList();
    return nodes;
  }

  const canonicalUrl = article
    ? `https://brasilia-agora.com/artigo/${article.id}`
    : null;

  const newsArticleSchema = article
    ? {
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        headline: article.title,
        description: article.subtitle ?? "",
        image: article.imageUrl ? [article.imageUrl] : [],
        datePublished: article.publishedAt,
        dateModified: article.publishedAt,
        author: {
          "@type": "Person",
          name: article.author ?? "Redação Brasília Agora",
        },
        publisher: {
          "@type": "Organization",
          name: "Brasília Agora",
          logo: {
            "@type": "ImageObject",
            url: "https://brasilia-agora.com/favicon.jpg",
          },
        },
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": canonicalUrl,
        },
      }
    : null;

  const breadcrumbSchema = article
    ? {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Início",
            item: "https://brasilia-agora.com/",
          },
          {
            "@type": "ListItem",
            position: 2,
            name: article.tag,
            item: `https://brasilia-agora.com${categoryRoute(article.category)}`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: article.title,
            item: canonicalUrl,
          },
        ],
      }
    : null;

  return (
    <div className="min-h-screen w-full bg-white flex flex-col">
      {newsArticleSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(newsArticleSchema) }}
        />
      )}
      {breadcrumbSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
        />
      )}
      <TopBar />
      <Header />
      <main className="flex-1 bg-white pb-16">
        <div className="max-w-[1280px] mx-auto px-4 mt-6">
          <div className="flex flex-col lg:flex-row gap-8">

            {/* ── CONTEÚDO PRINCIPAL ─────────────────────────────────── */}
            <article className="w-full lg:flex-1 min-w-0 pl-[0px] pr-[0px] pt-[0px] pb-[0px] ml-[0px] mb-[0px] mr-[106px]">
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
                      href={categoryRoute(article.category)}
                      className="hover:text-[#1d4ed8] capitalize"
                    >
                      {article.tag}
                    </Link>
                    <span>/</span>
                    <span className="text-gray-300 truncate max-w-[240px]">
                      {article.title.replace(/<[^>]*>/g, "")}
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
                    style={{ fontSize: "clamp(1.6rem, 3vw, 2.6rem)" }}
                    dangerouslySetInnerHTML={{ __html: article.title }}
                  />

                  {/* Subtítulo */}
                  {article.subtitle && (
                    <p className="text-[17px] text-gray-600 leading-relaxed mb-5 border-l-4 pl-4"
                      style={{ borderColor: chapeuColor }}
                      dangerouslySetInnerHTML={{ __html: article.subtitle }}
                    />
                  )}

                  {/* Autor + compartilhamento */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3 border-y border-gray-100 mb-6 gap-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={settings?.bylineLogoBase64 || settings?.logoBase64 || settings?.faviconBase64 || "/favicon.jpg"}
                        alt={settings?.bylineName || settings?.siteName || "Portal"}
                        className="w-9 h-9 rounded-full object-cover shrink-0"
                      />
                      <div>
                        <div className="font-bold text-sm text-[#1a2448]">
                          Por {settings?.bylineName || settings?.siteName || "Redação"}
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
                      <button
                        onClick={() => {
                          const url = encodeURIComponent(window.location.href);
                          window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, "_blank", "noopener");
                          trackShare("facebook");
                        }}
                        className="w-8 h-8 rounded-full bg-[#1877f2] text-white flex items-center justify-center hover:opacity-80 transition-opacity"
                        title="Compartilhar no Facebook"
                      >
                        <FaFacebook size={13} />
                      </button>
                      <button
                        onClick={() => {
                          const url = encodeURIComponent(window.location.href);
                          const text = encodeURIComponent(article?.title ?? "");
                          window.open(`https://twitter.com/intent/tweet?url=${url}&text=${text}`, "_blank", "noopener");
                          trackShare("twitter");
                        }}
                        className="w-8 h-8 rounded-full bg-[#1da1f2] text-white flex items-center justify-center hover:opacity-80 transition-opacity"
                        title="Compartilhar no Twitter/X"
                      >
                        <FaTwitter size={13} />
                      </button>
                      <button
                        onClick={() => {
                          const url = encodeURIComponent(window.location.href);
                          const text = encodeURIComponent((article?.title ?? "") + " ");
                          window.open(`https://api.whatsapp.com/send?text=${text}${url}`, "_blank", "noopener");
                          trackShare("whatsapp");
                        }}
                        className="w-8 h-8 rounded-full bg-[#25d366] text-white flex items-center justify-center hover:opacity-80 transition-opacity"
                        title="Compartilhar no WhatsApp"
                      >
                        <FaWhatsapp size={13} />
                      </button>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(window.location.href).catch(() => {});
                          trackShare("copy");
                        }}
                        className="w-8 h-8 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center hover:bg-gray-300 transition-colors"
                        title="Copiar link"
                      >
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

                  {/* Propaganda in-content — entre a imagem e o corpo */}
                  <div className="mb-5">
                    <p className="text-[9px] text-gray-300 uppercase tracking-widest text-center mb-1">Publicidade</p>
                    <AdBanner slot="slot_10" />
                  </div>

                  {/* Corpo */}
                  <div className="max-w-none">
                    {renderContent(article.content)}
                  </div>

                  {/* Crédito de fonte — só para artigos RSS não reescritos */}
                  {article.origin === "rss" && !article.aiRewritten && article.rssSourceName && (
                    <div className="mt-6 pt-4 border-t border-gray-100">
                      <p className="text-[12px] text-gray-400 italic">
                        Conteúdo originalmente publicado por{" "}
                        {article.rssSourceUrl ? (
                          <a
                            href={article.rssSourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#0b3d91] hover:underline font-medium"
                          >
                            {article.rssSourceName}
                          </a>
                        ) : (
                          <span className="font-medium text-gray-500">{article.rssSourceName}</span>
                        )}
                        . Reproduzido com fins informativos.
                      </p>
                    </div>
                  )}

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

                  {/* Banner horizontal — gerenciado pelo painel */}
                  <div className="mt-8">
                    <p className="text-[9px] text-gray-300 uppercase tracking-widest text-center mb-1">
                      Publicidade
                    </p>
                    <AdBanner slot="slot_06" placeholder="Publicidade" />
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
