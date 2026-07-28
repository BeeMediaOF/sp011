/**
 * Entry de SSR — usado pelo bundle `vite build --ssr` e consumido pelo middleware
 * de preview (vite.config.ts) para renderizar home, artigo e editoria no servidor.
 *
 * `render(url, data)` semeia os caches dos hooks sincronamente e renderiza o App
 * para string. Como o seed acontece imediatamente antes do renderToString (sem
 * await no meio), o bloco é atômico no event loop single-thread do Node — duas
 * requisições concorrentes não misturam dados.
 *
 * Artigo e CategoryArchivePage entram por IMPORT ESTÁTICO e são injetados no App
 * pela prop `pages`: no cliente eles são `lazy`, e o `renderToString` não espera
 * Suspense — pelo caminho normal a página sairia daqui como o spinner de rota.
 */
import { renderToString } from "react-dom/server";
import App, { type SsrPages } from "./App";
import Artigo from "./pages/Artigo";
import CategoryArchivePage from "./pages/CategoryArchivePage";
import { seedArticles, seedArticle, type Article } from "./hooks/useArticles";
import { seedSite, type SiteSettings } from "./hooks/useSite";
import { seedAds } from "./components/ads/useAds";
import { seedCategoryArchive, type CategorySeedData } from "./lib/categorySeed";
import { seedOrigin } from "./lib/pageOrigin";
import type { AdItem } from "./components/ads/useAds";

export interface SSRData {
  articles: Article[];
  site: SiteSettings | null;
  ads: AdItem[];
  /** proto://host da requisição — JSON-LD e canonical do artigo (ver pageOrigin). */
  origin?: string;
  /** Rota /artigo/:slug. `key` é o slug CRU da URL, que é o que o useArticle procura. */
  article?: { key: string; article: Article } | null;
  /** Rota de editoria (fixa ou vinda do menu). */
  category?: CategorySeedData | null;
}

const SSR_PAGES: SsrPages = { Artigo, CategoryArchivePage };

export function render(url: string, data: SSRData): string {
  if (data.origin) seedOrigin(data.origin);
  if (Array.isArray(data.articles)) seedArticles(data.articles);
  if (data.site) seedSite(data.site);
  if (Array.isArray(data.ads)) seedAds(data.ads);
  if (data.article?.article) seedArticle(data.article.key, data.article.article);
  if (data.category) seedCategoryArchive(data.category);
  return renderToString(<App ssrPath={url} pages={SSR_PAGES} />);
}
