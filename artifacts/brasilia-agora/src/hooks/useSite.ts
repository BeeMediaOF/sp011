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
  reverse?: boolean;
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
  facebookPixelId?: string;
  gtmId?: string;
  ga4MeasurementId?: string;
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

const STORAGE_KEY = "bee_site_v1";

function loadFromStorage(): SiteSettings | null {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? (JSON.parse(s) as SiteSettings) : null;
  } catch { return null; }
}

function saveToStorage(data: SiteSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    try {
      const { logoBase64, bylineLogoBase64, ogImageBase64, faviconBase64, adminLogoBase64, ...slim } = data;
      void [logoBase64, bylineLogoBase64, ogImageBase64, faviconBase64, adminLogoBase64];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
    } catch {}
  }
}

// Always start null — never pre-render with stale localStorage data.
// localStorage is only used as a network-error fallback.
let _cache: SiteSettings | null = null;
let _fetch: Promise<void> | null = null;
const _subscribers = new Set<(s: SiteSettings) => void>();

function notifySubscribers() {
  if (_cache) _subscribers.forEach((cb) => cb(_cache!));
}

async function doFetch() {
  try {
    const r = await fetch("/api/site");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json() as SiteSettings;
    _cache = data;
    saveToStorage(data);
    notifySubscribers();
  } catch {
    // Network / server error — fall back to localStorage so the page
    // is not completely blank, but never show it on a successful load.
    const stored = loadFromStorage();
    if (stored && !_cache) {
      _cache = stored;
      notifySubscribers();
    }
    _fetch = null;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("message", (e) => {
    if (e.data?.type === "settings:refresh") {
      _cache = null;
      _fetch = doFetch().catch(() => { _fetch = null; });
    }
  });
}

export function invalidateSiteCache() {
  _cache = null;
  _fetch = doFetch().catch(() => { _fetch = null; });
}

export function useSite() {
  const [settings, setSettings] = useState<SiteSettings | null>(_cache);
  const [loading, setLoading] = useState(_cache === null);

  useEffect(() => {
    const subscriber = (s: SiteSettings) => {
      setSettings(s);
      setLoading(false);
    };
    _subscribers.add(subscriber);

    if (_cache) {
      setSettings(_cache);
      setLoading(false);
    }

    if (!_fetch) {
      _fetch = doFetch().catch(() => { _fetch = null; });
    }

    _fetch.then(() => {
      if (_cache) setSettings(_cache);
      setLoading(false);
    });

    return () => { _subscribers.delete(subscriber); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { settings, loading };
}
