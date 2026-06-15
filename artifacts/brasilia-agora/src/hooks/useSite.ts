import { useState, useEffect } from "react";

export interface HomeBlock {
  id: string;
  name: string;
  visible: boolean;
  order: number;
  category?: string;
  layout?: "grid" | "featured" | "duplo" | "cultura" | "lista" | "manchete" | "mosaico";
  color?: string;
  custom?: boolean;
}

export interface MenuItem {
  id: string;
  label: string;
  path: string;
  order: number;
  visible: boolean;
}

export interface SiteSettings {
  siteName: string;
  tagline: string;
  logoBase64?: string;
  logoSize?: number;
  mobileEnabled: boolean;
  desktopEnabled: boolean;
  seoDescription?: string;
  seoKeywords?: string;
  ogImageBase64?: string;
  faviconBase64?: string;
  homeBlocks?: HomeBlock[];
  menuItems?: MenuItem[];
  adminLogoBase64?: string;
  adminSidebarColor?: string;
  adminAccentColor?: string;
  bylineName?: string;
  bylineLogoBase64?: string;
  headerStyle?: "standard" | "compact" | "centered";
  footerStyle?: "dark" | "light" | "minimal";
  headerBgColor?: string;
  footerBgColor?: string;
}

// ─── Singleton module-level cache ─────────────────────────────────────────────
let _cache: SiteSettings | null = null;
let _fetch: Promise<void> | null = null;

export function invalidateSiteCache() {
  _cache = null;
  _fetch = null;
}

export function useSite() {
  const [settings, setSettings] = useState<SiteSettings | null>(_cache);
  const [loading, setLoading] = useState(_cache === null);

  useEffect(() => {
    if (_cache) {
      setSettings(_cache);
      setLoading(false);
      return;
    }

    if (!_fetch) {
      _fetch = fetch("/api/site")
        .then((r) => r.json())
        .then((data) => { _cache = data; })
        .catch(() => {});
    }

    _fetch.then(() => {
      if (_cache) setSettings(_cache);
      setLoading(false);
    });
  }, []);

  return { settings, loading };
}
