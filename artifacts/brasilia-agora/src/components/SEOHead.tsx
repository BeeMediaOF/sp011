import { useEffect } from "react";
import { useSite } from "../hooks/useSite";

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

export default function SEOHead() {
  const { settings } = useSite();

  useEffect(() => {
    if (!settings) return;

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
