import { useEffect } from "react";
import { useSite } from "../hooks/useSite";

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

  // ── Scripts de terceiros (pesados) → adiados para o idle, fora do TBT ────────
  useEffect(() => {
    if (!settings) return;
    if (!settings.gtmId && !settings.ga4MeasurementId && !settings.facebookPixelId
        && !settings.customHeadCode && !settings.customBodyCode) return;

    const cancel = onIdle(() => {
    // ── Google Tag Manager ────────────────────────────────────────────────────
    if (settings.gtmId) {
      const gid = settings.gtmId.trim();
      if (!document.getElementById("gtm-init")) {
        injectScript("gtm-init", `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gid}');`);
        // noscript iframe
        if (!document.getElementById("gtm-noscript")) {
          const ns = document.createElement("noscript");
          ns.id = "gtm-noscript";
          ns.innerHTML = `<iframe src="https://www.googletagmanager.com/ns.html?id=${gid}" height="0" width="0" style="display:none;visibility:hidden"></iframe>`;
          document.body.prepend(ns);
        }
      }
    }

    // ── Google Analytics 4 ────────────────────────────────────────────────────
    if (settings.ga4MeasurementId) {
      const gid = settings.ga4MeasurementId.trim();
      injectExternalScript("ga4-gtag", `https://www.googletagmanager.com/gtag/js?id=${gid}`);
      injectScript("ga4-init", `
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', '${gid}');
      `);
    }

    // ── Facebook Pixel ────────────────────────────────────────────────────────
    if (settings.facebookPixelId) {
      const pid = settings.facebookPixelId.trim();
      injectScript("fb-pixel-init", `
        !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
        n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
        (window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
        fbq('init','${pid}');fbq('track','PageView');
      `);
    }

    // ── Código personalizado do <head> ───────────────────────────────────────
    if (settings.customHeadCode && !document.getElementById("custom-head-code")) {
      try {
        injectHtmlSnippet("custom-head-code", settings.customHeadCode, document.head, "append");
      } catch { /* snippet inválido — ignorar silenciosamente */ }
    }

    // ── Código personalizado do <body> ───────────────────────────────────────
    if (settings.customBodyCode && !document.getElementById("custom-body-code")) {
      try {
        injectHtmlSnippet("custom-body-code", settings.customBodyCode, document.body, "prepend");
      } catch { /* snippet inválido — ignorar silenciosamente */ }
    }
    });

    return cancel;
  }, [settings]);

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

    // OG image
    if (settings.ogImageBase64) {
      setMeta("property", "og:image", settings.ogImageBase64);
      setMeta("name", "twitter:image", settings.ogImageBase64);
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
