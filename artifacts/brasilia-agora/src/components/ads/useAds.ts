import { useState, useEffect } from "react";

export type AdSlotKey = "slot_01" | "slot_02" | "slot_03" | "slot_04" | "slot_05" | "slot_06" | "slot_07" | "slot_08" | "slot_09" | "slot_10" | "slot_11";

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
