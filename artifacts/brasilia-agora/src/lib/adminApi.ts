const BASE = "/api/admin";

function getToken(): string | null {
  return localStorage.getItem("admin_token");
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: authHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export const adminApi = {
  login: (username: string, password: string) =>
    req<{ token: string; username: string }>("POST", "/login", { username, password }),

  // Articles
  getArticles: () => req<{ articles: Article[] }>("GET", "/articles"),
  getArticle: (id: string) => req<{ article: Article }>("GET", `/articles/${id}`),
  createArticle: (data: Partial<Article>) => req<{ article: Article }>("POST", "/articles", data),
  updateArticle: (id: string, data: Partial<Article>) => req<{ article: Article }>("PUT", `/articles/${id}`, data),
  deleteArticle: (id: string) => req<{ success: boolean }>("DELETE", `/articles/${id}`),
  publishArticle: (id: string) => req<{ article: Article }>("POST", `/publish/${id}`, {}),
  rewriteArticle: (id: string) => req<{ article: Article }>("POST", `/articles/${id}/rewrite`, {}),
  autofillArticle: (title: string, content: string) =>
    req<{ subtitle: string; summary: string; tags: string[]; seoTitle: string; metaDesc: string; slug: string }>(
      "POST", "/articles/autofill", { title, content }
    ),

  // Menu
  getMenu: () => req<{ menuItems: MenuItem[] }>("GET", "/menu"),
  updateMenu: (menuItems: MenuItem[]) => req<{ menuItems: MenuItem[] }>("PUT", "/menu", { menuItems }),

  // Settings + Logo
  getSettings: () => req<{ settings: SiteSettings }>("GET", "/settings"),
  updateSettings: (settings: Partial<SiteSettings>) => req<{ settings: SiteSettings }>("PUT", "/settings", settings),
  uploadLogo: (logoBase64: string) => req<{ settings: SiteSettings }>("POST", "/logo", { logoBase64 }),

  // Ads
  getAds: () => req<{ ads: Ad[] }>("GET", "/ads"),
  getAd: (id: string) => req<{ ad: Ad }>("GET", `/ads/${id}`),
  createAd: (data: { name: string; imageBase64: string; link: string; position: Ad["position"]; active: boolean }) =>
    req<{ ad: Ad }>("POST", "/ads", data),
  updateAd: (id: string, data: Partial<Ad>) => req<{ ad: Ad }>("PUT", `/ads/${id}`, data),
  deleteAd: (id: string) => req<{ success: boolean }>("DELETE", `/ads/${id}`),
  trackAdClick: (id: string) => fetch(`/api/ads/${id}/click`, { method: "POST" }).then((r) => r.json()),

  // Columnists
  getColumnists: () => req<{ columnists: Columnist[] }>("GET", "/columnists"),
  getColumnist: (id: string) => req<{ columnist: Columnist }>("GET", `/columnists/${id}`),
  createColumnist: (data: { name: string; bio: string; avatarBase64: string; active: boolean }) =>
    req<{ columnist: Columnist }>("POST", "/columnists", data),
  updateColumnist: (id: string, data: Partial<Columnist>) => req<{ columnist: Columnist }>("PUT", `/columnists/${id}`, data),
  deleteColumnist: (id: string) => req<{ success: boolean }>("DELETE", `/columnists/${id}`),

  // Contact Info
  getContactInfo: () => req<{ contactInfo: ContactInfo }>("GET", "/contact"),
  updateContactInfo: (info: Partial<ContactInfo>) => req<{ contactInfo: ContactInfo }>("PUT", "/contact", info),

  // Analytics
  getAnalyticsStats: (): Promise<AnalyticsStats> => {
    const token = localStorage.getItem("admin_token");
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    return fetch("/api/analytics/stats", { headers }).then((r) => r.json()) as Promise<AnalyticsStats>;
  },
};

export interface Article {
  id: string;
  title: string;
  subtitle: string;
  content: string;
  category: string;
  tag: string;
  imageUrl: string;
  author: string;
  publishedAt: string;
  status: "draft" | "published";
  createdAt: string;
  updatedAt: string;
  origin?: "manual" | "rss";
  rssSourceId?: string;
  rssSourceName?: string;
  rssSourceUrl?: string;
  aiRewritten?: boolean;
  keywords?: string;
  slug?: string;
}

export interface MenuItem {
  id: string;
  label: string;
  path: string;
  order: number;
  visible: boolean;
}

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
  adminLogoBase64?: string;
  adminSidebarColor?: string;
  adminAccentColor?: string;
  rssAiProvider?: "gemini_free" | "gemini_paid" | "openai";
  rssAiApiKey?: string;
  rssAiModel?: string;
  bylineName?: string;
  bylineLogoBase64?: string;
  headerStyle?: "standard" | "compact" | "centered";
  footerStyle?: "dark" | "light" | "minimal";
  headerBgColor?: string;
  footerBgColor?: string;
}

export interface AnalyticsStats {
  totals: { today: number; week: number; month: number; allTime: number };
  dailyChart: { date: string; views: number }[];
  hourlyChart: { hour: number; views: number }[];
  topArticles: { id: string; title: string; views: number }[];
  topCategories: { name: string; views: number; articles: number }[];
  devices: { mobile: number; desktop: number; tablet: number };
}

export interface Ad {
  id: string;
  name: string;
  imageBase64: string;
  link: string;
  position: "slot_01" | "slot_02" | "slot_03" | "slot_04" | "slot_05" | "slot_06" | "slot_07" | "slot_08" | "slot_09" | "slot_10" | "slot_11" | "topo" | "centro" | "lateral" | "rodape" | "slidebar_250" | "slidebar_500" | "banner" | "sidebar" | "central";

  active: boolean;
  clicks: number;
  impressions: number;
  createdAt: string;
  updatedAt: string;
}

export type ColumnistSpecialty =
  | "Política"
  | "Esporte"
  | "Economia"
  | "Cultura"
  | "Segurança Pública"
  | "Social"
  | "Outro";

export interface Columnist {
  id: string;
  name: string;
  bio: string;
  specialty: ColumnistSpecialty;
  avatarBase64: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContactInfo {
  supportEmail: string;
  displayEmail: string;
  phone: string;
  whatsapp: string;
  facebook: string;
  instagram: string;
  x: string;
  youtube: string;
  tiktok: string;
  address: string;
  cnpj: string;
  legalInfo: string;
  privacyPolicy: string;
  termsOfUse: string;
}
