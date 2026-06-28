import { useState, useEffect } from "react";

export type AdSlotKey = "slot_01" | "slot_02" | "slot_03" | "slot_04" | "slot_05" | "slot_06" | "slot_07" | "slot_08" | "slot_09" | "slot_10" | "slot_11";

export interface SlotConfig {
  label: string;
  format: string;
  aspectRatio: string;
  /** px width used in <img width=...> for layout hints */
  imgWidth: number;
  imgHeight: number;
}

export const SLOT_CONFIG: Record<AdSlotKey, SlotConfig> = {
  slot_08: { label: "Topo do site",          format: "970×250", aspectRatio: "970/250", imgWidth: 970,  imgHeight: 250 },
  slot_03: { label: "Home – bloco central",   format: "970×250", aspectRatio: "970/250", imgWidth: 970,  imgHeight: 250 },
  slot_01: { label: "Home – posição 1",       format: "970×90",  aspectRatio: "970/90",  imgWidth: 970,  imgHeight: 90  },
  slot_02: { label: "Home – posição 2",       format: "970×90",  aspectRatio: "970/90",  imgWidth: 970,  imgHeight: 90  },
  slot_04: { label: "Home – posição 3",       format: "970×90",  aspectRatio: "970/90",  imgWidth: 970,  imgHeight: 90  },
  slot_09: { label: "Rodapé do site",         format: "970×90",  aspectRatio: "970/90",  imgWidth: 970,  imgHeight: 90  },
  slot_10: { label: "Entre parágrafos",       format: "970×90",  aspectRatio: "970/90",  imgWidth: 970,  imgHeight: 90  },
  slot_06: { label: "Artigo – pós texto",     format: "970×90",  aspectRatio: "970/90",  imgWidth: 970,  imgHeight: 90  },
  slot_07: { label: "Sidebar do artigo",      format: "250×350", aspectRatio: "250/350", imgWidth: 250,  imgHeight: 350 },
  slot_05: { label: "Sidebar da editoria",    format: "250×350", aspectRatio: "250/350", imgWidth: 250,  imgHeight: 350 },
  slot_11: { label: "Sidebar do arquivo",     format: "250×350", aspectRatio: "250/350", imgWidth: 250,  imgHeight: 350 },
};

export interface AdItem {
  id: string;
  imageUrl: string;
  link: string;
  position: string;
}

// ─── Cache singleton compartilhado (evita N fetches: há ~6 AdBanner na home) ───
const ADS_TTL = 60_000;
let _cache: AdItem[] | null = null;
let _cacheAt = 0;
let _fetch: Promise<void> | null = null;
const _subs = new Set<(a: AdItem[]) => void>();

function takeBoot(key: string): Promise<unknown> | null {
  if (typeof window === "undefined") return null;
  const boot = (window as unknown as { __BOOT__?: Record<string, Promise<unknown> | null> }).__BOOT__;
  const p = boot?.[key] ?? null;
  if (boot && p) boot[key] = null;
  return p;
}

async function doFetchAds() {
  try {
    let data = (await takeBoot("ads")) as { ads?: AdItem[] } | null;
    if (!data) {
      const r = await fetch("/api/ads");
      data = r.ok ? ((await r.json()) as { ads?: AdItem[] }) : null;
    }
    _cache = data?.ads ?? [];
    _cacheAt = Date.now();
    _subs.forEach((cb) => cb(_cache!));
  } catch {
    if (!_cache) _cache = [];
  } finally {
    _fetch = null;
  }
}

/** Semeia o cache de anúncios sincronamente (SSR + hidratação). Ver seedArticles. */
export function seedAds(ads: AdItem[]): void {
  _cache = ads;
  _cacheAt = Date.now();
  _subs.forEach((cb) => cb(_cache!));
}

export function useAds() {
  const [ads, setAds] = useState<AdItem[]>(_cache ?? []);
  const [loading, setLoading] = useState(_cache === null);

  useEffect(() => {
    const sub = (a: AdItem[]) => { setAds(a); setLoading(false); };
    _subs.add(sub);

    if (_cache) { setAds(_cache); setLoading(false); }

    const stale = !_cache || Date.now() - _cacheAt > ADS_TTL;
    if (!_fetch && stale) _fetch = doFetchAds();
    if (_fetch) _fetch.then(() => { if (_cache) { setAds(_cache); setLoading(false); } });

    return () => { _subs.delete(sub); };
  }, []);

  function getSlot(key: AdSlotKey): AdItem | null {
    return ads.find((a) => a.position === key) ?? null;
  }

  function getSlotAll(key: AdSlotKey): AdItem[] {
    return ads.filter((a) => a.position === key);
  }

  const banners = ads.filter((a) => a.position === "banner");
  const sidebars = ads.filter((a) => a.position === "sidebar");
  const centrals = ads.filter((a) => a.position === "central");

  return { ads, getSlot, getSlotAll, banners, sidebars, centrals, loading };
}

export function trackClick(adId: string) {
  return fetch(`/api/ads/${adId}/click`, { method: "POST" }).catch(() => {});
}

export function trackImpression(adId: string) {
  return fetch(`/api/ads/${adId}/impression`, { method: "POST" }).catch(() => {});
}
