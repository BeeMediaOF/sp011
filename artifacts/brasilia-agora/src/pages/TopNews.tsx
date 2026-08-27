/**
 * Aba "Top News" — as notícias mais lidas DESTE blog.
 *
 * Rota `/top-news`, a mesma nos blogs pt-BR e no ksports (EN): a imagem é UMA
 * para os 11 blogs, e um path que mudasse por idioma teria que ser resolvido em
 * tempo de execução em três lugares (App, `ssrRoutes`, `categoryRoutes`). O
 * rótulo do menu é dado do blog (`menu_items`); o path é código.
 *
 * A página NÃO tem SSR (é `static` no `classifySsrPath`, como /arquivo): o
 * ranking depende de uma agregação do analytics que muda a cada 5 min, e
 * pré-renderizar uma lista volátil só multiplicaria entradas de cache. Ela
 * também não entra no sitemap — `top-news` está em `RESERVED_SLUGS`
 * (`lib/sitemapXml.ts`), então nenhuma editoria homônima pode publicá-la.
 *
 * Nada de cor de marca embutida: a faixa e o acento saem das settings do
 * próprio blog, e a tinta sobre a faixa é decidida por luminância (`inkOn`) —
 * um blog de rodapé claro continua legível.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import TopBar from "../components/TopBar";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useSite } from "../hooks/useSite";
import { useT, formatShortDate } from "../lib/i18n";
import { categoryColor } from "../hooks/useCategories";
import { safeTitleHtml } from "@/lib/sanitize";
import { coverSrcSet, aspectClass, proxyUrl, COVER_Q } from "../lib/newsImage";
import { inkOn } from "../lib/colorContrast";

interface TopArticle {
  id: string;
  slug?: string;
  title: string;
  subtitle?: string;
  category?: string;
  tag?: string;
  imageUrl?: string;
  publishedAt: string;
  rank: number;
  views: number;
  windowViews: number;
}

interface TopResponse { articles?: TopArticle[]; days?: number }

/** Janelas oferecidas na aba. `0` = todos os tempos (o servidor pula a consulta
 *  ao analytics e ranqueia só pelo acumulado). */
const WINDOWS = [7, 30, 0] as const;

const TOP_LIMIT = 24;

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "");
}

function href(a: TopArticle): string {
  return `/artigo/${a.slug || a.id}`;
}

function chapeu(a: TopArticle): string {
  return (a.tag || a.category || "").toUpperCase();
}

/** Contagem exibida: a da janela quando há janela, senão o acumulado. Mostrar o
 *  acumulado ao lado de um ranking de 7 dias faria os números contradizerem a
 *  ordem da lista. */
function reads(a: TopArticle, days: number): number {
  return days > 0 ? a.windowViews : a.views;
}

/** Card grande do #1 e dos dois vice-líderes. */
function PodiumCard({
  a, days, accent, big,
}: { a: TopArticle; days: number; accent: string; big: boolean }) {
  const { t, lang, tz } = useT();
  const cor = categoryColor(a.category ?? "");
  const n = reads(a, days);
  const aspect = big ? "16/9" : "3/2";
  return (
    <Link href={href(a)} className="group block">
      <div className={`relative w-full ${aspectClass(aspect)} overflow-hidden rounded-lg bg-gray-100`}>
        {a.imageUrl && (
          <img
            src={proxyUrl(a.imageUrl, big ? 960 : 640, COVER_Q)}
            srcSet={coverSrcSet(a.imageUrl, aspect) || undefined}
            sizes={big ? "(max-width: 1024px) 100vw, 760px" : "(max-width: 640px) 100vw, 380px"}
            alt={stripTags(a.title)}
            width={big ? 760 : 380}
            height={big ? 428 : 253}
            loading={big ? "eager" : "lazy"}
            fetchPriority={big ? "high" : "auto"}
            decoding={big ? "sync" : "async"}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

        {/* A posição é a informação principal da página — ela vem antes do
            chapéu, e no #1 vira selo com o rótulo por extenso. */}
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <span
            className={`inline-flex items-center justify-center font-black leading-none text-white rounded ${big ? "w-11 h-11 text-[22px]" : "w-8 h-8 text-[15px]"}`}
            style={{ backgroundColor: accent }}
          >
            {a.rank}
          </span>
          {big && (
            <span
              className="text-[10px] font-black uppercase tracking-[0.12em] text-white px-2 py-1 rounded"
              style={{ backgroundColor: accent }}
            >
              {t("topNews.leader")}
            </span>
          )}
        </div>

        <div className={`absolute bottom-0 left-0 right-0 ${big ? "p-5 sm:p-6" : "p-4"}`}>
          {chapeu(a) && (
            <span
              className="inline-block text-white text-[10px] font-bold px-2 py-0.5 mb-2 uppercase tracking-wider rounded-sm"
              style={{ backgroundColor: cor }}
            >
              {chapeu(a)}
            </span>
          )}
          <h3
            className={`font-serif text-white font-black leading-tight ${big ? "text-[22px] sm:text-[28px] line-clamp-3" : "text-[16px] line-clamp-3"}`}
            dangerouslySetInnerHTML={{ __html: safeTitleHtml(a.title) }}
          />
          <p className="text-white/60 text-[11px] mt-2">
            {formatShortDate(a.publishedAt, lang, tz)}
            {n > 0 && <> · {n.toLocaleString(lang)} {t("topNews.reads")}</>}
          </p>
        </div>
      </div>
    </Link>
  );
}

/** Linha numerada do ranking, do #4 em diante. */
function RankRow({ a, days, accent }: { a: TopArticle; days: number; accent: string }) {
  const { t, lang, tz } = useT();
  const cor = categoryColor(a.category ?? "");
  const n = reads(a, days);
  return (
    <Link
      href={href(a)}
      className="group flex gap-3 sm:gap-4 items-start py-3 border-b border-gray-100 last:border-0"
    >
      <span
        className="font-black text-[26px] sm:text-[30px] leading-none w-9 sm:w-11 shrink-0 tabular-nums select-none"
        style={{ color: accent }}
      >
        {a.rank}
      </span>
      {a.imageUrl && (
        <div className="w-[84px] h-[56px] sm:w-[110px] sm:h-[73px] shrink-0 overflow-hidden rounded bg-gray-100">
          <img
            src={proxyUrl(a.imageUrl, 240, COVER_Q)}
            srcSet={coverSrcSet(a.imageUrl, "3/2") || undefined}
            sizes="(max-width: 640px) 84px, 110px"
            alt={stripTags(a.title)}
            width={110}
            height={73}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        </div>
      )}
      <div className="flex-1 min-w-0">
        {chapeu(a) && (
          <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: cor }}>
            {chapeu(a)}
          </span>
        )}
        <h4
          className="font-serif text-[14px] sm:text-[15px] font-bold text-[#1a1a1a] leading-snug line-clamp-2 group-hover:underline"
          dangerouslySetInnerHTML={{ __html: safeTitleHtml(a.title) }}
        />
        <p className="text-[11px] text-gray-400 mt-1">
          {formatShortDate(a.publishedAt, lang, tz)}
          {n > 0 && <> · {n.toLocaleString(lang)} {t("topNews.reads")}</>}
        </p>
      </div>
    </Link>
  );
}

