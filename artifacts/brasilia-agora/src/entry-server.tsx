/**
 * Entry de SSR — usado pelo bundle `vite build --ssr` e consumido pelo middleware
 * de preview (vite.config.ts) para renderizar a home no servidor.
 *
 * `render(url, data)` semeia os caches dos hooks sincronamente e renderiza o App
 * para string. Como o seed acontece imediatamente antes do renderToString (sem
 * await no meio), o bloco é atômico no event loop single-thread do Node — duas
 * requisições concorrentes não misturam dados.
 */
import { renderToString } from "react-dom/server";
import App from "./App";
import { seedArticles, type Article } from "./hooks/useArticles";
import { seedSite, type SiteSettings } from "./hooks/useSite";
import { seedAds } from "./components/ads/useAds";
import type { AdItem } from "./components/ads/useAds";

export interface SSRData {
  articles: Article[];
  site: SiteSettings | null;
  ads: AdItem[];
}

export function render(url: string, data: SSRData): string {
  if (Array.isArray(data.articles)) seedArticles(data.articles);
  if (data.site) seedSite(data.site);
  if (Array.isArray(data.ads)) seedAds(data.ads);
  return renderToString(<App ssrPath={url} />);
}
