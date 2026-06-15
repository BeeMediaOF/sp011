import { readFileSync, writeFileSync, existsSync } from "fs";
import { randomUUID } from "crypto";

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
}

const DEFAULT_HOME_BLOCKS: HomeBlock[] = [
  { id: "hero",       name: "Hero / Destaques",   visible: true, order: 0 },
  { id: "brasil",     name: "Brasil",              visible: true, order: 1 },
  { id: "mais-lidas", name: "Mais Lidas",          visible: true, order: 2 },
  { id: "mundo",      name: "Mundo",               visible: true, order: 3 },
  { id: "esporte",    name: "Esporte",             visible: true, order: 4 },
  { id: "cultura",    name: "Cultura",             visible: true, order: 5 },
  { id: "df",         name: "DF",                  visible: true, order: 6 },
  { id: "saude",      name: "Saúde",               visible: true, order: 7 },
  { id: "tecnologia", name: "Tecnologia",          visible: true, order: 8 },
  { id: "colunistas", name: "Colunistas",          visible: true, order: 9 },
  { id: "ultimas",    name: "Últimas Notícias",    visible: true, order: 10 },
];

export interface Ad {
  id: string;
  name: string;
  imageBase64: string;
  link: string;
  position: "banner" | "sidebar" | "central";
  active: boolean;
  clicks: number;
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

interface StoreData {
  articles: Article[];
  menuItems: MenuItem[];
  settings: SiteSettings;
  ads: Ad[];
  columnists: Columnist[];
  contactInfo: ContactInfo;
}

const STORE_FILE = "/tmp/brasilia-store.json";

const defaultStore: StoreData = {
  articles: [
    {
      id: "hero-1",
      title: "Câmara Legislativa aprova projeto que cria o programa Morar DF",
      subtitle: "Iniciativa prevê subsídio para famílias de baixa renda adquirirem a casa própria no Distrito Federal.",
      content: "A Câmara Legislativa do Distrito Federal aprovou nesta semana o projeto de lei que institui o programa Morar DF. A iniciativa prevê subsídio direto para famílias de baixa renda que desejam adquirir imóveis na capital. O programa deve beneficiar cerca de 15 mil famílias nos próximos dois anos.",
      category: "politica",
      tag: "POLÍTICA",
      imageUrl: "",
      author: "Bee News",
      publishedAt: new Date().toISOString(),
      status: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "hero-2",
      title: "Obras no Eixão alteram trânsito neste fim de semana em Brasília",
      subtitle: "Motoristas devem ficar atentos às mudanças no tráfego durante o período de obras.",
      content: "O Departamento de Trânsito do DF informou que obras de manutenção no Eixo Monumental vão alterar o trânsito neste fim de semana. A interdição parcial ocorre entre as vias N2 e S2.",
      category: "transporte",
      tag: "TRÂNSITO",
      imageUrl: "",
      author: "Bee News",
      publishedAt: new Date().toISOString(),
      status: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  menuItems: [
    { id: "1", label: "HOME",      path: "/",          order: 0, visible: true },
    { id: "2", label: "POLÍTICA",  path: "/politica",  order: 1, visible: true },
    { id: "3", label: "CIDADE",    path: "/cidade",    order: 2, visible: true },
    { id: "4", label: "SEGURANÇA", path: "/seguranca", order: 3, visible: true },
    { id: "5", label: "TRANSPORTE",path: "/transporte",order: 4, visible: true },
    { id: "6", label: "SAÚDE",     path: "/saude",     order: 5, visible: true },
    { id: "7", label: "EDUCAÇÃO",  path: "/educacao",  order: 6, visible: true },
    { id: "8", label: "CULTURA",   path: "/cultura",   order: 7, visible: true },
    { id: "9", label: "ESPORTES",  path: "/esportes",  order: 8, visible: true },
    { id: "10",label: "COLUNAS",   path: "/colunas",   order: 9, visible: true },
  ],
  settings: {
    siteName: "Brasília Hoje",
    tagline: "A notícia da nossa capital, agora.",
    logoSize: 101,
    mobileEnabled: true,
    desktopEnabled: true,
    homeBlocks: DEFAULT_HOME_BLOCKS,
  },
  ads: [],
  columnists: [
    {
      id: "c1", name: "Ana Paula Mendes", specialty: "Política" as const,
      bio: "Jornalista com 15 anos de cobertura do Congresso Nacional e Palácio do Planalto. Especialista em política externa e relações institucionais.",
      avatarBase64: "", active: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
    {
      id: "c2", name: "Carlos Eduardo Rocha", specialty: "Esporte" as const,
      bio: "Cronista esportivo, ex-atleta e comentarista. Cobertura de futebol, atletismo e esportes olímpicos há mais de 10 anos.",
      avatarBase64: "", active: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
    {
      id: "c3", name: "Beatriz Fonseca", specialty: "Economia" as const,
      bio: "Economista e analista de mercado. Escreve sobre finanças pessoais, macroeconomia e o impacto das políticas fiscais no cotidiano.",
      avatarBase64: "", active: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
    {
      id: "c4", name: "Rafael Martins", specialty: "Cultura" as const,
      bio: "Crítico de cinema, teatro e literatura. Doutor em comunicação pela UnB, escreve sobre arte, comportamento e identidade cultural brasileira.",
      avatarBase64: "", active: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
    {
      id: "c5", name: "Juliana Soares", specialty: "Segurança Pública" as const,
      bio: "Especialista em segurança pública e direitos humanos. Acompanha as políticas de segurança do DF e dos estados brasileiros.",
      avatarBase64: "", active: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
    {
      id: "c6", name: "Marcos Vinicius Costa", specialty: "Social" as const,
      bio: "Assistente social e colunista. Escreve sobre desigualdade, políticas públicas, habitação e os desafios das comunidades periféricas.",
      avatarBase64: "", active: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
  ],
  contactInfo: {
    supportEmail: "suporte@beemedia.ai",
    displayEmail: "redacao@brasiliaagora.com.br",
    phone: "(61) 99888-0000",
    whatsapp: "(61) 99888-0000",
    facebook: "",
    instagram: "",
    x: "",
    youtube: "",
    tiktok: "",
    address: "Brasília, Distrito Federal",
    cnpj: "",
    legalInfo: "",
    privacyPolicy: "",
    termsOfUse: "",
  },
};

function loadStore(): StoreData {
  try {
    if (existsSync(STORE_FILE)) {
      return JSON.parse(readFileSync(STORE_FILE, "utf-8")) as StoreData;
    }
  } catch { /* ignore */ }
  return structuredClone(defaultStore);
}

function saveStore(data: StoreData): void {
  try {
    writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch { /* ignore */ }
}

let _store: StoreData = loadStore();

export const store = {
  // Articles
  getArticles: () => [..._store.articles],
  getArticle: (id: string) => _store.articles.find((a) => a.id === id) ?? null,
  createArticle: (data: Omit<Article, "id" | "createdAt" | "updatedAt">): Article => {
    const article: Article = {
      ...data,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    _store.articles.unshift(article);
    saveStore(_store);
    return article;
  },
  updateArticle: (id: string, data: Partial<Omit<Article, "id" | "createdAt">>): Article | null => {
    const idx = _store.articles.findIndex((a) => a.id === id);
    if (idx === -1) return null;
    _store.articles[idx] = { ..._store.articles[idx]!, ...data, updatedAt: new Date().toISOString() };
    saveStore(_store);
    return _store.articles[idx]!;
  },
  deleteArticle: (id: string): boolean => {
    const before = _store.articles.length;
    _store.articles = _store.articles.filter((a) => a.id !== id);
    const deleted = _store.articles.length < before;
    if (deleted) saveStore(_store);
    return deleted;
  },

  // Menu
  getMenuItems: () => [..._store.menuItems].sort((a, b) => a.order - b.order),
  updateMenuItems: (items: MenuItem[]): MenuItem[] => {
    _store.menuItems = items;
    saveStore(_store);
    return [..._store.menuItems];
  },

  // Settings
  getSettings: () => ({ ..._store.settings }),
  updateSettings: (data: Partial<SiteSettings>): SiteSettings => {
    _store.settings = { ..._store.settings, ...data };
    saveStore(_store);
    return { ..._store.settings };
  },

  // Ads
  getAds: () => [..._store.ads],
  getAd: (id: string) => _store.ads.find((a) => a.id === id) ?? null,
  createAd: (data: Omit<Ad, "id" | "createdAt" | "updatedAt" | "clicks">): Ad => {
    const ad: Ad = {
      ...data,
      id: randomUUID(),
      clicks: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    _store.ads.push(ad);
    saveStore(_store);
    return ad;
  },
  updateAd: (id: string, data: Partial<Omit<Ad, "id" | "createdAt">>): Ad | null => {
    const idx = _store.ads.findIndex((a) => a.id === id);
    if (idx === -1) return null;
    _store.ads[idx] = { ..._store.ads[idx]!, ...data, updatedAt: new Date().toISOString() };
    saveStore(_store);
    return _store.ads[idx]!;
  },
  deleteAd: (id: string): boolean => {
    const before = _store.ads.length;
    _store.ads = _store.ads.filter((a) => a.id !== id);
    const deleted = _store.ads.length < before;
    if (deleted) saveStore(_store);
    return deleted;
  },
  trackAdClick: (id: string): boolean => {
    const idx = _store.ads.findIndex((a) => a.id === id);
    if (idx === -1 || !_store.ads[idx]!.active) return false;
    _store.ads[idx]!.clicks += 1;
    saveStore(_store);
    return true;
  },

  // Columnists
  getColumnists: () => [..._store.columnists],
  getColumnist: (id: string) => _store.columnists.find((c) => c.id === id) ?? null,
  createColumnist: (data: Omit<Columnist, "id" | "createdAt" | "updatedAt">): Columnist => {
    const col: Columnist = {
      ...data,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    _store.columnists.push(col);
    saveStore(_store);
    return col;
  },
  updateColumnist: (id: string, data: Partial<Omit<Columnist, "id" | "createdAt">>): Columnist | null => {
    const idx = _store.columnists.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    _store.columnists[idx] = { ..._store.columnists[idx]!, ...data, updatedAt: new Date().toISOString() };
    saveStore(_store);
    return _store.columnists[idx]!;
  },
  deleteColumnist: (id: string): boolean => {
    const before = _store.columnists.length;
    _store.columnists = _store.columnists.filter((c) => c.id !== id);
    const deleted = _store.columnists.length < before;
    if (deleted) saveStore(_store);
    return deleted;
  },

  // Contact Info
  getContactInfo: () => ({ ..._store.contactInfo }),
  updateContactInfo: (data: Partial<ContactInfo>): ContactInfo => {
    _store.contactInfo = { ..._store.contactInfo, ...data };
    saveStore(_store);
    return { ..._store.contactInfo };
  },
};
