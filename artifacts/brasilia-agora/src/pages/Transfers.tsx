/**
 * Página `/transferencias` — todas as possíveis transferências ATIVAS do blog.
 *
 * Destino do link "Ver todas as possíveis transferências" do bloco da home. O
 * path é o mesmo nos 11 blogs, inclusive no ksports (EN), onde o título sai em
 * inglês pelo i18n: **o rótulo é dado, o path é código** — a mesma regra do
 * `/top-news`. Aqui o path ficou em português de propósito: "transferências" é
 * o termo de busca real em 6 dos 7 blogs de esporte, e esta página tem valor de
 * SEO que a de mais-lidas não tem.
 *
 * Zero fetch próprio: os dados já vêm no `/api/site` que o `useSite()` carrega
 * para o cabeçalho e o rodapé. A página não entra no menu (a porta de entrada é
 * o bloco) — colocar lá reabriria o "Aplicar template apaga o menu".
 *
 * As amarras que a fazem existir de verdade (todas testadas):
 *  1. `<Route path="/transferencias">` ANTES do `/:slug` no App;
 *  2. `/transferencias` em `STATIC_PAGE_PATHS` — classifica como `static` no
 *     SSR (nunca 404 de "editoria sem conteúdo") e alimenta o `RESERVED_PATHS`,
 *     impedindo que o path vire uma editoria vazia com `noindex`;
 *  3. `transferencias` em `RESERVED_SLUGS` do sitemap do api-server.
 */
import { useMemo, useState } from "react";
import TopBar from "../components/TopBar";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useSite } from "../hooks/useSite";
import { useT, type TKey } from "../lib/i18n";
import { inkOn } from "../lib/colorContrast";
import {
  clubMonogram, formatInfoDate, formatMoneyShort, positionKey,
  transferCrestUrl, transferPhotoUrl,
  type PublicTransfer,
} from "../lib/transfers";

/** Iniciais no lugar do escudo ausente — escudo é marca de terceiro e o seed de
 *  clubes não traz nenhum (ver deploy/transferencias/README.md). */
function Crest({ name, crestUrl, accent, size = 22 }: {
  name: string; crestUrl?: string; accent: string; size?: number;
}) {
  if (crestUrl) {
    return (
      <img src={transferCrestUrl(crestUrl, size)} alt="" width={size} height={size}
        loading="lazy" decoding="async" className="object-contain shrink-0"
        style={{ width: size, height: size }} />
    );
  }
  return (
    <span aria-hidden="true"
      className="shrink-0 inline-flex items-center justify-center rounded-full font-bold"
      style={{
        width: size, height: size,
        backgroundColor: `${accent}1f`, color: accent,
        fontSize: Math.max(8, Math.round(size * 0.42)),
      }}>
      {clubMonogram(name)}
    </span>
  );
}

