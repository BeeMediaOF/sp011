import { useState, useEffect } from "react";

export interface SiteSettings {
  siteName: string;
  tagline: string;
  logoBase64?: string;
  mobileEnabled: boolean;
  desktopEnabled: boolean;
}

export function useSite() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/site")
      .then((r) => r.json())
      .then((data) => {
        setSettings(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return { settings, loading };
}
