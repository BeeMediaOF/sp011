/**
 * Entry do cliente. Em rotas com SSR (home), o servidor injeta window.__SSR_DATA__
 * e o HTML do #root já vem renderizado → hidratamos (hydrateRoot) reaproveitando o
 * DOM (o hero já pintado conta como LCP). Antes de hidratar, semeamos os caches
 * com os MESMOS dados do servidor para o 1º render bater (sem mismatch).
 * Em rotas sem SSR, o #root vem vazio → createRoot normal (SPA).
 */
import { hydrateRoot, createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { seedArticles } from "./hooks/useArticles";
import { seedSite, refreshSite } from "./hooks/useSite";
import { seedAds } from "./components/ads/useAds";
import type { SSRData } from "./entry-server";

const rootEl = document.getElementById("root")!;
const data = (window as unknown as { __SSR_DATA__?: SSRData }).__SSR_DATA__;

if (data && rootEl.hasChildNodes()) {
  if (Array.isArray(data.articles)) seedArticles(data.articles);
  if (data.site) seedSite(data.site);
  if (Array.isArray(data.ads)) seedAds(data.ads);
  hydrateRoot(rootEl, <App />);
  // O SSR semeou settings "magras" (sem base64 de logos/favicon/og). Após hidratar,
  // busca a versão completa para restaurar logos do byline, favicon e analytics.
  refreshSite();
} else {
  createRoot(rootEl).render(<App />);
}