function TransferCard({ r, accent }: { r: PublicTransfer; accent: string }) {
  const { t, lang } = useT();
  const valor = formatMoneyShort(r.transferValue, r.currency ?? "EUR", lang);
  const mercado = formatMoneyShort(r.marketValue, r.currency ?? "EUR", lang);
  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {r.playerPhotoUrl ? (
          <img src={transferPhotoUrl(r.playerPhotoUrl, 56)} alt={r.playerName}
            width={56} height={56} loading="lazy" decoding="async"
            className="w-14 h-14 rounded-full object-cover shrink-0 bg-gray-100" />
        ) : (
          <span aria-hidden="true"
            className="w-14 h-14 rounded-full shrink-0 inline-flex items-center justify-center text-[14px] font-bold"
            style={{ backgroundColor: `${accent}1f`, color: accent }}>
            {clubMonogram(r.playerName)}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-[16px] font-bold text-[#1a1a1a] leading-tight truncate">{r.playerName}</h2>
          <p className="text-[11px] text-gray-400 leading-tight">
            {t(positionKey(r.position) as TKey)}
            {r.nationality ? ` · ${r.nationality}` : ""}
            {r.age ? ` · ${r.age} ${t("transfers.age")}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-center rounded-xl px-3 py-1.5" style={{ backgroundColor: `${accent}14` }}>
          <span className="block text-[19px] font-black leading-none tabular-nums" style={{ color: accent }}>
            {r.probability}%
          </span>
          <span className="block text-[9px] uppercase tracking-wider text-gray-400 mt-0.5">
            {t("transfers.probability")}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[12px] text-gray-600 border-t border-gray-100 pt-3">
        <Crest name={r.from.name} crestUrl={r.from.crestUrl} accent={accent} />
        <span className="truncate">{r.from.name}</span>
        <span aria-hidden="true" className="text-gray-300">&rarr;</span>
        <Crest name={r.to.name} crestUrl={r.to.crestUrl} accent={accent} />
        <span className="truncate font-semibold text-[#1a1a1a]">{r.to.name}</span>
      </div>

      {(valor || mercado || r.source || r.infoDate) && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-gray-500">
          {valor && (<><dt className="text-gray-400">{t("transfers.value")}</dt><dd className="text-right font-semibold text-[#1a1a1a]">{valor}</dd></>)}
          {mercado && (<><dt className="text-gray-400">{t("transfers.marketValue")}</dt><dd className="text-right font-semibold text-[#1a1a1a]">{mercado}</dd></>)}
          {r.source && (<><dt className="text-gray-400">{t("transfers.source")}</dt><dd className="text-right truncate">{r.source}</dd></>)}
          {r.infoDate && (<><dt className="text-gray-400">{t("transfers.date")}</dt><dd className="text-right tabular-nums">{formatInfoDate(r.infoDate, lang)}</dd></>)}
        </dl>
      )}
    </article>
  );
}

export default function Transfers() {
  const { t, lang } = useT();
  const { settings } = useSite();
  const [busca, setBusca] = useState("");
  const [clube, setClube] = useState("");

  const rows = settings?.transfers ?? [];

  /* Faixa e acento saem das settings do PRÓPRIO blog — a imagem é a mesma para
     os 11, então nada de cor de marca escrita aqui. */
  const faixaBg = settings?.footerBgColor || settings?.topBarBgColor || "#111827";
  const faixaInk = inkOn(faixaBg);
  const accent = settings?.footerAccentColor || settings?.menuBarBgColor || "#1d4ed8";

  /** Clubes que realmente aparecem nos rumores (não o catálogo inteiro: um
   *  filtro com 100 times, dos quais 90 sem rumor, não filtra nada). */
  const clubes = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) { set.add(r.from.name); set.add(r.to.name); }
    return [...set].sort((a, b) => a.localeCompare(b, lang));
  }, [rows, lang]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rows.filter((r) => {
      if (clube && r.from.name !== clube && r.to.name !== clube) return false;
      if (!q) return true;
      return r.playerName.toLowerCase().includes(q);
    });
  }, [rows, busca, clube]);

  return (
    <div className="min-h-screen w-full bg-white flex flex-col">
      <TopBar />
      <Header />

      <main className="flex-1 pb-16">
        <div className="w-full" style={{ backgroundColor: faixaBg, borderTop: `4px solid ${accent}` }}>
          <div className="max-w-[1280px] mx-auto px-4 py-7 sm:py-9">
            <h1 className="text-[28px] sm:text-[34px] font-black uppercase tracking-tight leading-none"
              style={{ color: faixaInk }}>
              {t("transfers.pageTitle")}
            </h1>
            <p className="text-[13px] mt-2 opacity-60" style={{ color: faixaInk }}>
              {t("transfers.subtitle")}
            </p>
          </div>
        </div>

        <div className="max-w-[1280px] mx-auto px-4 mt-6">
          {rows.length === 0 ? (
            <div className="flex items-center justify-center py-24 text-gray-400 text-sm">
              {t("transfers.empty")}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 mb-6">
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder={t("transfers.search")}
                  aria-label={t("transfers.search")}
                  className="flex-1 min-w-[180px] max-w-[320px] px-3 py-2 text-[13px] rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-0"
                  style={{ ["--tw-ring-color" as string]: accent }}
                />
                <select
                  value={clube}
                  onChange={(e) => setClube(e.target.value)}
                  aria-label={t("transfers.allClubs")}
                  className="px-3 py-2 text-[13px] rounded-xl border border-gray-200 bg-white"
                >
                  <option value="">{t("transfers.allClubs")}</option>
                  {clubes.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <span className="text-[12px] text-gray-400 tabular-nums">
                  {filtrados.length} {t("transfers.count")}
                </span>
              </div>

              {filtrados.length === 0 ? (
                <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
                  {t("transfers.noResults")}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filtrados.map((r) => <TransferCard key={r.id} r={r} accent={accent} />)}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
