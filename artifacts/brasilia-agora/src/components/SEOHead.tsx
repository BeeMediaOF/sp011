import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useSite } from "../hooks/useSite";
import { containsGtmContainer } from "../lib/gtmSnippet";

// Consentimento de cookies (mesma chave/evento do banner LGPDConsent). Scripts de
// terceiros (GTM/GA4/Pixel/código custom) só carregam após "Aceitar" — exigência
// de consentimento (NDPA/LGPD). Lido cru p/ não acoplar ao componente lazy.
const CONSENT_KEY = "bee_analytics_consent";
function hasTrackingConsent(): boolean {
  try { return localStorage.getItem(CONSENT_KEY) === "accepted"; } catch { return false; }
}

/**
 * IDs de rastreamento (GTM-XXXX, G-XXXX, pixel numérico) vão interpolados em
 * <script> inline: valores fora do formato esperado (espaços, aspas, HTML)
 * quebrariam o script ou abririam injeção. Fora do padrão → não injeta.
 */
const TRACKING_ID_RE = /^[A-Za-z0-9_-]{4,40}$/;
function cleanTrackingId(v: string | undefined): string {
  const t = (v ?? "").trim();
  return TRACKING_ID_RE.test(t) ? t : "";
}

// Properly executes HTML snippets that contain <script> tags.
// createContextualFragment parses but does NOT run scripts — this does.
function injectHtmlSnippet(
  markerId: string,
  html: string,
  parent: HTMLElement,
  position: "append" | "prepend"
) {
  if (document.getElementById(markerId)) return;
  const marker = document.createElement("meta");
  marker.id = markerId;
  marker.setAttribute("data-injected", "1");
  position === "append" ? parent.appendChild(marker) : parent.prepend(marker);

  const tmp = document.createElement("div");
  tmp.innerHTML = html;

  const nodes = Array.from(tmp.childNodes);
  const insert = (node: Node) =>
    position === "append" ? parent.appendChild(node) : parent.prepend(node);

  for (const node of nodes) {
    if (node instanceof HTMLScriptElement) {
      const s = document.createElement("script");
      s.type = node.type || "text/javascript";
      if (node.src) {
        s.src = node.src;
        s.async = node.async;
      } else {
        s.textContent = node.textContent;
      }
      Array.from(node.attributes).forEach((a) => {
        if (!["src", "type", "async"].includes(a.name))
          s.setAttribute(a.name, a.value);
      });
      insert(s);
    } else {
      insert(node.cloneNode(true));
    }
  }
}

function injectScript(id: string, html: string) {
  if (document.getElementById(id)) return;
  const el = document.createElement("script");
  el.id = id;
  el.innerHTML = html;
  document.head.appendChild(el);
}

function injectExternalScript(id: string, src: string, attrs: Record<string, string> = {}) {
  if (document.getElementById(id)) return;
  const el = document.createElement("script");
  el.id = id;
  el.src = src;
  el.async = true;
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  document.head.appendChild(el);
}

/**
 * Agenda `cb` para quando a thread principal estiver ociosa. Usado para adiar a
 * injeção dos scripts de terceiros (GTM/GA4/Pixel), que são pesados e, se rodarem
 * logo após a hidratação, entram na janela de medição do TBT (PageSpeed). Adiá-los
 * para o idle tira ~100-200ms de TBT sem perder rastreamento (o PageView dispara
 * poucos segundos depois). `timeout` garante execução mesmo se nunca ficar ocioso.
 */
function onIdle(cb: () => void): () => void {
  const ric = (window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (h: number) => void;
  }).requestIdleCallback;
  if (typeof ric === "function") {
    const h = ric(cb, { timeout: 3000 });
    return () => (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback?.(h);
  }
  const t = window.setTimeout(cb, 2000);
  return () => window.clearTimeout(t);
}

