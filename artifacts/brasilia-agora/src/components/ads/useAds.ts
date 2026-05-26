import { useState, useEffect } from "react";

export interface AdItem {
  id: string;
  imageBase64: string;
  link: string;
  position: "banner" | "sidebar";
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

  const banners = ads.filter((a) => a.position === "banner");
  const sidebars = ads.filter((a) => a.position === "sidebar");

  return { ads, banners, sidebars, loading };
}

export function trackClick(adId: string) {
  return fetch(`/api/ads/${adId}/click`, { method: "POST" }).catch(() => {});
}
