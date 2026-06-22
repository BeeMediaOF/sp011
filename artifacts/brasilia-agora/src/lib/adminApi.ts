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
    if (res.status === 401) {
      localStorage.removeItem("admin_token");
      localStorage.removeItem("admin_role");
      localStorage.removeItem("admin_user");
      window.location.href = "/admin/login";
      throw new Error("Sessão expirada. Redirecionando para o login...");
    }
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export const adminApi = {
  login: (email: string, password: string) =>
    req<{ token: string; email: string; role: string; name: string }>("POST", "/login", { email, password }),

  logout: () => req<{ success: boolean }>("POST", "/logout", {}),

  me: () => req<{ user: AdminUser }>("GET", "/me"),

  // Articles
  getArticles: () => req<{ articles: Article[] }>("GET", "/articles"),
  getArticle: (id: string) => req<{ article: Article }>("GET", `/articles/${id}`),
  createArticle: (data: Partial<Article>) => req<{ article: Article }>("POST", "/articles", data),
  updateArticle: (id: string, data: Partial<Article>) => req<{ article: Article }>("PUT", `/articles/${id}`, data),
  deleteArticle: (id: string) => req<{ success: boolean }>("DELETE", `/articles/${id}`),
  publishArticle: (id: string) => req<{ article: Article }>("POST", `/publish/${id}`, {}),
  rewriteArticle: (id: string) => req<{ article: Article }>("POST", `/articles/${id}/rewrite`, {}),
  repairContent: () => req<{ fixed: number; skipped: number; total: number }>("POST", "/articles/repair-content", {}),
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
  updateMyProfile: (data: { name?: string; avatarBase64?: string | null }) =>
    req<{ user: { id: number; name: string; email: string; role: string; avatarBase64?: string | null } }>("PUT", "/me", data),

  // Ads
  getAds: () => req<{ ads: Ad[] }>("GET", "/ads"),
  getAd: (id: string) => req<{ ad: Ad }>("GET", `/ads/${id}`),
  createAd: (data: { name: string; imageBase64: string; link: string; position: Ad["position"]; active: boolean; targetDevices?: ("desktop" | "mobile" | "tablet")[]; expiresAt?: string | null }) =>
    req<{ ad: Ad }>("POST", "/ads", data),
  updateAd: (id: string, data: Partial<Ad>) => req<{ ad: Ad }>("PUT", `/ads/${id}`, data),
  deleteAd: (id: string) => req<{ success: boolean }>("DELETE", `/ads/${id}`),
  trackAdClick: (id: string) => fetch(`/api/ads/${id}/click`, { method: "POST" }).then((r) => r.json()),

  // 2FA
  twoFaStatus: () => req<{ twoFactorEnabled: boolean }>("GET", "/2fa/status"),
  twoFaSetup: () => req<{ secret: string; qrDataUrl: string }>("POST", "/2fa/setup", {}),
  twoFaVerify: (code: string) => req<{ ok: boolean; message: string }>("POST", "/2fa/verify", { code }),
  twoFaDisable: (code: string) => req<{ ok: boolean; message: string }>("POST", "/2fa/disable", { code }),
  twoFaLogin: (tempToken: string, code: string) =>
    req<{ token: string; email: string; role: string; name: string; avatarBase64: string | null }>("POST", "/2fa/login", { tempToken, code }),

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

  // Users (admin only)
  getUsers: () => req<{ users: AdminUser[] }>("GET", "/users"),
  getUser: (id: number) => req<{ user: AdminUser }>("GET", `/users/${id}`),
  createUser: (data: { name: string; email: string; password: string; role: "admin" | "editor"; status: "active" | "inactive" }) =>
    req<{ user: AdminUser }>("POST", "/users", data),
  updateUser: (id: number, data: { name?: string; email?: string; role?: "admin" | "editor"; status?: "active" | "inactive" | "blocked" }) =>
    req<{ user: AdminUser }>("PUT", `/users/${id}`, data),
  changeUserPassword: (id: number, password: string) =>
    req<{ success: boolean }>("PUT", `/users/${id}/password`, { password }),
  deleteUser: (id: number) => req<{ success: boolean }>("DELETE", `/users/${id}`),

  // Permissions (admin only)
  getEditorPermissions: () =>
    req<{ permissions: EditorPermission[] }>("GET", "/permissions"),
  setEditorPermission: (key: string, enabled: boolean) =>
    req<{ key: string; enabled: boolean }>("PUT", `/permissions/${key}`, { enabled }),
  getMyPermissions: () =>
    req<{ permissions: string[] }>("GET", "/permissions/me"),

  // Image upload (multipart)
  uploadImage: (file: File): Promise<{ ok: boolean; url: string; filename: string; size: number }> => {
    const token = getToken();
    const form = new FormData();
    form.append("image", file);
    return fetch("/api/uploads/image", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    }).then(async (r) => {
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: r.statusText }));
        throw new Error((err as { error?: string }).error ?? r.statusText);
      }
      return r.json() as Promise<{ ok: boolean; url: string; filename: string; size: number }>;
    });
  },

  // Webhook API Key (admin only)
  getWebhookKey: () => req<{ apiKey: string | null }>("GET", "/webhook-key"),
  regenerateWebhookKey: () => req<{ apiKey: string }>("POST", "/webhook-key"),

  // Logs (admin only)
  getAuditLogs: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return req<{ logs: AuditLog[]; total: number }>("GET", `/logs/audit${qs}`);
  },
  getSecurityLogs: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return req<{ logs: SecurityLog[]; total: number }>("GET", `/logs/security${qs}`);
  },
  getLogStats: () => req<LogStats>("GET", "/logs/stats"),
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: "admin" | "editor";
  status: "active" | "inactive" | "blocked";
  createdAt: string;
  updatedAt: string;
  lastLogin: string | null;
  mustChangePassword: number;
}

export interface AuditLog {
  id: number;
  userId: number | null;
  userEmail: string | null;
  action: string;
  module: string;
  description: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: string | null;
  createdAt: string;
}

export interface SecurityLog {
  id: number;
  userId: number | null;
  userEmail: string | null;
  eventType: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  ipAddress: string | null;
  userAgent: string | null;
  route: string | null;
  payloadSummary: string | null;
  createdAt: string;
}

export interface LogStats {
  failedLoginsLast24h: number;
  blockedAccessLast24h: number;
  criticalEventsLast24h: number;
  lastAdminLogin: string | null;
}

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
  canonicalUrl?: string;
}

export interface MenuItem {
  id: string;
  label: string;
  path: string;
  order: number;
  visible: boolean;
  newTab?: boolean;
  highlight?: boolean;
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
  reverse?: boolean;
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
  adminLogoBase64?: string;
  loginLogoBase64?: string;
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
  siteUrl?: string;
}

export interface AnalyticsStats {
  totals: { today: number; week: number; month: number; allTime: number };
  dailyChart: { date: string; views: number }[];
  hourlyChart: { hour: number; views: number }[];
  topArticles: { id: string; title: string; views: number }[];
  topCategories: { name: string; views: number; clicks: number; articles: number }[];
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
  targetDevices?: ("desktop" | "mobile" | "tablet")[];
  expiresAt?: string | null;
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

export interface EditorPermission {
  key: string;
  label: string;
  group: string;
  description: string;
  enabled: boolean;
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
