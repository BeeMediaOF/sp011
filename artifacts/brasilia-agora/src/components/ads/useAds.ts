import { useState, useEffect, useRef } from "react";
import { getSessionId } from "../../hooks/useAnalytics";

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

/** Admin logado (ou ambiente dev): antes SUPRIMIA o envio; agora envia com internal:true
 *  (alinhado ao SDK de pageview) — o servidor conta em internal_* e não polui o público
 *  (PRD 04 RF3). Consentimento LGPD/viewability/dedup por aba ficam no PRD 02. */
function isInternalTraffic(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return Boolean(localStorage.getItem("admin_token"));
  } catch {
    return false;
  }
}

function trackBody(): string {
  return JSON.stringify({
    sessionId: getSessionId(),                                    // mesmo id do SDK
    path: typeof location !== "undefined" ? location.pathname : undefined,
    internal: isInternalTraffic() || undefined,
  });
}

export function trackClick(adId: string) {
  return fetch(`/api/ads/${adId}/click`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: trackBody(),
  }).catch(() => {});
}

export function trackImpression(adId: string) {
  return fetch(`/api/ads/${adId}/impression`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: trackBody(),
  }).catch(() => {});
}

/** Tempo mínimo de visibilidade CONTÍNUA (≥50% na tela) para valer impressão —
 *  passar rolando por cima do banner não conta (padrão de viewability IAB). */
const IMPRESSION_DWELL_MS = 1000;

function impressionAlreadyCounted(adId: string): boolean {
  try { return sessionStorage.getItem(`bee_adimp_${adId}`) === "1"; } catch { return false; }
}
function markImpressionCounted(adId: string): void {
  try { sessionStorage.setItem(`bee_adimp_${adId}`, "1"); } catch { /* ignore */ }
}

/**
 * Impressão "viewável": conta quando ≥50% do anúncio fica visível por 1s
 * contínuo (IntersectionObserver + dwell), UMA vez por anúncio por SESSÃO
 * (sessionStorage; o Set por montagem é só fallback se o storage falhar).
 * Nunca no render — banner abaixo da dobra que ninguém viu não conta.
 * Uso: `const adRef = useAdImpression(ad?.id)` e `ref={adRef}` no contêiner.
 */
export function useAdImpression(adId: string | null | undefined): (el: HTMLElement | null) => void {
  const seen = useRef<Set<string>>(new Set());
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!el) { setVisible(false); return; }
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const obs = new IntersectionObserver(
      (entries) => { setVisible(entries.some((e) => e.isIntersecting)); },
      { threshold: 0.5 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [el]);

  useEffect(() => {
    if (!visible || !adId) return;
    if (seen.current.has(adId) || impressionAlreadyCounted(adId)) return;
    // Timer de dwell: sair da tela (ou trocar o anúncio do carrossel) antes de
    // 1s cancela pelo cleanup — visibilidade precisa ser contínua.
    const timer = window.setTimeout(() => {
      if (seen.current.has(adId) || impressionAlreadyCounted(adId)) return;
      seen.current.add(adId);
      markImpressionCounted(adId);
      void trackImpression(adId);
    }, IMPRESSION_DWELL_MS);
    return () => window.clearTimeout(timer);
  }, [visible, adId]);

  return setEl;
}
