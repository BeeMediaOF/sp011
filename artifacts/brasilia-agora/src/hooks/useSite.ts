import { useState, useEffect } from "react";
import type { HomeBlock } from "../lib/homeBlocks";
import type { FooterConfig, PublicContact } from "../lib/footerConfig";

export type { HomeBlock };

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
  showTickerBar?: boolean;
  showHeroStrip?: boolean;
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
  /** Estilo do menu principal (cor do texto, cor do item ativo, tamanho e peso da fonte). */
  menuTextColor?: string;
  menuActiveColor?: string;
  menuFontSize?: number;
  menuFontWeight?: number;
  /** Margem lateral interna do cabeçalho, em px (padrão 16). */
  headerPaddingX?: number;
  /** Margem acima do cabeçalho, em px (padrão 0). */
  headerMarginTop?: number;
  customHeadCode?: string;
  customBodyCode?: string;
  /** Configuração editável do rodapé (painel → aba Rodapé). */
  footerConfig?: FooterConfig;
  /** Contato público (hub de Contato) — telefone, e-mail e redes do rodapé. */
  contact?: PublicContact;
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

// Cache TTL: 60 seconds. After this, the next useSite() mount triggers a fresh fetch.
const CACHE_TTL_MS = 60_000;

let _cache: SiteSettings | null = null;
let _cacheAt = 0;
let _fetch: Promise<void> | null = null;
const _subscribers = new Set<(s: SiteSettings) => void>();

function isCacheStale() {
  return !_cache || Date.now() - _cacheAt > CACHE_TTL_MS;
}

function notifySubscribers() {
  if (_cache) _subscribers.forEach((cb) => cb(_cache!));
}

/** Consome a promessa de boot (prefetch inline no index.html) se disponível. */
function takeBoot(key: string): Promise<unknown> | null {
  if (typeof window === "undefined") return null;
  const boot = (window as unknown as { __BOOT__?: Record<string, Promise<unknown> | null> }).__BOOT__;
  const p = boot?.[key] ?? null;
  if (boot && p) boot[key] = null;
  return p;
}

async function doFetch(force = false) {
  try {
    let data = force ? null : (await takeBoot("site")) as SiteSettings | null;
    if (!data) {
      const r = await fetch("/api/site", force ? { cache: "no-store" } : undefined);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      data = await r.json() as SiteSettings;
    }
    _cache = data;
    _cacheAt = Date.now();
    saveToStorage(data);
    notifySubscribers();
  } catch {
    // Network / server error — fall back to localStorage so the page
    // is not completely blank, but never show it on a successful load.
    const stored = loadFromStorage();
    if (stored && !_cache) {
      _cache = stored;
      _cacheAt = Date.now();
      notifySubscribers();
    }
  } finally {
    // Always reset _fetch so the next mount can re-check staleness
    _fetch = null;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("message", (e) => {
    if (e.data?.type === "settings:refresh") {
      _cache = null;
      _cacheAt = 0;
      _fetch = doFetch(true).catch(() => { _fetch = null; });
    }
  });
}

export function invalidateSiteCache() {
  _cache = null;
  _cacheAt = 0;
  _fetch = doFetch(true).catch(() => { _fetch = null; });
}

/** Semeia o cache de settings sincronamente (SSR + hidratação). Ver seedArticles. */
export function seedSite(data: SiteSettings): void {
  _cache = data;
  _cacheAt = Date.now();
  notifySubscribers();
}

/**
 * Rebusca /api/site completo após a hidratação. O SSR semeia uma versão "magra"
 * das settings (sem os base64 de logo/favicon/og, para não inchar o HTML); esta
 * função traz a versão completa em background, sem blanquear o cache atual
 * (doFetch só substitui _cache em caso de sucesso) → logos/analytics aparecem.
 */
export function refreshSite(): void {
  if (!_fetch) _fetch = doFetch(true).catch(() => { _fetch = null; });
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

    // Fetch if: no in-flight request AND (no cache or cache is stale)
    if (!_fetch && isCacheStale()) {
      _fetch = doFetch().catch(() => { _fetch = null; });
    }

    if (_fetch) {
      _fetch.then(() => {
        if (_cache) setSettings(_cache);
        setLoading(false);
      });
    }

    return () => { _subscribers.delete(subscriber); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { settings, loading };
}
