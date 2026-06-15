import { useState, useEffect } from "react";

export interface HomeBlock {
  id: string;
  name: string;
  visible: boolean;
  order: number;
  category?: string;
  layout?: "grid" | "featured" | "duplo" | "cultura";
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
  ogImageBase64?: string;
  faviconBase64?: string;
  homeBlocks?: HomeBlock[];
  menuItems?: MenuItem[];
  adminLogoBase64?: string;
  adminSidebarColor?: string;
  adminAccentColor?: string;
  bylineName?: string;
  bylineLogoBase64?: string;
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