export default function SEOHead() {
  const { settings } = useSite();
  const [location] = useLocation();
  // Painel não é audiência: GTM/GA4/Pixel no /admin inflariam as métricas
  // externas com navegação interna da redação (o analytics próprio já filtra).
  const isAdmin = /^\/admin(\/|$)/.test(location);

  // Consentimento: re-renderiza quando o visitante Aceita (banner dispara o
  // evento) ou quando muda em outra aba (storage).
  const [consented, setConsented] = useState<boolean>(() => hasTrackingConsent());
  useEffect(() => {
    const sync = () => setConsented(hasTrackingConsent());
    window.addEventListener("bee_consent_change", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("bee_consent_change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  /* Canonical sempre apontando para a URL atual. O SSR (PRD-PERF-05) passou a
     servir <link rel="canonical"> no HTML de home/artigo/editoria; sem este
     efeito, uma navegação SPA sairia da página mantendo o canonical da anterior.
     A página de artigo sobrescreve depois (efeito dela roda em seguida) quando o
     artigo tem canonicalUrl externa. */
  useEffect(() => {
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = window.location.origin + location;
  }, [location]);

  /* Consent Mode: o container do GTM vem do servidor em toda página e já nasce
     com ad_storage/analytics_storage NEGADOS (lib/gtmSnippet.ts). Quem levanta
     a restrição é este efeito, no "Aceitar" do banner — sem ele o container
     carrega, é detectável por um GET, e mesmo assim não rastreia ninguém. */
  useEffect(() => {
    if (!consented || isAdmin) return;
    // `gtag` é definido pelo próprio snippet do servidor. Não existe quando o
    // blog está sem GTM configurado — aí não há consentimento a atualizar.
    const w = window as unknown as { gtag?: (...args: unknown[]) => void };
    w.gtag?.("consent", "update", {
      ad_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "granted",
      analytics_storage: "granted",
    });
  }, [consented, isAdmin]);

  // ── Scripts de terceiros (pesados) → adiados para o idle, fora do TBT ────────
  useEffect(() => {
    if (!settings || isAdmin) return;
    // Sem consentimento explícito, nenhum script de terceiro é carregado.
    if (!consented) return;
    const gtmId   = cleanTrackingId(settings.gtmId);
    const ga4Id   = cleanTrackingId(settings.ga4MeasurementId);
    const pixelId = cleanTrackingId(settings.facebookPixelId);
    if (!gtmId && !ga4Id && !pixelId
        && !settings.customHeadCode && !settings.customBodyCode) return;

    const cancel = onIdle(() => {
    /* O container do GTM NÃO é injetado aqui desde 2026-08-14 — ele vem no HTML
       servido (vite.config.ts → applyHead → lib/gtmSnippet.ts). Injetar daqui
       carregaria o mesmo container duas vezes. O que continua sendo daqui é o
       `consent update`, no efeito logo abaixo. */

    // ── Google Analytics 4 ────────────────────────────────────────────────────
    if (ga4Id) {
      const gid = ga4Id;
      injectExternalScript("ga4-gtag", `https://www.googletagmanager.com/gtag/js?id=${gid}`);
      injectScript("ga4-init", `
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', '${gid}');
      `);
    }

    // ── Facebook Pixel ────────────────────────────────────────────────────────
    if (pixelId) {
      const pid = pixelId;
      injectScript("fb-pixel-init", `
        !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
        n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
        (window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
        fbq('init','${pid}');fbq('track','PageView');
      `);
    }

    /* Código personalizado: pulado quando repete o container que o servidor já
       injetou. É o caso comum — o operador preenche o "Container ID" E cola o
       snippet inteiro do GTM no campo de código (foi assim no oleysports), o
       que carregaria o mesmo container duas vezes e dobraria o pageview. */
    if (settings.customHeadCode && !containsGtmContainer(settings.customHeadCode, gtmId)
        && !document.getElementById("custom-head-code")) {
      try {
        injectHtmlSnippet("custom-head-code", settings.customHeadCode, document.head, "append");
      } catch { /* snippet inválido — ignorar silenciosamente */ }
    }

    if (settings.customBodyCode && !containsGtmContainer(settings.customBodyCode, gtmId)
        && !document.getElementById("custom-body-code")) {
      try {
        injectHtmlSnippet("custom-body-code", settings.customBodyCode, document.body, "prepend");
      } catch { /* snippet inválido — ignorar silenciosamente */ }
    }
    });

    return cancel;
  }, [settings, isAdmin, consented]);

  // ── Title / meta / favicon → síncrono (barato e relevante para SEO/SPA) ──────
  useEffect(() => {
    if (!settings) return;

    // Title
    document.title = settings.siteName
      ? `${settings.siteName} — ${settings.tagline ?? "Notícias"}`
      : document.title;

    // Meta description
    const desc = settings.seoDescription || settings.tagline;
    if (desc) {
      setMeta("name", "description", desc);
      setMeta("property", "og:description", desc);
      setMeta("name", "twitter:description", desc);
    }

    // Meta keywords
    if (settings.seoKeywords) {
      setMeta("name", "keywords", settings.seoKeywords);
    }

    // OG title
    if (settings.siteName) {
      setMeta("property", "og:title", settings.siteName);
      setMeta("name", "twitter:title", settings.siteName);
    }

    // OG image — o /api/site publica o campo como URL relativa (/api/site-asset/…);
    // crawlers exigem URL absoluta na tag og:image.
    if (settings.ogImageBase64) {
      const og = settings.ogImageBase64.startsWith("/")
        ? window.location.origin + settings.ogImageBase64
        : settings.ogImageBase64;
      setMeta("property", "og:image", og);
      setMeta("name", "twitter:image", og);
    }

    // Favicon
    if (settings.faviconBase64) {
      let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = settings.faviconBase64;
    }
  }, [settings]);

  return null;
}

function setMeta(attr: "name" | "property", value: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${value}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, value);
    document.head.appendChild(el);
  }
  el.content = content;
}
