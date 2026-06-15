import { useState, useEffect } from "react";

export type AdSlotKey = "slot_01" | "slot_02" | "slot_03" | "slot_04" | "slot_05";

export interface AdItem {
  id: string;
  imageBase64: string;
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

  // Legacy compat
  const banners = ads.filter((a) => a.position === "banner");
  const sidebars = ads.filter((a) => a.position === "sidebar");
  const centrals = ads.filter((a) => a.position === "central");

  return { ads, getSlot, banners, sidebars, centrals, loading };
}

export function trackClick(adId: string) {
  return fetch(`/api/ads/${adId}/click`, { method: "POST" }).catch(() => {});
}
