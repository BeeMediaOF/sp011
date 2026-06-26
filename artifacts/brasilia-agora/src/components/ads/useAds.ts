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

export function useAds() {
  const [ads, setAds] = useState<AdItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/ads")
      .then((r) => r.json())
      .then((data) => {
        setAds(data.ads ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
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