export default function TopNews() {
  const { t } = useT();
  const { settings } = useSite();
  const [days, setDays] = useState<number>(7);
  const [articles, setArticles] = useState<TopArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    fetch(`/api/articles/top?limit=${TOP_LIMIT}&days=${days}`)
      .then((r) => r.json())
      .then((d: TopResponse) => {
        if (!vivo) return;
        setArticles(d.articles ?? []);
      })
      .catch(() => { if (vivo) setArticles([]); })
      .finally(() => { if (vivo) setLoading(false); });
    /* Requisição em voo quando o visitante troca a janela: sem esta trava, a
       resposta antiga podia chegar depois e sobrescrever a nova. */
    return () => { vivo = false; };
  }, [days]);

  /* Faixa e acento saem das settings do PRÓPRIO blog — a imagem é a mesma para
     os 11, então nada de cor de marca escrita aqui. */
  const faixaBg = settings?.footerBgColor || settings?.topBarBgColor || "#111827";
  const faixaInk = inkOn(faixaBg);
  const accent = settings?.footerAccentColor || settings?.menuBarBgColor || "#1d4ed8";

  const label = (d: number) =>
    d === 7 ? t("topNews.week") : d === 30 ? t("topNews.month") : t("topNews.always");

  const podium = articles.slice(0, 3);
  const resto = articles.slice(3);

  return (
    <div className="min-h-screen w-full bg-white flex flex-col">
      <TopBar />
      <Header />

      <main className="flex-1 pb-16">
        {/* Faixa de título */}
        <div className="w-full" style={{ backgroundColor: faixaBg, borderTop: `4px solid ${accent}` }}>
          <div className="max-w-[1280px] mx-auto px-4 py-7 sm:py-9">
            <h1
              className="text-[28px] sm:text-[34px] font-black uppercase tracking-tight leading-none"
              style={{ color: faixaInk }}
            >
              {t("topNews.title")}
            </h1>
            <p className="text-[13px] mt-2 opacity-60" style={{ color: faixaInk }}>
              {t("topNews.subtitle")}
            </p>

            {/* Janela do ranking. Sem ela a aba congelaria: o campeão histórico
                ficaria em #1 para sempre e nenhuma notícia nova apareceria. */}
            <div className="flex flex-wrap gap-2 mt-5" role="group" aria-label={t("topNews.ranking")}>
              {WINDOWS.map((d) => {
                const ativo = d === days;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDays(d)}
                    aria-pressed={ativo}
                    className="px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-full border transition-colors"
                    style={
                      ativo
                        ? { backgroundColor: accent, borderColor: accent, color: inkOn(accent) }
                        : { borderColor: `${faixaInk}33`, color: faixaInk, opacity: 0.75 }
                    }
                  >
                    {label(d)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="max-w-[1280px] mx-auto px-4 mt-8">
          {loading ? (
            <div className="flex items-center justify-center py-24 text-gray-400 text-sm">
              {t("common.loadingDots")}
            </div>
          ) : articles.length === 0 ? (
            <div className="flex items-center justify-center py-24 text-gray-400 text-sm">
              {t("topNews.empty")}
            </div>
          ) : (
            <>
              {/* Pódio: #1 grande, #2 e #3 ao lado */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-10">
                <div className="lg:col-span-2">
                  <PodiumCard a={podium[0]!} days={days} accent={accent} big />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-5">
                  {podium.slice(1).map((a) => (
                    <PodiumCard key={a.id} a={a} days={days} accent={accent} big={false} />
                  ))}
                </div>
              </div>

              {/* Do #4 em diante */}
              {resto.length > 0 && (
                <section>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-1 h-5" style={{ backgroundColor: accent }} />
                    <h2 className="text-[15px] font-bold text-[#1a1a1a] uppercase tracking-wider">
                      {t("topNews.ranking")}
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10">
                    {resto.map((a) => (
                      <RankRow key={a.id} a={a} days={days} accent={accent} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
