import { useEffect } from "react";
import { useSite } from "../hooks/useSite";

export default function SEOHead() {
  const { settings } = useSite();

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
