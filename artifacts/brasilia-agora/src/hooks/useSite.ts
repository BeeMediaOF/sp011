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
  facebookPixelId?: string;
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

// ─── localStorage persistence ─────────────────────────────────────────────────
// Keeps last-known settings so the first render matches the saved state.
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
    // Quota exceeded — store layout-critical fields only (no large blobs)
    try {
      const { logoBase64, bylineLogoBase64, ogImageBase64, faviconBase64, adminLogoBase64, ...slim } = data;
      void [logoBase64, bylineLogoBase64, ogImageBase64, faviconBase64, adminLogoBase64];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
    } catch {}
  }
}

// ─── Singleton module-level cache ─────────────────────────────────────────────
// Pre-populated from localStorage on module init — eliminates first-render flash.
let _cache: SiteSettings | null = loadFromStorage();
let _fetch: Promise<void> | null = null;

/** Refresh settings from the API immediately (call after any admin save). */
export function invalidateSiteCache() {
  // Start a background re-fetch so that by the time the user navigates away
  // from the admin panel, the cache is already up to date — no flash.
  _fetch = fetch("/api/site")
    .then((r) => r.json())
    .then((data: SiteSettings) => {
      _cache = data;
      saveToStorage(data);
    })
    .catch(() => {
      _cache = null;
      _fetch = null;
    });
}

export function useSite() {
  const [settings, setSettings] = useState<SiteSettings | null>(_cache);
  const [loading, setLoading] = useState(_cache === null);

  useEffect(() => {
    // Render immediately from cache if available (stale-while-revalidate)
    if (_cache) {
      setSettings(_cache);
      setLoading(false);
    }

    // Always kick off a background refresh to stay in sync
    if (!_fetch) {
      _fetch = fetch("/api/site")
        .then((r) => r.json())
        .then((data: SiteSettings) => {
          _cache = data;
          saveToStorage(data);
        })
        .catch(() => {});
    }

    _fetch.then(() => {
      if (_cache) setSettings(_cache);
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { settings, loading };
}
